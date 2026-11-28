/**
 * Input validation for the Phase 04G read routes, preserving the domain's
 * disclosure ordering.
 *
 * WHY THIS WRAPPER EXISTS
 * ----------------------
 * The existing staff application boundary resolves the verified actor BEFORE it
 * validates input, and Phase 04E pinned that as a security property: an
 * unauthenticated or deactivated caller receives `UNAUTHENTICATED` / `INACTIVE`
 * even when the input is also malformed, so a validation outcome can never be
 * used to probe the accepted parameter set without an account
 * (`tests/unit/questions/staff-boundary.test.ts:313-323` — "refuses
 * getStaffQuestion with UNAUTHENTICATED before inspecting questionId or
 * querying").
 *
 * A Route Handler that parsed first would silently reverse that ordering. But
 * the transport also needs validated values BEFORE calling the boundary (the
 * cursor must be bound to the validated filters), so the handler cannot simply
 * let the boundary validate.
 *
 * The answer is ordered disclosure rather than ordered parsing: run the input
 * work, and if it fails, resolve identity first through `requireActor()` — the
 * one existing identity boundary — before reporting the failure. Nothing is
 * duplicated: no permission check is performed here, no schema is restated, and
 * the extra actor resolution only happens on a request that is already failing
 * (a well-formed authorized request resolves identity exactly once, inside the
 * staff boundary).
 *
 * WHAT COUNTS AS "INPUT WORK"
 * ---------------------------
 * Every step that can tell a caller something about the accepted input shape,
 * which is more than Zod validation:
 *
 *   1. transport parsing — unsupported / repeated query parameters, a `limit`
 *      that is not a whole number (`./list-query.ts`, `TransportError` → 400);
 *   2. domain validation — UUIDs, enums, bounds (`parseStaffInput` → 422);
 *   3. cursor validation — malformed payload, unknown version, filter mismatch
 *      (`./cursor.ts` → 422).
 *
 * All three run through `parseStaffTransport`, so all three report 401 to an
 * anonymous caller and 403 to an inactive one, and only an authenticated,
 * active caller learns that their input was wrong (400 / 422).
 *
 * Pure of business rules: no Prisma, no query, no authorization decision.
 */

import type { z } from 'zod';

import { requireActor } from '@/server/auth/actor';
import { parseInput } from '@/server/questions/authoring/schemas';
import { DomainError } from '@/server/shared/errors';

import { TransportError } from './errors';

/**
 * True for the failures that must not be disclosed before identity is known:
 * transport-level malformed input and domain validation. Anything else (an
 * unknown coding fault) propagates untouched and becomes a sanitized 500.
 */
function isInputOutcome(error: unknown): boolean {
  return (
    error instanceof TransportError ||
    (error instanceof DomainError && error.code === 'VALIDATION_FAILED')
  );
}

/**
 * Runs one step of request-input handling and, if it fails with an input
 * outcome, establishes the caller's standing first.
 *
 * `requireActor()` throws `UNAUTHENTICATED` (no verified session) or `INACTIVE`
 * (deactivated profile) and therefore replaces the input failure with the
 * identity failure — exactly what the Phase 04E boundary does. For an active
 * authenticated caller it resolves without error and the original input failure
 * is rethrown unchanged, so the existing 400 / 422 contract is preserved.
 *
 * The returned value is whatever `work` returns, so a step can validate and
 * transform in one call (e.g. decode a cursor).
 */
export async function parseStaffTransport<T>(work: () => T): Promise<T> {
  try {
    return work();
  } catch (error) {
    if (isInputOutcome(error)) {
      // Throws UNAUTHENTICATED / INACTIVE when the caller has no standing to
      // learn anything about the accepted input.
      await requireActor();
    }
    throw error;
  }
}

/**
 * Parses `input` with the existing domain schema, or throws the same
 * `VALIDATION_FAILED` the domain services throw — after establishing that the
 * caller is an authenticated, active user.
 */
export function parseStaffInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
): Promise<z.output<S>> {
  return parseStaffTransport(() => parseInput(schema, input));
}
