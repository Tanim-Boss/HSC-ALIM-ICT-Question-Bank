/**
 * Shared database fixtures for the integration suites.
 *
 * Every suite that needs a publishable question must build the same taxonomy
 * chain (education level → subject → level_subject membership → chapter), and
 * the database refuses to create a question whose (level, subject) pair is not
 * in `level_subjects` (`fk_questions_level_subject`). Doing that once here
 * keeps the suites from drifting apart and from each inventing a slightly
 * different fixture — which is how one of them ended up with a lowercase code
 * the CHECK constraint rejects.
 *
 * Codes are uppercase-only (`^[A-Z][A-Z0-9_]{1,31}$`) and fixed, so the upserts
 * are idempotent and cleanup is exact.
 */

import { PrismaClient } from '@/lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ensureActorProfiles, publishStamp, verifyStamp } from '../auth-fixtures';

const DATABASE_URL = process.env['DATABASE_URL'];

/** A client shared by the integration suites, or a loud failure. */
export const prisma: PrismaClient = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL ?? '' }),
});

export const FIXTURE_CODES = {
  level: 'IT45F_LEVEL',
  subject: 'IT45F_SUBJECT',
} as const;

export interface Taxonomy {
  readonly levelId: string;
  readonly subjectId: string;
  readonly chapterId: string;
}

let cached: Taxonomy | null = null;

/** Creates (once per process) and returns the shared taxonomy chain. */
export async function taxonomy(): Promise<Taxonomy> {
  if (cached !== null) return cached;

  // Phase 04B: published / verified fixture rows name a real profile.
  await ensureActorProfiles(prisma);

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
    where: { subjectId_chapterNumber: { subjectId: subject.id, chapterNumber: 1 } },
    create: { subjectId: subject.id, chapterNumber: 1, titleBn: 'অধ্যায়', titleEn: 'Chapter' },
    update: {},
    select: { id: true },
  });

  cached = { levelId: level.id, subjectId: subject.id, chapterId: chapter.id };
  return cached;
}

/** The §7.5 `mcq_stem` shape, minimal but valid. */
export const MCQ_STEM = {
  format: 'rich_blocks',
  version: 1,
  blocks: [{ type: 'paragraph', data: { text: 'প্রশ্ন', lang: 'bn' } }],
} as const;

/** The §7.5 `option` shape, minimal but valid. */
export const OPTION_CONTENT = {
  format: 'rich_blocks',
  version: 1,
  blocks: [{ type: 'paragraph', data: { text: 'উত্তর', lang: 'bn' } }],
} as const;

export interface FixtureOptions {
  /** Option keys to create. Defaults to A–D. */
  readonly keys?: readonly string[];
  /** Whether the version starts PUBLISHED. Defaults to DRAFT. */
  readonly publish?: boolean;
  /** Omit the answer key entirely, making the question unpublishable. */
  readonly omitAnswerKey?: boolean;
  /** Skip the answer key's verification, making the question unpublishable. */
  readonly unverified?: boolean;
  /** Create fewer than four options, making the question unpublishable. */
  readonly optionCount?: number;
  /** Duplicate an option key to violate I-4's distinctness half. */
  readonly duplicateKey?: boolean;
}

/**
 * Creates one complete MCQ question on real rows.
 *
 * Returns the ids a service-level test needs. Every option and the key are
 * written through real Prisma calls, so the composite foreign key
 * (`fk_answer_keys_options_of_version`) and the unique indexes are genuinely
 * exercised.
 */
export async function createMcqFixture(options: FixtureOptions = {}): Promise<{
  questionId: string;
  versionId: string;
}> {
  const tax = await taxonomy();
  const keys = options.keys ?? ['A', 'B', 'C', 'D'];
  const optionCount = options.optionCount ?? keys.length;

  return prisma.$transaction(async (tx) => {
    const db = tx as unknown as PrismaClient;
    const question = await db.question.create({
      data: {
        type: 'MCQ',
        status: 'DRAFT',
        difficulty: 'MEDIUM',
        createdVia: 'MANUAL',
        educationLevelId: tax.levelId,
        subjectId: tax.subjectId,
        chapterId: tax.chapterId,
        marks: 1,
      },
      select: { id: true },
    });
    const version = await db.questionVersion.create({
      data: {
        questionId: question.id,
        versionNumber: 1,
        status: options.publish === true ? 'PUBLISHED' : 'DRAFT',
        ...(options.publish === true ? publishStamp() : {}),
        content: MCQ_STEM,
      },
      select: { id: true },
    });

    for (let index = 0; index < optionCount; index += 1) {
      await db.questionOption.create({
        data: {
          versionId: version.id,
          // duplicateKey makes index 1 collide with index 0.
          key:
            options.duplicateKey === true && index === 1 ? (keys[0] ?? 'A') : (keys[index] ?? 'A'),
          content: OPTION_CONTENT,
          order: index,
        },
      });
    }

    if (options.omitAnswerKey !== true) {
      await db.answerKey.create({
        data: {
          versionId: version.id,
          mcqCorrectOptionKey: keys[0] ?? 'A',
          isVerified: options.unverified !== true,
          ...(options.unverified === true ? {} : { verifiedAt: new Date(), ...verifyStamp() }),
        },
      });
    }

    return { questionId: question.id, versionId: version.id };
  });
}

/**
 * Removes every row this fixture module creates.
 *
 * FK order, children first. Safe to call twice; safe to call when nothing was
 * created. A suite that crashes before its own cleanup still leaves the database
 * usable for the next run.
 */
export async function cleanupFixtures(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM questions WHERE education_level_id IN (SELECT id FROM education_levels WHERE code = '${FIXTURE_CODES.level}')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM level_subjects WHERE level_id IN (SELECT id FROM education_levels WHERE code = '${FIXTURE_CODES.level}')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM chapters WHERE subject_id IN (SELECT id FROM subjects WHERE code = '${FIXTURE_CODES.subject}')`,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM subjects WHERE code = '${FIXTURE_CODES.subject}'`);
  await prisma.$executeRawUnsafe(
    `DELETE FROM education_levels WHERE code = '${FIXTURE_CODES.level}'`,
  );
  cached = null;
}

/** Number of question rows currently present — used to prove nothing was left behind. */
export async function countQuestions(): Promise<number> {
  const rows = (await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS c FROM questions`)) as {
    c: bigint;
  }[];
  return Number(rows[0]?.c ?? -1);
}
