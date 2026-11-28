/**
 * Strict query-string parsing for `GET /api/v1/staff/questions`.
 *
 * The Route Handler cannot hand `request.url` to Zod and call it validation.
 * Three things have to be true before the domain schema is consulted, and none
 * of them are the domain's business:
 *
 *   1. the URL must parse at all;
 *   2. every parameter must be one the approved list schema defines — an
 *      unknown parameter is refused, not ignored, so a typo (`subjetId=…`) can
 *      never silently return a wider result set than the caller believes;
 *   3. no parameter may be repeated. `?limit=20&limit=50` has no defensible
 *      single meaning, and OD-17 §15 requires strict transport validation, so
 *      ambiguity is a 400 instead of a pick-first-wins.
 *
 * Everything else — UUIDs, enums, bounds, `q` length, page size, cursor shape
 * — is delegated to `listQuestionsInputSchema` in
 * `server/questions/authoring/schemas.ts`. This module does not restate a single
 * domain rule; it only turns HTTP into the plain object that schema expects.
 *
 * Pure: no Prisma, no `server-only`, no I/O.
 */

import type { ListQuestionsInput } from '@/server/questions/authoring/schemas';

import { TransportError } from './errors';

/**
 * Makes a caller-supplied parameter NAME safe to echo in an error message.
 *
 * The name is the only request-supplied text this transport repeats back. It is
 * bounded and stripped of control characters so a crafted query string cannot
 * turn a 400 body into a log-injection or terminal-escape payload.
 */
function safeParameterName(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/gu, '');
  return cleaned.length > 64 ? `${cleaned.slice(0, 64)}…` : cleaned;
}

/**
 * The parameter surface, derived from the approved list contract (OD-17 §8,
 * `listQuestionsInputSchema`).
 *
 * Board and college are separate entries because they are independent
 * provenance dimensions (README §7.1.1): selecting one neither sets nor clears
 * the other, and each is matched through its own `EXISTS` predicate in
 * `server/questions/authoring/list-filters.ts`.
 */
const INTEGER_PARAMETERS = new Set(['limit']);

const STRING_PARAMETERS = new Set([
  'educationLevelId',
  'subjectId',
  'chapterId',
  'topicId',
  'type',
  'status',
  'difficulty',
  'boardId',
  'collegeId',
  'academicYearId',
  'tagId',
  'q',
  'cursor',
]);

/** Every parameter this endpoint understands. `limit` is parsed as an integer. */
export const SUPPORTED_QUERY_PARAMETERS: readonly string[] = [
  ...STRING_PARAMETERS,
  ...INTEGER_PARAMETERS,
];

/**
 * Converts the query string into the unvalidated shape the domain schema takes.
 *
 * Throws `TransportError` (→ 400 `INVALID_REQUEST`) for a malformed URL, an
 * unsupported parameter or a repeated parameter. Values themselves are passed
 * through untouched: a wrong UUID or an unknown enum member must produce the
 * domain's `VALIDATION_FAILED` (422), not a transport error, because that is the
 * existing, already-tested contract and the field name in the message is what
 * makes the failure actionable.
 */
export function parseStaffQuestionListQuery(rawQuery: string): ListQuestionsInput {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(rawQuery);
  } catch {
    throw new TransportError('The query string could not be read.');
  }

  const entries: [string, string][] = [];
  const seen = new Set<string>();
  for (const [name, value] of params) {
    if (!SUPPORTED_QUERY_PARAMETERS.includes(name)) {
      // The NAME came from the caller, but it is not a value: echoing it lets a
      // client see which parameter was rejected without reflecting any data.
      throw new TransportError(`Unsupported query parameter: ${safeParameterName(name)}.`);
    }
    if (seen.has(name)) {
      throw new TransportError(
        `The query parameter "${safeParameterName(name)}" was supplied more than once.`,
      );
    }
    seen.add(name);
    entries.push([name, value]);
  }

  const input: Record<string, string | number> = {};
  for (const [name, value] of entries) {
    if (INTEGER_PARAMETERS.has(name)) {
      // `Number('')` is 0 and `Number('20abc')` is NaN; both must fail. Only a
      // string of decimal digits becomes a number, so `limit=2.0` and
      // `limit=1e1` are rejected instead of quietly coerced.
      if (!/^\d+$/.test(value)) {
        throw new TransportError(
          `The query parameter "${safeParameterName(name)}" must be a whole number.`,
        );
      }
      input[name] = Number(value);
      continue;
    }
    input[name] = value;
  }

  return input as ListQuestionsInput;
}

/**
 * The validated filters a cursor is bound to: every filter EXCEPT the page size
 * (a page size does not change which rows the result set contains) and the
 * cursor itself (a cursor cannot fingerprint itself — including it would make
 * every continuation page's own cursor the "different" context).
 */
const NON_FILTER_PARAMETERS = new Set(['cursor']);

export function listFilterContext(validated: Record<string, unknown>) {
  const context: Record<string, string | undefined> = {};
  for (const name of STRING_PARAMETERS) {
    if (NON_FILTER_PARAMETERS.has(name)) continue;
    const value = validated[name];
    if (typeof value === 'string') context[name] = value;
  }
  return context;
}
