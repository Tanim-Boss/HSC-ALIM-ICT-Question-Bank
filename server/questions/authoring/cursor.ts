/**
 * Keyset-pagination cursor for the staff question list.
 *
 * Opaque to callers: base64url of `<ISO timestamp>|<uuid>`. The list is ordered
 * `(created_at DESC, id DESC)`, so a cursor is a POSITION in that composite
 * order, not an offset — which is why page 50 costs the same as page 1.
 *
 * Extracted from queries.ts in Phase 04D so that the query, the filter builder
 * (./list-filters.ts) and the performance harness's SQL renderer
 * (scripts/db/list-query-sql.ts) all mint and read cursors with one piece of
 * code. The harness runs under plain Node (`node scripts/db/…`), which cannot
 * resolve the `@/` TypeScript alias, so this module deliberately imports
 * NOTHING — not even the DomainError type. Invalid input is reported as
 * `InvalidCursorError`, which the alias-using callers translate.
 *
 * Pure: no Prisma, no `server-only`, no imports.
 */

export interface CursorPosition {
  readonly createdAt: Date;
  readonly id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The message every caller has always produced for a bad cursor. */
export const INVALID_CURSOR_MESSAGE = 'cursor: not a cursor returned by this list';

export class InvalidCursorError extends Error {
  constructor() {
    super(INVALID_CURSOR_MESSAGE);
    this.name = 'InvalidCursorError';
  }
}

export function encodeCursor(position: CursorPosition): string {
  return Buffer.from(`${position.createdAt.toISOString()}|${position.id}`, 'utf8').toString(
    'base64url',
  );
}

/** Throws `InvalidCursorError` for anything this module did not mint. */
export function decodeCursor(cursor: string): CursorPosition {
  const text = Buffer.from(cursor, 'base64url').toString('utf8');
  const [iso, id, extra] = text.split('|');
  if (iso === undefined || id === undefined || extra !== undefined || !UUID.test(id)) {
    throw new InvalidCursorError();
  }
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== iso) {
    throw new InvalidCursorError();
  }
  return { createdAt, id };
}
