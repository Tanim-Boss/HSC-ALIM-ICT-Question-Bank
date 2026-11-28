/**
 * Phase 04D — the College filter, and the two renderings of one filter spec.
 *
 * Two claims are proved against real PostgreSQL 16:
 *
 * 1. COLLEGE IS AN INDEPENDENT PROVENANCE DIMENSION. It comes from
 *    `question_sources.college_id` — a real relation, never free text — and it
 *    never sets, clears or disables Board (README §7.1.1). Selecting both means
 *    both must hold, which is an AND of two `EXISTS` predicates: a question with
 *    a Dhaka Board source and a college source matches both, and a question with
 *    only one of them does not.
 *
 * 2. THE SERVICE AND THE PERF HARNESS SEE THE SAME ROWS. `listQuestionsForStaff`
 *    renders the spec through Prisma; `scripts/db/list-query-sql.ts` renders the
 *    same spec as SQL for `EXPLAIN`. The performance report is only meaningful if
 *    those two renderings return the same ids, so every case below is checked
 *    both ways.
 */

import { PrismaClient } from '@/lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { purgeQuestions } from '../purge';
import { Client as PgClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildListFilter } from '@/server/questions/authoring/list-filters';
import { createQuestion, listQuestionsForStaff } from '@/server/questions/authoring';
import type { ListQuestionsInput } from '@/server/questions/authoring/schemas';
import { renderMainStatement } from '../../../scripts/db/list-query-sql';
import { actorFor, ensureActorProfiles } from '../auth-fixtures';

const DATABASE_URL = process.env['DATABASE_URL'];
const hasDatabase = typeof DATABASE_URL === 'string' && DATABASE_URL.length > 0;
const describeDb = hasDatabase ? describe : describe.skip;

if (!hasDatabase) {
  console.warn('[04D] DATABASE_URL is not set — college-filter integration tests were SKIPPED.');
}

const CODES = { level: 'COLL4D_LEVEL', subject: 'COLL4D_SUBJECT', board: 'COLL4D' } as const;
const COLLEGE_A = 'COLL4D College A';
const COLLEGE_B = 'COLL4D College B';
const YEAR_LABEL = 'COLL4D-2026';
const UNKNOWN = '4d000000-0000-4000-8000-00000000dead';

let prisma: PrismaClient;
let pg: PgClient;
const tax = {
  levelId: '',
  subjectId: '',
  chapterId: '',
  topicId: '',
  boardId: '',
  yearId: '',
  collegeA: '',
  collegeB: '',
};

/** A JSON value as the draft input schema types it (zod's `JSONType`). */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const envelope = (blocks: Json[]): Json => ({ format: 'rich_blocks', version: 1, blocks });
const para = (text: string): Json => ({ type: 'paragraph', data: { text, lang: 'bn' } });
const stem = (text: string): Json => envelope([para(text)]);
const option = (text: string): Json => stem(text);

type Source = {
  sourceType: 'BOARD' | 'COLLEGE';
  boardId?: string;
  collegeId?: string;
  academicYearId?: string;
};

async function createWithSources(stemText: string, sources: Source[]): Promise<string> {
  const created = await createQuestion(actorFor('editor'), {
    type: 'MCQ',
    marks: 1,
    educationLevelId: tax.levelId,
    subjectId: tax.subjectId,
    chapterId: tax.chapterId,
    topicId: tax.topicId,
    sources,
    draft: {
      content: stem(stemText),
      options: [
        { key: 'A' as const, content: option('এক') },
        { key: 'B' as const, content: option('দুই') },
      ],
      answerKey: { mcqCorrectOptionKey: 'A' },
    },
  });
  return created.questionId;
}

async function serviceIds(input: ListQuestionsInput): Promise<string[]> {
  const page = await listQuestionsForStaff(actorFor('editor'), { limit: 50, ...input });
  return page.items.map((item) => item.id).sort();
}

/** The ids the perf harness's SQL renderer returns for the same spec. */
async function renderedIds(input: ListQuestionsInput): Promise<string[]> {
  const spec = buildListFilter({ limit: 50, ...input });
  const statement = renderMainStatement(spec);
  const rows = await pg.query<{ id: string }>(statement.sql, statement.values);
  // The renderer fetches limit+1 rows by design (it exists to be EXPLAINed and
  // must match Prisma's take); ids are compared modulo that extra row.
  return rows.rows
    .map((row) => row.id)
    .slice(0, spec.limit)
    .sort();
}

async function cleanup(): Promise<void> {
  await purgeQuestions(prisma, { subject: { code: CODES.subject } });
  await prisma.topic.deleteMany({ where: { chapter: { subject: { code: CODES.subject } } } });
  await prisma.chapter.deleteMany({ where: { subject: { code: CODES.subject } } });
  await prisma.levelSubject.deleteMany({ where: { subject: { code: CODES.subject } } });
  await prisma.subject.deleteMany({ where: { code: CODES.subject } });
  await prisma.educationLevel.deleteMany({ where: { code: CODES.level } });
  await prisma.board.deleteMany({ where: { code: CODES.board } });
  await prisma.academicYear.deleteMany({ where: { label: YEAR_LABEL } });
  await prisma.college.deleteMany({ where: { name: { in: [COLLEGE_A, COLLEGE_B] } } });
}

describeDb('Phase 04D — College filter and renderer equivalence', () => {
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL ?? '' }) });
    pg = new PgClient({ connectionString: DATABASE_URL ?? '' });
    await pg.connect();
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
    const board = await prisma.board.create({ data: { code: CODES.board, nameEn: 'Board' } });
    const year = await prisma.academicYear.create({ data: { label: YEAR_LABEL } });
    const collegeA = await prisma.college.create({ data: { name: COLLEGE_A } });
    const collegeB = await prisma.college.create({ data: { name: COLLEGE_B } });
    Object.assign(tax, {
      levelId: level.id,
      subjectId: subject.id,
      chapterId: chapter.id,
      topicId: topic.id,
      boardId: board.id,
      yearId: year.id,
      collegeA: collegeA.id,
      collegeB: collegeB.id,
    });

    ids['board'] = await createWithSources('বোর্ড প্রশ্ন', [
      { sourceType: 'BOARD', boardId: tax.boardId, academicYearId: tax.yearId },
    ]);
    ids['collegeA'] = await createWithSources('কলেজ এ প্রশ্ন', [
      { sourceType: 'COLLEGE', collegeId: tax.collegeA, academicYearId: tax.yearId },
    ]);
    ids['collegeANoYear'] = await createWithSources('কলেজ এ প্রশ্ন (সাল ছাড়া)', [
      { sourceType: 'COLLEGE', collegeId: tax.collegeA },
    ]);
    ids['collegeB'] = await createWithSources('কলেজ বি প্রশ্ন', [
      { sourceType: 'COLLEGE', collegeId: tax.collegeB, academicYearId: tax.yearId },
    ]);
    ids['both'] = await createWithSources('বোর্ড ও কলেজ দুটোই', [
      { sourceType: 'BOARD', boardId: tax.boardId, academicYearId: tax.yearId },
      { sourceType: 'COLLEGE', collegeId: tax.collegeA, academicYearId: tax.yearId },
    ]);
    ids['noSource'] = await createWithSources('উৎস ছাড়া প্রশ্ন', []);
  });

  afterAll(async () => {
    await cleanup();
    await pg.end();
    await prisma.$disconnect();
  });

  describe('College is its own dimension', () => {
    it('filters by college alone, and finds a question whose only source is a college', async () => {
      expect(await serviceIds({ collegeId: tax.collegeA })).toEqual(
        [ids['collegeA'], ids['collegeANoYear'], ids['both']].sort(),
      );
    });

    it('does not clear or disable Board when College is selected', async () => {
      expect(await serviceIds({ boardId: tax.boardId })).toEqual(
        [ids['board'], ids['both']].sort(),
      );
      expect(await serviceIds({ collegeId: tax.collegeB })).toEqual([ids['collegeB']]);
      // Board is still selectable in the same call, and still means Board.
      expect(await serviceIds({ boardId: tax.boardId, collegeId: tax.collegeA })).toEqual([
        ids['both'],
      ]);
    });

    it('requires BOTH dimensions when both are selected (AND, not OR)', async () => {
      const both = await serviceIds({ boardId: tax.boardId, collegeId: tax.collegeA });
      expect(both).toEqual([ids['both']]);
      // A board-only question does not match a college filter, and vice versa.
      expect(both).not.toContain(ids['board']);
      expect(both).not.toContain(ids['collegeA']);
      // College B has no board source of this board, so the pair is empty.
      expect(await serviceIds({ boardId: tax.boardId, collegeId: tax.collegeB })).toEqual([]);
    });

    it('applies the year to the college attribution, on the same source row', async () => {
      expect(await serviceIds({ collegeId: tax.collegeA, academicYearId: tax.yearId })).toEqual(
        [ids['collegeA'], ids['both']].sort(),
      );
      // The year-less college source is excluded by that combination but found
      // by the college filter on its own.
      expect(await serviceIds({ collegeId: tax.collegeA })).toContain(ids['collegeANoYear']);
    });

    it('applies the year to BOTH dimensions when both are selected', async () => {
      expect(
        await serviceIds({
          boardId: tax.boardId,
          collegeId: tax.collegeA,
          academicYearId: tax.yearId,
        }),
      ).toEqual([ids['both']]);
    });

    it('returns an empty page for an unknown college id', async () => {
      const page = await listQuestionsForStaff(actorFor('editor'), { collegeId: UNKNOWN });
      expect(page.items).toEqual([]);
      expect(page.nextCursor).toBeNull();
    });

    it('returns an empty page when an unknown college is combined with a real board', async () => {
      expect(await serviceIds({ boardId: tax.boardId, collegeId: UNKNOWN })).toEqual([]);
    });

    it('combines with chapter, status and type without changing their meaning', async () => {
      expect(
        await serviceIds({ collegeId: tax.collegeA, chapterId: tax.chapterId, type: 'MCQ' }),
      ).toEqual([ids['collegeA'], ids['collegeANoYear'], ids['both']].sort());
      expect(await serviceIds({ collegeId: tax.collegeA, type: 'CQ' })).toEqual([]);
    });

    it('paginates with a college filter without repeating or skipping a question', async () => {
      const first = await listQuestionsForStaff(actorFor('editor'), {
        collegeId: tax.collegeA,
        limit: 1,
      });
      expect(first.items).toHaveLength(1);
      expect(first.nextCursor).not.toBeNull();

      const second = await listQuestionsForStaff(actorFor('editor'), {
        collegeId: tax.collegeA,
        limit: 1,
        cursor: first.nextCursor ?? undefined,
      });
      expect(second.items).toHaveLength(1);
      expect(second.items[0]?.id).not.toBe(first.items[0]?.id);

      const third = await listQuestionsForStaff(actorFor('editor'), {
        collegeId: tax.collegeA,
        limit: 1,
        cursor: second.nextCursor ?? undefined,
      });
      const seen = [first, second, third].flatMap((page) => page.items.map((i) => i.id));
      expect(new Set(seen).size).toBe(3);
      expect(seen.sort()).toEqual([ids['collegeA'], ids['collegeANoYear'], ids['both']].sort());
    });

    it('is refused to a STUDENT, before any row is read', async () => {
      await expect(
        listQuestionsForStaff(actorFor('student'), { collegeId: tax.collegeA }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('the perf harness renders the same rows as the service', () => {
    // `build`, not a ready-made input: this table is read while the file is
    // being collected, but the taxonomy ids only exist after `beforeAll`.
    const cases: { name: string; build: () => ListQuestionsInput }[] = [
      { name: 'no filter', build: () => ({}) },
      { name: 'college only', build: () => ({ collegeId: tax.collegeA }) },
      { name: 'board only', build: () => ({ boardId: tax.boardId }) },
      {
        name: 'board + college',
        build: () => ({ boardId: tax.boardId, collegeId: tax.collegeA }),
      },
      {
        name: 'college + year',
        build: () => ({ collegeId: tax.collegeA, academicYearId: tax.yearId }),
      },
      { name: 'year only', build: () => ({ academicYearId: tax.yearId }) },
      {
        name: 'chapter + college',
        build: () => ({ collegeId: tax.collegeA, chapterId: tax.chapterId }),
      },
      { name: 'unknown college', build: () => ({ collegeId: UNKNOWN }) },
      {
        name: 'search + college',
        build: () => ({ collegeId: tax.collegeA, q: 'কলেজ' }),
      },
      {
        name: 'search + board + year',
        build: () => ({ boardId: tax.boardId, academicYearId: tax.yearId, q: 'বোর্ড' }),
      },
    ];

    /** Ids in one list but not the other, so a failure says WHICH row disagreed. */
    function difference(rendered: string[], service: string[]) {
      const inRendered = new Set(rendered);
      const inService = new Set(service);
      return {
        renderedOnly: rendered.filter((id) => !inService.has(id)),
        serviceOnly: service.filter((id) => !inRendered.has(id)),
        renderedCount: rendered.length,
        serviceCount: service.length,
      };
    }

    async function expectAgreement(input: ListQuestionsInput): Promise<void> {
      const rendered = await renderedIds(input);
      const service = await serviceIds(input);
      expect(
        rendered,
        `renderer vs service: ${JSON.stringify(difference(rendered, service))}`,
      ).toEqual(service);
    }

    for (const testCase of cases) {
      it(`agrees for: ${testCase.name}`, async () => {
        await expectAgreement(testCase.build());
      });
    }

    it('agrees on a cursor page', async () => {
      const first = await listQuestionsForStaff(actorFor('editor'), { limit: 2 });
      const cursor = first.nextCursor ?? '';
      await expectAgreement({ limit: 2, cursor });
    });
  });
});
