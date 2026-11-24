/**
 * V-5 — mapping PostgreSQL unique violations to stable application errors.
 *
 * THE PROBLEM THIS SOLVES
 *
 * `uq_tags_name_lower` and `uq_colleges_name_lower` are **expression** unique
 * indexes (`lower(name)`) added as hand-written SQL. Prisma does not model them.
 * When one is violated, PostgreSQL raises `23505` naming the **index**, and
 * Prisma's `meta.target` may be a field list, a single field, an index name, or
 * nothing at all. Measured against real PostgreSQL in the V-1…V-5 work:
 *
 *     SQLSTATE   23505 (unique_violation)
 *     CONSTRAINT uq_tags_name_lower          <- an INDEX name, not a model field
 *     DETAIL     Key (lower(name))=(computer network) already exists.
 *
 * So a mapper that assumes `meta.target` is always `string[]` will either throw
 * or silently mis-label the conflict. Both are user-visible bugs.
 *
 * THE THREE INVARIANTS OF THIS MODULE
 *
 *   1. Every known unique index maps to exactly one stable code. A tag-name
 *      conflict is never reported as a college-name conflict.
 *   2. An unrecognised unique violation becomes `UNIQUE_CONFLICT` — a safely
 *      handled generic conflict. It is never guessed into a specific field.
 *   3. No raw database text leaves this module. Index names, SQLSTATE, SQL and
 *      `DETAIL` lines are captured for logs but stripped from what a caller gets
 *      (see `toPublicError` in `./errors.ts`).
 *
 * Deliberately dependency-free: no Prisma import. The shape below is structural,
 * so tests can feed recorded errors locally and the real client in CI without a
 * type import that would require a generated client to exist.
 */

import { DomainError, type DomainErrorCode } from './errors';

/** The subset of a Prisma known-request error this module relies on. */
export interface PrismaKnownErrorShape {
  /** Prisma's own error code — `P2002` for a unique violation. */
  readonly code: string;
  /** Safe-ish message; may contain the index name and the DETAIL line. */
  readonly message?: string;
  readonly meta?: {
    /** Prisma's target: field list, single field, or an index name. */
    readonly target?: unknown;
    /** Some driver paths put the constraint name here instead. */
    readonly constraint?: unknown;
    readonly modelName?: unknown;
    readonly field_name?: unknown;
  } | null;
}

/** What a mapped conflict says. `message` is shown to a user and is safe. */
interface Mapping {
  readonly code: DomainErrorCode;
  readonly message: string;
  readonly field?: string;
}

/**
 * The registry. Keyed by the **exact index/constraint name** the database uses,
 * which is the only identifier that is stable across Prisma versions. Every
 * unique index in migration 0001 appears here; the list is checked against the
 * migration by `tests/integration/questions/unique-index-coverage.test.ts` so a
 * future migration cannot add an index that silently falls through to generic.
 */
export const UNIQUE_INDEX_MAP: Readonly<Record<string, Mapping>> = {
  // ── expression uniques (Prisma does not model these) ──────────────────
  uq_tags_name_lower: {
    code: 'TAG_NAME_CONFLICT',
    message: 'A tag with this name already exists (names are compared ignoring case).',
    field: 'name',
  },
  uq_colleges_name_lower: {
    code: 'COLLEGE_NAME_CONFLICT',
    message: 'A college with this name already exists (names are compared ignoring case).',
    field: 'name',
  },
  // ── plain uniques Prisma does model ──────────────────────────────────
  uq_tags_slug: {
    code: 'TAG_SLUG_CONFLICT',
    message: 'A tag with this URL identifier already exists.',
    field: 'slug',
  },
  uq_subjects_code: {
    code: 'SUBJECT_CODE_CONFLICT',
    message: 'A subject with this code already exists.',
    field: 'code',
  },
  uq_boards_code: {
    code: 'BOARD_CODE_CONFLICT',
    message: 'A board with this code already exists.',
    field: 'code',
  },
  uq_education_levels_code: {
    code: 'EDUCATION_LEVEL_CODE_CONFLICT',
    message: 'An education level with this code already exists.',
    field: 'code',
  },
  uq_chapters_subject_number: {
    code: 'CHAPTER_NUMBER_CONFLICT',
    message: 'This subject already has a chapter with that number.',
    field: 'chapterNumber',
  },
  uq_topics_chapter_order: {
    code: 'TOPIC_ORDER_CONFLICT',
    message: 'An active topic already occupies that position in this chapter.',
    field: 'order',
  },
  uq_academic_years_label: {
    code: 'ACADEMIC_YEAR_CONFLICT',
    message: 'An academic year with that label or year already exists.',
  },
  uq_academic_years_year: {
    code: 'ACADEMIC_YEAR_CONFLICT',
    message: 'An academic year with that label or year already exists.',
  },
  uq_question_versions_question_number: {
    code: 'QUESTION_VERSION_NUMBER_CONFLICT',
    message: 'This question already has a version with that number.',
    field: 'versionNumber',
  },
  uq_question_versions_one_published_per_question: {
    code: 'ONE_PUBLISHED_VERSION_CONFLICT',
    message: 'This question already has a published version.',
  },
  uq_question_options_version_key: {
    code: 'OPTION_KEY_CONFLICT',
    message: 'This version already has an option with that key.',
    field: 'key',
  },
  uq_answer_keys_version: {
    code: 'ANSWER_KEY_EXISTS_CONFLICT',
    message: 'This version already has an answer key.',
  },
  uq_question_assets_storage_key: {
    code: 'ASSET_STORAGE_KEY_CONFLICT',
    message: 'An asset with that storage key already exists.',
  },
  uq_question_version_assets_version_block_ref: {
    code: 'ASSET_POINTER_CONFLICT',
    message: 'That asset location is already linked to this version.',
    field: 'blockRef',
  },
  uq_question_sources_identity: {
    code: 'SOURCE_IDENTITY_CONFLICT',
    message: 'This question already has a source with those same details.',
  },
  question_tags_pkey: {
    code: 'TAG_ALREADY_LINKED_CONFLICT',
    message: 'That tag is already linked to this question.',
  },
} as const;

/** Constraint names in the migration that are not these models' uniques. */
const IGNORED_NON_UNIQUE_CONSTRAINTS = new Set(['answer_keys_pkey', 'level_subjects_pkey']);

/**
 * Extracts every index/constraint name a Prisma error might carry.
 *
 * Prisma puts an index name in `meta.target` for an expression index on some
 * versions, in `meta.constraint` on others, and in the message (`... constraint
 * "uq_x" failed` or `CONSTRAINT: uq_x`) on others again. All three are tried
 * because assuming one is exactly the mistake V-5 exists to prevent.
 */
export function extractConstraintNames(error: PrismaKnownErrorShape): string[] {
  const names = new Set<string>();

  const target = error.meta?.target;
  if (typeof target === 'string' && target.length > 0) {
    names.add(target);
  } else if (Array.isArray(target)) {
    for (const entry of target) {
      if (typeof entry === 'string' && entry.length > 0) names.add(entry);
    }
  }

  for (const value of [error.meta?.constraint, error.meta?.field_name]) {
    if (typeof value === 'string' && value.length > 0) names.add(value);
  }

  const message = error.message ?? '';
  // Prisma wording: `Unique constraint failed on the constraint: \`uq_x\``
  const onConstraint = /constraint:\s*`?([A-Za-z0-9_]+)`?/gi;
  for (let m = onConstraint.exec(message); m !== null; m = onConstraint.exec(message)) {
    const name = m[1];
    if (name !== undefined) names.add(name);
  }
  // PostgreSQL wording passed through: `violates unique constraint "uq_x"`
  const quoted = /unique constraint\s+"([A-Za-z0-9_]+)"/gi;
  for (let m = quoted.exec(message); m !== null; m = quoted.exec(message)) {
    const name = m[1];
    if (name !== undefined) names.add(name);
  }

  return [...names];
}

/** True when the error is Prisma's unique-violation code. */
export function isUniqueViolation(error: unknown): error is PrismaKnownErrorShape {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    (error as { code: string }).code === 'P2002'
  );
}

/**
 * A five-character SQLSTATE.
 *
 * Prisma's own codes are `P####` — also five characters — so the pattern must
 * exclude them. Caught by a test that fed in a Prisma error and got `P2002`
 * back as if it were a SQLSTATE; without the exclusion the caller would compare
 * 'P2002' against '23505' and take the wrong branch.
 */
function isSqlState(code: string): boolean {
  return /^[0-9A-Z]{5}$/.test(code) && !/^P\d{4}$/.test(code);
}

/**
 * Extracts the SQLSTATE from a driver-level error, if one is attached.
 *
 * A raw `pg` error carries `.code === '23505'`. Prisma wraps it, so this walks
 * `cause` a few levels. Returns null when no SQLSTATE is reachable — which is
 * itself information, not a failure.
 */
export function sqlStateOf(error: unknown, depth = 0): string | null {
  if (typeof error !== 'object' || error === null || depth > 4) return null;
  const candidate = error as { code?: unknown; cause?: unknown };
  if (typeof candidate.code === 'string' && isSqlState(candidate.code)) {
    return candidate.code;
  }
  return sqlStateOf(candidate.cause, depth + 1);
}

/**
 * Maps any thrown value to a `DomainError`.
 *
 * Returns non-unique errors unchanged so callers can re-throw them: this module
 * owns unique-conflict mapping, not general error handling.
 */
export function mapUniqueViolation(error: unknown): DomainError | null {
  if (!isUniqueViolation(error) && sqlStateOf(error) !== '23505') {
    return null;
  }

  const names = isUniqueViolation(error)
    ? extractConstraintNames(error)
    : extractConstraintNamesFromCause(error);

  // Invariant 1: exactly one registry entry hit. More than one match is
  // ambiguous — take the first deterministically rather than inventing a merge.
  for (const name of names) {
    const mapping = UNIQUE_INDEX_MAP[name];
    if (mapping !== undefined) {
      return new DomainError({
        code: mapping.code,
        message: mapping.message,
        ...(mapping.field === undefined ? {} : { field: mapping.field }),
        constraintNames: [name],
      });
    }
  }

  // A constraint we know is not a unique violation (a primary key on a join
  // table reached through the wrong path) still becomes a safe generic conflict.
  const ignored = names.filter((n) => IGNORED_NON_UNIQUE_CONSTRAINTS.has(n));

  // Invariant 2: never guess. An unmapped unique violation is generic and safe.
  return new DomainError({
    code: 'UNIQUE_CONFLICT',
    message: 'That value conflicts with something that already exists. Please check and try again.',
    constraintNames: ignored.length > 0 ? ignored : names,
  });
}

function extractConstraintNamesFromCause(error: unknown, depth = 0): string[] {
  if (typeof error !== 'object' || error === null || depth > 4) return [];
  const candidate = error as { constraint?: unknown; message?: unknown; cause?: unknown };
  const names: string[] = [];
  if (typeof candidate.constraint === 'string' && candidate.constraint.length > 0) {
    names.push(candidate.constraint);
  }
  if (typeof candidate.message === 'string') {
    const quoted = /unique constraint\s+"([A-Za-z0-9_]+)"/gi;
    for (let m = quoted.exec(candidate.message); m !== null; m = quoted.exec(candidate.message)) {
      const name = m[1];
      if (name !== undefined) names.push(name);
    }
  }
  return [...names, ...extractConstraintNamesFromCause(candidate.cause, depth + 1)];
}

/**
 * Runs `work` and converts a unique violation into a `DomainError`.
 *
 * The point of wrapping at this boundary is that **nothing else may see a 23505
 * as an unhandled error**: a route handler that forgets to call `mapUniqueViolation`
 * would leak a raw driver error to a user.
 */
export async function withUniqueConflictMapping<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const mapped = mapUniqueViolation(error);
    if (mapped !== null) throw mapped;
    throw error;
  }
}

/** Human-readable summary for a server log. Never sent to a client. */
export function describeForLog(error: unknown): string {
  const names = isUniqueViolation(error) ? extractConstraintNames(error) : [];
  const state = sqlStateOf(error);
  return [`sqlstate=${state ?? 'unknown'}`, `constraints=${names.join(',') || 'none'}`].join(' ');
}
