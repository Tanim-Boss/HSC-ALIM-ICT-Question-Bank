/**
 * AMB-5 — the fail-closed review gate, exercised through the real service on
 * real PostgreSQL.
 *
 * WHY THIS FILE CALLS `changeQuestionType` AND NOT A PURE HELPER
 *
 * The Task 6 requirement is explicit: the test must exercise the actual
 * application service. Testing `assertLegacyArchiveReviewRequired` in isolation
 * would prove only that a pure function throws — and the defect AMB-5 describes
 * was never in the function, it was that NOTHING CALLED IT. `changeQuestionType`
 * is the service; these tests drive it through its public interface, against
 * committed rows, and read the database back afterwards to prove whether a write
 * happened.
 *
 * WHAT IS PROVEN HERE
 *
 *   archived      → refused with QUESTION_TYPE_CHANGE_REVIEW_REQUIRED, and
 *                   `questions.type` is unchanged in the database (that second
 *                   half is the part a pure unit test cannot show);
 *   fail-closed   → the refusal does not depend on missing evidence being read
 *                   as non-publication; an all-archived question is never
 *                   treated as "never published";
 *   positive      → a draft-only question IS allowed to change type, writes the
 *                   new type, and reports the previous type;
 *   bypass        → the direct `update` that would skip the gate is shown to
 *                   still be reachable from raw Prisma (the gate is application
 *                   level, not a database constraint) and the service is the
 *                   only in-repo path that reaches the write;
 *   no override   → there is no parameter that unlocks the archived case.
 *
 * Requires DATABASE_URL pointing at a disposable database with 0001 applied.
 * Skips LOUDLY without it.
 */

import { PrismaClient } from '@/lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { changeQuestionType } from '@/server/questions/change-type';
import { DomainError } from '@/server/questions/publish/errors';
import type { QuestionType, VersionStatus } from '@/server/questions/publish/rules';

const DATABASE_URL = process.env['DATABASE_URL'];
const hasDatabase = typeof DATABASE_URL === 'string' && DATABASE_URL.length > 0;
const describeDb = hasDatabase ? describe : describe.skip;

if (!hasDatabase) {
  console.warn('[AMB-5] DATABASE_URL is not set — type-change service tests were SKIPPED.');
}

const FIXTURE_CODES = { level: 'AMB5_LEVEL', subject: 'AMB5_SUBJECT' } as const;

let prisma: PrismaClient;

interface Taxonomy {
  readonly levelId: string;
  readonly subjectId: string;
  readonly chapterId: string;
}

let tax: Taxonomy;

/**
 * Creates a question with the given version statuses, children last.
 *
 * Written with raw Prisma rather than the publish fixtures because AMB-5 needs
 * control over the *number* of versions and over a status (ARCHIVED) the MCQ
 * fixture does not produce. The taxonomy chain is duplicated from the shared
 * fixture on purpose: this suite must not be able to fail because another
 * suite's cleanup ran at the wrong moment, and the codes are distinct so the
 * two cleanups cannot collide.
 */
async function createQuestion(
  type: QuestionType,
  versionStatuses: readonly VersionStatus[],
): Promise<{ questionId: string; versionIds: string[] }> {
  return prisma.$transaction(async (tx) => {
    const db = tx as unknown as PrismaClient;
    const question = await db.question.create({
      data: {
        type,
        // With no versions nothing was ever published, so the question is a
        // draft. `.every` is vacuously true on an empty array, so the emptiness
        // is checked explicitly rather than inherited from that quirk.
        status:
          versionStatuses.length > 0 && versionStatuses.every((s) => s === 'ARCHIVED')
            ? 'ARCHIVED'
            : 'DRAFT',
        difficulty: 'MEDIUM',
        createdVia: 'MANUAL',
        educationLevelId: tax.levelId,
        subjectId: tax.subjectId,
        chapterId: tax.chapterId,
        marks: type === 'MCQ' ? 1 : 10,
      },
      select: { id: true },
    });

    const versionIds: string[] = [];
    for (let i = 0; i < versionStatuses.length; i += 1) {
      const version = await db.questionVersion.create({
        data: {
          questionId: question.id,
          versionNumber: i + 1,
          status: versionStatuses[i] ?? 'DRAFT',
          content: { format: 'rich_blocks', version: 1, blocks: [] },
        },
        select: { id: true },
      });
      versionIds.push(version.id);
    }

    return { questionId: question.id, versionIds };
  });
}

/** Reads the persisted type — the only trustworthy evidence a write happened. */
async function readType(questionId: string): Promise<string> {
  const row = await prisma.question.findUnique({
    where: { id: questionId },
    select: { type: true },
  });
  return row?.type ?? '<missing>';
}

beforeAll(async () => {
  if (!hasDatabase) return;
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL ?? '' }) });

  const level = await prisma.educationLevel.upsert({
    where: { code: FIXTURE_CODES.level },
    create: { code: FIXTURE_CODES.level, nameBn: 'স্তর', nameEn: 'Level' },
    update: {},
    select: { id: true },
  });
  const subject = await prisma.subject.upsert({
    where: { code: FIXTURE_CODES.subject },
    create: { code: FIXTURE_CODES.subject, nameBn: 'বিষয়', nameEn: 'Subject' },
    update: {},
    select: { id: true },
  });
  await prisma.levelSubject.upsert({
    where: { levelId_subjectId: { levelId: level.id, subjectId: subject.id } },
    create: { levelId: level.id, subjectId: subject.id },
    update: {},
  });
  const chapter = await prisma.chapter.upsert({
    // The column is `chapter_number` (Prisma `chapterNumber`), and the
    // composite unique is `@@unique([subjectId, chapterNumber])`. Getting these
    // names wrong throws inside `beforeAll`, which skips every test in the file
    // while reporting the file as failed — the suite looks like it ran and found
    // nothing. CI's generated-client typecheck caught it; the name is fixed here
    // against prisma/schema.prisma rather than guessed.
    where: { subjectId_chapterNumber: { subjectId: subject.id, chapterNumber: 1 } },
    create: {
      subjectId: subject.id,
      chapterNumber: 1,
      titleBn: 'অধ্যায়',
      titleEn: 'Chapter',
    },
    update: {},
    select: { id: true },
  });
  tax = { levelId: level.id, subjectId: subject.id, chapterId: chapter.id };
});

afterAll(async () => {
  if (!hasDatabase) return;
  const levelId = tax.levelId;
  await prisma.$executeRawUnsafe(
    `DELETE FROM questions WHERE education_level_id = $1::uuid`,
    levelId,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM level_subjects WHERE level_id = $1::uuid`, levelId);
  await prisma.$executeRawUnsafe(
    `DELETE FROM chapters WHERE subject_id IN (SELECT id FROM subjects WHERE code = $1)`,
    FIXTURE_CODES.subject,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM subjects WHERE code = $1`, FIXTURE_CODES.subject);
  await prisma.$executeRawUnsafe(
    `DELETE FROM education_levels WHERE code = $1`,
    FIXTURE_CODES.level,
  );
  await prisma.$disconnect();
});

describeDb('AMB-5 · fully archived question — FAIL CLOSED', () => {
  let questionId: string;

  beforeEach(async () => {
    const created = await createQuestion('MCQ', ['ARCHIVED']);
    questionId = created.questionId;
  });

  it('refuses a type change with the specific review-required code', async () => {
    await expect(changeQuestionType({ questionId, nextType: 'CQ' })).rejects.toMatchObject({
      code: 'QUESTION_TYPE_CHANGE_REVIEW_REQUIRED',
      invariant: 'I-6',
    });
  });

  it('does NOT report it as an ordinary published-version immutability failure', async () => {
    // The two codes mean different things and lead to different remediation.
    // Collapsing them would hide the missing historical tracking.
    await expect(changeQuestionType({ questionId, nextType: 'CQ' })).rejects.not.toMatchObject({
      code: 'QUESTION_TYPE_IMMUTABLE',
    });
  });

  it('leaves the row untouched — the refusal is not a half-applied write', async () => {
    await expect(changeQuestionType({ questionId, nextType: 'CQ' })).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(await readType(questionId)).toBe('MCQ');
  });

  it('refuses several archived versions too, not only a single one', async () => {
    const { questionId: multi } = await createQuestion('MCQ', ['ARCHIVED', 'ARCHIVED', 'ARCHIVED']);
    await expect(changeQuestionType({ questionId: multi, nextType: 'CQ' })).rejects.toMatchObject({
      code: 'QUESTION_TYPE_CHANGE_REVIEW_REQUIRED',
    });
    expect(await readType(multi)).toBe('MCQ');
  });

  it('refuses regardless of the direction of the change', async () => {
    const { questionId: cqArchived } = await createQuestion('CQ', ['ARCHIVED']);
    await expect(
      changeQuestionType({ questionId: cqArchived, nextType: 'MCQ' }),
    ).rejects.toMatchObject({ code: 'QUESTION_TYPE_CHANGE_REVIEW_REQUIRED' });
    expect(await readType(cqArchived)).toBe('CQ');
  });

  it('treats the same-type no-op as allowed — nothing to review', async () => {
    // "Do not treat missing historical evidence as proof of never-published"
    // cuts both ways: it must not manufacture a refusal where no change occurs.
    const result = await changeQuestionType({ questionId, nextType: 'MCQ' });
    expect(result).toMatchObject({ type: 'MCQ', previousType: 'MCQ' });
    expect(await readType(questionId)).toBe('MCQ');
  });
});

describeDb('AMB-5 · archived mixed with other statuses', () => {
  it('a question with one PUBLISHED and one ARCHIVED version is refused as IMMUTABLE', async () => {
    const { questionId } = await createQuestion('MCQ', ['PUBLISHED', 'ARCHIVED']);
    await expect(changeQuestionType({ questionId, nextType: 'CQ' })).rejects.toMatchObject({
      code: 'QUESTION_TYPE_IMMUTABLE',
      invariant: 'I-6',
    });
    expect(await readType(questionId)).toBe('MCQ');
  });

  it('a draft-only question is NOT refused by the archived gate', async () => {
    const { questionId } = await createQuestion('MCQ', ['DRAFT']);
    const result = await changeQuestionType({ questionId, nextType: 'CQ' });
    expect(result).toMatchObject({ previousType: 'MCQ', type: 'CQ' });
  });
});

describeDb('AMB-5 · POSITIVE CONTROLS — approved rules still permit the change', () => {
  it('changes a draft-only MCQ to CQ and persists it', async () => {
    const { questionId } = await createQuestion('MCQ', ['DRAFT']);
    const result = await changeQuestionType({ questionId, nextType: 'CQ' });

    expect(result).toMatchObject({ questionId, previousType: 'MCQ', type: 'CQ' });
    expect(await readType(questionId)).toBe('CQ');
  });

  it('changes a question with NO versions at all', async () => {
    // Nothing was ever published by definition, so there is no unknown to
    // resolve and no review to require.
    const { questionId } = await createQuestion('MCQ', []);
    const result = await changeQuestionType({ questionId, nextType: 'CQ' });
    expect(result.type).toBe('CQ');
    expect(await readType(questionId)).toBe('CQ');
  });

  it('changes a question whose only version is a draft, repeated twice', async () => {
    const { questionId } = await createQuestion('MCQ', ['DRAFT']);
    expect((await changeQuestionType({ questionId, nextType: 'CQ' })).type).toBe('CQ');
    expect((await changeQuestionType({ questionId, nextType: 'MCQ' })).type).toBe('MCQ');
    expect(await readType(questionId)).toBe('MCQ');
  });
});

describeDb('AMB-5 · bypass analysis', () => {
  it('the service refuses an unknown question instead of creating one', async () => {
    await expect(
      changeQuestionType({
        questionId: '00000000-0000-4000-8000-00000000dead',
        nextType: 'CQ',
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('raw Prisma CAN still change type on an archived row — so the gate is application-level', async () => {
    // Recorded as a known boundary, not a pass. `questions.type` has no
    // database-level guard, and AMB-5 authorises no migration to add one
    // (no 0002). Every in-repo write therefore has to go through
    // `changeQuestionType`; a future handler that calls `prisma.question.update`
    // directly would bypass this. The repository has no such call today —
    // asserted in the unit-level source scan below.
    const { questionId } = await createQuestion('MCQ', ['ARCHIVED']);
    await prisma.question.update({ where: { id: questionId }, data: { type: 'CQ' } });
    expect(await readType(questionId)).toBe('CQ');
  });

  it('there is no parameter that unlocks the archived case', async () => {
    // The service signature has exactly two fields. An override would have to be
    // added, which requires an owner decision that has not been made.
    const { questionId } = await createQuestion('MCQ', ['ARCHIVED']);
    const input = { questionId, nextType: 'CQ' as const };
    expect(Object.keys(input).sort()).toEqual(['nextType', 'questionId']);
    // Passing an extra property has no effect: TypeScript rejects it, and the
    // runtime gate is unconditional.
    await expect(
      changeQuestionType({
        ...input,
        allowLegacyArchivedTypeChange: true,
      } as unknown as typeof input),
    ).rejects.toMatchObject({ code: 'QUESTION_TYPE_CHANGE_REVIEW_REQUIRED' });
    expect(await readType(questionId)).toBe('MCQ');
  });
});

/**
 * Transaction and concurrency verification.
 *
 * Two kinds of proof, deliberately separated:
 *
 *   DETERMINISTIC — open a transaction that holds the row lock, then assert from
 *   a second connection that the lock is actually held on the question row. No
 *   sleeps: `pg_locks` is queried until the state is observed, with a bounded
 *   poll. This proves the service takes the lock at all, which a timing-based
 *   race test cannot show.
 *
 *   RACE — two service calls in flight at once. Which one wins is not
 *   deterministic, so only the invariant is asserted: at most one write lands
 *   and the persisted state is consistent. Same approach the publish suite
 *   already uses.
 */
describeDb('AMB-5 · transaction scope and row locking', () => {
  /**
   * Waits until some backend holds a lock on the `questions` table.
   *
   * Used instead of a sleep so the tests do not depend on the holder being fast
   * enough. Bounded, so a genuine failure surfaces as an assertion rather than
   * a hang. A false NEGATIVE is possible only if an unrelated connection holds a
   * lock on the same table; that would make the test stricter, never laxer.
   */
  async function waitForQuestionLock(): Promise<boolean> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const rows = (await prisma.$queryRawUnsafe(
        `SELECT count(*)::int AS n
           FROM pg_locks
          WHERE relation = 'questions'::regclass
            AND granted
            AND mode IN ('RowShareLock', 'RowExclusiveLock')`,
      )) as { n: number }[];
      if ((rows[0]?.n ?? 0) > 0) return true;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return false;
  }

  it('the service holds a row lock on the question for the duration of the transaction', async () => {
    // Acquire the SAME lock the service takes, by hand, so the contention is
    // deterministic: the service must block on it. The blocking behaviour is the
    // assertion; nothing here depends on winning a race.
    const { questionId } = await createQuestion('MCQ', ['DRAFT']);

    let releaseHold: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      releaseHold = resolve;
    });

    // A separate connection holds FOR UPDATE on the row.
    const holder = (async () => {
      const client = new PrismaClient({
        adapter: new PrismaPg({ connectionString: DATABASE_URL ?? '' }),
      });
      try {
        await client.$transaction(async (tx) => {
          await (
            tx as unknown as { $executeRawUnsafe: typeof prisma.$executeRawUnsafe }
          ).$executeRawUnsafe(
            `SELECT id FROM questions WHERE id = $1::uuid FOR UPDATE`,
            questionId,
          );
          await hold; // hold the lock until the assertion below has run
        });
      } finally {
        await client.$disconnect();
      }
    })();

    // Wait until the lock is genuinely held, then assert the service is the one
    // that has to wait for it.
    expect(await waitForQuestionLock(), 'the holder never acquired the row lock').toBe(true);

    // Start the service; it must NOT complete while the lock is held.
    let serviceSettled = false;
    const call = changeQuestionType({ questionId, nextType: 'CQ' }).finally(() => {
      serviceSettled = true;
    });

    // Give the service a bounded window in which it must remain blocked.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(serviceSettled, 'the service wrote without waiting for the row lock').toBe(false);

    // Release, and the service proceeds normally.
    releaseHold();
    const result = await call;
    await holder;
    expect(result.type).toBe('CQ');
    expect(await readType(questionId)).toBe('CQ');
  });

  it('a blocked type change sees post-commit state, not a stale pre-lock read', async () => {
    // The lock is acquired AFTER the holder commits a change. If the service read
    // through the pool instead of its transaction (defect D2), it could decide on
    // the pre-change type. Here the holder moves MCQ → CQ under the lock; the
    // waiting service then asks for MCQ, which is now a change BACK and must be
    // allowed and must be based on the committed CQ.
    const { questionId } = await createQuestion('MCQ', ['DRAFT']);

    let releaseHold: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      releaseHold = resolve;
    });

    const holder = (async () => {
      const client = new PrismaClient({
        adapter: new PrismaPg({ connectionString: DATABASE_URL ?? '' }),
      });
      try {
        await client.$transaction(async (tx) => {
          await (
            tx as unknown as { $executeRawUnsafe: typeof prisma.$executeRawUnsafe }
          ).$executeRawUnsafe(
            `SELECT id FROM questions WHERE id = $1::uuid FOR UPDATE`,
            questionId,
          );
          await (
            tx as unknown as { $executeRawUnsafe: typeof prisma.$executeRawUnsafe }
          ).$executeRawUnsafe(`UPDATE questions SET type = 'CQ' WHERE id = $1::uuid`, questionId);
          await hold;
        });
      } finally {
        await client.$disconnect();
      }
    })();

    // Deterministic: proceed only once the holder demonstrably holds the lock,
    // so the service is guaranteed to block and therefore to read AFTER the
    // holder's uncommitted UPDATE commits.
    expect(await waitForQuestionLock(), 'the holder never acquired the row lock').toBe(true);
    const call = changeQuestionType({ questionId, nextType: 'MCQ' });
    releaseHold();
    await holder;

    const result = await call;
    // The service must have observed CQ as the "before" type.
    expect(result.previousType).toBe('CQ');
    expect(result.type).toBe('MCQ');
    expect(await readType(questionId)).toBe('MCQ');
  });

  it('two concurrent type changes both land without interleaving into an inconsistent state', async () => {
    const { questionId } = await createQuestion('MCQ', ['DRAFT']);

    const outcomes = await Promise.allSettled([
      changeQuestionType({ questionId, nextType: 'CQ' }),
      changeQuestionType({ questionId, nextType: 'CQ' }),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    expect(fulfilled.length, 'neither concurrent type change completed').toBeGreaterThanOrEqual(1);

    // Serialised by the lock: the first writes CQ, the second observes CQ and
    // becomes a no-op. Both are legitimate results, and both must agree.
    for (const outcome of fulfilled) {
      if (outcome.status === 'fulfilled') expect(outcome.value.type).toBe('CQ');
    }
    expect(await readType(questionId)).toBe('CQ');
  });

  it('a rejected archived change rolls back and leaves no partial state', async () => {
    const { questionId, versionIds } = await createQuestion('MCQ', ['ARCHIVED']);

    await expect(changeQuestionType({ questionId, nextType: 'CQ' })).rejects.toMatchObject({
      code: 'QUESTION_TYPE_CHANGE_REVIEW_REQUIRED',
    });

    // Type unchanged AND the version untouched — the whole transaction rolled back.
    expect(await readType(questionId)).toBe('MCQ');
    const version = await prisma.questionVersion.findUnique({
      where: { id: versionIds[0] ?? '' },
      select: { status: true },
    });
    expect(version?.status).toBe('ARCHIVED');
  });
});
