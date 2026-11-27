/**
 * Phase 04D — staff search against real PostgreSQL 16.
 *
 * Two different things are proved here, and they fail for different reasons:
 *
 * 1. PARITY. The projection rule exists twice — `buildVersionSearchText` (TS,
 *    used on every write) and `ict_version_search_text` (SQL, used by migration
 *    0003's backfill and available to an operator as a drift detector). Two
 *    implementations of one rule drift unless something pins them together.
 *    Every fixture document is projected both ways and the strings must be
 *    identical. If this test is red, existing rows and new rows are being
 *    indexed by different rules.
 *
 * 2. BEHAVIOUR. A staff member searching the list must find Bangla, English and
 *    mixed content — and must NOT be able to find an answer key or a CQ rubric,
 *    which live in the same row as the content being searched.
 *
 * The SQL function is part of the committed history (0003), so this suite
 * requires it: if the function is missing the suite FAILS rather than skips,
 * because a green run that never exercised the rule would be a false pass
 * (the same policy the V-4/V-5 workflow applies to skipped suites).
 */

import { PrismaClient } from '@/lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createQuestion, listQuestionsForStaff } from '@/server/questions/authoring';
import { buildVersionSearchText } from '@/server/questions/authoring/search-text';
import { ACTOR_IDS, actorFor, ensureActorProfiles } from '../auth-fixtures';

const DATABASE_URL = process.env['DATABASE_URL'];
const hasDatabase = typeof DATABASE_URL === 'string' && DATABASE_URL.length > 0;
const describeDb = hasDatabase ? describe : describe.skip;

if (!hasDatabase) {
  console.warn('[04D] DATABASE_URL is not set — staff-search integration tests were SKIPPED.');
}

const CODES = { level: 'SRCH4D_LEVEL', subject: 'SRCH4D_SUBJECT', board: 'SRCH4D' } as const;
const TAG_SLUG = 'srch4d-tag';
const YEAR_LABEL = 'SRCH4D-2026';
const RUBRIC_CANARY = 'zzrubriccanaryzz';
const OPTION_CANARY = 'zzoptioncanaryzz';

let prisma: PrismaClient;
let db: PrismaClient;
const tax = { levelId: '', subjectId: '', chapterId: '', topicId: '', tagId: '', boardId: '', yearId: '' };

/* ── documents ───────────────────────────────────────────────────────────── */

/** A JSON value as the draft input schema types it (zod's `JSONType`). */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const envelope = (blocks: Json[]): Json => ({ format: 'rich_blocks', version: 1, blocks });
const para = (text: string, lang: 'bn' | 'en' = 'bn'): Json => ({
  type: 'paragraph',
  data: { text, lang },
});
const stem = (text: string): Json => envelope([para(text)]);
const option = (text: string): Json => stem(text);

const cqStem = (stimulus: string): Json =>
  envelope([
    para(stimulus),
    ...(['ক', 'খ', 'গ', 'ঘ'] as const).map((part, index) => ({
      type: 'subquestion',
      data: {
        part,
        maxMarks: (index + 1) as 1 | 2 | 3 | 4,
        blocks: [para(`উপপ্রশ্ন ${part}`)],
      },
    })),
  ]);

/** §7.7 cq_rubric — the canary lives in a criterion description. */
const cqRubric = (criterion: string): Json => ({
  format: 'cq_rubric' as const,
  version: 1 as const,
  totalMaxMarks: 10,
  parts: (['ক', 'খ', 'গ', 'ঘ'] as const).map((part, index) => ({
    part,
    maxMarks: (index + 1) as 1 | 2 | 3 | 4,
    criteria: [{ description: `${criterion} ${part}`, marks: (index + 1) as 1 | 2 | 3 | 4 }],
  })),
});

/** Creates an MCQ through the real command, so the projection is written by the service. */
async function createMcq(stemText: string, options: string[], correct = 0) {
  const keys = ['A', 'B', 'C', 'D'] as const;
  return createQuestion(actorFor('editor'), {
    type: 'MCQ',
    marks: 1,
    educationLevelId: tax.levelId,
    subjectId: tax.subjectId,
    chapterId: tax.chapterId,
    topicId: tax.topicId,
    tagIds: [tax.tagId],
    sources: [{ sourceType: 'BOARD', boardId: tax.boardId, academicYearId: tax.yearId }],
    draft: {
      content: stem(stemText),
      options: options.map((text, index): { key: (typeof keys)[number]; content: Json } => ({
        key: keys[index] ?? 'D',
        content: option(text),
      })),
      answerKey: { mcqCorrectOptionKey: keys[correct] ?? 'A' },
    },
  });
}

async function createCq(stimulus: string, rubricCriterion: string) {
  return createQuestion(actorFor('editor'), {
    type: 'CQ',
    marks: 10,
    educationLevelId: tax.levelId,
    subjectId: tax.subjectId,
    chapterId: tax.chapterId,
    topicId: tax.topicId,
    tagIds: [tax.tagId],
    sources: [{ sourceType: 'BOARD', boardId: tax.boardId, academicYearId: tax.yearId }],
    draft: {
      content: cqStem(stimulus),
      options: [] as { key: 'A'; content: Json }[],
      answerKey: { cqRubric: cqRubric(rubricCriterion) },
    },
  });
}

/** Ids the staff list returns for `input`, newest first. */
async function listIds(input: Parameters<typeof listQuestionsForStaff>[1]): Promise<string[]> {
  const page = await listQuestionsForStaff(actorFor('editor'), { limit: 50, ...input });
  return page.items.map((item) => item.id);
}

/* ── setup ───────────────────────────────────────────────────────────────── */

async function cleanup(): Promise<void> {
  await prisma.question.deleteMany({ where: { subject: { code: CODES.subject } } });
  await prisma.topic.deleteMany({ where: { chapter: { subject: { code: CODES.subject } } } });
  await prisma.chapter.deleteMany({ where: { subject: { code: CODES.subject } } });
  await prisma.levelSubject.deleteMany({ where: { subject: { code: CODES.subject } } });
  await prisma.subject.deleteMany({ where: { code: CODES.subject } });
  await prisma.educationLevel.deleteMany({ where: { code: CODES.level } });
  await prisma.tag.deleteMany({ where: { slug: TAG_SLUG } });
  await prisma.board.deleteMany({ where: { code: CODES.board } });
  await prisma.academicYear.deleteMany({ where: { label: YEAR_LABEL } });
}

describeDb('Phase 04D — staff search (real PostgreSQL)', () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL ?? '' }) });
    db = prisma;
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
    const topic = await prisma.topic.create({
      data: { chapterId: chapter.id, nameBn: 'টপিক', nameEn: 'Topic' },
    });
    const tag = await prisma.tag.create({ data: { name: 'Search 4D', slug: TAG_SLUG } });
    const board = await prisma.board.create({ data: { code: CODES.board, nameEn: 'Board' } });
    const year = await prisma.academicYear.create({ data: { label: YEAR_LABEL } });
    Object.assign(tax, {
      levelId: level.id,
      subjectId: subject.id,
      chapterId: chapter.id,
      topicId: topic.id,
      tagId: tag.id,
      boardId: board.id,
      yearId: year.id,
    });

    const fn = await prisma.$queryRaw<{ present: string | null }[]>`
      SELECT to_regprocedure('ict_version_search_text(jsonb, jsonb)')::text AS present`;
    expect(
      fn[0]?.present,
      'migration 0003 is not applied: the SQL projection function is missing',
    ).not.toBeNull();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  /* ── 1. parity ─────────────────────────────────────────────────────────── */

  describe('the TS builder and the SQL function produce identical text', () => {
    const documents: { name: string; content: Json; options: Json[] }[] = [
      { name: 'empty document', content: envelope([]), options: [] },
      { name: 'one paragraph', content: stem('নিচের কোনটি ইনপুট ডিভাইস?'), options: [] },
      {
        name: 'every text-bearing key',
        content: envelope([
          { type: 'heading', data: { text: 'শিরোনাম', level: 1, lang: 'bn' } },
          para('অনুচ্ছেদ'),
          { type: 'list', data: { ordered: true, items: [{ text: 'প্রথম' }, { text: 'দ্বিতীয়' }], lang: 'bn' } },
          {
            type: 'table',
            data: {
              headerRow: true,
              lang: 'bn',
              caption: 'সারণির ক্যাপশন',
              rows: [
                [{ text: 'শিরোনাম ঘর', header: true }, { text: 'মান', header: true }],
                [{ text: 'ঘর-এক' }, { text: '১' }],
              ],
            },
          },
          { type: 'code', data: { language: 'sql', code: 'SELECT 1', caption: 'কোড ক্যাপশন' } },
          { type: 'image', data: { assetId: tax.levelId, alt: 'বিকল্প টেক্সট', longDescription: 'দীর্ঘ বর্ণনা', caption: 'ছবির ক্যাপশন' } },
          { type: 'callout', data: { kind: 'info', text: 'সতর্কতা', lang: 'bn' } },
        ]),
        options: [option('কিবোর্ড'), option('মনিটর')],
      },
      {
        name: 'CQ stem with subquestions',
        content: cqStem('উদ্দীপক পড়ো'),
        options: [],
      },
      {
        name: 'Latin case, accents and whitespace',
        content: stem('  CAFÉ   Network\tওয়েব  '),
        options: [option('  Mixed   CASE  ')],
      },
      {
        name: 'Bangla conjuncts and joiners',
        content: stem('শিক্ষা ও ক্ষ \u09B0\u09CD\u200D\u09AF'),
        options: [option('কম্পিউটার')],
      },
      {
        name: 'punctuation only',
        content: stem('??? !!! ...'),
        options: [],
      },
      {
        name: 'missing text keys (structure only)',
        content: envelope([{ type: 'image', data: { assetId: tax.levelId } }]),
        options: [envelope([])],
      },
      {
        name: 'nested list inside a subquestion',
        content: envelope([
          para('উদ্দীপক'),
          {
            type: 'subquestion',
            data: {
              part: 'ক',
              maxMarks: 1,
              blocks: [
                { type: 'list', data: { ordered: false, items: [{ text: 'উপ-তালিকা' }], lang: 'bn' } },
              ],
            },
          },
          ...(['খ', 'গ', 'ঘ'] as const).map((part, index) => ({
            type: 'subquestion',
            data: { part, maxMarks: (index + 2) as 2 | 3 | 4, blocks: [para(`উপপ্রশ্ন ${part}`)] },
          })),
        ]),
        options: [],
      },
      {
        name: 'flowchart with description, alt and caption',
        content: envelope([
          {
            type: 'flowchart',
            data: {
              assetId: tax.levelId,
              alt: 'প্রবাহচিত্র',
              description: 'ধাপে ধাপে',
              caption: 'চিত্র',
            },
          },
          para('ব্যাখ্যা'),
        ]),
        options: [],
      },
      {
        // The SQL function truncates with left(...,20000) and PostgreSQL counts
        // characters, not bytes; the TS builder truncates by code point. Both
        // must land on the same string, or a long document would be indexed two
        // different ways.
        name: 'projection longer than 20000 characters (truncation parity)',
        content: stem('ক'.repeat(20_500)),
        options: [],
      },
      {
        name: 'astral characters at the truncation boundary',
        content: stem('😀'.repeat(20_050)),
        options: [],
      },
      {
        name: 'two blocks of the same type in one document',
        content: envelope([
          {
            type: 'table',
            data: {
              lang: 'bn',
              caption: 'ক',
              rows: [
                [{ text: 'খ' }, { text: 'গ' }],
                [{ text: 'ঘ' }, { text: 'ঙ' }],
              ],
            },
          },
          {
            type: 'list',
            data: { ordered: false, lang: 'bn', items: [{ text: 'চ' }, { text: 'ছ', lang: 'bn' }] },
          },
        ]),
        options: [],
      },
    ];

    for (const document of documents) {
      it(`matches for: ${document.name}`, async () => {
        const rows = await db.$queryRaw<{ text: string }[]>`
          SELECT ict_version_search_text(${JSON.stringify(document.content)}::jsonb,
                                          ${JSON.stringify(document.options)}::jsonb) AS text`;
        expect(rows[0]?.text).toBe(buildVersionSearchText(document.content, document.options));
      });
    }

    it('produces the same projection for a row the service wrote', async () => {
      const created = await createMcq('সমান্তরাল রেখা কাকে বলে?', ['অপশন এক', 'অপশন দুই']);
      const rows = await db.$queryRaw<{ stored: string; derived: string }[]>`
        SELECT v.search_text AS stored,
               ict_version_search_text(
                 v.content,
                 coalesce(
                   (SELECT jsonb_agg(o.content ORDER BY o.sort_order)
                      FROM question_options o WHERE o.version_id = v.id),
                   '[]'::jsonb
                 )
               ) AS derived
          FROM question_versions v WHERE v.id = ${created.versionId}::uuid`;
      expect(rows[0]?.stored).toBe(rows[0]?.derived);
      expect(rows[0]?.stored).toContain('অপশন এক');
    });
  });

  /* ── 2. behaviour ──────────────────────────────────────────────────────── */

  describe('what a staff search finds', () => {
    let englishId = '';
    let banglaId = '';
    let conjunctId = '';
    let optionId = '';
    let rubricId = '';
    let mixedId = '';

    beforeAll(async () => {
      englishId = (await createMcq('Which device is an input device?', ['Keyboard', 'Monitor'])).questionId;
      banglaId = (await createMcq('কম্পিউটারের প্রধান অংশ কোনটি?', ['কিবোর্ড', 'মনিটর'])).questionId;
      conjunctId = (await createMcq('শিক্ষার মূল উদ্দেশ্য কী?', ['জ্ঞান অর্জন', 'পরীক্ষা'])).questionId;
      optionId = (await createMcq('নিচের কোনটি সঠিক?', ['কিবোর্ড', `মনিটর ${OPTION_CANARY}`])).questionId;
      rubricId = (await createCq('উদ্দীপক: কম্পিউটার নেটওয়ার্ক', RUBRIC_CANARY)).questionId;
      mixedId = (await createMcq('HTML ওয়েব পেজ তৈরি করে', ['ট্যাগ', 'অ্যাট্রিবিউট'])).questionId;
    });

    it('finds English content, case-insensitively', async () => {
      expect(await listIds({ q: 'keyboard' })).toContain(englishId);
      expect(await listIds({ q: 'KEYBOARD' })).toContain(englishId);
    });

    it('finds Bangla content', async () => {
      expect(await listIds({ q: 'কম্পিউটারের' })).toContain(banglaId);
    });

    it('finds a Bangla conjunct, and a partial word containing it', async () => {
      expect(await listIds({ q: 'ক্ষ' })).toContain(conjunctId);
      expect(await listIds({ q: 'শিক্ষা' })).toContain(conjunctId);
    });

    it('finds a substring inside a word (infix search)', async () => {
      expect(await listIds({ q: 'ম্পিউটার' })).toContain(banglaId);
    });

    it('finds option text, not only the stem', async () => {
      expect(await listIds({ q: OPTION_CANARY })).toContain(optionId);
      expect(await listIds({ q: 'মনিটর' })).toContain(optionId);
    });

    it('requires every token of a mixed Bangla + English query in the same version', async () => {
      expect(await listIds({ q: 'html ওয়েব' })).toContain(mixedId);
      // Both tokens must be present; 'html' alone matches, the pair with an
      // unrelated token does not.
      expect(await listIds({ q: 'html কিবোর্ড' })).not.toContain(mixedId);
    });

    it('matches a decomposed Latin query against a composed projection', async () => {
      const composed = await createMcq('Café au lait', ['এক', 'দুই']);
      expect(await listIds({ q: 'cafe\u0301' })).toContain(composed.questionId);
    });

    it('treats punctuation in the stored text as content, and strips it from the query', async () => {
      const punctuated = await createMcq('কি? হ্যাঁ; ঠিক আছে!', ['এক', 'দুই']);
      expect(await listIds({ q: 'হ্যাঁ;' })).toContain(punctuated.questionId);
    });

    it('never matches an answer key or a rubric', async () => {
      // The rubric canary exists in answer_keys.cq_rubric and nowhere else.
      expect(await listIds({ q: RUBRIC_CANARY })).toEqual([]);
      const stored = await db.$queryRaw<{ text: string }[]>`
        SELECT search_text AS text FROM question_versions WHERE question_id = ${rubricId}::uuid`;
      expect(stored[0]?.text ?? '').not.toContain(RUBRIC_CANARY);
    });

    it('refuses a query that normalises to nothing, and a query over the bound', async () => {
      await expect(listQuestionsForStaff(actorFor('editor'), { q: '%%%' })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
      await expect(listQuestionsForStaff(actorFor('editor'), { q: 'x'.repeat(121) })).rejects.toMatchObject(
        { code: 'VALIDATION_FAILED' },
      );
      await expect(listQuestionsForStaff(actorFor('editor'), { q: '   ' })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    });

    it('a search that matches nothing returns an empty page, not the whole list', async () => {
      const page = await listQuestionsForStaff(actorFor('editor'), { q: 'zzznomatchzzz' });
      expect(page.items).toEqual([]);
      expect(page.nextCursor).toBeNull();
    });

    it('combines with the other filters and paginates', async () => {
      const all = await listQuestionsForStaff(actorFor('editor'), {
        q: 'কম্পিউটার',
        chapterId: tax.chapterId,
        limit: 1,
      });
      expect(all.items.length).toBe(1);
      expect(all.nextCursor).not.toBeNull();
      const next = await listQuestionsForStaff(actorFor('editor'), {
        q: 'কম্পিউটার',
        chapterId: tax.chapterId,
        limit: 1,
        cursor: all.nextCursor ?? undefined,
      });
      expect(next.items[0]?.id).not.toBe(all.items[0]?.id);
    });

    it('is readable by a moderator and refused to a student', async () => {
      await expect(
        listQuestionsForStaff(actorFor('student'), { q: 'কম্পিউটার' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      const asModerator = await listQuestionsForStaff(actorFor('moderator'), { q: 'কম্পিউটার' });
      expect(asModerator.items.length).toBeGreaterThan(0);
    });
  });

  it('keeps the projection in step with a save: new option text becomes searchable', async () => {
    const created = await createMcq('নিচের কোনটি সঠিক?', ['এক', 'দুই']);
    expect(await listIds({ q: 'নতুন টেক্সট' })).not.toContain(created.questionId);

    const { saveDraft } = await import('@/server/questions/authoring');
    const version = await prisma.questionVersion.findUniqueOrThrow({
      where: { id: created.versionId },
      select: { content: true, updatedAt: true },
    });
    await saveDraft(actorFor('editor'), {
      questionId: created.questionId,
      versionId: created.versionId,
      expectedUpdatedAt: version.updatedAt,
      draft: {
        // The row's stored document, re-sent unchanged: Prisma types it as
        // JsonValue, the draft input as JSONType.
        content: version.content as unknown as Json,
        options: [
          { key: 'A', content: option('এক') },
          { key: 'B', content: option('নতুন টেক্সট') },
        ],
        answerKey: { mcqCorrectOptionKey: 'A' },
      },
    });

    expect(await listIds({ q: 'নতুন টেক্সট' })).toContain(created.questionId);
    expect(await listIds({ q: 'দুই' })).not.toContain(created.questionId);
  });

  it('records the acting editor as the last editor of the searched row', async () => {
    const created = await createMcq('শেষ সম্পাদক পরীক্ষা', ['এক', 'দুই']);
    const version = await prisma.questionVersion.findUniqueOrThrow({
      where: { id: created.versionId },
      select: { updatedById: true },
    });
    expect(version.updatedById).toBe(ACTOR_IDS.editor);
  });
});
