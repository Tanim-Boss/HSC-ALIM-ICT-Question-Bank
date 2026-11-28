/**
 * Input validation for the Phase 04G read routes, preserving the domain's
 * disclosure ordering.
 *
 * WHY THIS WRAPPER EXISTS
 * ----------------------
 * The existing staff application boundary resolves the verified actor BEFORE it
 * validates input, and Phase 04E pinned that as a security property: an
 * unauthenticated or deactivated caller receives `UNAUTHENTICATED` / `INACTIVE`
 * even when the input is also malformed, so a 422 can never be used to probe
 * the accepted parameter set without an account
 * (`tests/unit/questions/staff-boundary.test.ts`,
 * `tests/unit/questions/integration/.../staff-boundary.test.ts`).
 *
 * A Route Handler that parsed first would silently reverse that ordering. But
 * the transport also needs validated values BEFORE calling the boundary (the
 * cursor must be bound to the validated filters), so the handler cannot simply
 * let the boundary validate.
 *
 * The answer is ordered validation: parse through the SAME schema and the SAME
 * `parseInput` (`server/questions/authoring/schemas.ts`), and if it fails,
 * resolve identity first through `requireActor()` — the one existing identity
 * boundary — before reporting the validation failure. Nothing is duplicated:
 * the schema is reused, no permission check is performed here, and the extra
 * actor resolution only happens on a request that is already failing.
 *
 * Pure of business rules: no Prisma, no query, no authorization decision.
 */

import type { z } from 'zod';

import { requireActor } from '@/server/auth/actor';
import { parseInput } from '@/server/questions/authoring/schemas';
import { DomainError } from '@/server/shared/errors';

/**
 * Parses `input` with the existing domain schema, or throws the same
 * `VALIDATION_FAILED` the domain services throw — after establishing that the
 * caller is an authenticated, active user.
 */
export async function parseStaffInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
): Promise<z.output<S>> {
  try {
    return parseInput(schema, input);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'VALIDATION_FAILED') {
      // Throws UNAUTHENTICATED / INACTIVE when the caller has no standing to
      // learn anything about the accepted input.
      await requireActor();
    }
    throw error;
  }
}
