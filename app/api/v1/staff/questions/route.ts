import 'server-only';

/**
 * `GET /api/v1/staff/questions` — Phase 04G staff question list.
 *
 * This is a THIN HTTP ADAPTER and nothing else (OD-17 §3, §15). The entire
 * request path below is: parse HTTP → resolve the verified actor and authorize
 * through the existing staff boundary → project an explicit DTO → set headers.
 *
 * What it deliberately does not do
 * --------------------------------
 *   · No Prisma access, no query building, no filter semantics, no ordering and
 *     no pagination arithmetic. `listStaffQuestions`
 *     (`server/questions/staff-boundary.ts`) → `listQuestionsForStaff`
 *     (`server/questions/authoring/queries.ts`) already own all of that,
 *     including the key-free projection and the `(createdAt DESC, id DESC)`
 *     keyset.
 *   · No new authorization model and no second application boundary. Identity
 *     comes from `requireActor()` inside `listStaffQuestions`; a caller cannot
 *     supply an actor id, a role or a permission — the only input that crosses
 *     this file is the query string, and it contains no such field.
 *   · No offset pagination and no page numbers: the cursor is the only
 *     continuation mechanism (OD-17 §8).
 *
 * Authorization runs BEFORE input is validated, because the boundary resolves
 * the actor first. That ordering is the existing domain behaviour (a student
 * receives 403, not a 422 that reveals the accepted parameter set); this file
 * preserves it rather than re-implementing it.
 *
 * Caching: every response — success or failure — carries
 * `Cache-Control: private, no-store` and an `X-Request-Id`, set explicitly
 * rather than inherited from framework defaults (OD-17 §10).
 */

import { listStaffQuestions } from '@/server/questions/staff-boundary';
import { listQuestionsInputSchema } from '@/server/questions/authoring/schemas';

import {
  decodeStaffListCursor,
  encodeStaffListCursor,
  type StaffListCursorRejection,
} from '@/server/questions/read-api/cursor';
import { toStaffQuestionListDto } from '@/server/questions/read-api/dto';
import { errorResponse, jsonResponse, newRequestId } from '@/server/questions/read-api/errors';
import { parseStaffInput } from '@/server/questions/read-api/input';
import {
  listFilterContext,
  parseStaffQuestionListQuery,
} from '@/server/questions/read-api/list-query';
import { DomainError } from '@/server/shared/errors';
import { decodeCursor, InvalidCursorError } from '@/server/questions/authoring/cursor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ROUTE = 'GET /api/v1/staff/questions';

/**
 * One sentence per rejection reason, so the caller learns what to do without
 * learning anything about the server. A cursor is never an authorization
 * credential (OD-17 §8); these messages say exactly that by never implying one.
 */
const CURSOR_REJECTION_MESSAGES: Record<StaffListCursorRejection, string> = {
  malformed: 'cursor: not a cursor returned by this list',
  unsupported_version: 'cursor: this cursor version is not supported by this endpoint',
  filter_mismatch: 'cursor: this cursor belongs to a different filter selection',
  invalid_position: 'cursor: not a cursor returned by this list',
};

function cursorError(reason: StaffListCursorRejection): DomainError {
  return new DomainError({
    code: 'VALIDATION_FAILED',
    message: CURSOR_REJECTION_MESSAGES[reason],
    field: 'cursor',
  });
}

/**
 * Convert the domain cursor minted by the query into the wire cursor, using the
 * validated filter context. Kept local (not in the mapper) so the binding
 * between "which filters produced this page" and "which cursor is issued" is
 * visible in one place.
 */
function toWireCursor(
  domainCursor: string | null,
  filters: Record<string, string | undefined>,
): string | null {
  if (domainCursor === null) return null;
  try {
    return encodeStaffListCursor(decodeCursor(domainCursor), filters);
  } catch (error) {
    // A domain cursor we cannot read means the query and the transport
    // disagree; answering 500 is honest, silently dropping pagination is not.
    if (error instanceof InvalidCursorError) {
      throw new Error('the domain returned a cursor this transport cannot read');
    }
    throw error;
  }
}

export async function GET(request: Request): Promise<Response> {
  // Trustworthy per-request id: generated here, never taken from a header or
  // query parameter a caller controls (OD-17 §9).
  const requestId = newRequestId();

  try {
    const input = parseStaffQuestionListQuery(new URL(request.url).searchParams.toString());

    // Domain validation: the SAME schema and the SAME error contract as the
    // authoring services (UUIDs, enums, bounds, `q` length, `limit` 1…50,
    // cursor shape). Nothing is restated here. A failure is reported only after
    // identity is established, so a 422 cannot be used to probe the accepted
    // parameter set without an account — the ordering the boundary already has.
    const validated = await parseStaffInput(listQuestionsInputSchema, input);
    const filters = listFilterContext(validated as Record<string, unknown>);

    // Transport cursor → domain cursor, bound to these filters.
    let cursor: string | undefined;
    if (validated.cursor !== undefined) {
      const decoded = decodeStaffListCursor(validated.cursor, filters);
      if (!decoded.ok) throw cursorError(decoded.reason);
      cursor = decoded.cursor;
    }

    const page = await listStaffQuestions({
      ...validated,
      ...(cursor === undefined ? {} : { cursor }),
    });

    return jsonResponse(
      toStaffQuestionListDto(page, toWireCursor(page.nextCursor, filters)),
      200,
      requestId,
    );
  } catch (error) {
    return errorResponse(error, requestId, ROUTE);
  }
}
