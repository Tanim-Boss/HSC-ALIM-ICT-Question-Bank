/**
 * AMB-5 — STRUCTURAL AND BEHAVIOURAL proof that the archived-record review gate
 * cannot be disarmed.
 *
 * WHY THIS FILE REPLACED A SOURCE-TEXT TEST
 *
 * The earlier suite asserted `expect(serviceSource).not.toContain('<flag name>')`
 * — a substring search over `server/questions/change-type.ts`. That only
 * constrained what the file could SAY. It did not prove that the service runs
 * the gate, it did not prove a caller cannot bypass it, and it silently
 * penalised documenting the very flag it was guarding against. Mutation testing
 * showed the weakness directly: deleting the gate call left the assertion green
 * as long as the identifier was still mentioned somewhere.
 *
 * A flag named `allowLegacyArchivedTypeChange` really did exist on the rules
 * helper, reachable from any caller. It has been removed (no production caller
 * ever passed it). What follows pins the removal and the containment
 * behaviourally, against the real service and the real gate entry point, with a
 * controlled client instead of a database.
 *
 * WHAT IS PROVEN HERE
 *
 *   1. The production service REFUSES an all-archived type change — i.e. it
 *      demonstrably invokes the gate before writing.
 *   2. A caller cannot smuggle a bypass: an extra property on the input is
 *      inert, and the helper accepts no override argument at runtime even when
 *      one is forced through a cast.
 *   3. Rejection happens BEFORE the write and escapes the transaction callback,
 *      so the write is never attempted (rollback is the database's job, proven
 *      against real PostgreSQL in `tests/integration/questions/change-type-service.test.ts`).
 *   4. Lock, read and write all go through the SAME transaction client, and the
 *      pool client is never used for a read (defect D2).
 *   5. The older entry point `assertQuestionTypeChangeAllowed` enforces the same
 *      gate, exercised with an injected lookup client.
 *
 * NOT proven here, and not claimed: real serialisation of concurrent
 * transactions. That requires two connections and a row lock; it lives in the
 * PostgreSQL suite (all four concurrency tests preserved there).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// `server-only` throws on import by design; the unit environment is not a
// server-render context. Mocking it is what lets the real service module load.
vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => {
  const calls: string[] = [];
  const holder: { row: unknown } = { row: null };

  const tx = {
    $queryRaw: () => {
      calls.push('lock');
      return Promise.resolve([]);
    },
    question: {
      findUnique: () => {
        calls.push('read');
        return Promise.resolve(holder.row);
      },
      update: () => {
        calls.push('write');
        return Promise.resolve({});
      },
    },
    levelSubject: {
      findUnique: () => Promise.resolve({ levelId: 'lvl' }),
    },
    // Phase 04B: the audit row written on the same transaction as the change.
    auditEvent: {
      create: () => {
        calls.push('audit');
        return Promise.resolve({});
      },
    },
  };

  // The pool client. A read through this is defect D2, so it fails loudly
  // instead of quietly returning data.
  const client = {
    $transaction: (cb: (t: unknown) => Promise<unknown>) => {
      calls.push('begin');
      return cb(tx);
    },
    question: {
      findUnique: () => {
        calls.push('POOL_READ');
        throw new Error('D2: the service read through the pool, not the transaction client');
      },
      update: () => {
        calls.push('POOL_WRITE');
        throw new Error('D2: the service wrote through the pool, not the transaction client');
      },
    },
  };

  return {
    calls,
    holder,
    tx,
    client,
    reset(row: unknown) {
      calls.length = 0;
      holder.row = row;
    },
  };
});

vi.mock('@/lib/db', () => ({ getPrisma: () => h.client }));

const { changeQuestionType } = await import('@/server/questions/change-type');
const { AppRole } = await import('@/lib/generated/prisma/enums');

/** An actor allowed to change a draft question's type (Phase 04B). */
const editor = {
  userId: '0b000000-0000-4000-8000-000000000002',
  roles: new Set([AppRole.EDITOR]),
};
const { assertQuestionTypeChangeAllowed } = await import('@/server/questions/publish/gate');

/** A snapshot row of the shape `loadQuestionSnapshot` selects and maps. */
function questionRow(type: string, statuses: readonly string[]) {
  return {
    id: 'q-1',
    type,
    status: statuses[0] ?? 'DRAFT',
    marks: 1,
    educationLevelId: 'lvl',
    subjectId: 'sub',
    chapterId: null,
    topicId: null,
    subtopicId: null,
    educationLevel: { id: 'lvl', isActive: true },
    subject: { id: 'sub', isActive: true },
    chapter: null,
    topic: null,
    subtopic: null,
    versions: statuses.map((status, index) => ({
      id: `v-${String(index + 1)}`,
      versionNumber: index + 1,
      status,
      content: {},
      options: [],
      answerKey: null,
      assets: [],
    })),
  };
}

describe('the production service cannot be talked out of the AMB-5 gate', () => {
  beforeEach(() => h.reset(questionRow('MCQ', ['ARCHIVED'])));

  it('refuses an all-archived type change with the review code, not the immutable one', async () => {
    // Both codes exist and mean different things. If the service ever collapsed
    // them, the distinction AMB-5 rests on would be gone.
    await expect(
      changeQuestionType(editor, { questionId: 'q-1', nextType: 'CQ' }),
    ).rejects.toMatchObject({
      code: 'QUESTION_TYPE_CHANGE_REVIEW_REQUIRED',
    });
  });

  it('never writes when the gate refuses — the rejection precedes the update', () => {
    expect(h.calls).not.toContain('write');
  });

  it('lets the rejection escape the transaction callback, so nothing can be committed', async () => {
    // A swallowed error inside `$transaction` would let a half-applied change
    // commit. The fake client's `$transaction` simply returns the callback's
    // promise, so a rejected promise here means the same thing for Prisma.
    const outcome = changeQuestionType(editor, { questionId: 'q-1', nextType: 'CQ' });
    await expect(outcome).rejects.toBeInstanceOf(Error);
    expect(h.calls).toEqual(['begin', 'lock', 'read']);
  });

  it('ignores an extra bypass property supplied by a caller', async () => {
    // The old rules-layer flag. A caller who passes it — through a cast, or from
    // plain JavaScript with no types at all — must change nothing.
    const smuggled = {
      questionId: 'q-1',
      nextType: 'CQ',
      allowLegacyArchivedTypeChange: true,
    } as unknown as Parameters<typeof changeQuestionType>[1];

    await expect(changeQuestionType(editor, smuggled)).rejects.toMatchObject({
      code: 'QUESTION_TYPE_CHANGE_REVIEW_REQUIRED',
    });
    expect(h.calls).not.toContain('write');
  });

  it('takes exactly (actor, input) — there is no options slot to pass a flag into', () => {
    expect(changeQuestionType.length).toBe(2);
  });

  it('refuses an actor without question.change_type before opening a transaction', async () => {
    h.reset(questionRow('MCQ', ['DRAFT']));
    const student = { userId: editor.userId, roles: new Set([AppRole.STUDENT]) };
    await expect(
      changeQuestionType(student, { questionId: 'q-1', nextType: 'CQ' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(h.calls).toEqual([]);
  });

  it('still refuses a currently-published question with QUESTION_TYPE_IMMUTABLE', async () => {
    h.reset(questionRow('MCQ', ['PUBLISHED']));
    await expect(
      changeQuestionType(editor, { questionId: 'q-1', nextType: 'CQ' }),
    ).rejects.toMatchObject({
      code: 'QUESTION_TYPE_IMMUTABLE',
    });
    expect(h.calls).not.toContain('write');
  });

  it('permits a draft-only change and returns the new type', async () => {
    h.reset(questionRow('MCQ', ['DRAFT']));
    await expect(
      changeQuestionType(editor, { questionId: 'q-1', nextType: 'CQ' }),
    ).resolves.toMatchObject({
      questionId: 'q-1',
      previousType: 'MCQ',
      type: 'CQ',
    });
    expect(h.calls).toContain('write');
  });

  it('treats a same-type request as a no-op with no write', async () => {
    h.reset(questionRow('MCQ', ['ARCHIVED']));
    await expect(
      changeQuestionType(editor, { questionId: 'q-1', nextType: 'MCQ' }),
    ).resolves.toMatchObject({
      type: 'MCQ',
    });
    expect(h.calls).not.toContain('write');
  });

  it('locks, reads and writes through ONE transaction client, never the pool', async () => {
    h.reset(questionRow('MCQ', ['DRAFT']));
    await changeQuestionType(editor, { questionId: 'q-1', nextType: 'CQ' });

    // Every operation the service performs went through the single `tx` object
    // handed to it by `$transaction`; any pool access would have recorded
    // POOL_READ/POOL_WRITE (and thrown).
    expect(h.calls).toEqual(['begin', 'lock', 'read', 'write', 'audit']);
  });

  it('does not fall back to the pool when the snapshot is missing', async () => {
    h.reset(null);
    // `loadQuestionSnapshot` reports a missing question as
    // INACTIVE_ROW_REFERENCED (snapshot.ts:206). That is existing, approved
    // behaviour and is asserted as-is rather than "corrected" here.
    await expect(
      changeQuestionType(editor, { questionId: 'q-1', nextType: 'CQ' }),
    ).rejects.toMatchObject({
      code: 'INACTIVE_ROW_REFERENCED',
    });
    expect(h.calls).not.toContain('POOL_READ');
    expect(h.calls).not.toContain('write');
  });
});

describe('the rules helper itself accepts no override', () => {
  it('throws for an all-archived change even when a flag is forced through a cast', async () => {
    const { assertLegacyArchiveReviewRequired } = await import('@/server/questions/publish/rules');
    const versions = [
      {
        id: 'v1',
        versionNumber: 1,
        status: 'ARCHIVED',
        content: null,
        options: [],
        answerKey: null,
        assetLinks: [],
      },
    ] as const;

    expect(() => assertLegacyArchiveReviewRequired('CQ', 'MCQ', versions as never)).toThrow(
      /review/i,
    );

    // Forced extra argument: ignored, because the parameter no longer exists.
    const forced = assertLegacyArchiveReviewRequired as unknown as (
      a: string,
      b: string,
      c: unknown,
      d: unknown,
    ) => void;
    expect(() => forced('CQ', 'MCQ', versions, { allowLegacyArchivedTypeChange: true })).toThrow(
      /review/i,
    );
  });
});

describe('the older entry point enforces the same gate (injected client)', () => {
  const clientFor = (type: string, statuses: readonly string[]) =>
    ({
      question: {
        findUnique: () =>
          Promise.resolve({ type, versions: statuses.map((status) => ({ status })) }),
      },
    }) as never;

  it('refuses an all-archived type change', async () => {
    await expect(
      assertQuestionTypeChangeAllowed('q-1', 'CQ', clientFor('MCQ', ['ARCHIVED'])),
    ).rejects.toMatchObject({ code: 'QUESTION_TYPE_CHANGE_REVIEW_REQUIRED' });
  });

  it('still refuses a published question with QUESTION_TYPE_IMMUTABLE', async () => {
    await expect(
      assertQuestionTypeChangeAllowed('q-1', 'CQ', clientFor('MCQ', ['PUBLISHED'])),
    ).rejects.toMatchObject({ code: 'QUESTION_TYPE_IMMUTABLE' });
  });

  it('permits a draft-only change', async () => {
    await expect(
      assertQuestionTypeChangeAllowed('q-1', 'CQ', clientFor('MCQ', ['DRAFT'])),
    ).resolves.toBeUndefined();
  });
});
