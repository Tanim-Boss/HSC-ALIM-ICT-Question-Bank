import 'server-only';

/**
 * The question type-change service — the single entry point that can change a
 * question's type.
 *
 * ── Why this file exists ─────────────────────────────────────────────────
 *
 * AMB-5 requires that a fully archived question cannot pass the ordinary
 * type-change path without a review. Before this module there was no such path
 * to protect: `assertQuestionTypeChangeAllowed` existed in `gate.ts` but had no
 * caller anywhere in `server/`, and nothing in the codebase ever wrote
 * `questions.type` (verified by grep for `.update(`/`.create(`/`.upsert(`/
 * `.delete(` across `server/` — no results). A guard with no caller protects
 * nothing, and a test of the guard alone would prove only that a pure function
 * returns a value.
 *
 * So this module supplies the missing entry point AND puts both gates on it.
 * The AMB-5 test runs against THIS function with a real PostgreSQL transaction,
 * which is what "exercise the actual application service" means.
 *
 * ── Transport-free, deliberately ─────────────────────────────────────────
 *
 * This is a domain service, not an HTTP handler. OD-17 (wire contract) is still
 * open, so it invents no route, no status code, no response envelope and no
 * field-path format. Callers get a `DomainError` with a stable `code`, which is
 * the same contract every other service in this directory already honours.
 *
 * ── What it guarantees ───────────────────────────────────────────────────
 *
 *   1. The question row is locked (`FOR UPDATE`) so two concurrent type changes
 *      cannot both read the pre-change state and both decide it is allowed.
 *   2. Every read goes through the transaction client (`db`), never the pool —
 *      defect D2 was exactly this mistake, and a read through the pool would
 *      make the lock meaningless.
 *   3. Both I-6 gates run, in order, before any write:
 *        · `assertTypeChangeAllowed`            — published RIGHT NOW?
 *        · `assertLegacyArchiveReviewRequired`   — publication status UNKNOWABLE?
 *   4. There is NO global bypass. The review-exception parameter is absent by
 *      design: AMB-5 authorises no override mechanism, and the owner has not
 *      approved one. Until such a decision exists, exceptions are simply
 *      unavailable — see `docs/database/g1-spike/option-c/prod-ready/v45/
 *      AMB-5-LEGACY-ARCHIVE-DECISION.md`.
 */

import { getPrisma } from '@/lib/db';
import { DomainError } from './publish/errors';
import { mapUniqueViolation } from './publish/db-errors';
import { loadQuestionSnapshot, type QuestionReader } from './publish/snapshot';
import {
  assertLegacyArchiveReviewRequired,
  assertTypeChangeAllowed,
  type QuestionStatus,
  type QuestionType,
} from './publish/rules';

/**
 * The subset of the interactive transaction client this service needs.
 *
 * Declared structurally for the same reason as `TransactionClient` in
 * `gate.ts`: the generated Prisma client is git-ignored, so an untyped `tx`
 * would make every callback parameter an implicit `any` under
 * `noImplicitAny`.
 */
interface TypeChangeTransactionClient extends QuestionReader {
  $queryRaw(query: TemplateStringsArray, ...values: readonly unknown[]): Promise<unknown>;
  readonly question: QuestionReader['question'] & {
    update(args: unknown): Promise<unknown>;
  };
}

export interface ChangeQuestionTypeInput {
  readonly questionId: string;
  readonly nextType: QuestionType;
}

export interface ChangeQuestionTypeResult {
  readonly questionId: string;
  /** The type before the change. Returned so a caller can log an audit trail. */
  readonly previousType: QuestionType;
  readonly type: QuestionType;
  /**
   * The question status after the change. A type change never alters a version's
   * status, so this equals the status read inside the transaction; it is
   * returned rather than assumed, so callers do not re-derive the I-3 rollup.
   */
  readonly questionStatus: QuestionStatus;
}

/**
 * Changes a question's type, refusing when I-6 or the AMB-5 fail-closed review
 * gate forbids it.
 *
 * Refusal codes, both `DomainError`, both safe to show a user:
 *   · `QUESTION_TYPE_IMMUTABLE` — a version is published right now.
 *   · `QUESTION_TYPE_CHANGE_REVIEW_REQUIRED` — every version is archived, so
 *     whether it was ever published cannot be determined. Missing history is
 *     never read as proof of non-publication.
 *
 * A no-op (same type in, same type out) is NOT an error: it is the state the
 * caller asked for, and there is nothing to review. It is still returned in the
 * same shape so callers have one branch, not two.
 */
export async function changeQuestionType(
  input: ChangeQuestionTypeInput,
): Promise<ChangeQuestionTypeResult> {
  const prisma = getPrisma();

  try {
    // `tx` is deliberately not annotated with the structural interface: the real
    // callback parameter is the full transaction client, and a narrower
    // annotation is rejected under strictFunctionTypes. One explicit cast below
    // keeps the callback free of implicit `any` without widening the public
    // signature. Same pattern as `publishVersion`.
    return await prisma.$transaction(async (tx): Promise<ChangeQuestionTypeResult> => {
      const db = tx as unknown as TypeChangeTransactionClient;

      // 1. Serialise concurrent type changes on the same question. Without this,
      //    two requests could each read "draft only" and each proceed.
      await db.$queryRaw`SELECT id FROM questions WHERE id = ${input.questionId}::uuid FOR UPDATE`;

      // 2. Read through the SAME client that holds the lock (D2). `snapshot` is
      //    the full snapshot, so the gates see every version's real status rather
      //    than the synthetic placeholders `assertQuestionTypeChangeAllowed` has
      //    to build when a caller hands it a bare client.
      const snapshot = await loadQuestionSnapshot(db, input.questionId);

      const currentType = snapshot.type;
      if (input.nextType === currentType) {
        // Not a change. Still inside the transaction, so the return value
        // reflects the state the lock protects.
        return {
          questionId: input.questionId,
          previousType: currentType,
          type: currentType,
          questionStatus: snapshot.status,
        };
      }

      // 3. Both gates, before any write.
      assertTypeChangeAllowed(input.nextType, currentType, snapshot.versions);
      assertLegacyArchiveReviewRequired(input.nextType, currentType, snapshot.versions);

      // 4. Write. A type change touches `questions.type` only: versions, options,
      //    keys and marks are untouched, so the I-3 status rollup cannot change
      //    and is not re-derived here.
      await db.question.update({
        where: { id: input.questionId },
        data: { type: input.nextType },
      });

      return {
        questionId: input.questionId,
        previousType: currentType,
        type: input.nextType,
        questionStatus: snapshot.status,
      };
    });
  } catch (error) {
    if (error instanceof DomainError) throw error;
    // The database stays the last line of defence; its conflicts become ours.
    const mapped = mapUniqueViolation(error);
    if (mapped !== null) throw mapped;
    throw error;
  }
}
