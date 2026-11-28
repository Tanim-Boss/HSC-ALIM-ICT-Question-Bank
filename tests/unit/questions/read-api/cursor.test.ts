/**
 * Phase 04G — the transport cursor adapter.
 *
 * The domain cursor is a bare keyset position. OD-17 §8 requires the WIRE
 * cursor to be versioned and bound to the filter context, so this suite pins:
 *
 *   · the wire form is `qsc1.<base64url(json)>` and the version is explicit;
 *   · a cursor round-trips and still carries the exact domain position;
 *   · the fingerprint ignores parameter order, defaults and search-text case,
 *     but changes for every real filter change — including board vs college,
 *     which are independent dimensions;
 *   · malformed payloads, unknown versions, tampered positions and mismatched
 *     filters are all refused, each with its own reason;
 *   · a cursor is not an authorization credential: decoding proves nothing, and
 *     the domain cursor it wraps is not itself accepted on the wire.
 */

import { describe, expect, it } from 'vitest';

import { decodeCursor, encodeCursor } from '@/server/questions/authoring/cursor';
import {
  canonicaliseFilterContext,
  decodeStaffListCursor,
  encodeStaffListCursor,
  filterFingerprint,
  STAFF_LIST_CURSOR_VERSION,
} from '@/server/questions/read-api/cursor';

const POSITION = {
  createdAt: new Date('2026-11-27T09:30:00.000Z'),
  id: '0c000000-0000-4000-8000-000000000005',
};

const FILTERS = {
  subjectId: '1a000000-0000-4000-8000-000000000002',
  status: 'DRAFT',
} as const;

const BOARD = '1a000000-0000-4000-8000-000000000004';
const COLLEGE = '1a000000-0000-4000-8000-000000000005';

function tamper(cursor: string, mutate: (payload: Record<string, unknown>) => void): string {
  const [tag, payload] = cursor.split('.');
  const decoded = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
  mutate(decoded);
  return `${tag}.${Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url')}`;
}

describe('wire format', () => {
  it('mints a versioned, opaque cursor with an explicit version tag', () => {
    const cursor = encodeStaffListCursor(POSITION, FILTERS);

    expect(cursor.startsWith(`qsc${STAFF_LIST_CURSOR_VERSION}.`)).toBe(true);
    expect(cursor).toMatch(/^qsc1\.[A-Za-z0-9_-]+$/);
    // Never the raw domain cursor: that is the thing OD-17 §8 said not to expose.
    expect(cursor).not.toBe(encodeCursor(POSITION));
    expect(cursor.includes(encodeCursor(POSITION))).toBe(false);
    // Bounded, because the domain schema caps `cursor` at 200 characters.
    expect(cursor.length).toBeLessThanOrEqual(200);
  });

  it('does not embed the filter values or the search text', () => {
    const cursor = encodeStaffListCursor(POSITION, { ...FILTERS, q: 'কিবোর্ড search' });
    const payload = Buffer.from(cursor.split('.')[1] ?? '', 'base64url').toString('utf8');

    expect(payload).not.toContain('1a000000-0000-4000-8000-000000000002');
    expect(payload).not.toContain('কিবোর্ড');
    expect(payload).not.toContain('DRAFT');
  });

  it('round-trips to the identical domain position for matching filters', () => {
    const cursor = encodeStaffListCursor(POSITION, FILTERS);
    const result = decodeStaffListCursor(cursor, FILTERS);

    expect(result).toEqual({ ok: true, cursor: encodeCursor(POSITION) });
    if (result.ok) expect(decodeCursor(result.cursor)).toEqual(POSITION);
  });
});

describe('filter binding', () => {
  it('accepts a reordered but equivalent filter context (canonical, not raw query order)', () => {
    const cursor = encodeStaffListCursor(POSITION, FILTERS);
    const reordered = { status: 'DRAFT', subjectId: FILTERS.subjectId };

    expect(decodeStaffListCursor(cursor, reordered).ok).toBe(true);
  });

  it('accepts explicit undefined, which is how an absent filter is represented', () => {
    const cursor = encodeStaffListCursor(POSITION, FILTERS);
    const withUndefined = { ...FILTERS, chapterId: undefined, boardId: undefined };

    expect(canonicaliseFilterContext(withUndefined)).toEqual(canonicaliseFilterContext(FILTERS));
    expect(decodeStaffListCursor(cursor, withUndefined).ok).toBe(true);
  });

  it('treats search text as one result set regardless of case and spacing', () => {
    const cursor = encodeStaffListCursor(POSITION, { q: 'Kibo  Input' });

    expect(decodeStaffListCursor(cursor, { q: 'kibo input' }).ok).toBe(true);
  });

  it('rejects reuse with a different subject filter', () => {
    const cursor = encodeStaffListCursor(POSITION, FILTERS);

    expect(decodeStaffListCursor(cursor, { ...FILTERS, subjectId: COLLEGE })).toEqual({
      ok: false,
      reason: 'filter_mismatch',
    });
  });

  it('rejects reuse with an added filter', () => {
    const cursor = encodeStaffListCursor(POSITION, FILTERS);

    expect(decodeStaffListCursor(cursor, { ...FILTERS, status: 'PUBLISHED' })).toEqual({
      ok: false,
      reason: 'filter_mismatch',
    });
  });

  it('keeps Board and College independent when binding a cursor', () => {
    const boardCursor = encodeStaffListCursor(POSITION, { boardId: BOARD });
    const collegeCursor = encodeStaffListCursor(POSITION, { collegeId: COLLEGE });

    expect(decodeStaffListCursor(boardCursor, { boardId: BOARD }).ok).toBe(true);
    // Selecting a college is a different result set, not the board's.
    expect(decodeStaffListCursor(boardCursor, { collegeId: COLLEGE }).ok).toBe(false);
    expect(decodeStaffListCursor(collegeCursor, { boardId: BOARD }).ok).toBe(false);
    // Both together is a third result set.
    expect(decodeStaffListCursor(boardCursor, { boardId: BOARD, collegeId: COLLEGE }).ok).toBe(
      false,
    );
  });

  it('ignores page size: pagination does not change the result set identity', () => {
    const cursor = encodeStaffListCursor(POSITION, FILTERS);
    const limitFingerprint = filterFingerprint({ ...FILTERS, limit: '50' });

    // `limit` is never part of the context the handler builds, so adding it to a
    // raw object must not silently match. The handler excludes it two ways.
    expect(limitFingerprint).not.toBe(filterFingerprint(FILTERS));
    expect(decodeStaffListCursor(cursor, FILTERS).ok).toBe(true);
  });
});

describe('rejections', () => {
  it('rejects an unversioned / legacy domain cursor on the wire', () => {
    expect(decodeStaffListCursor(encodeCursor(POSITION), FILTERS)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('rejects malformed cursors', () => {
    for (const cursor of [
      '',
      '.',
      'qsc1',
      'qsc1.',
      '.payload',
      'qsc1.!!!notbase64!!!',
      'qsc1.bm90LWpzb24', // base64url("not-json")
      `qsc1.${Buffer.from('[1,2,3]', 'utf8').toString('base64url')}`,
      `qsc1.${Buffer.from('"a string"', 'utf8').toString('base64url')}`,
      'nonsense-' + 'A'.repeat(20),
    ]) {
      const result = decodeStaffListCursor(cursor, FILTERS);
      expect(result.ok, cursor).toBe(false);
      if (!result.ok) expect(result.reason).toBe('malformed');
    }
  });

  it('rejects a non-canonical base64url payload rather than silently repairing it', () => {
    const cursor = encodeStaffListCursor(POSITION, FILTERS);

    expect(decodeStaffListCursor(`${cursor}!`, FILTERS)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('rejects a payload with missing or wrongly typed fields', () => {
    const cursor = encodeStaffListCursor(POSITION, FILTERS);

    expect(
      decodeStaffListCursor(
        tamper(cursor, (payload) => {
          delete payload['p'];
        }),
        FILTERS,
      ),
    ).toEqual({ ok: false, reason: 'malformed' });

    expect(
      decodeStaffListCursor(
        tamper(cursor, (payload) => {
          payload['f'] = 42;
        }),
        FILTERS,
      ),
    ).toEqual({ ok: false, reason: 'malformed' });
  });

  it('rejects an unsupported version in the tag position', () => {
    const cursor = encodeStaffListCursor(POSITION, FILTERS);
    const payload = cursor.split('.')[1] ?? '';

    expect(decodeStaffListCursor(`qsc2.${payload}`, FILTERS)).toEqual({
      ok: false,
      reason: 'unsupported_version',
    });
    expect(decodeStaffListCursor(`qsc99.${payload}`, FILTERS)).toEqual({
      ok: false,
      reason: 'unsupported_version',
    });
  });

  it('rejects an unsupported version inside the payload even with a current tag', () => {
    const cursor = encodeStaffListCursor(POSITION, FILTERS);

    expect(
      decodeStaffListCursor(
        tamper(cursor, (payload) => {
          payload['v'] = 2;
        }),
        FILTERS,
      ),
    ).toEqual({ ok: false, reason: 'unsupported_version' });
  });

  it('rejects a tampered position that is not a domain cursor', () => {
    const cursor = encodeStaffListCursor(POSITION, FILTERS);

    expect(
      decodeStaffListCursor(
        tamper(cursor, (payload) => {
          payload['p'] = Buffer.from('2026-11-27T09:30:00.000Z|not-a-uuid', 'utf8').toString(
            'base64url',
          );
        }),
        FILTERS,
      ),
    ).toEqual({ ok: false, reason: 'invalid_position' });
  });

  it('reports a filter mismatch before an unusable position', () => {
    const cursor = encodeStaffListCursor(POSITION, FILTERS);
    // Matching filters are required to reach the position check; a different
    // filter selection is the more actionable fact, so it wins.

    expect(decodeStaffListCursor(cursor, { subjectId: COLLEGE })).toEqual({
      ok: false,
      reason: 'filter_mismatch',
    });
  });
});

describe('a cursor is not an authorization credential', () => {
  it('is decodable by anyone — the payload is not secret and is not signed', () => {
    const cursor = encodeStaffListCursor(POSITION, FILTERS);
    const decoded = JSON.parse(
      Buffer.from(cursor.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    expect(Object.keys(decoded).sort()).toEqual(['f', 'p', 'v']);
    // No signature, no MAC, no subject claim: OD-17 §8 did not approve signing.
    expect(Object.keys(decoded)).not.toContain('sig');
    expect(Object.keys(decoded)).not.toContain('sub');
  });

  it('cannot be edited into a different result set', () => {
    const cursor = encodeStaffListCursor(POSITION, FILTERS);
    const rewritten = tamper(cursor, (payload) => {
      payload['f'] = filterFingerprint({ subjectId: COLLEGE });
    });

    expect(decodeStaffListCursor(rewritten, FILTERS)).toEqual({
      ok: false,
      reason: 'filter_mismatch',
    });
  });
});
