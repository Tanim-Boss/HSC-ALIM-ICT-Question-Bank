import 'server-only';

/**
 * Staff read model (Phase 04C). Action `question.read_staff` — EDITOR and up.
 *
 *   · listQuestionsForStaff — filtered, keyset-paginated on (created_at, id),
 *     newest first, at most 50 per page. Its projection is an explicit `select`
 *     with NO answer key, rubric, option or content field: the list can never
 *     carry an answer, whatever a caller does with it.
 *   · getQuestionForStaff — one question with every version, its options, its
 *     answer key and verification, sources, tags and asset links. The ONLY read
 *     that returns answer keys, and it is staff-only.
 *
 * Reads are not audited and take no lock.
 */

import type { Prisma } from '@/lib/generated/prisma/client';
import { getPrisma } from '@/lib/db';
import { authorize, type Actor } from '@/server/auth/authorize';
import { DomainError } from '@/server/shared/errors';
import {
  getQuestionInputSchema,
  listQuestionsInputSchema,
  parseInput,
  type GetQuestionInput,
  type ListQuestionsInput,
} from './schemas';

/* ------------------------------------------------------------------------- */
/* Cursor                                                                    */
/* ------------------------------------------------------------------------- */

interface CursorPosition {
  readonly createdAt: Date;
  readonly id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opaque to callers: base64url of `<ISO timestamp>|<uuid>`. */
export function encodeCursor(position: CursorPosition): string {
  return Buffer.from(`${position.createdAt.toISOString()}|${position.id}`, 'utf8').toString(
    'base64url',
  );
}

export function decodeCursor(cursor: string): CursorPosition {
  const invalid = () =>
    new DomainError({
      code: 'VALIDATION_FAILED',
      message: 'cursor: not a cursor returned by this list',
      field: 'cursor',
    });
  const text = Buffer.from(cursor, 'base64url').toString('utf8');
  const [iso, id, extra] = text.split('|');
  if (iso === undefined || id === undefined || extra !== undefined || !UUID.test(id)) {
    throw invalid();
  }
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== iso) throw invalid();
  return { createdAt, id };
}

/* ------------------------------------------------------------------------- */
/* List                                                                      */
/* ------------------------------------------------------------------------- */

/** The list projection. Deliberately has no answerKey / options / content. */
const LIST_SELECT = {
  id: true,
  type: true,
  status: true,
  difficulty: true,
  marks: true,
  educationLevelId: true,
  subjectId: true,
  chapterId: true,
  topicId: true,
  subtopicId: true,
  createdAt: true,
  updatedAt: true,
  tags: { select: { tagId: true } },
  versions: {
    select: { id: true, versionNumber: true, status: true, updatedAt: true },
    orderBy: { versionNumber: 'desc' },
  },
} as const satisfies Prisma.QuestionSelect;

type ListRow = Prisma.QuestionGetPayload<{ select: typeof LIST_SELECT }>;

export interface StaffQuestionListItem {
  readonly id: string;
  readonly type: ListRow['type'];
  readonly status: ListRow['status'];
  readonly difficulty: ListRow['difficulty'];
  readonly marks: number;
  readonly educationLevelId: string;
  readonly subjectId: string;
  readonly chapterId: string | null;
  readonly topicId: string | null;
  readonly subtopicId: string | null;
  readonly tagIds: readonly string[];
  readonly versions: readonly {
    readonly id: string;
    readonly versionNumber: number;
    readonly status: ListRow['versions'][number]['status'];
    readonly updatedAt: Date;
  }[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface StaffQuestionPage {
  readonly items: readonly StaffQuestionListItem[];
  /** Pass back as `cursor` for the next page; null on the last page. */
  readonly nextCursor: string | null;
}

export async function listQuestionsForStaff(
  actor: Actor,
  input: ListQuestionsInput = {},
): Promise<StaffQuestionPage> {
  authorize(actor, 'question.read_staff');
  const f = parseInput(listQuestionsInputSchema, input);

  const and: Prisma.QuestionWhereInput[] = [];
  if (f.educationLevelId !== undefined) and.push({ educationLevelId: f.educationLevelId });
  if (f.subjectId !== undefined) and.push({ subjectId: f.subjectId });
  if (f.chapterId !== undefined) and.push({ chapterId: f.chapterId });
  if (f.topicId !== undefined) and.push({ topicId: f.topicId });
  if (f.type !== undefined) and.push({ type: f.type });
  if (f.status !== undefined) and.push({ status: f.status });
  if (f.difficulty !== undefined) and.push({ difficulty: f.difficulty });
  if (f.tagId !== undefined) and.push({ tags: { some: { tagId: f.tagId } } });
  // Board and year match the SAME source row: "from board X in year Y".
  if (f.boardId !== undefined || f.academicYearId !== undefined) {
    and.push({
      sources: {
        some: {
          ...(f.boardId === undefined ? {} : { boardId: f.boardId }),
          ...(f.academicYearId === undefined ? {} : { academicYearId: f.academicYearId }),
        },
      },
    });
  }
  if (f.cursor !== undefined) {
    const after = decodeCursor(f.cursor);
    // Newest first: the next page is strictly "older" in (created_at, id).
    and.push({
      OR: [
        { createdAt: { lt: after.createdAt } },
        { createdAt: after.createdAt, id: { lt: after.id } },
      ],
    });
  }

  const rows = await getPrisma().question.findMany({
    where: { AND: and },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: f.limit + 1,
    select: LIST_SELECT,
  });

  const page = rows.slice(0, f.limit);
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      difficulty: row.difficulty,
      marks: row.marks,
      educationLevelId: row.educationLevelId,
      subjectId: row.subjectId,
      chapterId: row.chapterId,
      topicId: row.topicId,
      subtopicId: row.subtopicId,
      tagIds: row.tags.map((t) => t.tagId),
      versions: row.versions,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    nextCursor:
      rows.length > f.limit && last !== undefined
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null,
  };
}

/* ------------------------------------------------------------------------- */
/* Detail                                                                    */
/* ------------------------------------------------------------------------- */

const DETAIL_SELECT = {
  id: true,
  type: true,
  status: true,
  difficulty: true,
  createdVia: true,
  marks: true,
  educationLevelId: true,
  subjectId: true,
  chapterId: true,
  topicId: true,
  subtopicId: true,
  createdAt: true,
  updatedAt: true,
  tags: { select: { tagId: true } },
  sources: {
    select: {
      id: true,
      sourceType: true,
      boardId: true,
      collegeId: true,
      academicYearId: true,
      sourceName: true,
    },
  },
  versions: {
    orderBy: { versionNumber: 'asc' },
    select: {
      id: true,
      versionNumber: true,
      status: true,
      content: true,
      createdById: true,
      updatedById: true,
      publishedById: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      options: { select: { key: true, content: true, order: true }, orderBy: { order: 'asc' } },
      answerKey: {
        select: {
          mcqCorrectOptionKey: true,
          cqRubric: true,
          isVerified: true,
          verifiedById: true,
          verifiedAt: true,
        },
      },
      assets: { select: { assetId: true, blockRef: true } },
    },
  },
} as const satisfies Prisma.QuestionSelect;

export type StaffQuestionDetail = Prisma.QuestionGetPayload<{ select: typeof DETAIL_SELECT }>;

export async function getQuestionForStaff(
  actor: Actor,
  input: GetQuestionInput,
): Promise<StaffQuestionDetail> {
  authorize(actor, 'question.read_staff');
  const { questionId } = parseInput(getQuestionInputSchema, input);
  const question = await getPrisma().question.findUnique({
    where: { id: questionId },
    select: DETAIL_SELECT,
  });
  if (question === null) {
    throw new DomainError({
      code: 'NOT_FOUND',
      message: 'That question does not exist.',
      field: 'questionId',
    });
  }
  return question;
}
