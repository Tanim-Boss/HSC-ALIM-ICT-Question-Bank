/**
 * The single error vocabulary for the publish gate and the database boundary.
 *
 * Every failure that can reach a caller is a `DomainError` with a stable
 * machine-readable `code` and a user-safe `message`. The rules in this folder
 * never let a raw driver message, SQL statement or constraint definition
 * escape — §3.13's invariants are ours to explain in domain terms, and a
 * `23514` string is not an explanation a user can act on.
 *
 * Shared by every server module (moved here from server/questions/publish in
 * Phase 04C; the old path re-exports it).
 *
 * Deliberately dependency-free: no Prisma import, no `server-only`. The rules
 * must be unit-testable without a database (see tests/unit/questions/), and the
 * database half must be able to import the rules without pulling a client in.
 */

/** Every invariant / conflict code the application can emit. */
export type DomainErrorCode =
  // ── publish gate: I-3 … I-15 ────────────────────────────────────────────
  | 'QUESTION_STATUS_ROLLUP_MISMATCH' // I-3
  | 'MCQ_OPTION_COUNT_INVALID' // I-4
  | 'CQ_OPTION_COUNT_INVALID' // I-4
  | 'OPTION_KEYS_NOT_DISTINCT' // I-4 — the SAME key appears twice
  | 'OPTION_KEY_ALPHABET_INVALID' // I-4 — keys are distinct but not one complete alphabet
  | 'PUBLISHED_VERSION_IMMUTABLE' // I-5
  | 'QUESTION_TYPE_IMMUTABLE' // I-6
  | 'CQ_RUBRIC_PARTS_MISMATCH' // I-7
  | 'CQ_RUBRIC_INVALID' // §7.7 rubric shape, strict: unknown/malformed fields
  | 'ASSET_POINTER_UNRESOLVED' // I-8 / I-14
  | 'ASSET_POINTER_DUPLICATE' // I-8
  | 'MCQ_ANSWER_KEY_INVALID' // I-13
  | 'CQ_ANSWER_KEY_INVALID' // I-13
  | 'ANSWER_KEY_NOT_VERIFIED' // I-13 / §7.7 rule 5
  | 'VERSION_NUMBER_GAP' // I-11
  | 'INACTIVE_ROW_REFERENCED' // I-12
  | 'CQ_MARKS_MISMATCH' // I-15
  | 'CONTENT_PROFILE_INVALID' // §7.5 profiles, prerequisite of the above
  // ── AMB-5: fail-closed review gate for legacy archived records ───────────
  // Distinct from QUESTION_TYPE_IMMUTABLE on purpose. That code means "a
  // published version exists right now"; this one means "publication status
  // cannot be determined because every version is archived". Collapsing them
  // would let a UI tell the user the wrong thing, and would hide the fact that
  // no historical publication tracking exists.
  | 'QUESTION_TYPE_CHANGE_REVIEW_REQUIRED'
  // ── V-5: unique-constraint mapping ──────────────────────────────────────
  | 'TAG_NAME_CONFLICT' // uq_tags_name_lower
  | 'TAG_SLUG_CONFLICT' // uq_tags_slug
  | 'COLLEGE_NAME_CONFLICT' // uq_colleges_name_lower
  | 'SUBJECT_CODE_CONFLICT' // uq_subjects_code
  | 'BOARD_CODE_CONFLICT' // uq_boards_code
  | 'EDUCATION_LEVEL_CODE_CONFLICT' // uq_education_levels_code
  | 'CHAPTER_NUMBER_CONFLICT' // uq_chapters_subject_number
  | 'TOPIC_ORDER_CONFLICT' // uq_topics_chapter_order
  | 'ACADEMIC_YEAR_CONFLICT' // uq_academic_years_label / _year
  | 'QUESTION_VERSION_NUMBER_CONFLICT' // uq_question_versions_question_number
  | 'ONE_PUBLISHED_VERSION_CONFLICT' // uq_question_versions_one_published_per_question
  | 'OPTION_KEY_CONFLICT' // uq_question_options_version_key
  | 'ANSWER_KEY_EXISTS_CONFLICT' // uq_answer_keys_version
  | 'ASSET_STORAGE_KEY_CONFLICT' // uq_question_assets_storage_key
  | 'ASSET_POINTER_CONFLICT' // uq_question_version_assets_version_block_ref
  | 'SOURCE_IDENTITY_CONFLICT' // uq_question_sources_identity
  | 'TAG_ALREADY_LINKED_CONFLICT' // question_tags primary key
  // The composite-FK support uniques (uq_chapters_id_subject, uq_topics_id_chapter,
  // uq_subtopics_id_topic). A collision means the service tried to create a row
  // that already existed — an internal bug, not a form the user can fix — so it
  // is kept distinct from the form-level conflicts above rather than reusing one
  // of their messages.
  | 'REFERENCE_TARGET_CONFLICT'
  // ── Phase 04B: identity and authorization (server/auth/) ─────────────────
  | 'UNAUTHENTICATED' // no verified Supabase session
  | 'INACTIVE' // the profile exists but is deactivated
  | 'FORBIDDEN' // the actor's roles do not permit the action (incl. separation of duties)
  // ── Phase 04C: authoring commands (server/questions/authoring/) ──────────
  | 'VALIDATION_FAILED' // input failed its Zod schema; `field` names the path
  | 'NOT_FOUND' // the question or version does not exist (or not in that question)
  | 'CONFLICT' // optimistic concurrency: expectedUpdatedAt is stale
  | 'VERSION_NOT_EDITABLE' // saveDraft/verify on an ARCHIVED version
  | 'DRAFT_ALREADY_EXISTS' // createRevision while a DRAFT version exists
  | 'NO_PUBLISHED_VERSION' // createRevision with nothing published to copy
  | 'ANSWER_KEY_MISSING' // verifyAnswerKey on a version with no key
  | 'ALREADY_VERIFIED' // verifyAnswerKey on an already-verified key
  | 'ALREADY_ARCHIVED' // archive on something already archived
  | 'NOTHING_TO_ARCHIVE' // archiveQuestion on a question with no versions
  // ── Phase 04C: foreign-key mapping (23503 / P2003) ───────────────────────
  | 'TAXONOMY_CHAIN_INVALID' // C-1…C-4: level/subject/chapter/topic/subtopic do not belong together
  | 'ANSWER_KEY_OPTION_MISSING' // C-5: the correct option is not an option of this version
  | 'REFERENCE_NOT_FOUND' // a referenced row (taxonomy, tag, board, …) does not exist
  | 'FOREIGN_KEY_CONFLICT' // an unrecognised FK violation; never guessed into a field
  // Generic, deliberately last: an unmapped unique violation is a conflict the
  // user can act on ("that value is already taken") without learning which
  // index it was. Never silently coerced into a specific field (V-5 requirement).
  | 'UNIQUE_CONFLICT';

export interface DomainErrorInit {
  readonly code: DomainErrorCode;
  /** Safe to show a user. Must not contain SQL, index names or driver text. */
  readonly message: string;
  /** Which invariant raised it, when it is an invariant. */
  readonly invariant?: string;
  /** Field-level detail for form mapping. Safe to show. */
  readonly field?: string;
  /**
   * Index/constraint names that produced the error. Kept OFF the class instance
   * that reaches a client — see `toPublicError`. Present so server logs can
   * correlate a mapped error with the database fact.
   */
  readonly constraintNames?: readonly string[];
}

/**
 * A domain failure. `instanceof` works across module boundaries because this is
 * a real class, and `code` is stable enough to switch on.
 */
export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly invariant?: string;
  readonly field?: string;
  readonly constraintNames?: readonly string[];

  constructor(init: DomainErrorInit) {
    super(init.message);
    this.name = 'DomainError';
    this.code = init.code;
    this.invariant = init.invariant;
    this.field = init.field;
    this.constraintNames = init.constraintNames;
  }
}

/** What a route handler may return to a client. No internals. */
export interface PublicError {
  readonly code: DomainErrorCode;
  readonly message: string;
  readonly invariant?: string;
  readonly field?: string;
}

/**
 * Strips everything internal. `constraintNames` is intentionally dropped: an
 * index name is schema detail, and V-5 requires that raw database detail never
 * reaches a user.
 */
export function toPublicError(error: DomainError): PublicError {
  return {
    code: error.code,
    message: error.message,
    ...(error.invariant === undefined ? {} : { invariant: error.invariant }),
    ...(error.field === undefined ? {} : { field: error.field }),
  };
}

/**
 * Collects every violation found while validating, so a caller can be told
 * about all of them at once instead of fixing one per round trip.
 *
 * Ordering is stable (insertion), because the user sees these in a form.
 */
export class ViolationCollector {
  private readonly violations: DomainError[] = [];

  add(error: DomainError): void {
    this.violations.push(error);
  }

  /** Convenience: build and record in one step. */
  fail(init: DomainErrorInit): void {
    this.add(new DomainError(init));
  }

  get count(): number {
    return this.violations.length;
  }

  get isEmpty(): boolean {
    return this.violations.length === 0;
  }

  list(): readonly DomainError[] {
    return [...this.violations];
  }

  /**
   * Throws a single `DomainError` carrying the FIRST violation's code (stable
   * and actionable) with a message listing the rest.
   *
   * A multi-code aggregate was considered and rejected: callers switch on
   * `code`, and inventing a `MULTIPLE_VIOLATIONS` code would force every caller
   * to unwrap. The full list is exposed separately via `list()` for form UIs.
   */
  throwIfAny(): void {
    if (this.violations.length === 0) return;
    const [first, ...rest] = this.violations;
    if (first === undefined) return;
    if (rest.length === 0) throw first;
    throw new DomainError({
      code: first.code,
      message: `${first.message} (${rest.length} further problem${rest.length === 1 ? '' : 's'} found)`,
      ...(first.invariant === undefined ? {} : { invariant: first.invariant }),
      ...(first.field === undefined ? {} : { field: first.field }),
      constraintNames: this.violations.flatMap((v) => v.constraintNames ?? []),
    });
  }
}
