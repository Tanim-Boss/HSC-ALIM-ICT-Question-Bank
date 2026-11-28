/**
 * Transport-level pagination cursor for the Phase 04G staff question list.
 *
 * WHY A SECOND CURSOR EXISTS
 * --------------------------
 * The domain cursor (`server/questions/authoring/cursor.ts`) is a POSITION in
 * the `(createdAt DESC, id DESC)` keyset: base64url of `<ISO timestamp>|<uuid>`.
 * It is correct and it is what PostgreSQL is asked to continue from — but it
 * is, by design, just a position. It carries no version and no record of which
 * filters produced it, so a client could legally continue a `subjectId=A` page
 * with a cursor minted under `subjectId=B` and silently receive
 * "after that row in a different result set".
 *
 * OD-17 §8 therefore says: do NOT expose that cursor as the wire cursor. Add an
 * explicit version and bind it to the canonical validated filter context, so an
 * incompatible reuse is rejected instead of answered.
 *
 * THE WIRE FORMAT
 * ---------------
 *
 *     qsc1.<payload>
 *
 *   · `qsc1`    — version tag. `1` is the only accepted version; anything else
 *                 is refused as an unsupported version (not silently migrated).
 *   · `.`       — separator, so the version is readable without decoding.
 *   · `<payload>` — base64url of a compact JSON object:
 *
 *                    { "v": 1, "f": "<filter fingerprint>", "p": "<domain cursor>" }
 *
 *                 `p` is the UNCHANGED domain cursor, so keyset semantics (and
 *                 page cost) are exactly what Phase 04C/04D implemented. `f`
 *                 is a SHA-256 fingerprint of the canonical filter
 *                 representation, not the filters themselves: the cursor does
 *                 not echo a caller's search text back at them, and it cannot
 *                 grow with the number of filters.
 *
 * WHY NO HMAC / SIGNATURE
 * -----------------------
 * OD-17 §8 explicitly did not approve signature-based signing: a cursor is not
 * an authorization credential and is re-authorized on every request through the
 * staff boundary. Anyone can decode, edit and re-encode these bytes — and gains
 * nothing but their own page position, because the filter binding is re-checked
 * against the filters THEY sent, and the answer key is never in a list DTO.
 * A tampered cursor therefore fails closed with `VALIDATION_FAILED`.
 *
 * WHY A FINGERPRINT RATHER THAN THE FILTERS THEMSELVES
 * ----------------------------------------------------
 *   · The filters contain a free-text query (`q`, up to 120 characters); a
 *     fingerprint keeps the cursor bounded and stops it from being a channel
 *     that reflects caller input back.
 *   · The domain cursor accepts at most 200 characters
 *     (`listQuestionsInputSchema`), which the wrapped payload must respect.
 *
 * CANONICALISATION
 * ----------------
 * The fingerprint is computed over a deterministic, key-sorted JSON rendering of
 * the VALIDATED filter values (never the raw query string), so a client may send
 * its parameters in any order, with or without defaults, and still paginate.
 * `limit` and `cursor` are excluded: page size is not part of the result-set
 * identity, and the cursor obviously cannot fingerprint itself.
 *
 * Pure: no Prisma, no `server-only`, no I/O.
 */

import { createHash } from 'node:crypto';

import {
  decodeCursor,
  encodeCursor,
  type CursorPosition,
} from '@/server/questions/authoring/cursor';

/** The only cursor format this build accepts. */
export const STAFF_LIST_CURSOR_VERSION = 1;

const VERSION_TAG = `qsc${String(STAFF_LIST_CURSOR_VERSION)}`;
const SEPARATOR = '.';

/** `<version>.` + base64url(JSON) must fit the domain schema's 200-char bound. */
const WIRE_CURSOR_MAX = 200;

/** Why a wire cursor was refused. Every reason maps to `VALIDATION_FAILED`. */
export type StaffListCursorRejection =
  | 'malformed' // not `qsc<version>.<payload>`, or the payload is not our JSON
  | 'unsupported_version' // a well-formed tag this build does not accept
  | 'filter_mismatch' // valid cursor minted for a different result set
  | 'invalid_position'; // the wrapped domain cursor does not decode

/**
 * The validated list filters, normalized for comparison.
 *
 * These are `z.output<typeof listQuestionsInputSchema>` values — i.e. AFTER
 * defaults and trimming — minus `limit` and `cursor`. Enum members are the
 * generated Prisma literals and UUIDs are lower-cased by the schema, so two
 * spellings of the same filter cannot produce different fingerprints.
 */
export type StaffListFilterContext = Readonly<Record<string, string | undefined>>;

/**
 * The identity of a result set. Undefined values are dropped, keys are sorted,
 * and the search text is compared after the same NFC + lowercase normalisation
 * the query itself uses (`server/questions/authoring/list-filters.ts`), so
 * "Kibo" and "kibo" are one result set, not two.
 */
export function canonicaliseFilterContext(filters: StaffListFilterContext): Record<string, string> {
  const canonical: Record<string, string> = {};
  for (const key of Object.keys(filters).sort()) {
    const value = filters[key];
    if (value === undefined) continue;
    canonical[key] = key === 'q' ? normalizeSearchText(value) : value;
  }
  return canonical;
}

/** Mirror of the query's own normalisation, so the fingerprint follows semantics. */
function normalizeSearchText(query: string): string {
  return query.normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

/** A stable, opaque fingerprint of the canonical filter context. */
export function filterFingerprint(filters: StaffListFilterContext): string {
  const json = JSON.stringify(canonicaliseFilterContext(filters));
  return createHash('sha256').update(json, 'utf8').digest('base64url').slice(0, 22);
}

function base64UrlEncode(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string | null {
  // `Buffer.from(…, 'base64url')` never throws; it silently drops invalid
  // characters. Re-encoding is the only reliable way to reject a non-canonical
  // payload ("abc!" would otherwise decode like "abc").
  const decoded = Buffer.from(value, 'base64url').toString('utf8');
  return Buffer.from(decoded, 'utf8').toString('base64url') === value ? decoded : null;
}

export function isStaffListCursorRejection(value: unknown): value is StaffListCursorRejection {
  return (
    value === 'malformed' ||
    value === 'unsupported_version' ||
    value === 'filter_mismatch' ||
    value === 'invalid_position'
  );
}

/**
 * Mints a wire cursor from the domain cursor the query returned.
 *
 * `position` is passed through `encodeCursor` here rather than trusting the
 * query's string, so the transport format is minted in exactly one place.
 */
export function encodeStaffListCursor(
  position: CursorPosition,
  filters: StaffListFilterContext,
): string {
  const payload = JSON.stringify({
    v: STAFF_LIST_CURSOR_VERSION,
    f: filterFingerprint(filters),
    p: encodeCursor(position),
  });
  const cursor = `${VERSION_TAG}${SEPARATOR}${base64UrlEncode(payload)}`;
  // Defensive: the domain schema caps `cursor` at 200 characters, and a cursor
  // we cannot hand back to ourselves would be worse than failing loudly.
  if (cursor.length > WIRE_CURSOR_MAX) {
    throw new Error('staff list cursor exceeded its wire bound');
  }
  return cursor;
}

/** A decoded, verified wire cursor. */
export type StaffListCursorResult =
  | { readonly ok: true; readonly cursor: string }
  | { readonly ok: false; readonly reason: StaffListCursorRejection };

/**
 * Verifies a wire cursor against the filters of THIS request and returns the
 * domain cursor the query should continue from.
 *
 * Order matters: format → version → payload → position → filter binding. A
 * mismatched filter context is reported as `filter_mismatch` even when the
 * position is decodable, because that is the actionable fact for the caller.
 */
export function decodeStaffListCursor(
  cursor: string,
  filters: StaffListFilterContext,
): StaffListCursorResult {
  const separator = cursor.indexOf(SEPARATOR);
  if (separator <= 0 || separator === cursor.length - 1) {
    return { ok: false, reason: 'malformed' };
  }

  const tag = cursor.slice(0, separator);
  if (!/^qsc\d+$/.test(tag)) return { ok: false, reason: 'malformed' };
  if (!tag.startsWith('qsc') || tag !== VERSION_TAG) {
    return { ok: false, reason: 'unsupported_version' };
  }

  const json = base64UrlDecode(cursor.slice(separator + 1));
  if (json === null) return { ok: false, reason: 'malformed' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'malformed' };
  }

  const { v, f, p } = parsed as Record<string, unknown>;
  if (typeof v !== 'number' || !Number.isInteger(v)) return { ok: false, reason: 'malformed' };
  if (v !== STAFF_LIST_CURSOR_VERSION) return { ok: false, reason: 'unsupported_version' };
  if (typeof f !== 'string' || typeof p !== 'string') {
    return { ok: false, reason: 'malformed' };
  }

  // The wrapped position must still be a real domain cursor: this build only
  // mints them, so anything else was not produced by this endpoint.
  try {
    decodeCursor(p);
  } catch {
    return { ok: false, reason: 'invalid_position' };
  }

  if (f !== filterFingerprint(filters)) return { ok: false, reason: 'filter_mismatch' };

  return { ok: true, cursor: p };
}
