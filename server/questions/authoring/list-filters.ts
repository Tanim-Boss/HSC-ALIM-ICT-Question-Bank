/**
 * The staff list's filter SEMANTICS, separated from the query that executes
 * them (Phase 04D).
 *
 * Why this module exists. Phase 04D has to prove a performance claim about
 * `listQuestionsForStaff`, and the measurement has to run the *same* filter
 * tree the service runs — not a hand-written approximation of it. So the filter
 * tree is built once, here, as a plain data structure (`ListFilterSpec`), and
 * two consumers render it:
 *
 *   · `toPrismaWhere` — the production path (server/questions/authoring/queries.ts);
 *   · scripts/db/list-query-sql.ts — the perf harness's SQL renderer.
 *
 * A single source of truth for semantics is what makes
 * docs/database/perf/04d-before.md and 04d-after.md comparable, and
 * tests/integration/questions/staff-list-filters.test.ts pins the two
 * renderings to the same rows.
 *
 * Provenance semantics — board, college and year
 * ----------------------------------------------
 * A `QuestionSource` row names EITHER a board OR a college (the schema's
 * `sourceInput` rule and the domain description in README §7.1.1), and a
 * question may hold several source rows. Therefore:
 *
 *   · board and college are INDEPENDENT dimensions: each gets its own
 *     `EXISTS`. Selecting a board never sets, clears or constrains a college,
 *     and vice versa (README §7.1.1 rules 1, 4, 5).
 *   · year qualifies an attribution: when a board is also selected, year and
 *     board must hold on the SAME source row ("from Dhaka board in 2023"),
 *     which is the Phase 04C behaviour and is preserved exactly. The same rule
 *     applies to college + year. With year alone, any source row qualifies.
 *   · a question may match the board EXISTS and the college EXISTS on two
 *     different source rows. That is the point of the two dimensions.
 *
 * Pure: no Prisma client, no `server-only`, no I/O.
 */

import type { Prisma } from '@/lib/generated/prisma/client';
import type {
  QuestionDifficulty,
  QuestionStatus,
  QuestionType,
} from '@/lib/generated/prisma/enums';

import { DomainError } from '@/server/shared/errors';

import {
  decodeCursor,
  INVALID_CURSOR_MESSAGE,
  InvalidCursorError,
  type CursorPosition,
} from './cursor';
import { listQuestionsInputSchema, parseInput, type ListQuestionsInput } from './schemas';

/* ------------------------------------------------------------------------- */
/* Query text normalisation                                                  */
/* ------------------------------------------------------------------------- */

/** Upper bound on the characters a staff query may carry. */
export const SEARCH_QUERY_MAX = 120;
/** Upper bound on the tokens one query may be split into. */
export const SEARCH_TOKENS_MAX = 5;

/**
 * Normalises a staff search box into tokens that are literal substrings.
 *
 *   · Unicode NFC, so a decomposed Bangla or Latin sequence matches a composed
 *     one (and vice versa — everything is compared in NFC).
 *   · Lower case, which is how the stored projection is normalised. Bangla has
 *     no case, so this only affects Latin text; it is why the query does not
 *     need `mode: 'insensitive'` (ILIKE) and can therefore use the GIN trigram
 *     index directly.
 *   · Whitespace collapsed, then split into tokens; every token must appear.
 *   · LIKE metacharacters `%`, `_` and `\` are removed. Prisma's `contains`
 *     does not escape them, so a literal `%` would otherwise become a wildcard
 *     and turn a staff search into a table scan (or match everything).
 *
 * Returns `[]` for a blank query, which the caller treats as "no search".
 */
export function normalizeSearchQuery(query: string): string[] {
  const normalized = query
    .normalize('NFC')
    .toLowerCase()
    .replace(/[%_\\]/g, ' ');
  const tokens = normalized.split(/\s+/u).filter((token) => token.length > 0);
  return tokens.slice(0, SEARCH_TOKENS_MAX);
}

/* ------------------------------------------------------------------------- */
/* The spec                                                                  */
/* ------------------------------------------------------------------------- */

export interface ListFilterSpec {
  readonly educationLevelId?: string;
  readonly subjectId?: string;
  readonly chapterId?: string;
  readonly topicId?: string;
  readonly type?: QuestionType;
  readonly status?: QuestionStatus;
  readonly difficulty?: QuestionDifficulty;
  readonly tagId?: string;
  readonly boardId?: string;
  readonly collegeId?: string;
  readonly academicYearId?: string;
  /** Normalised search tokens; empty means "no search filter". */
  readonly searchTokens: readonly string[];
  readonly cursor?: CursorPosition;
  readonly limit: number;
}

/**
 * Validates raw input and produces the spec. Validation is unchanged from
 * Phase 04C — the same Zod schema, the same `VALIDATION_FAILED` contract — with
 * `collegeId` and `q` added to that schema.
 */
export function buildListFilter(input: ListQuestionsInput = {}): ListFilterSpec {
  const f = parseInput(listQuestionsInputSchema, input);
  const searchTokens = f.q === undefined ? [] : normalizeSearchQuery(f.q);
  if (f.q !== undefined && searchTokens.length === 0) {
    // `q` passed the schema but normalisation left nothing to match (it was only
    // LIKE metacharacters). Answering with the UNFILTERED list would look like a
    // successful search that ignored the operator, so refuse instead.
    throw new DomainError({
      code: 'VALIDATION_FAILED',
      message: 'q: contains no searchable characters',
      field: 'q',
    });
  }
  return {
    ...(f.educationLevelId === undefined ? {} : { educationLevelId: f.educationLevelId }),
    ...(f.subjectId === undefined ? {} : { subjectId: f.subjectId }),
    ...(f.chapterId === undefined ? {} : { chapterId: f.chapterId }),
    ...(f.topicId === undefined ? {} : { topicId: f.topicId }),
    ...(f.type === undefined ? {} : { type: f.type }),
    ...(f.status === undefined ? {} : { status: f.status }),
    ...(f.difficulty === undefined ? {} : { difficulty: f.difficulty }),
    ...(f.tagId === undefined ? {} : { tagId: f.tagId }),
    ...(f.boardId === undefined ? {} : { boardId: f.boardId }),
    ...(f.collegeId === undefined ? {} : { collegeId: f.collegeId }),
    ...(f.academicYearId === undefined ? {} : { academicYearId: f.academicYearId }),
    searchTokens,
    ...(f.cursor === undefined ? {} : { cursor: decode(f.cursor) }),
    limit: f.limit,
  };
}

/** Decodes a cursor, translating the pure module's error into the domain contract. */
function decode(cursor: string): CursorPosition {
  try {
    return decodeCursor(cursor);
  } catch (error) {
    if (error instanceof InvalidCursorError) {
      throw new DomainError({
        code: 'VALIDATION_FAILED',
        message: INVALID_CURSOR_MESSAGE,
        field: 'cursor',
      });
    }
    throw error;
  }
}

/* ------------------------------------------------------------------------- */
/* Prisma rendering (production)                                             */
/* ------------------------------------------------------------------------- */

/**
 * The Prisma `where` the service executes.
 *
 * Ordering is deliberate: the cheapest, most selective scalar predicates come
 * first so a reader (and PostgreSQL) sees the driving condition before the
 * `EXISTS` subqueries.
 */
export function toPrismaWhere(spec: ListFilterSpec): Prisma.QuestionWhereInput {
  const and: Prisma.QuestionWhereInput[] = [];
  if (spec.educationLevelId !== undefined) and.push({ educationLevelId: spec.educationLevelId });
  if (spec.subjectId !== undefined) and.push({ subjectId: spec.subjectId });
  if (spec.chapterId !== undefined) and.push({ chapterId: spec.chapterId });
  if (spec.topicId !== undefined) and.push({ topicId: spec.topicId });
  if (spec.type !== undefined) and.push({ type: spec.type });
  if (spec.status !== undefined) and.push({ status: spec.status });
  if (spec.difficulty !== undefined) and.push({ difficulty: spec.difficulty });
  if (spec.tagId !== undefined) and.push({ tags: { some: { tagId: spec.tagId } } });

  // Board and year qualify the SAME attribution; college is its own dimension.
  if (spec.boardId !== undefined) {
    and.push({
      sources: {
        some: {
          boardId: spec.boardId,
          ...(spec.academicYearId === undefined ? {} : { academicYearId: spec.academicYearId }),
        },
      },
    });
  }
  if (spec.collegeId !== undefined) {
    and.push({
      sources: {
        some: {
          collegeId: spec.collegeId,
          ...(spec.academicYearId === undefined ? {} : { academicYearId: spec.academicYearId }),
        },
      },
    });
  }
  // Year on its own qualifies ANY attribution. It is deliberately not pushed
  // when a board or a college is selected: that would add a second, weaker
  // EXISTS that the dimension-specific clause already implies.
  if (
    spec.academicYearId !== undefined &&
    spec.boardId === undefined &&
    spec.collegeId === undefined
  ) {
    and.push({ sources: { some: { academicYearId: spec.academicYearId } } });
  }

  // Every token must appear in the SAME version's projection.
  if (spec.searchTokens.length > 0) {
    and.push({
      versions: {
        some: {
          AND: spec.searchTokens.map((token) => ({ searchText: { contains: token } })),
        },
      },
    });
  }

  if (spec.cursor !== undefined) {
    const after = spec.cursor;
    and.push({
      OR: [
        { createdAt: { lt: after.createdAt } },
        { createdAt: after.createdAt, id: { lt: after.id } },
      ],
    });
  }

  return { AND: and };
}
