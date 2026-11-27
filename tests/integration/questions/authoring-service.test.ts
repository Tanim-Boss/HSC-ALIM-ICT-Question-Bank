/**
 * Phase 04C — the authoring service against real PostgreSQL 16 with migrations
 * 0001 + 0002 applied. Every case drives the real commands and reads back what
 * the database actually holds.
 */

import { PrismaClient } from '@/lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  archiveQuestion,
  archiveVersion,
  createQuestion,
  createRevision,
  getQuestionForStaff,
  listQuestionsForStaff,
  saveDraft,
  verifyAnswerKey,
  type CreateQuestionInput,
} from '@/server/questions/authoring';
import { publishVersion } from '@/server/questions/publish/gate';
import { ACTOR_IDS, actorFor, ensureActorProfiles } from '../auth-fixtures';

const DATABASE_URL = process.env['DATABASE_URL'];
const hasDatabase = typeof DATABASE_URL === 'string' && DATABASE_URL.length > 0;
const describeDb = hasDatabase ? describe : describe.skip;

if (!hasDatabase) {
  console.warn('[04C] DATABASE_URL is not set — authoring integration tests were SKIPPED.');
}

const CODES = { level: 'AUTH4C_LEVEL', subject: 'AUTH4C_SUBJECT', board: 'AUTH4C' } as const;
const TAG_SLUGS = ['auth4c-tag', 'auth4c-page'] as const;
const YEAR_LABEL = 'AUTH4C-2026';

let prisma: PrismaClient;
const tax = {
  levelId: '',
  subjectId: '',
  chapter1: '',
  chapter2: '',
  topicIn1: '',
  topicIn2: '',
  tagId: '',
  pageTagId: '',
  boardId: '',
  yearId: '',
};

/* ── fixtures ────────────────────────────────────────────────────────────── */

const stem = (text = 'নিচের কোনটি ইনপুট ডিভাইস?') => ({
  format: 'rich_blocks',
  version: 1,
  blocks: [{ type: 'paragraph', data: { text, lang: 'bn' } }],
});
const option = (text: string) => ({
  format: 'rich_blocks',
  version: 1,
  blocks: [{ type: 'paragraph', data: { text, lang: 'bn' } }],
});
const fourOptions = () =>
  (['A', 'B', 'C', 'D'] as const).map((key, i) => ({
    key,
    content: option(['কিবোর্ড', 'মনিটর', 'প্রিন্টার', 'স্পিকার'][i] ?? key),
  }));

function mcqInput(overrides: Partial<CreateQuestionInput> = {}): CreateQuestionInput {
  return {
    type: 'MCQ',
    marks: 1,
    educationLevelId: tax.levelId,
    subjectId: tax.subjectId,
    chapterId: tax.chapter1,
    topicId: tax.topicIn1,
    tagIds: [tax.tagId],
    sources: [{ sourceType: 'BOARD', boardId: tax.boardId, academicYearId: tax.yearId }],
    draft: { content: stem(), options: fourOptions(), answerKey: { mcqCorrectOptionKey: 'A' } },
    ...overrides,
  };
}

async function auditRows(resourceId: string) {
  return prisma.auditEvent.findMany({ where: { resourceId }, orderBy: { occurredAt: 'asc' } });
}

async function counts() {
  const [questions, versions, audit] = await Promise.all([
    prisma.question.count({ where: { subjectId: tax.subjectId } }),
    prisma.questionVersion.count({ where: { question: { subjectId: tax.subjectId } } }),
    prisma.auditEvent.count(),
  ]);
  return { questions, versions, audit };
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

async function versionRow(versionId: string) {
  return prisma.questionVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: { options: { orderBy: { order: 'asc' } }, answerKey: true, assets: true },
  });
}

/** Editor A creates; moderator2 verifies — a publishable question. */
async function publishableDraft() {
  const created = await createQuestion(actorFor('editor'), mcqInput());
  await verifyAnswerKey(actorFor('moderator2'), {
    questionId: created.questionId,
    versionId: created.versionId,
  });
  return created;
}

/* ── setup ───────────────────────────────────────────────────────────────── */

async function cleanup(): Promise<void> {
  await prisma.question.deleteMany({
    where: { subject: { code: CODES.subject } },
  });
  await prisma.topic.deleteMany({ where: { chapter: { subject: { code: CODES.subject } } } });
  await prisma.chapter.deleteMany({ where: { subject: { code: CODES.subject } } });
  await prisma.levelSubject.deleteMany({ where: { subject: { code: CODES.subject } } });
  await prisma.subject.deleteMany({ where: { code: CODES.subject } });
  await prisma.educationLevel.deleteMany({ where: { code: CODES.level } });
  await prisma.tag.deleteMany({ where: { slug: { in: [...TAG_SLUGS] } } });
  await prisma.board.deleteMany({ where: { code: CODES.board } });
  await prisma.academicYear.deleteMany({ where: { label: YEAR_LABEL } });
}

describeDb('Phase 04C — question authoring service (real PostgreSQL)', () => {
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
    const c1 = await prisma.chapter.create({
      data: { subjectId: subject.id, chapterNumber: 1, titleBn: 'অধ্যায় ১', titleEn: 'Chapter 1' },
    });
    const c2 = await prisma.chapter.create({
      data: { subjectId: subject.id, chapterNumber: 2, titleBn: 'অধ্যায় ২', titleEn: 'Chapter 2' },
    });
    const t1 = await prisma.topic.create({
      data: { chapterId: c1.id, nameBn: 'টপিক ১', nameEn: 'Topic 1' },
    });
    const t2 = await prisma.topic.create({
      data: { chapterId: c2.id, nameBn: 'টপিক ২', nameEn: 'Topic 2' },
    });
    const tag = await prisma.tag.create({ data: { name: 'Auth4C tag', slug: TAG_SLUGS[0] } });
    const pageTag = await prisma.tag.create({ data: { name: 'Auth4C page', slug: TAG_SLUGS[1] } });
    const board = await prisma.board.create({ data: { code: CODES.board, nameEn: 'Board' } });
    const year = await prisma.academicYear.create({ data: { label: YEAR_LABEL } });
    Object.assign(tax, {
      levelId: level.id,
      subjectId: subject.id,
      chapter1: c1.id,
      chapter2: c2.id,
      topicIn1: t1.id,
      topicIn2: t2.id,
      tagId: tag.id,
      pageTagId: pageTag.id,
      boardId: board.id,
      yearId: year.id,
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  /* ── createQuestion ──────────────────────────────────────────────────── */

  it('EDITOR creates a question → v1 DRAFT with created_by set, one audit row', async () => {
    const before = await counts();
    const result = await createQuestion(actorFor('editor'), mcqInput());

    const question = await prisma.question.findUniqueOrThrow({
      where: { id: result.questionId },
      include: { tags: true, sources: true },
    });
    expect(question).toMatchObject({ status: 'DRAFT', type: 'MCQ', chapterId: tax.chapter1 });
    expect(question.tags.map((t) => t.tagId)).toEqual([tax.tagId]);
    expect(question.sources).toHaveLength(1);

    const v1 = await versionRow(result.versionId);
    expect(v1).toMatchObject({
      versionNumber: 1,
      status: 'DRAFT',
      createdById: ACTOR_IDS.editor,
      updatedById: ACTOR_IDS.editor,
      publishedById: null,
    });
    expect(v1.options.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D']);
    expect(v1.answerKey).toMatchObject({
      mcqCorrectOptionKey: 'A',
      isVerified: false,
      verifiedById: null,
    });

    const rows = await auditRows(result.questionId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: ACTOR_IDS.editor,
      action: 'question.create',
      resourceType: 'question',
    });
    expect(JSON.stringify(rows[0]?.after)).not.toMatch(/কিবোর্ড|mcqCorrectOptionKey|blocks/);

    const after = await counts();
    expect(after.questions - before.questions).toBe(1);
    expect(after.versions - before.versions).toBe(1);
    expect(after.audit - before.audit).toBe(1);
  });

  it('accepts an incomplete draft: stem only, no options, no key', async () => {
    const result = await createQuestion(
      actorFor('editor'),
      mcqInput({ draft: { content: stem() }, tagIds: [], sources: [] }),
    );
    const v1 = await versionRow(result.versionId);
    expect(v1.options).toEqual([]);
    expect(v1.answerKey).toBeNull();
  });

  it('invalid taxonomy chain (topic not in chapter) → clean DomainError, no rows', async () => {
    const before = await counts();
    const error = await caught(
      createQuestion(
        actorFor('editor'),
        mcqInput({ chapterId: tax.chapter1, topicId: tax.topicIn2 }),
      ),
    );
    expect(error).toMatchObject({ code: 'TAXONOMY_CHAIN_INVALID', field: 'topicId' });
    expect((error as Error).message).not.toMatch(/constraint|violates|fk_|23503/i);
    expect(await counts()).toEqual(before);
  });

  it('a chapter that does not exist and an unknown tag map to REFERENCE_NOT_FOUND', async () => {
    const missing = '0c000000-0000-4000-8000-00000000dead';
    const before = await counts();
    expect(
      await caught(
        createQuestion(actorFor('editor'), mcqInput({ chapterId: missing, topicId: undefined })),
      ),
    ).toMatchObject({ code: 'REFERENCE_NOT_FOUND', field: 'chapterId' });
    expect(
      await caught(createQuestion(actorFor('editor'), mcqInput({ tagIds: [missing] }))),
    ).toMatchObject({ code: 'REFERENCE_NOT_FOUND', field: 'tagIds' });
    expect(await counts()).toEqual(before);
  });

  /* ── STUDENT ─────────────────────────────────────────────────────────── */

  it('STUDENT → FORBIDDEN for every command, no rows and no audit row', async () => {
    const existing = await createQuestion(actorFor('editor'), mcqInput());
    const v1 = await versionRow(existing.versionId);
    const before = await counts();
    const student = actorFor('student');
    const ids = { questionId: existing.questionId, versionId: existing.versionId };

    const attempts = [
      createQuestion(student, mcqInput()),
      saveDraft(student, {
        ...ids,
        expectedUpdatedAt: v1.updatedAt,
        draft: { content: stem('বদল') },
      }),
      createRevision(student, { questionId: ids.questionId }),
      verifyAnswerKey(student, ids),
      archiveVersion(student, ids),
      archiveQuestion(student, { questionId: ids.questionId }),
      listQuestionsForStaff(student, {}),
      getQuestionForStaff(student, { questionId: ids.questionId }),
    ];
    for (const attempt of attempts) {
      expect(await caught(attempt)).toMatchObject({ code: 'FORBIDDEN' });
    }

    expect(await counts()).toEqual(before);
    expect(await versionRow(existing.versionId)).toEqual(v1);
  });

  /* ── saveDraft ───────────────────────────────────────────────────────── */

  it('saveDraft sets updated_by, advances updated_at and audits the changed field names', async () => {
    const created = await createQuestion(actorFor('editor'), mcqInput());
    const v1 = await versionRow(created.versionId);

    const saved = await saveDraft(actorFor('editorModerator'), {
      questionId: created.questionId,
      versionId: created.versionId,
      expectedUpdatedAt: v1.updatedAt,
      draft: {
        content: stem('পরিবর্তিত প্রশ্ন'),
        options: fourOptions(),
        answerKey: { mcqCorrectOptionKey: 'A' },
      },
    });
    expect(saved.changedFields).toEqual(['content']);

    const after = await versionRow(created.versionId);
    expect(after.updatedById).toBe(ACTOR_IDS.editorModerator);
    expect(after.createdById).toBe(ACTOR_IDS.editor);
    expect(after.updatedAt.getTime()).toBeGreaterThan(v1.updatedAt.getTime());
    expect(after.updatedAt.getTime()).toBe(saved.versionUpdatedAt.getTime());

    const rows = await auditRows(created.versionId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'question.save_draft',
      actorId: ACTOR_IDS.editorModerator,
    });
    expect(rows[0]?.after).toMatchObject({ changedFields: ['content'] });
    expect(JSON.stringify(rows[0]?.after)).not.toMatch(/পরিবর্তিত/);
  });

  it('saveDraft on a PUBLISHED version → refused; nothing written', async () => {
    const created = await publishableDraft();
    await publishVersion(actorFor('moderator'), {
      questionId: created.questionId,
      versionId: created.versionId,
    });
    const published = await versionRow(created.versionId);
    const auditBefore = (await auditRows(created.versionId)).length;

    const error = await caught(
      saveDraft(actorFor('editor'), {
        questionId: created.questionId,
        versionId: created.versionId,
        expectedUpdatedAt: published.updatedAt,
        draft: { content: stem('চুপিচুপি বদল') },
      }),
    );
    expect(error).toMatchObject({ code: 'PUBLISHED_VERSION_IMMUTABLE', invariant: 'I-5' });
    expect(await versionRow(created.versionId)).toEqual(published);
    expect(await auditRows(created.versionId)).toHaveLength(auditBefore);
  });

  it('a stale expectedUpdatedAt → CONFLICT, and the other editor’s work survives', async () => {
    const created = await createQuestion(actorFor('editor'), mcqInput());
    const opened = await versionRow(created.versionId);

    // Editor A saves first.
    await saveDraft(actorFor('editor'), {
      questionId: created.questionId,
      versionId: created.versionId,
      expectedUpdatedAt: opened.updatedAt,
      draft: {
        content: stem('A-র সংস্করণ'),
        options: fourOptions(),
        answerKey: { mcqCorrectOptionKey: 'A' },
      },
    });
    const afterA = await versionRow(created.versionId);

    // Editor B still holds the old timestamp.
    const error = await caught(
      saveDraft(actorFor('editorModerator'), {
        questionId: created.questionId,
        versionId: created.versionId,
        expectedUpdatedAt: opened.updatedAt,
        draft: { content: stem('B-র সংস্করণ') },
      }),
    );
    expect(error).toMatchObject({ code: 'CONFLICT', field: 'expectedUpdatedAt' });
    expect(await versionRow(created.versionId)).toEqual(afterA);
  });

  it('two saves in quick succession get distinct updated_at values', async () => {
    const created = await createQuestion(actorFor('editor'), mcqInput());
    const v = await versionRow(created.versionId);
    const ids = { questionId: created.questionId, versionId: created.versionId };
    const first = await saveDraft(actorFor('editor'), {
      ...ids,
      expectedUpdatedAt: v.updatedAt,
      draft: { content: stem('১') },
    });
    const second = await saveDraft(actorFor('editor'), {
      ...ids,
      expectedUpdatedAt: first.versionUpdatedAt,
      draft: { content: stem('২') },
    });
    expect(second.versionUpdatedAt.getTime()).toBeGreaterThan(first.versionUpdatedAt.getTime());
    // And the first timestamp is now stale.
    expect(
      await caught(
        saveDraft(actorFor('editor'), {
          ...ids,
          expectedUpdatedAt: first.versionUpdatedAt,
          draft: { content: stem('৩') },
        }),
      ),
    ).toMatchObject({ code: 'CONFLICT' });
  });

  it('editing the answer key resets verification; an unchanged key keeps it', async () => {
    const created = await publishableDraft(); // key 'A', verified by moderator2
    const ids = { questionId: created.questionId, versionId: created.versionId };
    const verified = await versionRow(created.versionId);
    expect(verified.answerKey).toMatchObject({
      isVerified: true,
      verifiedById: ACTOR_IDS.moderator2,
    });

    // Same key, new stem → verification kept.
    const kept = await saveDraft(actorFor('editor'), {
      ...ids,
      expectedUpdatedAt: verified.updatedAt,
      draft: {
        content: stem('নতুন কাণ্ড'),
        options: fourOptions(),
        answerKey: { mcqCorrectOptionKey: 'A' },
      },
    });
    expect(kept.answerKeyVerified).toBe(true);
    expect((await versionRow(created.versionId)).answerKey?.verifiedById).toBe(
      ACTOR_IDS.moderator2,
    );

    // Different key → reset.
    const reset = await saveDraft(actorFor('editor'), {
      ...ids,
      expectedUpdatedAt: kept.versionUpdatedAt,
      draft: {
        content: stem('নতুন কাণ্ড'),
        options: fourOptions(),
        answerKey: { mcqCorrectOptionKey: 'C' },
      },
    });
    expect(reset.changedFields).toEqual(['answerKey']);
    const after = await versionRow(created.versionId);
    expect(after.answerKey).toMatchObject({
      mcqCorrectOptionKey: 'C',
      isVerified: false,
      verifiedById: null,
      verifiedAt: null,
    });
    const last = (await auditRows(created.versionId)).at(-1);
    expect(last?.after).toMatchObject({ verificationReset: true, isVerified: false });
  });

  it('a correct option that is not among the saved options is refused at the boundary', async () => {
    const created = await createQuestion(actorFor('editor'), mcqInput());
    const v = await versionRow(created.versionId);
    const error = await caught(
      saveDraft(actorFor('editor'), {
        questionId: created.questionId,
        versionId: created.versionId,
        expectedUpdatedAt: v.updatedAt,
        draft: {
          content: stem(),
          options: fourOptions().slice(0, 2),
          answerKey: { mcqCorrectOptionKey: 'D' },
        },
      }),
    );
    expect(error).toMatchObject({ code: 'ANSWER_KEY_OPTION_MISSING' });
    expect(await versionRow(created.versionId)).toEqual(v);
  });

  /* ── separation of duties, end to end ────────────────────────────────── */

  it('end to end: editor A creates and saves → A cannot publish → moderator B publishes, published_by = B', async () => {
    const A = actorFor('editor');
    const created = await createQuestion(A, mcqInput());
    const opened = await versionRow(created.versionId);
    await saveDraft(A, {
      questionId: created.questionId,
      versionId: created.versionId,
      expectedUpdatedAt: opened.updatedAt,
      draft: {
        content: stem('চূড়ান্ত'),
        options: fourOptions(),
        answerKey: { mcqCorrectOptionKey: 'B' },
      },
    });
    // The key is checked by someone other than its author.
    await verifyAnswerKey(actorFor('moderator2'), {
      questionId: created.questionId,
      versionId: created.versionId,
    });

    const ids = { questionId: created.questionId, versionId: created.versionId };
    expect(await caught(publishVersion(A, ids))).toMatchObject({ code: 'FORBIDDEN' });
    expect((await versionRow(created.versionId)).status).toBe('DRAFT');

    await publishVersion(actorFor('moderator'), ids);
    const published = await versionRow(created.versionId);
    expect(published).toMatchObject({
      status: 'PUBLISHED',
      publishedById: ACTOR_IDS.moderator,
      updatedById: ACTOR_IDS.editor,
    });
  });

  it('separation of duties fires on real authorship: an editor-moderator cannot verify or publish their own edit', async () => {
    const author = actorFor('editorModerator');
    const created = await createQuestion(author, mcqInput());
    const ids = { questionId: created.questionId, versionId: created.versionId };

    expect(await caught(verifyAnswerKey(author, ids))).toMatchObject({
      code: 'FORBIDDEN',
      invariant: 'separation-of-duties',
    });
    await verifyAnswerKey(actorFor('moderator2'), ids);
    expect(await caught(publishVersion(author, ids))).toMatchObject({
      code: 'FORBIDDEN',
      invariant: 'separation-of-duties',
    });
    // SUPER_ADMIN is exempt.
    await publishVersion(actorFor('superAdmin'), ids);
    expect((await versionRow(created.versionId)).publishedById).toBe(ACTOR_IDS.superAdmin);
  });

  it('verifyAnswerKey refuses a missing key and an already-verified key', async () => {
    const bare = await createQuestion(actorFor('editor'), mcqInput({ draft: { content: stem() } }));
    expect(
      await caught(
        verifyAnswerKey(actorFor('moderator'), {
          questionId: bare.questionId,
          versionId: bare.versionId,
        }),
      ),
    ).toMatchObject({ code: 'ANSWER_KEY_MISSING' });

    const done = await publishableDraft();
    expect(
      await caught(
        verifyAnswerKey(actorFor('moderator'), {
          questionId: done.questionId,
          versionId: done.versionId,
        }),
      ),
    ).toMatchObject({ code: 'ALREADY_VERIFIED' });
  });

  /* ── createRevision ──────────────────────────────────────────────────── */

  it('createRevision → v2 DRAFT copies options and key (unverified); v1 stays PUBLISHED and unchanged', async () => {
    const created = await publishableDraft();
    await publishVersion(actorFor('moderator'), {
      questionId: created.questionId,
      versionId: created.versionId,
    });
    const v1Before = await versionRow(created.versionId);

    const revision = await createRevision(actorFor('editorModerator'), {
      questionId: created.questionId,
    });
    expect(revision).toMatchObject({ versionNumber: 2, fromVersionId: created.versionId });

    const v2 = await versionRow(revision.versionId);
    expect(v2).toMatchObject({
      status: 'DRAFT',
      versionNumber: 2,
      createdById: ACTOR_IDS.editorModerator,
      updatedById: ACTOR_IDS.editorModerator,
      publishedById: null,
      publishedAt: null,
    });
    expect(v2.content).toEqual(v1Before.content);
    expect(v2.options.map((o) => [o.key, o.content, o.order])).toEqual(
      v1Before.options.map((o) => [o.key, o.content, o.order]),
    );
    expect(v2.answerKey).toMatchObject({
      mcqCorrectOptionKey: v1Before.answerKey?.mcqCorrectOptionKey,
      isVerified: false,
      verifiedById: null,
      verifiedAt: null,
    });

    expect(await versionRow(created.versionId)).toEqual(v1Before);
    const question = await prisma.question.findUniqueOrThrow({ where: { id: created.questionId } });
    expect(question.status).toBe('PUBLISHED');

    const rows = await auditRows(revision.versionId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'question.create_revision' });

    // A second revision while the draft exists is refused.
    expect(
      await caught(createRevision(actorFor('editor'), { questionId: created.questionId })),
    ).toMatchObject({ code: 'DRAFT_ALREADY_EXISTS' });
  });

  it('createRevision with nothing published → NO_PUBLISHED_VERSION', async () => {
    const created = await createQuestion(actorFor('editor'), mcqInput());
    await archiveVersion(actorFor('moderator'), {
      questionId: created.questionId,
      versionId: created.versionId,
    });
    expect(
      await caught(createRevision(actorFor('editor'), { questionId: created.questionId })),
    ).toMatchObject({ code: 'NO_PUBLISHED_VERSION' });
  });

  /* ── archive ─────────────────────────────────────────────────────────── */

  it('archiveVersion / archiveQuestion re-derive the status and never delete', async () => {
    const created = await publishableDraft();
    await publishVersion(actorFor('moderator'), {
      questionId: created.questionId,
      versionId: created.versionId,
    });
    const revision = await createRevision(actorFor('editor'), { questionId: created.questionId });

    // An EDITOR may not archive.
    expect(
      await caught(archiveQuestion(actorFor('editor'), { questionId: created.questionId })),
    ).toMatchObject({ code: 'FORBIDDEN' });

    // Archiving the draft leaves the question PUBLISHED (v1 is still live).
    const one = await archiveVersion(actorFor('moderator'), {
      questionId: created.questionId,
      versionId: revision.versionId,
    });
    expect(one.questionStatus).toBe('PUBLISHED');

    const all = await archiveQuestion(actorFor('moderator'), { questionId: created.questionId });
    expect(all).toMatchObject({
      questionStatus: 'ARCHIVED',
      archivedVersionIds: [created.versionId],
    });

    const versions = await prisma.questionVersion.findMany({
      where: { questionId: created.questionId },
      orderBy: { versionNumber: 'asc' },
    });
    expect(versions.map((v) => v.status)).toEqual(['ARCHIVED', 'ARCHIVED']);
    // Archiving a published version keeps who published it.
    expect(versions[0]?.publishedById).toBe(ACTOR_IDS.moderator);
    expect(
      (await prisma.question.findUniqueOrThrow({ where: { id: created.questionId } })).status,
    ).toBe('ARCHIVED');

    expect(
      await caught(archiveQuestion(actorFor('moderator'), { questionId: created.questionId })),
    ).toMatchObject({ code: 'ALREADY_ARCHIVED' });
    expect(
      (await auditRows(created.questionId)).filter((r) => r.action === 'question.archive'),
    ).toHaveLength(1);
  });

  /* ── read model ──────────────────────────────────────────────────────── */

  it('list pagination is stable across pages, and the list never contains answer keys', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const created = await createQuestion(
        actorFor('editor'),
        mcqInput({
          tagIds: [tax.pageTagId],
          draft: {
            content: stem(`প্রশ্ন ${String(i)}`),
            options: fourOptions(),
            answerKey: { mcqCorrectOptionKey: 'B' },
          },
        }),
      );
      ids.push(created.questionId);
    }
    const editor = actorFor('editor');

    const seen: string[] = [];
    let cursor: string | undefined;
    const pageSizes: number[] = [];
    for (let guard = 0; guard < 10; guard += 1) {
      const page = await listQuestionsForStaff(editor, {
        tagId: tax.pageTagId,
        limit: 3,
        ...(cursor === undefined ? {} : { cursor }),
      });
      pageSizes.push(page.items.length);
      seen.push(...page.items.map((item) => item.id));

      const json = JSON.stringify(page);
      expect(json).not.toMatch(/answerKey|mcqCorrectOptionKey|cqRubric|"options"|"content"|blocks/);

      if (guard === 0) {
        // A question created mid-walk is newer than every cursor: it must not
        // appear in later pages or shift them.
        await createQuestion(editor, mcqInput({ tagIds: [tax.pageTagId] }));
      }
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }

    expect(pageSizes).toEqual([3, 3, 1]);
    expect(new Set(seen).size).toBe(seen.length); // no duplicates
    expect([...seen].sort()).toEqual([...ids].sort()); // no gaps
    expect(seen).toEqual([...ids].reverse()); // newest first
  });

  it('list filters by taxonomy, type, status, board and year', async () => {
    const editor = actorFor('editor');
    const inChapter2 = await createQuestion(
      editor,
      mcqInput({ chapterId: tax.chapter2, topicId: tax.topicIn2, sources: [], tagIds: [] }),
    );
    const byChapter = await listQuestionsForStaff(editor, { chapterId: tax.chapter2, limit: 50 });
    expect(byChapter.items.map((i) => i.id)).toContain(inChapter2.questionId);
    expect(byChapter.items.every((i) => i.chapterId === tax.chapter2)).toBe(true);

    const byBoardYear = await listQuestionsForStaff(editor, {
      subjectId: tax.subjectId,
      boardId: tax.boardId,
      academicYearId: tax.yearId,
      status: 'DRAFT',
      type: 'MCQ',
      limit: 50,
    });
    expect(byBoardYear.items.length).toBeGreaterThan(0);
    expect(byBoardYear.items.map((i) => i.id)).not.toContain(inChapter2.questionId);
    expect(byBoardYear.items.every((i) => i.status === 'DRAFT' && i.type === 'MCQ')).toBe(true);

    expect(await caught(listQuestionsForStaff(editor, { limit: 51 }))).toMatchObject({
      code: 'VALIDATION_FAILED',
      field: 'limit',
    });
  });

  it('getQuestionForStaff returns versions with options and the answer key; NOT_FOUND otherwise', async () => {
    const created = await publishableDraft();
    const detail = await getQuestionForStaff(actorFor('editor'), {
      questionId: created.questionId,
    });
    expect(detail.versions).toHaveLength(1);
    expect(detail.versions[0]?.answerKey).toMatchObject({
      mcqCorrectOptionKey: 'A',
      isVerified: true,
      verifiedById: ACTOR_IDS.moderator2,
    });
    expect(detail.versions[0]?.options).toHaveLength(4);
    expect(detail.tags.map((t) => t.tagId)).toEqual([tax.tagId]);

    expect(
      await caught(
        getQuestionForStaff(actorFor('editor'), {
          questionId: '0c000000-0000-4000-8000-00000000beef',
        }),
      ),
    ).toMatchObject({ code: 'NOT_FOUND' });
  });
});
