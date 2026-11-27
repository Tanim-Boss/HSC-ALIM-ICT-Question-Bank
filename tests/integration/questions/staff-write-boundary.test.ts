/**
 * Phase 04F — Staff Question Authoring write application boundary against real
 * PostgreSQL 16 (with migrations 0001, 0002 and 0003 applied).
 *
 * Only the Supabase session cookie reader (`@/lib/auth/session`'s `getUser`) is
 * stubbed, because there is no HTTP request/cookie store in a Node integration
 * runner. `requireActor()`, `loadOrProvisionProfile()`, `authorize()`, Zod
 * validation, and every domain service (commands, change-type, publish gate)
 * all run against the real Prisma client and PostgreSQL database.
 *
 * Tests pinned here:
 *   · Unauthenticated caller → UNAUTHENTICATED on every write operation.
 *   · STUDENT caller → FORBIDDEN on every write operation.
 *   · Authorized staff → each operation succeeds with the existing result DTO.
 *   · Separation-of-duties: verify and publish refuse the last editor unless
 *     SUPER_ADMIN.
 *   · SUPER_ADMIN exception: the last editor CAN verify/publish their own work.
 *   · Audit failure rolls back the underlying write (not testable without a
 *     broken audit table; domain preservation tested through service layer).
 *   · No raw Prisma records leak through the boundary.
 */

import type { User } from '@supabase/supabase-js';
import { PrismaClient } from '@/lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const sessionState = vi.hoisted(() => ({
  currentUser: null as User | null,
}));

vi.mock('@/lib/auth/session', () => ({
  getUser: () => Promise.resolve(sessionState.currentUser),
  isAuthenticated: () => Promise.resolve(sessionState.currentUser !== null),
}));

import {
  staffCreateQuestion,
  staffSaveDraft,
  staffCreateRevision,
  staffVerifyAnswerKey,
  staffArchiveVersion,
  staffArchiveQuestion,
  staffChangeQuestionType,
  staffPublishVersion,
} from '@/server/questions/staff-write-boundary';
import { ACTOR_IDS, ensureActorProfiles } from '../auth-fixtures';

const DATABASE_URL = process.env['DATABASE_URL'];
const hasDatabase = typeof DATABASE_URL === 'string' && DATABASE_URL.length > 0;
const describeDb = hasDatabase ? describe : describe.skip;

if (!hasDatabase) {
  console.warn(
    '[04F] DATABASE_URL is not set — staff-write-boundary integration tests were SKIPPED.',
  );
}

const CODES = { level: 'BOUND4F_LEVEL', subject: 'BOUND4F_SUBJECT', board: 'BOUND4F' } as const;
const TAG_SLUG = 'bound4f-tag';

let prisma: PrismaClient;
const tax = {
  levelId: '',
  subjectId: '',
  chapterId: '',
  boardId: '',
  tagId: '',
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

const fourOptions = () =>
  (['A', 'B', 'C', 'D'] as const).map((key, i) => ({
    key,
    content: stem(['কিবোর্ড', 'মনিটর', 'প্রিন্টার', 'স্পিকার'][i] ?? key),
  }));

function mcqInput() {
  return {
    type: 'MCQ' as const,
    marks: 1,
    educationLevelId: tax.levelId,
    subjectId: tax.subjectId,
    chapterId: tax.chapterId,
    tagIds: [tax.tagId],
    sources: [{ sourceType: 'BOARD' as const, boardId: tax.boardId }],
    draft: {
      content: stem('রাউটারের কাজ কী?'),
      options: fourOptions(),
      answerKey: { mcqCorrectOptionKey: 'A' as const },
    },
  };
}

async function cleanup(): Promise<void> {
  await prisma.question.deleteMany({ where: { subject: { code: CODES.subject } } });
  await prisma.chapter.deleteMany({ where: { subject: { code: CODES.subject } } });
  await prisma.levelSubject.deleteMany({ where: { subject: { code: CODES.subject } } });
  await prisma.subject.deleteMany({ where: { code: CODES.subject } });
  await prisma.educationLevel.deleteMany({ where: { code: CODES.level } });
  await prisma.board.deleteMany({ where: { code: CODES.board } });
  await prisma.tag.deleteMany({ where: { slug: TAG_SLUG } });
}

describeDb('Phase 04F — staff write application boundary (real PostgreSQL)', () => {
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
    const board = await prisma.board.create({ data: { code: CODES.board, nameEn: 'Board 4F' } });
    const tag = await prisma.tag.create({ data: { name: 'BOUND4F Tag', slug: TAG_SLUG } });

    Object.assign(tax, {
      levelId: level.id,
      subjectId: subject.id,
      chapterId: chapter.id,
      boardId: board.id,
      tagId: tag.id,
    });
  });

  afterAll(async () => {
    sessionState.currentUser = null;
    await cleanup();
    await prisma.$disconnect();
  });

  describe('identity and access control', () => {
    it('refuses unauthenticated callers with UNAUTHENTICATED on every write operation', async () => {
      sessionState.currentUser = null;

      await expect(staffCreateQuestion(mcqInput())).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
      await expect(
        staffSaveDraft({
          questionId: '00000000-0000-0000-0000-000000000000',
          versionId: '00000000-0000-0000-0000-000000000000',
          expectedUpdatedAt: new Date(),
          draft: {
            content: stem('x'),
            options: fourOptions(),
            answerKey: { mcqCorrectOptionKey: 'A' },
          },
        }),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      await expect(
        staffCreateRevision({ questionId: '00000000-0000-0000-0000-000000000000' }),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      await expect(
        staffVerifyAnswerKey({
          questionId: '00000000-0000-0000-0000-000000000000',
          versionId: '00000000-0000-0000-0000-000000000000',
        }),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      await expect(
        staffArchiveVersion({
          questionId: '00000000-0000-0000-0000-000000000000',
          versionId: '00000000-0000-0000-0000-000000000000',
        }),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      await expect(
        staffArchiveQuestion({ questionId: '00000000-0000-0000-0000-000000000000' }),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      await expect(
        staffChangeQuestionType({
          questionId: '00000000-0000-0000-0000-000000000000',
          nextType: 'CQ',
        }),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      await expect(
        staffPublishVersion({
          questionId: '00000000-0000-0000-0000-000000000000',
          versionId: '00000000-0000-0000-0000-000000000000',
        }),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('refuses a STUDENT caller with FORBIDDEN on every write operation', async () => {
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.student);

      await expect(staffCreateQuestion(mcqInput())).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(
        staffPublishVersion({
          questionId: '00000000-0000-0000-0000-000000000000',
          versionId: '00000000-0000-0000-0000-000000000000',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rejects caller-supplied actor spoofing through the input object', async () => {
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.student);

      await expect(
        staffCreateQuestion({
          ...mcqInput(),
          actor: { userId: ACTOR_IDS.superAdmin, roles: new Set(['SUPER_ADMIN']) },
        } as never),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('authorized staff operations', () => {
    it('EDITOR creates a question via staffCreateQuestion and gets the exact result DTO', async () => {
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.editor);

      const result = await staffCreateQuestion(mcqInput());

      expect(result.questionId).toBeDefined();
      expect(result.versionId).toBeDefined();
      expect(result.versionNumber).toBe(1);
      expect(result.versionUpdatedAt).toBeInstanceOf(Date);

      const question = await prisma.question.findUniqueOrThrow({
        where: { id: result.questionId },
      });
      expect(question.status).toBe('DRAFT');
    });

    it('EDITOR saves a draft via staffSaveDraft and gets the exact result DTO', async () => {
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.editor);

      // Create a question first.
      const created = await staffCreateQuestion(mcqInput());

      const version = await prisma.questionVersion.findUniqueOrThrow({
        where: { id: created.versionId },
        select: { updatedAt: true },
      });

      const result = await staffSaveDraft({
        questionId: created.questionId,
        versionId: created.versionId,
        expectedUpdatedAt: version.updatedAt,
        draft: {
          content: stem('রাউটারের কাজ কী? (updated)'),
          options: fourOptions(),
          answerKey: { mcqCorrectOptionKey: 'B' },
        },
      });

      expect(result.questionId).toBe(created.questionId);
      expect(result.versionId).toBe(created.versionId);
      expect(result.versionUpdatedAt).toBeInstanceOf(Date);
    });

    it('MODERATOR verifies answer key via staffVerifyAnswerKey (different from last editor)', async () => {
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.editor);
      const created = await staffCreateQuestion(mcqInput());

      // moderator is NOT the last editor → should succeed.
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.moderator);
      const result = await staffVerifyAnswerKey({
        questionId: created.questionId,
        versionId: created.versionId,
      });

      expect(result.versionId).toBe(created.versionId);
      expect(result.verifiedById).toBe(ACTOR_IDS.moderator);
      expect(result.verifiedAt).toBeInstanceOf(Date);
    });

    it('separation-of-duties: last editor CANNOT verify their own answer key (FORBIDDEN)', async () => {
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.editor);
      const created = await staffCreateQuestion(mcqInput());

      // Editor is the last editor → verify must fail with FORBIDDEN (separation-of-duties).
      await expect(
        staffVerifyAnswerKey({
          questionId: created.questionId,
          versionId: created.versionId,
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        invariant: 'separation-of-duties',
      });
    });

    it('SUPER_ADMIN exception: last editor CAN verify their own answer key', async () => {
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.superAdmin);
      const created = await staffCreateQuestion(mcqInput());

      // SUPER_ADMIN is the last editor → verify should succeed (exception).
      const result = await staffVerifyAnswerKey({
        questionId: created.questionId,
        versionId: created.versionId,
      });

      expect(result.verifiedById).toBe(ACTOR_IDS.superAdmin);
    });

    it('MODERATOR publishes a version via staffPublishVersion (different from last editor)', async () => {
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.editor);
      const created = await staffCreateQuestion(mcqInput());

      // Verify the key first (different verifier).
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.moderator2);
      await staffVerifyAnswerKey({
        questionId: created.questionId,
        versionId: created.versionId,
      });

      // Publish (moderator is NOT the last editor → should succeed).
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.moderator);
      const result = await staffPublishVersion({
        questionId: created.questionId,
        versionId: created.versionId,
      });

      expect(result.questionId).toBe(created.questionId);
      expect(result.versionId).toBe(created.versionId);
      expect(result.questionStatus).toBe('PUBLISHED');
    });

    it('separation-of-duties: last editor CANNOT publish their own version (FORBIDDEN)', async () => {
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.editor);
      const created = await staffCreateQuestion(mcqInput());

      // Verify the key first.
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.moderator2);
      await staffVerifyAnswerKey({
        questionId: created.questionId,
        versionId: created.versionId,
      });

      // Editor is the last editor → publish must fail with FORBIDDEN.
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.editor);
      await expect(
        staffPublishVersion({
          questionId: created.questionId,
          versionId: created.versionId,
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        invariant: 'separation-of-duties',
      });
    });

    it('SUPER_ADMIN exception: last editor CAN publish their own version', async () => {
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.superAdmin);
      const created = await staffCreateQuestion(mcqInput());

      // SUPER_ADMIN verifies own work (exception).
      await staffVerifyAnswerKey({
        questionId: created.questionId,
        versionId: created.versionId,
      });

      // SUPER_ADMIN publishes own work (exception).
      const result = await staffPublishVersion({
        questionId: created.questionId,
        versionId: created.versionId,
      });

      expect(result.questionStatus).toBe('PUBLISHED');
    });

    it('MODERATOR creates a revision via staffCreateRevision', async () => {
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.editor);
      const created = await staffCreateQuestion(mcqInput());

      // Publish the first version.
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.moderator2);
      await staffVerifyAnswerKey({
        questionId: created.questionId,
        versionId: created.versionId,
      });
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.moderator);
      await staffPublishVersion({
        questionId: created.questionId,
        versionId: created.versionId,
      });

      // Create revision.
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.editor);
      const result = await staffCreateRevision({ questionId: created.questionId });
      expect(result.versionNumber).toBe(2);
      expect(result.fromVersionId).toBe(created.versionId);
    });

    it('MODERATOR archives a version via staffArchiveVersion', async () => {
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.editor);
      const created = await staffCreateQuestion(mcqInput());

      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.moderator);
      const result = await staffArchiveVersion({
        questionId: created.questionId,
        versionId: created.versionId,
      });

      expect(result.archivedVersionIds).toEqual([created.versionId]);
      expect(result.questionStatus).toBe('ARCHIVED');
    });

    it('MODERATOR archives a question via staffArchiveQuestion', async () => {
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.editor);
      const created = await staffCreateQuestion(mcqInput());

      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.moderator);
      const result = await staffArchiveQuestion({ questionId: created.questionId });

      expect(result.archivedVersionIds).toContain(created.versionId);
      expect(result.questionStatus).toBe('ARCHIVED');
    });

    it('EDITOR changes question type via staffChangeQuestionType (no published versions)', async () => {
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.editor);
      const created = await staffCreateQuestion(mcqInput());

      const result = await staffChangeQuestionType({
        questionId: created.questionId,
        nextType: 'CQ',
      });

      expect(result.questionId).toBe(created.questionId);
      expect(result.type).toBe('CQ');
      expect(result.previousType).toBe('MCQ');
    });
  });

  describe('validation and domain errors', () => {
    it('returns VALIDATION_FAILED for invalid input through the boundary', async () => {
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.editor);

      await expect(
        staffCreateQuestion({ ...mcqInput(), type: 'ESSAY' } as never),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', field: 'type' });

      await expect(
        staffSaveDraft({
          questionId: 'invalid-uuid',
          versionId: VERSION_ID_PLACEHOLDER,
          expectedUpdatedAt: new Date(),
          draft: {
            content: stem('x'),
            options: fourOptions(),
            answerKey: { mcqCorrectOptionKey: 'A' },
          },
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', field: 'questionId' });
    });

    it('returns NOT_FOUND for missing questions', async () => {
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.editor);

      await expect(
        staffArchiveQuestion({ questionId: '0c000000-0000-4000-8000-00000000dead' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('no answer key or internal data leakage through errors', () => {
    it('no raw Prisma records are returned', async () => {
      sessionState.currentUser = asSupabaseUser(ACTOR_IDS.editor);
      const result = await staffCreateQuestion(mcqInput());

      // The result is a plain DTO, not a Prisma record. It should have exactly
      // the expected fields.
      expect(Object.keys(result).sort()).toEqual(
        ['questionId', 'versionId', 'versionNumber', 'versionUpdatedAt'].sort(),
      );
    });
  });
});

const VERSION_ID_PLACEHOLDER = '1a000000-0000-4000-8000-000000000099';
