import 'server-only';

/**
 * Staff Question Bank server-side application boundary (Phase 04E).
 *
 * Transport-neutral orchestration layer between future Staff/Admin interfaces
 * (Server Components, Server Actions, Route Handlers) and the existing Question
 * Bank staff read services in `server/questions/authoring/queries.ts`.
 *
 * Responsibilities at this boundary:
 *   1. Resolve the verified `Actor` from the server-side Supabase session via
 *      `requireActor()` — never from caller-supplied actor IDs, roles or claims.
 *   2. Delegate input validation (`listQuestionsInputSchema` / `buildListFilter`,
 *      `getQuestionInputSchema` / `parseInput`), `question.read_staff`
 *      authorization (`authorize`) and explicit DTO projection (`LIST_SELECT`,
 *      `DETAIL_SELECT`) to `listQuestionsForStaff` and `getQuestionForStaff`
 *      without duplicating schemas, permission rules or query logic.
 *   3. Sanitize unexpected failures so raw database errors, connection strings,
 *      stack traces or answer-key internals never cross the application boundary,
 *      while preserving `DomainError` semantics unchanged.
 *
 * OD-17 (public API paths, HTTP methods, status mappings and wire envelopes)
 * remains open; this module defines no routes, HTTP contracts or UI.
 */

import { requireActor } from '@/server/auth/actor';
import {
  getQuestionForStaff,
  listQuestionsForStaff,
  type StaffQuestionDetail,
  type StaffQuestionListItem,
  type StaffQuestionPage,
} from '@/server/questions/authoring/queries';
import type { GetQuestionInput, ListQuestionsInput } from '@/server/questions/authoring/schemas';
import { DomainError } from '@/server/shared/errors';
import { describeError, logger, newRequestId } from '@/server/shared/logger';

export type {
  GetQuestionInput,
  ListQuestionsInput,
  StaffQuestionDetail,
  StaffQuestionListItem,
  StaffQuestionPage,
};

const SAFE_UNEXPECTED_MESSAGE = 'The request could not be completed. Please try again.';

class StaffBoundaryInternalError extends Error {
  /** Correlates this sanitized error with the server log entry for the original. */
  readonly requestId: string;

  constructor(requestId: string) {
    super(SAFE_UNEXPECTED_MESSAGE);
    this.name = 'StaffBoundaryInternalError';
    this.stack = `${this.name}: ${this.message}`;
    this.requestId = requestId;
  }
}

/**
 * Preserves intentional `DomainError` failures and collapses any unexpected
 * infrastructure/runtime exception into a non-chain-linked error with a fixed,
 * secret-free message and sanitized stack (no `cause`, driver text, SQL,
 * connection URL or key data).
 */
async function withBoundarySafety<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    // Log the original (redacted, never the input) before it is replaced, so
    // the failure stays diagnosable; the request id links the two.
    const requestId = newRequestId();
    logger.error('staff_boundary.unexpected_error', { requestId, ...describeError(error) });
    throw new StaffBoundaryInternalError(requestId);
  }
}

/**
 * Lists Question Bank items for an authenticated, `question.read_staff`-authorized
 * staff member using the existing validated filters and keyset pagination.
 *
 * Resolves the actor and enforces `question.read_staff` BEFORE validating or
 * executing input, and rejects extra arguments if an untyped caller attempts to
 * pass an `Actor` slot.
 */
export async function listStaffQuestions(
  ...args: [input?: ListQuestionsInput]
): Promise<StaffQuestionPage> {
  return withBoundarySafety(async () => {
    const actor = await requireActor();
    if (args.length > 1) {
      return listQuestionsForStaff(actor, { __unexpectedArguments: true } as never);
    }
    return listQuestionsForStaff(actor, args[0] ?? {});
  });
}

/**
 * Retrieves one Question Bank item (including versions, options and answer key /
 * rubric) for an authenticated, `question.read_staff`-authorized staff member.
 *
 * Resolves the actor and enforces `question.read_staff` BEFORE validating or
 * executing input, and rejects missing or extra arguments if an untyped caller
 * bypasses TypeScript.
 */
export async function getStaffQuestion(
  ...args: [input: GetQuestionInput]
): Promise<StaffQuestionDetail> {
  return withBoundarySafety(async () => {
    const actor = await requireActor();
    if (args.length !== 1) {
      return getQuestionForStaff(
        actor,
        (args.length === 0 ? undefined : { __unexpectedArguments: true }) as never,
      );
    }
    return getQuestionForStaff(actor, args[0]);
  });
}
