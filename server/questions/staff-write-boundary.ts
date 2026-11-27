import 'server-only';

/**
 * Staff Question Authoring write application boundary (Phase 04F).
 *
 * Transport-neutral orchestration layer between future Staff/Admin interfaces
 * (Server Components, Server Actions, Route Handlers) and the existing
 * question-authoring write services:
 *
 *   · createQuestion         (server/questions/authoring/commands.ts)
 *   · saveDraft              (server/questions/authoring/commands.ts)
 *   · createRevision         (server/questions/authoring/commands.ts)
 *   · verifyAnswerKey        (server/questions/authoring/commands.ts)
 *   · archiveVersion         (server/questions/authoring/commands.ts)
 *   · archiveQuestion        (server/questions/authoring/commands.ts)
 *   · changeQuestionType     (server/questions/change-type.ts)
 *   · publishVersion         (server/questions/publish/gate.ts)
 *
 * Responsibilities at this boundary:
 *   1. Resolve the verified `Actor` from the server-side Supabase session via
 *      `requireActor()` — never from caller-supplied actor IDs, roles,
 *      permissions or claims.
 *   2. Delegate every domain concern (authorization, Zod validation, row
 *      locking, optimistic concurrency, separation-of-duties, transactional
 *      writes, audit events, error mapping) to the existing service without
 *      duplicating any of that logic.
 *   3. Sanitize unexpected failures so raw database errors, connection strings,
 *      stack traces or answer-key internals never cross the application
 *      boundary, while preserving `DomainError` semantics unchanged.
 *
 * The domain services remain the authority for validation, authorization,
 * concurrency, transaction and audit behaviour. This boundary only resolves
 * identity and adds error safety.
 *
 * OD-17 (public API paths, HTTP methods, status mappings and wire envelopes)
 * remains open; this module defines no routes, HTTP contracts or UI.
 */

import { requireActor } from '@/server/auth/actor';
import {
  archiveQuestion,
  archiveVersion,
  createQuestion,
  createRevision,
  saveDraft,
  verifyAnswerKey,
  type ArchiveResult,
  type CreateQuestionResult,
  type CreateRevisionResult,
  type SaveDraftResult,
  type VerifyAnswerKeyResult,
} from '@/server/questions/authoring/commands';
import {
  changeQuestionType,
  type ChangeQuestionTypeInput,
  type ChangeQuestionTypeResult,
} from '@/server/questions/change-type';
import {
  publishVersion,
  type PublishResult,
  type PublishVersionInput,
} from '@/server/questions/publish/gate';
import type {
  ArchiveQuestionInput,
  ArchiveVersionInput,
  CreateQuestionInput,
  CreateRevisionInput,
  SaveDraftInput,
  VerifyAnswerKeyInput,
} from '@/server/questions/authoring/schemas';
import { DomainError } from '@/server/shared/errors';

/* ── Re-exports ──────────────────────────────────────────────────────────── */

export type {
  ArchiveQuestionInput,
  ArchiveResult,
  ArchiveVersionInput,
  ChangeQuestionTypeInput,
  ChangeQuestionTypeResult,
  CreateQuestionInput,
  CreateQuestionResult,
  CreateRevisionInput,
  CreateRevisionResult,
  PublishResult,
  PublishVersionInput,
  SaveDraftInput,
  SaveDraftResult,
  VerifyAnswerKeyInput,
  VerifyAnswerKeyResult,
};

/* ── Boundary safety ─────────────────────────────────────────────────────── */

const SAFE_UNEXPECTED_MESSAGE = 'The request could not be completed. Please try again.';

class StaffBoundaryInternalError extends Error {
  constructor() {
    super(SAFE_UNEXPECTED_MESSAGE);
    this.name = 'StaffBoundaryInternalError';
    this.stack = `${this.name}: ${this.message}`;
  }
}

/**
 * Preserves intentional `DomainError` failures (including `PublishRejectedError`,
 * which extends `DomainError`) and collapses any unexpected infrastructure or
 * runtime exception into a non-chain-linked error with a fixed, secret-free
 * message and sanitized stack (no `cause`, driver text, SQL, connection URL or
 * key data).
 */
async function withBoundarySafety<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw new StaffBoundaryInternalError();
  }
}

/* ── 1. createQuestion — question.create ─────────────────────────────────── */

/**
 * Creates a new question with an initial DRAFT version. Resolves the actor from
 * the verified Supabase session and delegates authorization
 * (`question.create`), Zod validation, content-block profile checks, row
 * creation, option/answer-key writes, audit and database error mapping to
 * `createQuestion` in `server/questions/authoring/commands.ts`.
 */
export async function staffCreateQuestion(
  ...args: [input: CreateQuestionInput]
): Promise<CreateQuestionResult> {
  return withBoundarySafety(async () => {
    const actor = await requireActor();
    if (args.length !== 1) {
      return createQuestion(
        actor,
        (args.length === 0 ? undefined : { __unexpectedArguments: true }) as never,
      );
    }
    return createQuestion(actor, args[0]);
  });
}

/* ── 2. saveDraft — question.edit_draft ──────────────────────────────────── */

/**
 * Saves an updated draft for an existing DRAFT version. Delegates authorization
 * (`question.edit_draft`), optimistic concurrency (`expectedUpdatedAt`), Zod
 * validation, content-block profile checks, minimal-diff option/answer-key
 * writes, verification reset rules, audit and database error mapping to
 * `saveDraft` in `server/questions/authoring/commands.ts`.
 */
export async function staffSaveDraft(...args: [input: SaveDraftInput]): Promise<SaveDraftResult> {
  return withBoundarySafety(async () => {
    const actor = await requireActor();
    if (args.length !== 1) {
      return saveDraft(
        actor,
        (args.length === 0 ? undefined : { __unexpectedArguments: true }) as never,
      );
    }
    return saveDraft(actor, args[0]);
  });
}

/* ── 3. createRevision — question.edit_draft ─────────────────────────────── */

/**
 * Creates a new DRAFT version by copying the published version's content,
 * options, answer key and asset links. Delegates authorization
 * (`question.edit_draft`), I-3 status preservation, audit and database error
 * mapping to `createRevision` in `server/questions/authoring/commands.ts`.
 */
export async function staffCreateRevision(
  ...args: [input: CreateRevisionInput]
): Promise<CreateRevisionResult> {
  return withBoundarySafety(async () => {
    const actor = await requireActor();
    if (args.length !== 1) {
      return createRevision(
        actor,
        (args.length === 0 ? undefined : { __unexpectedArguments: true }) as never,
      );
    }
    return createRevision(actor, args[0]);
  });
}

/* ── 4. verifyAnswerKey — answer_key.verify ──────────────────────────────── */

/**
 * Marks a DRAFT version's answer key as verified. Delegates authorization
 * (`answer_key.verify`), separation-of-duties (the version's last editor cannot
 * verify their own work unless SUPER_ADMIN, read under the transaction lock),
 * Zod validation, version mutability checks, audit and database error mapping
 * to `verifyAnswerKey` in `server/questions/authoring/commands.ts`.
 */
export async function staffVerifyAnswerKey(
  ...args: [input: VerifyAnswerKeyInput]
): Promise<VerifyAnswerKeyResult> {
  return withBoundarySafety(async () => {
    const actor = await requireActor();
    if (args.length !== 1) {
      return verifyAnswerKey(
        actor,
        (args.length === 0 ? undefined : { __unexpectedArguments: true }) as never,
      );
    }
    return verifyAnswerKey(actor, args[0]);
  });
}

/* ── 5. archiveVersion — question.archive ────────────────────────────────── */

/**
 * Archives one DRAFT or PUBLISHED version and re-derives the question's status.
 * Delegates authorization (`question.archive`), I-3 rollup, Zod validation,
 * audit and database error mapping to `archiveVersion` in
 * `server/questions/authoring/commands.ts`.
 */
export async function staffArchiveVersion(
  ...args: [input: ArchiveVersionInput]
): Promise<ArchiveResult> {
  return withBoundarySafety(async () => {
    const actor = await requireActor();
    if (args.length !== 1) {
      return archiveVersion(
        actor,
        (args.length === 0 ? undefined : { __unexpectedArguments: true }) as never,
      );
    }
    return archiveVersion(actor, args[0]);
  });
}

/* ── 6. archiveQuestion — question.archive ───────────────────────────────── */

/**
 * Archives every non-archived version; the question becomes ARCHIVED. Delegates
 * authorization (`question.archive`), I-3 rollup, Zod validation, audit and
 * database error mapping to `archiveQuestion` in
 * `server/questions/authoring/commands.ts`.
 */
export async function staffArchiveQuestion(
  ...args: [input: ArchiveQuestionInput]
): Promise<ArchiveResult> {
  return withBoundarySafety(async () => {
    const actor = await requireActor();
    if (args.length !== 1) {
      return archiveQuestion(
        actor,
        (args.length === 0 ? undefined : { __unexpectedArguments: true }) as never,
      );
    }
    return archiveQuestion(actor, args[0]);
  });
}

/* ── 7. changeQuestionType — question.change_type ────────────────────────── */

/**
 * Changes a question's type. Delegates authorization (`question.change_type`),
 * I-6 and AMB-5 gates (read under the transaction lock), audit and database
 * error mapping to `changeQuestionType` in `server/questions/change-type.ts`.
 */
export async function staffChangeQuestionType(
  ...args: [input: ChangeQuestionTypeInput]
): Promise<ChangeQuestionTypeResult> {
  return withBoundarySafety(async () => {
    const actor = await requireActor();
    if (args.length !== 1) {
      return changeQuestionType(
        actor,
        (args.length === 0 ? undefined : { __unexpectedArguments: true }) as never,
      );
    }
    return changeQuestionType(actor, args[0]);
  });
}

/* ── 8. publishVersion — question.publish ────────────────────────────────── */

/**
 * Publishes a DRAFT version. Delegates authorization (`question.publish`),
 * separation-of-duties (the version's last editor cannot publish their own work
 * unless SUPER_ADMIN, read under the transaction lock), publish gate evaluation,
 * I-3 rollup, I-5 immutability, audit and database error mapping to
 * `publishVersion` in `server/questions/publish/gate.ts`.
 *
 * `PublishRejectedError` (which extends `DomainError`) is preserved unchanged
 * by `withBoundarySafety`.
 */
export async function staffPublishVersion(
  ...args: [input: PublishVersionInput]
): Promise<PublishResult> {
  return withBoundarySafety(async () => {
    const actor = await requireActor();
    if (args.length !== 1) {
      return publishVersion(
        actor,
        (args.length === 0 ? undefined : { __unexpectedArguments: true }) as never,
      );
    }
    return publishVersion(actor, args[0]);
  });
}
