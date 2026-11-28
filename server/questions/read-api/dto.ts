/**
 * Explicit wire DTOs for the Phase 04G staff question read API.
 *
 * OD-17 §7 is unambiguous: every response uses a purpose-built DTO, timestamps
 * are ISO-8601 UTC strings, field names are camelCase, and a Prisma record is
 * never serialized. These mappers are the only place a domain projection
 * becomes JSON.
 *
 * The two projections differ on purpose and that difference is the security
 * property of this API:
 *
 *   · LIST  — identity, taxonomy ids, status, marks, tag ids, a compact version
 *             summary and timestamps. NO answer key, NO correct option
 *             identifier, NO rubric, NO option content, NO stem content, NO
 *             `searchText`. The domain `LIST_SELECT` already omits these
 *             (`server/questions/authoring/queries.ts`); this mapper never
 *             reads them, so even a future service change cannot leak them
 *             through this DTO without an explicit edit here.
 *   · DETAIL — the existing authorized staff projection, which DOES include
 *             content, options and the answer key/rubric because
 *             `question.read_staff` (EDITOR and up) is granted before it runs.
 *             It is mapped field-by-field below; unknown keys on the domain
 *             object (for example an internal column a future `select` adds)
 *             are dropped, not spread.
 *
 * Pure: types only, no Prisma client, no I/O.
 */

import type {
  StaffQuestionDetail,
  StaffQuestionListItem,
  StaffQuestionPage,
} from '@/server/questions/authoring/queries';

/* ------------------------------------------------------------------------- */
/* List                                                                      */
/* ------------------------------------------------------------------------- */

export interface StaffQuestionVersionSummaryDto {
  readonly id: string;
  readonly versionNumber: number;
  readonly status: StaffQuestionListItem['versions'][number]['status'];
  readonly updatedAt: string;
}

export interface StaffQuestionListItemDto {
  readonly id: string;
  readonly type: StaffQuestionListItem['type'];
  readonly status: StaffQuestionListItem['status'];
  readonly difficulty: StaffQuestionListItem['difficulty'];
  readonly marks: number;
  readonly educationLevelId: string;
  readonly subjectId: string;
  readonly chapterId: string | null;
  readonly topicId: string | null;
  readonly subtopicId: string | null;
  readonly tagIds: readonly string[];
  readonly versions: readonly StaffQuestionVersionSummaryDto[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StaffQuestionListDto {
  readonly items: readonly StaffQuestionListItemDto[];
  /** Wire cursor for the next page, or null on the last page. */
  readonly nextCursor: string | null;
  /** True when a further page exists (i.e. `nextCursor` is not null). */
  readonly hasMore: boolean;
}

/** ISO-8601 UTC. `toISOString()` always renders the `Z` suffix. */
function iso(value: Date): string {
  return value.toISOString();
}

export function toStaffQuestionListItemDto(row: StaffQuestionListItem): StaffQuestionListItemDto {
  return {
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
    tagIds: [...row.tagIds],
    versions: row.versions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      status: version.status,
      updatedAt: iso(version.updatedAt),
    })),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

/**
 * Maps one page. `nextCursor` is supplied by the caller because the wire value
 * is the VERSIONED, filter-bound cursor (`./cursor.ts`), not the domain string
 * the query produced — that translation must not be hidden in a mapper.
 */
export function toStaffQuestionListDto(
  page: StaffQuestionPage,
  nextCursor: string | null,
): StaffQuestionListDto {
  return {
    items: page.items.map(toStaffQuestionListItemDto),
    nextCursor,
    hasMore: nextCursor !== null,
  };
}

/* ------------------------------------------------------------------------- */
/* Detail                                                                    */
/* ------------------------------------------------------------------------- */

export interface StaffQuestionSourceDto {
  readonly id: string;
  readonly sourceType: StaffQuestionDetail['sources'][number]['sourceType'];
  readonly boardId: string | null;
  readonly collegeId: string | null;
  readonly academicYearId: string | null;
  readonly sourceName: string | null;
}

export interface StaffQuestionOptionDto {
  readonly key: StaffQuestionDetail['versions'][number]['options'][number]['key'];
  readonly content: unknown;
  readonly order: number;
}

/** The stored option-key alphabet; `null` for a CQ rubric-only key. */
type StoredAnswerKey = NonNullable<StaffQuestionDetail['versions'][number]['answerKey']>;

export interface StaffQuestionAnswerKeyDto {
  readonly mcqCorrectOptionKey: StoredAnswerKey['mcqCorrectOptionKey'];
  readonly cqRubric: unknown;
  readonly isVerified: boolean;
  readonly verifiedById: string | null;
  readonly verifiedAt: string | null;
}

export interface StaffQuestionVersionDto {
  readonly id: string;
  readonly versionNumber: number;
  readonly status: StaffQuestionDetail['versions'][number]['status'];
  readonly content: unknown;
  readonly createdById: string | null;
  readonly updatedById: string | null;
  readonly publishedById: string | null;
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly options: readonly StaffQuestionOptionDto[];
  /** Answer key / rubric. Present only because the caller holds `question.read_staff`. */
  readonly answerKey: StaffQuestionAnswerKeyDto | null;
  readonly assetIds: readonly { readonly assetId: string; readonly blockRef: string }[];
}

export interface StaffQuestionDetailDto {
  readonly id: string;
  readonly type: StaffQuestionDetail['type'];
  readonly status: StaffQuestionDetail['status'];
  readonly difficulty: StaffQuestionDetail['difficulty'];
  readonly createdVia: StaffQuestionDetail['createdVia'];
  readonly marks: number;
  readonly educationLevelId: string;
  readonly subjectId: string;
  readonly chapterId: string | null;
  readonly topicId: string | null;
  readonly subtopicId: string | null;
  readonly tagIds: readonly string[];
  readonly sources: readonly StaffQuestionSourceDto[];
  readonly versions: readonly StaffQuestionVersionDto[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Field-by-field mapping of the authorized staff detail projection. The answer
 * key is nested per version, exactly where the domain keeps it; it is not
 * flattened to the question so a client cannot read a key without the version
 * it belongs to.
 */
export function toStaffQuestionDetailDto(row: StaffQuestionDetail): StaffQuestionDetailDto {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    difficulty: row.difficulty,
    createdVia: row.createdVia,
    marks: row.marks,
    educationLevelId: row.educationLevelId,
    subjectId: row.subjectId,
    chapterId: row.chapterId,
    topicId: row.topicId,
    subtopicId: row.subtopicId,
    tagIds: row.tags.map((tag) => tag.tagId),
    sources: row.sources.map((source) => ({
      id: source.id,
      sourceType: source.sourceType,
      boardId: source.boardId,
      collegeId: source.collegeId,
      academicYearId: source.academicYearId,
      sourceName: source.sourceName,
    })),
    versions: row.versions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      status: version.status,
      content: version.content,
      createdById: version.createdById,
      updatedById: version.updatedById,
      publishedById: version.publishedById,
      publishedAt: version.publishedAt === null ? null : iso(version.publishedAt),
      createdAt: iso(version.createdAt),
      updatedAt: iso(version.updatedAt),
      options: version.options.map((option) => ({
        key: option.key,
        content: option.content,
        order: option.order,
      })),
      answerKey:
        version.answerKey === null
          ? null
          : {
              mcqCorrectOptionKey: version.answerKey.mcqCorrectOptionKey,
              cqRubric: version.answerKey.cqRubric,
              isVerified: version.answerKey.isVerified,
              verifiedById: version.answerKey.verifiedById,
              verifiedAt:
                version.answerKey.verifiedAt === null ? null : iso(version.answerKey.verifiedAt),
            },
      assetIds: version.assets.map((asset) => ({
        assetId: asset.assetId,
        blockRef: asset.blockRef,
      })),
    })),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
