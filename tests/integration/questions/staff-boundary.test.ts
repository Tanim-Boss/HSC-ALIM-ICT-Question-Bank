/**
 * Phase 04E — Staff Question Bank server-side application boundary against real
 * PostgreSQL 16 (with migrations 0001, 0002 and 0003 applied).
 *
 * Only the Supabase session cookie reader (`@/lib/auth/session`'s `getUser`) is
 * stubbed, because there is no HTTP request/cookie store in a Node integration
 * runner. `requireActor()`, `loadOrProvisionProfile()`, `authorize()`, Zod
 * validation, `listQuestionsForStaff()` and `getQuestionForStaff()` all run
 * against the real Prisma client and PostgreSQL database.
 */

import { randomUUID } from 'node:crypto';

import type { User } from '@supabase/supabase-js';
import { PrismaClient } from '@/lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { purgeQuestions } from '../purge';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const sessionState = vi.hoisted(() => ({
  currentUser: null as User | null,
}));

vi.mock('@/lib/auth/session', () => ({
  getUser: () => Promise.resolve(sessionState.currentUser),
  isAuthenticated: () => Promise.resolve(sessionState.currentUser !== null),
}));

import { createQuestion, verifyAnswerKey } from '@/server/questions/authoring';
import { getStaffQuestion, listStaffQuestions } from '@/server/questions/staff-boundary';
import { ACTOR_IDS, actorFor, ensureActorProfiles } from '../auth-fixtures';

const DATABASE_URL = process.env['DATABASE_URL'];
const hasDatabase = typeof DATABASE_URL === 'string' && DATABASE_URL.length > 0;
const describeDb = hasDatabase ? describe : describe.skip;

if (!hasDatabase) {
  console.warn('[04E] DATABASE_URL is not set — staff-boundary integration tests were SKIPPED.');
}

const CODES = { level: 'BOUND4E_LEVEL', subject: 'BOUND4E_SUBJECT', board: 'BOUND4E' } as const;
const COLLEGE_NAME = 'BOUND4E College';
const TAG_SLUG = 'bound4e-tag';

let prisma: PrismaClient;
const tax = {
  levelId: '',
  subjectId: '',
  chapterId: '',
  boardId: '',
  collegeId: '',
  tagId: '',
  questionId: '',
  versionId: '',
};

function asSupabaseUser(id: string, email = 'user@ictatlas.example'): User {
  return {
    id,
    email,
    app_metadata: {},
    user_metadata: { full_name: 'Integration Test User' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  } as User;
}

const stem = (text: string) => ({
  format: 'rich_blocks',
  version: 1,
  blocks: [{ type: 'paragraph', data: { text, lang: 'bn' } }],
});

async function cleanup(): Promise<void> {
  await purgeQuestions(prisma, { subject: { code: CODES.subject } });
  await prisma.chapter.deleteMany({ where: { subject: { code: CODES.subject } } });
  await prisma.levelSubject.deleteMany({ where: { subject: { code: CODES.subject } } });
  await prisma.subject.deleteMany({ where: { code: CODES.subject } });
  await prisma.educationLevel.deleteMany({ where: { code: CODES.level } });
  await prisma.board.deleteMany({ where: { code: CODES.board } });
  await prisma.college.deleteMany({ where: { name: COLLEGE_NAME } });
  await prisma.tag.deleteMany({ where: { slug: TAG_SLUG } });
}

describeDb('Phase 04E — staff application boundary (real PostgreSQL)', () => {
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
      data: { subjectId: subject.id, chapterNumber: 1, titleBn: 'অধ্যায় ১', titleEn: 'Chapter 1' },
    });
    const board = await prisma.board.create({ data: { code: CODES.board, nameEn: 'Board 4E' } });
    const college = await prisma.college.create({ data: { name: COLLEGE_NAME } });
    const tag = await prisma.tag.create({ data: { name: 'BOUND4E Tag', slug: TAG_SLUG } });

    const created = await createQuestion(actorFor('editor'), {
      type: 'MCQ',
      marks: 1,
      educationLevelId: level.id,
      subjectId: subject.id,
      chapterId: chapter.id,
      tagIds: [tag.id],
      sources: [
        { sourceType: 'BOARD', boardId: board.id },
        { sourceType: 'COLLEGE', collegeId: college.id },
      ],
      draft: {
        content: stem('কম্পিউটার নেটওয়ার্কে রাউটারের কাজ কী?'),
        options: [
          { key: 'A', content: stem('প্যাকেট রাউটিং') },
          { key: 'B', content: stem('মুদ্রণ করা') },
          { key: 'C', content: stem('স্ক্যান করা') },
          { key: 'D', content: stem('শব্দ উৎপাদন') },
        ],
        answerKey: { mcqCorrectOptionKey: 'A' },
      },
    });
    await verifyAnswerKey(actorFor('moderator2'), {
      questionId: created.questionId,
      versionId: created.versionId,
    });

    Object.assign(tax, {
      levelId: level.id,
      subjectId: subject.id,
      chapterId: chapter.id,
      boardId: board.id,
      collegeId: college.id,
      tagId: tag.id,
      questionId: created.questionId,
      versionId: created.versionId,
    });
  });

  afterAll(async () => {
    sessionState.currentUser = null;
    await cleanup();
    await prisma.$disconnect();
  });

  it('refuses unauthenticated callers with UNAUTHENTICATED', async () => {
    sessionState.currentUser = null;

    await expect(listStaffQuestions({ subjectId: tax.subjectId })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await expect(getStaffQuestion({ questionId: tax.questionId })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('refuses an existing STUDENT session with FORBIDDEN on both list and detail', async () => {
    sessionState.currentUser = asSupabaseUser(ACTOR_IDS.student);

    await expect(listStaffQuestions({ subjectId: tax.subjectId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(getStaffQuestion({ questionId: tax.questionId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('provisions a brand-new authenticated user as STUDENT and still refuses staff reads with FORBIDDEN', async () => {
    const firstTimeUserId = randomUUID();
    sessionState.currentUser = asSupabaseUser(firstTimeUserId, 'newlearner@ictatlas.example');

    await expect(listStaffQuestions({ subjectId: tax.subjectId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(getStaffQuestion({ questionId: tax.questionId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('allows an EDITOR session to list questions with safe projection and retrieve privileged detail', async () => {
    sessionState.currentUser = asSupabaseUser(ACTOR_IDS.editor);

    const page = await listStaffQuestions({
      subjectId: tax.subjectId,
      boardId: tax.boardId,
      collegeId: tax.collegeId,
      q: 'রাউটারের',
      limit: 10,
    });
    expect(page.items.map((i) => i.id)).toEqual([tax.questionId]);
    expect(page.items[0]?.tagIds).toEqual([tax.tagId]);

    const listJson = JSON.stringify(page);
    expect(listJson).not.toMatch(
      /answerKey|mcqCorrectOptionKey|cqRubric|searchText|"options"|"content"|blocks/,
    );

    const detail = await getStaffQuestion({ questionId: tax.questionId });
    expect(detail.id).toBe(tax.questionId);
    expect(detail.versions[0]?.answerKey).toMatchObject({
      mcqCorrectOptionKey: 'A',
      isVerified: true,
      verifiedById: ACTOR_IDS.moderator2,
    });
    expect(JSON.stringify(detail)).not.toContain('searchText');
  });

  it('enforces validation and NOT_FOUND semantics for authorized staff callers', async () => {
    sessionState.currentUser = asSupabaseUser(ACTOR_IDS.moderator);

    await expect(listStaffQuestions({ limit: 0 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      field: 'limit',
    });
    await expect(getStaffQuestion({ questionId: 'invalid-uuid' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      field: 'questionId',
    });
    await expect(
      getStaffQuestion({ questionId: '0c000000-0000-4000-8000-00000000dead' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      field: 'questionId',
    });
  });
});
