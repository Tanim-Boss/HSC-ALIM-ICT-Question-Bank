/**
 * HTTP error mapping, response headers and the error envelope for the Phase
 * 04G staff question read API (`GET /api/v1/staff/questions`,
 * `GET /api/v1/staff/questions/[id]`).
 *
 * OD-17 (`docs/api/od-17-api-wire-contract-decision-brief.md`) §9 fixes one
 * stable JSON error envelope and a status mapping for the existing domain
 * vocabulary. This module is the ONE place that translation happens, so both
 * Route Handlers cannot drift apart.
 *
 * What this module deliberately does NOT do
 * -----------------------------------------
 *   · It does not invent domain errors. `DomainError` codes are the domain's
 *     vocabulary (`server/shared/errors.ts`); the only codes added here are
 *     `INVALID_REQUEST` and `INTERNAL_ERROR`, which OD-17 classifies as
 *     TRANSPORT codes with no `DomainError` counterpart.
 *   · It does not change any domain semantic. An error keeps its code and its
 *     user-safe message; only the HTTP status is attached.
 *   · It does not map domain codes that these two GET routes cannot produce.
 *     OD-17 §9 explicitly warns that "other named `*_CONFLICT` and invariant
 *     codes require an explicit status table; do not assume every domain code
 *     has this mapping". An unmapped code is therefore treated as an unexpected
 *     failure — logged and answered with a generic 500 — rather than guessed
 *     into a status a caller might act on.
 *
 * Leak rules (OD-17 §9, §11): the response body never carries SQL, driver text,
 * constraint names, stack traces, internal paths, secrets or authorization
 * detail. Domain messages are user-safe by construction (`DomainErrorInit`),
 * and everything else is replaced by a fixed sentence.
 */

import { DomainError, type DomainErrorCode } from '@/server/shared/errors';
import { describeError, logger, newRequestId } from '@/server/shared/logger';

export { newRequestId };

/** Stack traces, SQL and connection text never reach a client. */
const MAX_ERROR_MESSAGE_LENGTH = 500;

/** What a caller sees when nothing safe can be said. */
const INTERNAL_ERROR_MESSAGE = 'The request could not be completed.';

/**
 * The status table OD-17 §9 approves, restricted to the codes these read
 * boundaries can actually raise:
 *
 * | Domain code          | Status | Why it is reachable here                       |
 * |----------------------|-------:|------------------------------------------------|
 * | `UNAUTHENTICATED`    |    401 | `requireActor()` — no verified Supabase session |
 * | `INACTIVE`           |    403 | `requireActor()` — deactivated profile          |
 * | `FORBIDDEN`          |    403 | `authorize(…, 'question.read_staff')`           |
 * | `NOT_FOUND`          |    404 | `getQuestionForStaff` — absent question         |
 * | `VALIDATION_FAILED`  |    422 | Zod input validation (filters, id, cursor)      |
 * | `CONFLICT`           |    409 | approved mapping; stale-write code is a write concern, so an unexpected read-path `CONFLICT` keeps its meaning |
 *
 * `RATE_LIMITED` (429) is absent on purpose: no limiter is implemented and no
 * thresholds or provider are approved (OD-17 §13), so this build cannot emit
 * it. Publishing a 429 without a real limiter would be a claim, not a control.
 */
const STATUS_BY_DOMAIN_CODE: Partial<Record<DomainErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  INACTIVE: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_FAILED: 422,
};

/**
 * A malformed HTTP request: an unparseable URL, an unsupported query parameter,
 * or an ambiguous repeated parameter. OD-17 §9 classifies this as a transport
 * concern (`INVALID_REQUEST`, 400) with no `DomainError` counterpart, which is
 * why it is a distinct class rather than a fabricated domain code.
 *
 * `message` is a fixed, safe sentence — never a value echoed back from the
 * request beyond the parameter NAME the caller already sent.
 */
export class TransportError extends Error {
  readonly code = 'INVALID_REQUEST' as const;
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'TransportError';
  }
}

/** The OD-17 §9 error envelope. Exactly these three keys. */
export interface ApiErrorEnvelope {
  readonly error: {
    readonly code: DomainErrorCode | 'INVALID_REQUEST' | 'INTERNAL_ERROR';
    readonly message: string;
    readonly requestId: string;
  };
}

/** Every response — success or failure — forbids shared/public caching. */
export const NO_STORE_CACHE_CONTROL = 'private, no-store';

/** Header carrying the per-request correlation id. */
export const REQUEST_ID_HEADER = 'X-Request-Id';

/** The headers every response from these routes carries. */
export function responseHeaders(requestId: string): Headers {
  return new Headers({
    'Cache-Control': NO_STORE_CACHE_CONTROL,
    [REQUEST_ID_HEADER]: requestId,
  });
}

/** A JSON success response with the mandatory private/no-store headers. */
export function jsonResponse(body: unknown, status: number, requestId: string): Response {
  return Response.json(body, { status, headers: responseHeaders(requestId) });
}

function truncate(message: string): string {
  return message.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…`
    : message;
}

function envelope(
  code: ApiErrorEnvelope['error']['code'],
  message: string,
  requestId: string,
): ApiErrorEnvelope {
  return { error: { code, message: truncate(message), requestId } };
}

/**
 * Correlates a sanitized `StaffBoundaryInternalError` with the boundary log
 * entry that carries the original failure. Read structurally: the class lives
 * in the boundary module and must not be imported here just to read a field.
 */
function boundaryRequestIdOf(error: unknown): string | undefined {
  const value = (error as { requestId?: unknown } | null)?.requestId;
  return typeof value === 'string' ? value : undefined;
}

/**
 * Translates anything thrown by a read path into the OD-17 error envelope.
 *
 * `route` is a fixed literal supplied by the handler (e.g.
 * `'GET /api/v1/staff/questions'`) — never caller input — so log lines stay
 * safe and greppable.
 */
export function errorResponse(error: unknown, requestId: string, route: string): Response {
  if (error instanceof TransportError) {
    return jsonResponse(envelope(error.code, error.message, requestId), error.status, requestId);
  }

  if (error instanceof DomainError) {
    const status = STATUS_BY_DOMAIN_CODE[error.code];
    if (status !== undefined) {
      // The domain message is user-safe by contract (no SQL, no index names,
      // no driver text) — see `DomainErrorInit` in server/shared/errors.ts.
      return jsonResponse(envelope(error.code, error.message, requestId), status, requestId);
    }
    // A domain code with no approved HTTP status. OD-17 §9: do not guess.
    logger.error('staff_read_api.unmapped_domain_error', {
      requestId,
      route,
      domainCode: error.code,
    });
    return jsonResponse(
      envelope('INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE, requestId),
      500,
      requestId,
    );
  }

  // Everything else — including the boundary's sanitized internal error — is
  // unexpected here. Log the redacted original first (server/shared/logger.ts),
  // then return a body that reveals nothing.
  logger.error('staff_read_api.unexpected_error', {
    requestId,
    route,
    boundaryRequestId: boundaryRequestIdOf(error),
    ...describeError(error),
  });
  return jsonResponse(
    envelope('INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE, requestId),
    500,
    requestId,
  );
}
