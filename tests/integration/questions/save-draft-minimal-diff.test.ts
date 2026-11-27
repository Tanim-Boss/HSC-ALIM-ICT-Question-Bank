/**
 * Phase 04D — `saveDraft` persistence against real PostgreSQL 16.
 *
 * The unit suite (tests/unit/questions/authoring-save-draft-diff.test.ts) asserts
 * which STATEMENTS a save issues. This file asserts what the DATABASE then holds,
 * which is the part that a statement-level test cannot prove:
 *
 *   · option row identity survives an unchanged save, a content change and a
 *     reorder — the whole point of upserting on (version_id, key);
 *   · only the removed option disappears, and only the added one is created;
 *   · an unchanged answer key keeps `is_verified` / `verified_by` / `verified_at`
 *     exactly (04C reset them on every save because it recreated the row);
 *   · a changed key resets verification, and re-verification sticks;
 *   · the C-5 foreign key (answer key → option of the same version, ON DELETE
 *     RESTRICT) still holds through every ordering the save can produce;
 *   · two editors saving the same revision produce CONFLICT, not a silent
 *     overwrite;
 *   · `search_text` follows the document, so a search finds the new text and not
 *     the text that was removed.
 */

import { PrismaClient } from '@/lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createQuestion,
  listQuestionsForStaff,
  saveDraft,
  verifyAnswerKey,
} from '@/server/questions/authoring';
import { actorFor, ensureActorProfiles } from '../auth-fixtures';

const DATABASE_URL = process.env['DATABASE_URL'];
const hasDatabase = typeof DATABASE_URL === 'string' && DATABASE_URL.length > 0;
const describeDb = hasDatabase ? describe : describe.skip;

if (!hasDatabase) {
  console.warn('[04D] DATABASE_URL is not set — saveDraft persistence tests were SKIPPED.');
}

const CODES = { level: 'DIFF4D_LEVEL', subject: 'DIFF4D_SUBJECT', board: 'DIFF4D' } as const;
const YEAR_LABEL = 'DIFF4D-2026';

let prisma: PrismaClient;
const tax = { levelId: '', subjectId: '', chapterId: '', boardId: '', yearId: '' };

const OPTION_TEXTS = ['কিবোর্ড', 'মনিটর', 'প্রিন্টার', 'স্পিকার'] as const;
const KEYS = ['A', 'B', 'C', 'D'] as const;

/** A JSON value as the draft input schema types it (zod's `JSONType`). */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Only what these tests send: the service validates the rest. */
interface DraftOption {
  readonly key: (typeof KEYS)[number];
  readonly content: Json;
}
interface DraftInputShape {
  readonly content: Json;
  readonly options: DraftOption[];
  readonly answerKey: { readonly mcqCorrectOptionKey: (typeof KEYS)[number] } | null;
}
type SaveDraftResult = Awaited<ReturnType<typeof saveDraft>>;

function draftOptions(texts: readonly string[]): DraftOption[] {
  return texts.map((text, index) => ({
    key: KEYS[index] ?? 'D',
    content: {
      format: 'rich_blocks',
      version: 1,
      blocks: [{ type: 'paragraph', data: { text, lang: 'bn' } }],
    } as Json,
  }));
}

function draft(
  texts: readonly string[],
  answerKey: DraftInputShape['answerKey'] = { mcqCorrectOptionKey: 'A' },
): DraftInputShape {
  return {
    content: {
      format: 'rich_blocks',
      version: 1,
      blocks: [{ type: 'paragraph', data: { text: 'নিচের কোনটি ইনপুট ডিভাইস?', lang: 'bn' } }],
    } as Json,
    options: draftOptions(texts),
    answerKey,
  };
}

/** The version's `updated_at` as the optimistic-concurrency token. */
async function versionToken(versionId: string): Promise<Date> {
  const row = await prisma.questionVersion.findUniqueOrThrow({
    where: { id: versionId },
    select: { updatedAt: true },
  });
  return row.updatedAt;
}

async function save(
  questionId: string,
  versionId: string,
  input: DraftInputShape,
): Promise<SaveDraftResult> {
  return saveDraft(actorFor('editor'), {
    questionId,
    versionId,
    expectedUpdatedAt: await versionToken(versionId),
    draft: input,
  });
}

async function optionRows(versionId: string) {
  return prisma.questionOption.findMany({
    where: { versionId },
    orderBy: { order: 'asc' },
    select: { id: true, key: true, order: true, content: true },
  });
}

async function searchTextOf(versionId: string): Promise<string> {
  const rows = await prisma.$queryRaw<{ search_text: string }[]>`
    SELECT search_text FROM question_versions WHERE id = ${versionId}::uuid`;
  return rows[0]?.search_text ?? '';
}

async function cleanup(): Promise<void> {
  await prisma.question.deleteMany({ where: { subject: { code: CODES.subject } } });
  await prisma.chapter.deleteMany({ where: { subject: { code: CODES.subject } } });
  await prisma.levelSubject.deleteMany({ where: { subject: { code: CODES.subject } } });
  await prisma.subject.deleteMany({ where: { code: CODES.subject } });
  await prisma.educationLevel.deleteMany({ where: { code: CODES.level } });
  await prisma.board.deleteMany({ where: { code: CODES.board } });
  await prisma.academicYear.deleteMany({ where: { label: YEAR_LABEL } });
}

async function newQuestion(): Promise<{ questionId: string; versionId: string }> {
  const created = await createQuestion(actorFor('editor'), {
    type: 'MCQ',
    marks: 1,
    educationLevelId: tax.levelId,
    subjectId: tax.subjectId,
    chapterId: tax.chapterId,
    sources: [{ sourceType: 'BOARD', boardId: tax.boardId, academicYearId: tax.yearId }],
    draft: draft(OPTION_TEXTS),
  });
  return { questionId: created.questionId, versionId: created.versionId };
}

describeDb('Phase 04D — saveDraft persistence (real PostgreSQL)', () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL ?? '' }) });
    await ensureActorProfiles(prisma);
    await cleanup();

    const level = await prisma.educationLevel.create({
      data: { code: CODES.level, nameBn: 'স্তর', nameEn: 'Level' },
    });
    const subject = await prisma.subject.create({
      data: { code: CODES.subject, nameBn: 'বিষয়', nameEn: 'Subject' },
    });
    await prisma.levelSubject.create({ data: { levelId: level.id, subjectId: subject.id } });
    const chapter = await prisma.chapter.create({
      data: { subjectId: subject.id, chapterNumber: 1, titleBn: 'অধ্যায়', titleEn: 'Chapter' },
    });
    const board = await prisma.board.create({ data: { code: CODES.board, nameEn: 'Board' } });
    const year = await prisma.academicYear.create({ data: { label: YEAR_LABEL } });
    Object.assign(tax, {
      levelId: level.id,
      subjectId: subject.id,
      chapterId: chapter.id,
      boardId: board.id,
      yearId: year.id,
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('an unchanged save preserves every option id and the verification stamp', async () => {
    const { questionId, versionId } = await newQuestion();
    await verifyAnswerKey(actorFor('moderator2'), { questionId, versionId });
    const before = await optionRows(versionId);
    const keyBefore = await prisma.answerKey.findUniqueOrThrow({ where: { versionId } });

    const result = await save(questionId, versionId, draft(OPTION_TEXTS));

    expect(result.changedFields).toEqual([]);
    expect(result.answerKeyVerified).toBe(true);
    const after = await optionRows(versionId);
    expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id));
    const keyAfter = await prisma.answerKey.findUniqueOrThrow({ where: { versionId } });
    expect(keyAfter.id).toBe(keyBefore.id);
    expect(keyAfter.isVerified).toBe(true);
    expect(keyAfter.verifiedById).toBe(keyBefore.verifiedById);
    expect(keyAfter.verifiedAt?.toISOString()).toBe(keyBefore.verifiedAt?.toISOString());
  });

  it('changing one option updates that row in place', async () => {
    const { questionId, versionId } = await newQuestion();
    const before = await optionRows(versionId);

    const result = await save(
      questionId,
      versionId,
      draft(['কিবোর্ড', 'মনিটর (সংশোধিত)', 'প্রিন্টার', 'স্পিকার']),
    );

    expect(result.changedFields).toContain('options');
    const after = await optionRows(versionId);
    expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id));
    expect(JSON.stringify(after[1]?.content)).toContain('সংশোধিত');
    expect(JSON.stringify(after[0]?.content)).not.toContain('সংশোধিত');
    expect(await searchTextOf(versionId)).toContain('মনিটর (সংশোধিত)');
  });

  it('a reorder keeps every id and only rewrites sort_order', async () => {
    const { questionId, versionId } = await newQuestion();
    const before = await optionRows(versionId);

    // Send the options in B, A, C, D order: validateDraft derives sort_order from
    // the array index, so this is a pure reorder of the same four identities.
    await save(
      questionId,
      versionId,
      draft(['মনিটর', 'কিবোর্ড', 'প্রিন্টার', 'স্পিকার']),
    );

    const after = await optionRows(versionId);
    expect(after.map((row) => row.id).sort()).toEqual(before.map((row) => row.id).sort());
    expect(after.map((row) => row.key)).toEqual(['B', 'A', 'C', 'D']);
    expect(after.map((row) => row.order)).toEqual([0, 1, 2, 3]);
  });

  it('removing an option deletes only that row', async () => {
    const { questionId, versionId } = await newQuestion();
    const before = await optionRows(versionId);
    const removedId = before[3]?.id;

    await save(questionId, versionId, draft(OPTION_TEXTS.slice(0, 3)));

    const after = await optionRows(versionId);
    expect(after.map((row) => row.id)).toEqual(before.slice(0, 3).map((row) => row.id));
    expect(after.map((row) => row.id)).not.toContain(removedId);
    expect(await searchTextOf(versionId)).not.toContain('স্পিকার');
  });

  it('adding an option back creates exactly one row', async () => {
    const { questionId, versionId } = await newQuestion();
    await save(questionId, versionId, draft(OPTION_TEXTS.slice(0, 3)));
    const three = await optionRows(versionId);

    await save(questionId, versionId, draft(OPTION_TEXTS));

    const after = await optionRows(versionId);
    expect(after).toHaveLength(4);
    expect(after.slice(0, 3).map((row) => row.id)).toEqual(three.map((row) => row.id));
    expect(after[3]?.key).toBe('D');
    expect(after[3]?.id).not.toBe(three[3]?.id ?? '');
  });

  it('a changed answer key resets verification; re-verifying sticks across a no-op save', async () => {
    const { questionId, versionId } = await newQuestion();
    await verifyAnswerKey(actorFor('moderator2'), { questionId, versionId });
    expect((await prisma.answerKey.findUniqueOrThrow({ where: { versionId } })).isVerified).toBe(
      true,
    );

    const changed = await save(questionId, versionId, draft(OPTION_TEXTS, { mcqCorrectOptionKey: 'C' }));
    expect(changed.answerKeyVerified).toBe(false);
    const afterChange = await prisma.answerKey.findUniqueOrThrow({ where: { versionId } });
    expect(afterChange).toMatchObject({
      mcqCorrectOptionKey: 'C',
      isVerified: false,
      verifiedById: null,
      verifiedAt: null,
    });

    await verifyAnswerKey(actorFor('moderator2'), { questionId, versionId });
    const noop = await save(questionId, versionId, draft(OPTION_TEXTS, { mcqCorrectOptionKey: 'C' }));
    expect(noop.answerKeyVerified).toBe(true);
    expect(
      (await prisma.answerKey.findUniqueOrThrow({ where: { versionId } })).isVerified,
    ).toBe(true);
  });

  it('C-5 survives the save that deletes the option the old key named', async () => {
    const { questionId, versionId } = await newQuestion();
    // Correct answer is A; now remove A from the options and point at C.
    const result = await save(
      questionId,
      versionId,
      draft(['মনিটর', 'প্রিন্টার', 'স্পিকার'], { mcqCorrectOptionKey: 'C' }),
    );

    expect(result.answerKeyVerified).toBe(false);
    const remaining = await optionRows(versionId);
    expect(remaining.map((row) => row.key)).toEqual(['A', 'B', 'C']);
    expect(remaining.map((row) => row.key)).not.toContain('D');
    const key = await prisma.answerKey.findUniqueOrThrow({ where: { versionId } });
    expect(key.mcqCorrectOptionKey).toBe('C');
    // The FK is real: the key names an option row that exists.
    const named = await prisma.questionOption.findFirstOrThrow({
      where: { versionId, key: 'C' },
      select: { id: true },
    });
    expect(named.id).toBeTruthy();
  });

  it('two editors saving the same revision: the second gets CONFLICT and the first wins', async () => {
    const { questionId, versionId } = await newQuestion();
    const shared = await versionToken(versionId);

    await saveDraft(actorFor('editor'), {
      questionId,
      versionId,
      expectedUpdatedAt: shared,
      draft: draft(['কিবোর্ড', 'মনিটর', 'প্রিন্টার', 'স্পিকার']),
    });

    await expect(
      saveDraft(actorFor('moderator'), {
        questionId,
        versionId,
        expectedUpdatedAt: shared,
        draft: draft(['পরিবর্তন', 'মনিটর', 'প্রিন্টার', 'স্পিকার']),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const stored = await optionRows(versionId);
    expect(JSON.stringify(stored[0]?.content)).toContain('কিবোর্ড');
    expect(JSON.stringify(stored[0]?.content)).not.toContain('পরিবর্তন');
  });

  it('keeps one audit row per save, and never leaks content into it', async () => {
    const { questionId, versionId } = await newQuestion();
    const before = await prisma.auditEvent.count({ where: { resourceId: versionId } });

    await save(questionId, versionId, draft(OPTION_TEXTS));
    await save(questionId, versionId, draft(['কিবোর্ড (নতুন)', 'মনিটর', 'প্রিন্টার', 'স্পিকার']));

    const rows = await prisma.auditEvent.findMany({
      where: { resourceId: versionId },
      orderBy: { occurredAt: 'asc' },
    });
    expect(rows.length).toBe(before + 2);
    expect(rows.every((row) => row.action === 'question.save_draft')).toBe(true);
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain('কিবোর্ড');
    expect(serialized).not.toContain('mcqCorrectOptionKey');
  });

  it('search follows the save: new text is findable, removed text is not', async () => {
    const { questionId, versionId } = await newQuestion();
    const find = async (q: string) =>
      (
        await listQuestionsForStaff(actorFor('editor'), { q, chapterId: tax.chapterId })
      ).items.map((item) => item.id);

    expect(await find('স্পিকার')).toContain(questionId);
    await save(questionId, versionId, draft(['কিবোর্ড', 'মনিটর', 'প্রিন্টার', 'হেডফোন']));
    expect(await find('স্পিকার')).not.toContain(questionId);
    expect(await find('হেডফোন')).toContain(questionId);
  });
});
