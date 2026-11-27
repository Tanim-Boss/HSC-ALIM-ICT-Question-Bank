/**
 * Phase 04D — `saveDraft` writes a MINIMAL DIFF.
 *
 * Phase 04C's save deleted every option row and the answer-key row, then
 * recreated them. That was correct, but it destroyed row identity and made every
 * save proportional to the whole version. Phase 04D upserts against the identity
 * the schema already defines — `question_options UNIQUE (version_id, key)` and
 * `answer_keys UNIQUE (version_id)` — so this file asserts the STATEMENTS a save
 * issues, which is exactly what changed:
 *
 *   · an unchanged save issues no option or key statements at all;
 *   · a changed option is UPDATEd in place (id preserved);
 *   · a reorder is a set of UPDATEs of `sort_order`, not a delete + insert;
 *   · a removed option is the only one deleted, an added one the only inserted;
 *   · an unchanged answer key is not touched — verification columns survive;
 *   · a changed answer key is retired BEFORE its option is deleted (C-5 is ON
 *     DELETE RESTRICT) and recreated with verification reset;
 *   · the search projection is written in the same UPDATE as `content`.
 *
 * The statement order matters, so the fake records an ordered log. Real
 * persistence (row ids surviving a save, optimistic concurrency between two
 * editors) is tested against PostgreSQL in
 * tests/integration/questions/save-draft-minimal-diff.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

/* The service refuses students before it touches the database; these tests are
 * about what an EDITOR's save does, so only the transaction client is faked. */
const txCalls: string[] = [];
let versionRow: Record<string, unknown> = {};
let updateData: Record<string, unknown> = {};
let questionType = 'MCQ';

const fakeTx = {
  $queryRaw: (..._args: unknown[]) => Promise.resolve([{ id: 'q' }]),
  question: {
    findUniqueOrThrow: () => Promise.resolve({ type: questionType }),
  },
  questionVersion: {
    findFirst: () => Promise.resolve(versionRow),
    update: ({ data }: { data: Record<string, unknown> }) => {
      txCalls.push('questionVersion.update');
      updateData = data;
      return Promise.resolve({ updatedAt: new Date('2026-01-02T00:00:00.000Z') });
    },
  },
  questionOption: {
    update: ({ where, data }: { where: unknown; data: unknown }) => {
      txCalls.push(`questionOption.update ${JSON.stringify(where)} ${JSON.stringify(data)}`);
      return Promise.resolve({});
    },
    deleteMany: ({ where }: { where: unknown }) => {
      txCalls.push(`questionOption.deleteMany ${JSON.stringify(where)}`);
      return Promise.resolve({ count: 1 });
    },
    createMany: ({ data }: { data: unknown }) => {
      txCalls.push(`questionOption.createMany ${JSON.stringify(data)}`);
      return Promise.resolve({ count: 1 });
    },
  },
  answerKey: {
    deleteMany: ({ where }: { where: unknown }) => {
      txCalls.push(`answerKey.deleteMany ${JSON.stringify(where)}`);
      return Promise.resolve({ count: 1 });
    },
    create: ({ data }: { data: unknown }) => {
      txCalls.push(`answerKey.create ${JSON.stringify(data)}`);
      return Promise.resolve({});
    },
  },
  auditEvent: {
    create: ({ data }: { data: unknown }) => {
      txCalls.push(`auditEvent.create ${JSON.stringify(data)}`);
      return Promise.resolve({});
    },
  },
};

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  getPrisma: () => ({
    $transaction: (work: (tx: unknown) => Promise<unknown>) => work(fakeTx),
  }),
}));

const { saveDraft } = await import('@/server/questions/authoring');
const { AppRole } = await import('@/lib/generated/prisma/enums');
const { buildVersionSearchText } = await import('@/server/questions/authoring/search-text');

const EDITOR = {
  userId: '0b000000-0000-4000-8000-000000000002',
  roles: new Set([AppRole.EDITOR]),
};
const VERIFIER = '0b000000-0000-4000-8000-000000000004';
const QUESTION = '0c000000-0000-4000-8000-000000000001';
const VERSION = '0c000000-0000-4000-8000-000000000002';
const UPDATED_AT = new Date('2026-01-01T10:00:00.000Z');
type OptionKey = 'A' | 'B' | 'C' | 'D';

/** A JSON value as the draft input schema types it (zod's `JSONType`). */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const envelope = (blocks: Json[]): Json => ({ format: 'rich_blocks', version: 1, blocks });
const paragraph = (text: string): Json => ({ type: 'paragraph', data: { text, lang: 'bn' } });
const stem = (text = 'নিচের কোনটি ইনপুট ডিভাইস?'): Json => envelope([paragraph(text)]);
const optionDoc = (text: string): Json => envelope([paragraph(text)]);

const OPTIONS = [
  { key: 'A', content: optionDoc('কিবোর্ড'), order: 0 },
  { key: 'B', content: optionDoc('মনিটর'), order: 1 },
  { key: 'C', content: optionDoc('প্রিন্টার'), order: 2 },
  { key: 'D', content: optionDoc('স্পিকার'), order: 3 },
] as const;

const draftOf = (
  options: readonly { key: string; content: Json }[],
  answerKey: { mcqCorrectOptionKey: OptionKey } | null = { mcqCorrectOptionKey: 'A' },
) => ({
  questionId: QUESTION,
  versionId: VERSION,
  expectedUpdatedAt: UPDATED_AT,
  draft: {
    content: stem(),
    // The service validates the keys; these fixtures only ever use A…D.
    options: options as { key: OptionKey; content: Json }[],
    answerKey,
  },
});

/** Only the statements about options and the key — the interesting ones. */
function childCalls(): string[] {
  return txCalls.filter(
    (call) =>
      call.startsWith('questionOption.') ||
      call.startsWith('answerKey.') ||
      call === 'questionVersion.update',
  );
}

beforeEach(() => {
  txCalls.length = 0;
  updateData = {};
  questionType = 'MCQ';
  versionRow = {
    id: VERSION,
    versionNumber: 1,
    status: 'DRAFT',
    content: stem(),
    updatedAt: UPDATED_AT,
    options: OPTIONS.map((option) => ({ ...option })),
    answerKey: {
      mcqCorrectOptionKey: 'A',
      cqRubric: null,
      isVerified: true,
      verifiedById: VERIFIER,
      verifiedAt: new Date('2026-01-01T11:00:00.000Z'),
    },
  };
});

describe('saveDraft — an unchanged save', () => {
  it('issues no option statement and no answer-key statement', async () => {
    await saveDraft(EDITOR, draftOf(OPTIONS.map((o) => ({ key: o.key, content: o.content }))));
    expect(childCalls()).toEqual(['questionVersion.update']);
  });

  it('still writes content, projection and updated_by in one UPDATE', async () => {
    await saveDraft(EDITOR, draftOf(OPTIONS.map((o) => ({ key: o.key, content: o.content }))));
    expect(updateData['updatedById']).toBe(EDITOR.userId);
    expect(updateData['searchText']).toBe(
      buildVersionSearchText(
        stem(),
        OPTIONS.map((o) => o.content),
      ),
    );
    // One statement carries both: the projection can never lag the document.
    expect(txCalls.filter((c) => c === 'questionVersion.update')).toHaveLength(1);
  });

  it('reports no changed fields and leaves verification alone', async () => {
    const result = await saveDraft(
      EDITOR,
      draftOf(OPTIONS.map((o) => ({ key: o.key, content: o.content }))),
    );
    expect(result.changedFields).toEqual([]);
    expect(result.answerKeyVerified).toBe(true);
    expect(txCalls.some((c) => c.startsWith('answerKey.'))).toBe(false);
  });
});

describe('saveDraft — a changed option', () => {
  it('updates that key in place and touches nothing else', async () => {
    const options = OPTIONS.map((option) => ({
      key: option.key,
      content: option.key === 'B' ? optionDoc('মনিটর (সংশোধিত)') : option.content,
    }));

    const result = await saveDraft(EDITOR, draftOf(options));

    const calls = childCalls();
    expect(calls.filter((c) => c.startsWith('questionOption.update'))).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith('questionOption.update'))[0]).toContain(`"key":"B"`);
    expect(calls.some((c) => c.includes('deleteMany') && c.startsWith('questionOption'))).toBe(
      false,
    );
    expect(calls.some((c) => c.includes('createMany') && c.startsWith('questionOption'))).toBe(
      false,
    );
    expect(result.changedFields).toContain('options');
    // The answer key did not change, so its verification survives.
    expect(result.answerKeyVerified).toBe(true);
  });
});

describe('saveDraft — a reorder', () => {
  it('writes sort_order with UPDATEs, never a delete + insert', async () => {
    // A and B swap display order; the option keys (identities) are unchanged.
    const reordered = [
      { key: 'B', content: OPTIONS[1].content, order: 0 },
      { key: 'A', content: OPTIONS[0].content, order: 1 },
      { key: 'C', content: OPTIONS[2].content, order: 2 },
      { key: 'D', content: OPTIONS[3].content, order: 3 },
    ];
    versionRow['options'] = reordered.map((option) => ({ ...option }));
    // The stored rows now say B=0, A=1; the draft asks for A first.
    const draft = [
      { key: 'A', content: OPTIONS[0].content },
      { key: 'B', content: OPTIONS[1].content },
      { key: 'C', content: OPTIONS[2].content },
      { key: 'D', content: OPTIONS[3].content },
    ];

    await saveDraft(EDITOR, draftOf(draft));

    const updates = childCalls().filter((c) => c.startsWith('questionOption.update'));
    expect(updates).toHaveLength(2);
    expect(updates.some((c) => c.includes('"key":"A"') && c.includes('"order":0'))).toBe(true);
    expect(updates.some((c) => c.includes('"key":"B"') && c.includes('"order":1'))).toBe(true);
    expect(childCalls().some((c) => c.includes('deleteMany') || c.includes('createMany'))).toBe(
      false,
    );
  });
});

describe('saveDraft — removed and added options', () => {
  it('deletes only the removed key', async () => {
    // D is dropped; the correct answer stays A, so the key row is untouched.
    const draft = OPTIONS.slice(0, 3).map((option) => ({
      key: option.key,
      content: option.content,
    }));

    await saveDraft(EDITOR, draftOf(draft));

    const deletes = childCalls().filter((c) => c.startsWith('questionOption.deleteMany'));
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toContain('"in":["D"]');
    expect(childCalls().some((c) => c.startsWith('answerKey.'))).toBe(false);
  });

  it('inserts only the added key', async () => {
    versionRow['options'] = OPTIONS.slice(0, 3).map((option) => ({ ...option }));
    const draft = OPTIONS.slice(0, 3)
      .map((option) => ({ key: option.key, content: option.content }))
      .concat([{ key: 'D', content: optionDoc('নতুন অপশন') }]);

    await saveDraft(EDITOR, draftOf(draft));

    const creates = childCalls().filter((c) => c.startsWith('questionOption.createMany'));
    expect(creates).toHaveLength(1);
    expect(creates[0]).toContain('"key":"D"');
    expect(creates[0]).not.toContain('"key":"A"');
    expect(childCalls().some((c) => c.startsWith('questionOption.update'))).toBe(false);
  });
});

describe('saveDraft — the answer key', () => {
  it('retires the old key before the option it named is deleted (C-5 is RESTRICT)', async () => {
    // A→B, and option A is removed in the same save.
    const draft = [
      { key: 'B', content: OPTIONS[1].content },
      { key: 'C', content: OPTIONS[2].content },
    ];

    await saveDraft(EDITOR, draftOf(draft, { mcqCorrectOptionKey: 'B' }));

    const order = childCalls();
    const keyDelete = order.findIndex((c) => c.startsWith('answerKey.deleteMany'));
    const optionDelete = order.findIndex((c) => c.startsWith('questionOption.deleteMany'));
    const keyCreate = order.findIndex((c) => c.startsWith('answerKey.create'));
    const optionCreate = order.findIndex((c) => c.startsWith('questionOption.createMany'));
    expect(keyDelete).toBeGreaterThanOrEqual(0);
    expect(optionDelete).toBeGreaterThan(keyDelete);
    expect(keyCreate).toBeGreaterThan(optionDelete);
    // A new option would have to exist before the key can reference it.
    if (optionCreate >= 0) expect(keyCreate).toBeGreaterThan(optionCreate);
  });

  it('recreates a CHANGED key unverified', async () => {
    await saveDraft(
      EDITOR,
      draftOf(
        OPTIONS.map((o) => ({ key: o.key, content: o.content })),
        {
          mcqCorrectOptionKey: 'C',
        },
      ),
    );

    const create = childCalls().find((c) => c.startsWith('answerKey.create'));
    expect(create).toContain('"mcqCorrectOptionKey":"C"');
    expect(create).toContain('"isVerified":false');
    expect(create).toContain('"verifiedById":null');
    expect(create).toContain('"verifiedAt":null');

    const result = await saveDraft(
      EDITOR,
      draftOf(
        OPTIONS.map((o) => ({ key: o.key, content: o.content })),
        {
          mcqCorrectOptionKey: 'C',
        },
      ),
    );
    expect(result.changedFields).toContain('answerKey');
    expect(result.answerKeyVerified).toBe(false);
  });

  it('keeps the key row when the payload is identical (verification survives)', async () => {
    await saveDraft(
      EDITOR,
      draftOf(
        OPTIONS.map((o) => ({ key: o.key, content: o.content })),
        { mcqCorrectOptionKey: 'A' },
      ),
    );
    expect(txCalls.some((c) => c.startsWith('answerKey.'))).toBe(false);
  });

  it('deletes the key when the draft drops it, and creates nothing', async () => {
    const result = await saveDraft(
      EDITOR,
      draftOf(
        OPTIONS.map((o) => ({ key: o.key, content: o.content })),
        null,
      ),
    );

    expect(childCalls().filter((c) => c.startsWith('answerKey.'))).toEqual([
      `answerKey.deleteMany ${JSON.stringify({ versionId: VERSION })}`,
    ]);
    expect(result.answerKeyVerified).toBeNull();
  });
});

describe('saveDraft — the projection never carries a secret', () => {
  it('does not include rubric text, and the key value is not searchable', async () => {
    await saveDraft(EDITOR, draftOf(OPTIONS.map((o) => ({ key: o.key, content: o.content }))));
    const projection = updateData['searchText'] as string;
    expect(projection).toContain('কিবোর্ড');
    expect(projection).not.toMatch(/rubric|zzrubriccanaryzz/i);
  });
});

describe('saveDraft — guards are unchanged', () => {
  it('refuses a stale expectedUpdatedAt with CONFLICT and writes nothing', async () => {
    await expect(
      saveDraft(EDITOR, {
        ...draftOf(OPTIONS.map((o) => ({ key: o.key, content: o.content }))),
        expectedUpdatedAt: new Date('2025-12-31T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(childCalls()).toEqual([]);
  });

  it('refuses to edit a PUBLISHED version', async () => {
    versionRow['status'] = 'PUBLISHED';
    await expect(
      saveDraft(EDITOR, draftOf(OPTIONS.map((o) => ({ key: o.key, content: o.content })))),
    ).rejects.toMatchObject({ code: 'PUBLISHED_VERSION_IMMUTABLE' });
    expect(childCalls()).toEqual([]);
  });

  it('refuses a correct option that is not among the options', async () => {
    await expect(
      saveDraft(
        EDITOR,
        draftOf(
          OPTIONS.slice(0, 2).map((o) => ({ key: o.key, content: o.content })),
          {
            mcqCorrectOptionKey: 'D',
          },
        ),
      ),
    ).rejects.toMatchObject({ code: 'ANSWER_KEY_OPTION_MISSING' });
    expect(childCalls()).toEqual([]);
  });
});
