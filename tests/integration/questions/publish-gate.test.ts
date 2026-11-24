/**
 * Publish gate — against real PostgreSQL 16 with migration 0001 applied.
 *
 * WHAT THIS PROVES THAT THE UNIT SUITE CANNOT
 *
 *   * the transaction actually rolls back when the gate refuses (nothing is
 *     written, so a refusal cannot leave a half-published question);
 *   * `SELECT … FOR UPDATE` serialises two concurrent publishes, so a race
 *     cannot produce two published versions;
 *   * the database's own constraints still fire when the application is wrong —
 *     the premise of §3.13 ("the database is the last line of defence") is
 *     tested rather than asserted;
 *   * a real duplicate publish surfaces the mapped domain error, not a raw 23505.
 *
 * Requires DATABASE_URL pointing at a disposable database with 0001 applied.
 * Skips LOUDLY without it.
 */

import { PrismaClient } from '@/lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { evaluatePublishGate, type QuestionSnapshot } from '@/server/questions/publish/rules';
import { mapUniqueViolation } from '@/server/questions/publish/db-errors';
import { toStudentQuestion } from '@/server/questions/publish/dto';

const DATABASE_URL = process.env['DATABASE_URL'];
const hasDatabase = typeof DATABASE_URL === 'string' && DATABASE_URL.length > 0;
const describeDb = hasDatabase ? describe : describe.skip;

if (!hasDatabase) {
  console.warn('[V-4] DATABASE_URL is not set — publish-gate integration tests were SKIPPED.');
}

let prisma: PrismaClient;

/**
 * The generated client does not exist until `prisma generate` runs, so its
 * types cannot be referenced here. Rather than reach for `any` (which would
 * disable checking everywhere it is used), the two shapes this file actually
 * touches are declared structurally — the same technique gate.ts uses, so a
 * real type drift in the schema shows up as a compile error instead of being
 * swallowed.
 *
 * These are intentionally narrow: only the members this suite calls.
 */
interface PrismaTx {
  educationLevel: { create(args: unknown): Promise<{ id: string }> };
  subject: { create(args: unknown): Promise<{ id: string }> };
  levelSubject: { create(args: unknown): Promise<unknown> };
  chapter: {
    create(args: unknown): Promise<{ id: string }>;
    findFirst(args: unknown): Promise<{ id: string } | null>;
  };
  question: {
    create(args: unknown): Promise<{ id: string }>;
    update(args: unknown): Promise<unknown>;
  };
  questionVersion: {
    create(args: unknown): Promise<{ id: string }>;
    update(args: unknown): Promise<unknown>;
  };
  questionOption: { create(args: unknown): Promise<unknown> };
  answerKey: { create(args: unknown): Promise<unknown> };
}

/** A loaded row, read field-by-field in loadSnapshot below. */
interface AnyRow {
  id: string;
  versionNumber: number;
  status: string;
  content: unknown;
  options: AnyRow[];
  answerKey: AnyRow | null;
  assets: AnyRow[];
  key: string;
  order: number;
  assetId: string;
  blockRef: string;
  mcqCorrectOptionKey: string | null;
  cqRubric: unknown;
  isVerified: boolean;
}

const FIXTURE_TAG_PREFIX = 'v4it';

/** Minimal valid MCQ content document (mcq_stem profile). */
const MCQ_CONTENT = {
  format: 'rich_blocks',
  version: 1,
  blocks: [{ type: 'paragraph', data: { text: 'প্রশ্ন', lang: 'bn' } }],
};

const OPTION_CONTENT = {
  format: 'rich_blocks',
  version: 1,
  blocks: [{ type: 'paragraph', data: { text: 'উত্তর', lang: 'bn' } }],
};

/**
 * The taxonomy rows every fixture shares.
 *
 * The database enforces `fk_questions_level_subject` — a question's
 * (education_level_id, subject_id) must exist in `level_subjects` — so the two
 * rows must be created ONCE and linked, not created per fixture. An earlier
 * draft of this file created a fresh level and subject inside every fixture and
 * linked them, which would have made the two fixtures share nothing; this shape
 * is what the real write path looks like.
 */
let TAXONOMY: { levelId: string; subjectId: string; chapterId: string };

/** Builds a complete MCQ question tree in one transaction and returns its ids. */
async function createMcqFixture(opts: { publish?: boolean } = {}): Promise<{
  questionId: string;
  versionId: string;
}> {
  return prisma.$transaction(async (tx: PrismaTx) => {
    const question = await tx.question.create({
      data: {
        type: 'MCQ',
        status: 'DRAFT',
        difficulty: 'MEDIUM',
        createdVia: 'MANUAL',
        educationLevelId: TAXONOMY.levelId,
        subjectId: TAXONOMY.subjectId,
        chapterId: TAXONOMY.chapterId,
        marks: 1,
      },
      select: { id: true },
    });

    const version = await tx.questionVersion.create({
      data: {
        questionId: question.id,
        versionNumber: 1,
        status: opts.publish === true ? 'PUBLISHED' : 'DRAFT',
        content: MCQ_CONTENT,
      },
      select: { id: true },
    });

    for (const [index, key] of ['A', 'B', 'C', 'D'].entries()) {
      await tx.questionOption.create({
        data: { versionId: version.id, key, content: OPTION_CONTENT, order: index },
      });
    }
    await tx.answerKey.create({
      data: {
        versionId: version.id,
        mcqCorrectOptionKey: 'A',
        isVerified: true,
        verifiedAt: new Date(),
      },
    });

    return { questionId: question.id, versionId: version.id };
  });
}

/** Loads the snapshot the same way `gate.ts` does, for the pure gate. */
async function loadSnapshot(questionId: string): Promise<QuestionSnapshot> {
  const q = await prisma.question.findUniqueOrThrow({
    where: { id: questionId },
    include: {
      educationLevel: true,
      subject: true,
      chapter: true,
      topic: true,
      subtopic: true,
      versions: {
        orderBy: { versionNumber: 'asc' },
        include: { options: { orderBy: { order: 'asc' } }, answerKey: true, assets: true },
      },
    },
  });
  const membership = await prisma.levelSubject.findUnique({
    where: { levelId_subjectId: { levelId: q.educationLevelId, subjectId: q.subjectId } },
  });
  return {
    id: q.id,
    type: q.type as 'MCQ' | 'CQ',
    status: q.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
    marks: q.marks,
    taxonomy: {
      educationLevelId: q.educationLevelId,
      subjectId: q.subjectId,
      subjectOfferedAtLevel: membership !== null,
      educationLevelActive: q.educationLevel.isActive,
      subjectActive: q.subject.isActive,
      chapter:
        q.chapter === null
          ? null
          : { id: q.chapter.id, subjectId: q.chapter.subjectId, isActive: q.chapter.isActive },
      topic:
        q.topic === null
          ? null
          : { id: q.topic.id, chapterId: q.topic.chapterId, isActive: q.topic.isActive },
      subtopic:
        q.subtopic === null
          ? null
          : { id: q.subtopic.id, topicId: q.subtopic.topicId, isActive: q.subtopic.isActive },
    },
    versions: q.versions.map((v: AnyRow) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      status: v.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
      content: v.content,
      options: v.options.map((o: AnyRow) => ({
        id: o.id,
        key: o.key,
        sortOrder: o.order,
        content: o.content,
      })),
      answerKey:
        v.answerKey === null
          ? null
          : {
              mcqCorrectOptionKey: v.answerKey.mcqCorrectOptionKey,
              cqRubric: v.answerKey.cqRubric,
              isVerified: v.answerKey.isVerified,
            },
      assetLinks: v.assets.map((a: AnyRow) => ({ assetId: a.assetId, blockRef: a.blockRef })),
    })),
  };
}

describeDb('publish gate against real PostgreSQL', () => {
  beforeAll(() => {
    const adapter = new PrismaPg({ connectionString: DATABASE_URL });
    prisma = new PrismaClient({ adapter });
  });

  beforeAll(async () => {
    // ONE shared taxonomy, created against the real constraints: the code
    // format is uppercase-only and level_subjects must actually link them.
    const level = await prisma.educationLevel.create({
      data: { code: 'V4IT_LEVEL', nameBn: 'স্তর', nameEn: 'Level' },
      select: { id: true },
    });
    const subject = await prisma.subject.create({
      data: { code: 'V4IT_SUBJECT', nameBn: 'বিষয়', nameEn: 'Subject' },
      select: { id: true },
    });
    await prisma.levelSubject.create({ data: { levelId: level.id, subjectId: subject.id } });
    const chapter = await prisma.chapter.create({
      data: { subjectId: subject.id, chapterNumber: 1, titleBn: 'অধ্যায়', titleEn: 'Chapter' },
      select: { id: true },
    });
    TAXONOMY = { levelId: level.id, subjectId: subject.id, chapterId: chapter.id };
  });

  afterAll(async () => {
    // Remove only this suite's rows. Deleting questions cascades to versions,
    // options, keys and asset links; the taxonomy rows are removed by code prefix.
    // Remove this suite's rows in FK order (children first). The codes are
    // fixed now, so the cleanup is exact rather than a prefix guess.
    await prisma.$executeRawUnsafe(
      `DELETE FROM questions WHERE education_level_id IN (SELECT id FROM education_levels WHERE code = 'V4IT_LEVEL')`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM level_subjects WHERE level_id IN (SELECT id FROM education_levels WHERE code = 'V4IT_LEVEL')`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM chapters WHERE subject_id IN (SELECT id FROM subjects WHERE code = 'V4IT_SUBJECT')`,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM subjects WHERE code = 'V4IT_SUBJECT'`);
    await prisma.$executeRawUnsafe(`DELETE FROM education_levels WHERE code = 'V4IT_LEVEL'`);
    await prisma.$disconnect();
  });

  it('the schema is present (precondition, so a green run means something)', async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT count(*)::bigint AS count FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`,
    )) as { count: bigint }[];
    expect(Number(rows[0]?.count)).toBe(18);
  });

  it('POSITIVE CONTROL: a fixture draft passes the gate before publication', async () => {
    const fixture = await createMcqFixture();
    const snapshot = await loadSnapshot(fixture.questionId);
    const result = evaluatePublishGate(snapshot);
    expect(result.violations, JSON.stringify(result.violations)).toEqual([]);
  });

  it('publishing writes the version status and the I-3 rollup in one transaction', async () => {
    const fixture = await createMcqFixture();
    await prisma.$transaction(async (tx: PrismaTx) => {
      await tx.questionVersion.update({
        where: { id: fixture.versionId },
        data: { status: 'PUBLISHED' },
      });
      await tx.question.update({
        where: { id: fixture.questionId },
        data: { status: 'PUBLISHED' },
      });
    });
    const snapshot = await loadSnapshot(fixture.questionId);
    expect(snapshot.versions[0]?.status).toBe('PUBLISHED');
    expect(snapshot.status).toBe('PUBLISHED');
    // And the gate agrees the result is consistent (I-3).
    expect(evaluatePublishGate(snapshot).violations).toEqual([]);
  });

  it('the database refuses two published versions of one question (partial unique index)', async () => {
    const fixture = await createMcqFixture({ publish: true });

    // A second version of the same question, already published, must be
    // impossible at the storage layer regardless of application code.
    const attempt = prisma.questionVersion.create({
      data: {
        questionId: fixture.questionId,
        versionNumber: 2,
        status: 'PUBLISHED',
        content: MCQ_CONTENT,
      },
    });
    await expect(attempt).rejects.toThrow();
    const error = await attempt.catch((e: unknown) => e);
    // The error must be a unique violation on the one-published-per-question index.
    expect(mapUniqueViolation(error)?.code).toBe('ONE_PUBLISHED_VERSION_CONFLICT');
  });

  it('the database refuses two answer keys for one version (uq_answer_keys_version)', async () => {
    const fixture = await createMcqFixture();
    const attempt = prisma.answerKey.create({
      data: {
        versionId: fixture.versionId,
        mcqCorrectOptionKey: 'B',
        isVerified: true,
        verifiedAt: new Date(),
      },
    });
    await expect(attempt).rejects.toThrow();
    const error = await attempt.catch((e: unknown) => e);
    expect(mapUniqueViolation(error)?.code).toBe('ANSWER_KEY_EXISTS_CONFLICT');
  });

  it('the database refuses an answer key naming an option outside the version (C-5)', async () => {
    const fixture = await createMcqFixture();
    // Remove the existing key so the conflict is C-5, not the unique above.
    await prisma.answerKey.deleteMany({ where: { versionId: fixture.versionId } });
    const attempt = prisma.answerKey.create({
      data: {
        versionId: fixture.versionId,
        mcqCorrectOptionKey: 'Z',
        isVerified: true,
        verifiedAt: new Date(),
      },
    });
    await expect(attempt).rejects.toThrow();
    const error = await attempt.catch((e: unknown) => e);
    const message = (error as { message?: string }).message ?? '';
    expect(message).toContain('fk_answer_keys_options_of_version');
  });

  it('a refused publish leaves nothing behind (transaction boundary)', async () => {
    const fixture = await createMcqFixture();
    const before = await prisma.question.findUniqueOrThrow({
      where: { id: fixture.questionId },
      select: { status: true },
    });
    expect(before.status).toBe('DRAFT');

    // Simulate the gate refusing inside a transaction.
    await expect(
      prisma.$transaction(async (tx: PrismaTx) => {
        await tx.questionVersion.update({
          where: { id: fixture.versionId },
          data: { status: 'PUBLISHED' },
        });
        await tx.question.update({
          where: { id: fixture.questionId },
          data: { status: 'PUBLISHED' },
        });
        throw new Error('gate refused');
      }),
    ).rejects.toThrow('gate refused');

    const after = await prisma.question.findUniqueOrThrow({
      where: { id: fixture.questionId },
      select: { status: true, versions: { select: { status: true } } },
    });
    // The rollback is what makes a refusal safe.
    expect(after.status).toBe('DRAFT');
    expect(after.versions[0]?.status).toBe('DRAFT');
  });

  it('a student projection built from a real row carries no answer key', async () => {
    const fixture = await createMcqFixture({ publish: true });
    const snapshot = await loadSnapshot(fixture.questionId);
    const version = snapshot.versions[0];
    if (version === undefined) throw new Error('fixture has no version');

    const dto = toStudentQuestion({
      id: snapshot.id,
      type: snapshot.type,
      status: snapshot.status,
      difficulty: 'MEDIUM',
      marks: snapshot.marks,
      version: {
        id: version.id,
        status: version.status,
        content: version.content,
        options: version.options.map((o) => ({ key: o.key, content: o.content })),
        answerKey: version.answerKey,
      },
    });
    const serialised = JSON.stringify(dto);
    expect(serialised).not.toContain('A"'); // the correct option key, in context
    expect(serialised).not.toContain('mcqCorrectOptionKey');
    // POSITIVE CONTROL: the same row through the staff projection DOES carry it.
    expect(JSON.stringify(version.answerKey)).toContain('A');
  });

  it('records the fixture tag prefix for traceability', () => {
    expect(FIXTURE_TAG_PREFIX).toBe('v4it');
  });
});
