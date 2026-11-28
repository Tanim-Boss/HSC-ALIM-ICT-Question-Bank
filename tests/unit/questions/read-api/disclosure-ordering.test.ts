/**
 * Phase 04G — disclosure ordering for malformed input (review regression suite).
 *
 * THE INVARIANT
 * -------------
 * Phase 04E pins that the staff boundary establishes identity BEFORE it can
 * report anything about the input: `getStaffQuestion` with a malformed
 * `questionId` still answers `UNAUTHENTICATED` for an anonymous caller
 * (`tests/unit/questions/staff-boundary.test.ts:313-323`). The reason is
 * disclosure: a 400 or 422 is an oracle that tells an unauthenticated caller
 * which parameters, values and cursor shapes this endpoint accepts.
 *
 * The first version of the list handler ran `parseStaffQuestionListQuery()`
 * outside that guard, so transport failures (unsupported parameter, repeated
 * parameter, non-integer `limit`) returned 400 to anybody. Cursor validation
 * had the same gap. These tests pin the correction for every input class, on
 * both routes, in both directions:
 *
 *   · anonymous          → 401, never 400 / 422 (no disclosure)
 *   · deactivated        → 403, never 400 / 422
 *   · authenticated staff→ 400 for transport, 422 for domain/cursor (unchanged)
 *
 * The last group is the falsification control: a legitimate request must still
 * succeed and must still resolve identity exactly once, so a "fix" that simply
 * denied everything would fail here.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { call, expectNoStore, harness, storedQuestions, storedQuestion } from './harness';

import { GET as listGET } from '@/app/api/v1/staff/questions/route';
import { GET as detailGET } from '@/app/api/v1/staff/questions/[id]/route';

const BASE = 'http://localhost:3000/api/v1/staff/questions';
const QUESTION_ID = '0c000000-0000-4000-8000-000000000001';

const list = (query = '') => call(listGET, `${BASE}${query === '' ? '' : `?${query}`}`);
const detail = (id: string) =>
  call(detailGET, `${BASE}/${encodeURIComponent(id)}`, { params: Promise.resolve({ id }) });

/**
 * One representative of every class of malformed input the transport can
 * detect, with the status an AUTHORIZED caller receives for it.
 */
const MALFORMED_INPUTS: readonly { label: string; query: string; status: number; code: string }[] =
  [
    // Transport layer — the class the review found leaking.
    {
      label: 'unsupported parameter',
      query: 'subjetId=1a000000-0000-4000-8000-000000000002',
      status: 400,
      code: 'INVALID_REQUEST',
    },
    {
      label: 'repeated parameter',
      query: 'limit=20&limit=50',
      status: 400,
      code: 'INVALID_REQUEST',
    },
    {
      label: 'malformed limit (non-numeric)',
      query: 'limit=abc',
      status: 400,
      code: 'INVALID_REQUEST',
    },
    {
      label: 'malformed limit (fractional)',
      query: 'limit=2.5',
      status: 400,
      code: 'INVALID_REQUEST',
    },
    // Domain validation layer.
    {
      label: 'malformed value',
      query: 'subjectId=not-a-uuid',
      status: 422,
      code: 'VALIDATION_FAILED',
    },
    { label: 'out-of-range limit', query: 'limit=51', status: 422, code: 'VALIDATION_FAILED' },
    // Cursor layer.
    {
      label: 'malformed cursor',
      query: 'cursor=not-a-cursor',
      status: 422,
      code: 'VALIDATION_FAILED',
    },
  ];

beforeEach(() => {
  harness.resetRoles(['STUDENT', 'EDITOR']);
  harness.state.rows = storedQuestions(3);
});

describe('anonymous callers learn nothing about input', () => {
  it('returns 401 UNAUTHENTICATED for every malformed input class instead of 400/422', async () => {
    harness.state.sessionUser = null;

    for (const { label, query } of MALFORMED_INPUTS) {
      const result = await list(query);

      expect(result.status, label).toBe(401);
      expect((result.body['error'] as { code: string }).code, label).toBe('UNAUTHENTICATED');
      // Nothing about the parameter surface, the value grammar or the cursor
      // format is echoed back.
      expect(result.text, label).not.toContain('Unsupported query parameter');
      expect(result.text, label).not.toContain('whole number');
      expect(result.text, label).not.toContain('subjectId');
      expect(result.text, label).not.toContain('cursor:');
      expectNoStore(result);
    }

    // No profile lookup, no question read: identity failed first.
    expect(harness.calls.profileFindUnique).toBe(0);
    expect(harness.calls.questionFindMany).toHaveLength(0);
  });

  it('returns 401 for an unsupported parameter (review case 1)', async () => {
    harness.state.sessionUser = null;

    const result = await list('actorId=00000000-0000-4000-8000-000000000000');

    expect(result.status).toBe(401);
    expect(result.body['error']).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('returns 401 for a repeated parameter (review case 2)', async () => {
    harness.state.sessionUser = null;

    const result = await list('limit=20&limit=50');

    expect(result.status).toBe(401);
    expect(result.body['error']).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('returns 401 for a malformed limit (review case 3)', async () => {
    harness.state.sessionUser = null;

    const result = await list('limit=abc');

    expect(result.status).toBe(401);
    expect(result.body['error']).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('keeps the error envelope, request id and no-store header on the 401 body', async () => {
    harness.state.sessionUser = null;

    const result = await list('limit=abc');
    const error = result.body['error'] as Record<string, unknown>;

    expect(Object.keys(error).sort()).toEqual(['code', 'message', 'requestId']);
    expect(result.headers.get('x-request-id')).toBe(error['requestId']);
    expect(result.headers.get('cache-control')).toBe('private, no-store');
  });

  it('does not leak transport detail through the detail route either', async () => {
    harness.state.sessionUser = null;

    // A malformed path id is domain validation, so it must not disclose the
    // accepted id grammar to an anonymous caller.
    const result = await detail('not-a-uuid');

    expect(result.status).toBe(401);
    expect(result.text).not.toContain('questionId');
    expect(harness.calls.questionFindUnique).toHaveLength(0);
  });
});

describe('deactivated profiles are refused before any input outcome', () => {
  it('returns 403 INACTIVE for malformed transport input', async () => {
    harness.state.profile = { isActive: false, roles: [{ role: 'EDITOR' }] };

    for (const { label, query } of MALFORMED_INPUTS) {
      const result = await list(query);

      expect(result.status, label).toBe(403);
      expect((result.body['error'] as { code: string }).code, label).toBe('INACTIVE');
      expectNoStore(result);
    }
    expect(harness.calls.questionFindMany).toHaveLength(0);
  });

  it('returns 403 INACTIVE on the detail route for a malformed id', async () => {
    harness.state.profile = { isActive: false, roles: [{ role: 'EDITOR' }] };

    const result = await detail('not-a-uuid');

    expect(result.status).toBe(403);
    expect(result.body['error']).toMatchObject({ code: 'INACTIVE' });
  });
});

describe('authenticated active callers keep the existing contract', () => {
  it.each(MALFORMED_INPUTS)(
    'returns $status for $label when the caller is an active EDITOR',
    async ({ query, status, code }) => {
      const result = await list(query);

      expect(result.status).toBe(status);
      expect((result.body['error'] as { code: string }).code).toBe(code);
      expectNoStore(result);
    },
  );

  it('still reads no question for any rejected input', async () => {
    for (const { label, query } of MALFORMED_INPUTS) {
      await list(query);
      expect(harness.calls.questionFindMany, label).toHaveLength(0);
    }
  });

  /**
   * DOCUMENTED CONSEQUENCE OF THE ORDERING — do not "fix" this by moving the
   * permission check in front of transport parsing.
   *
   * Phase 04E's rule is that the transport must not disclose whether a request
   * is acceptable before identity has standing. For a malformed request, an
   * authenticated STUDENT has the identity but an unusable request, so:
   *
   *   · transport-malformed input            → 400 (the request cannot even be
   *     read; the review's requirement 6 fixes this for authenticated callers)
   *   · well-formed but unauthorized (domain) → 403 FORBIDDEN, which is what an
   *     authenticated STUDENT gets for a valid query, exactly as before
   *   · schema/cursor-malformed input        → 422, because the permission
   *     check lives inside the domain service, after validation — the same
   *     ordering `staff-boundary.test.ts` already pins for write commands.
   *
   * So a student never gains read access, and never learns anything an
   * authenticated caller could not already learn. What is unchanged is the
   * important part: no question is ever read for any of these.
   */
  it('never grants a student read access, whatever the input looks like', async () => {
    harness.resetRoles(['STUDENT']);

    for (const { label, query, status } of MALFORMED_INPUTS) {
      const result = await list(query);
      expect(result.status, label).toBe(status);
      const code = (result.body['error'] as { code: string }).code;
      expect(code, label).not.toBe('UNAUTHENTICATED');
      expect(['INVALID_REQUEST', 'VALIDATION_FAILED', 'FORBIDDEN'], label).toContain(code);
    }
    expect(harness.calls.questionFindMany).toHaveLength(0);
  });

  it('returns 403 FORBIDDEN for an authenticated STUDENT on a well-formed query', async () => {
    harness.resetRoles(['STUDENT']);

    const result = await list('type=MCQ');

    expect(result.status).toBe(403);
    expect(result.body['error']).toMatchObject({ code: 'FORBIDDEN' });
    expect(harness.calls.questionFindMany).toHaveLength(0);
  });
});

describe('falsification control — valid requests are unaffected', () => {
  it('serves a valid list request and resolves identity exactly once', async () => {
    const result = await list();

    expect(result.status).toBe(200);
    expect((result.body as { items: unknown[] }).items).toHaveLength(3);
    // One `getUser()` per request: the ordering guard only resolves identity a
    // second time when the input already failed.
    expect(harness.calls.getUser).toBe(1);
    expect(harness.calls.profileFindUnique).toBe(1);
  });

  it('serves a valid filtered request with one identity resolution', async () => {
    const result = await list('type=MCQ&limit=2');

    expect(result.status).toBe(200);
    expect(harness.calls.getUser).toBe(1);
  });

  it('still paginates with a valid cursor', async () => {
    harness.state.rows = storedQuestions(5);

    const first = await list('limit=2');
    expect(first.status).toBe(200);
    const cursor = (first.body as { nextCursor: string }).nextCursor;

    const second = await list(`limit=2&cursor=${encodeURIComponent(cursor)}`);

    expect(second.status).toBe(200);
    const ids = (second.body as { items: { id: string }[] }).items.map((item) => item.id);
    const firstIds = (first.body as { items: { id: string }[] }).items.map((item) => item.id);
    expect(ids).toHaveLength(2);
    expect(new Set([...firstIds, ...ids]).size).toBe(4);
    // Pagination resolves identity once per page as well.
    expect(harness.calls.getUser).toBe(2);
  });

  it('serves a valid detail request with one identity resolution', async () => {
    harness.state.rows = [storedQuestion({ id: QUESTION_ID })];

    const result = await detail(QUESTION_ID);

    expect(result.status).toBe(200);
    expect((result.body as { id: string }).id).toBe(QUESTION_ID);
    expect(harness.calls.getUser).toBe(1);
  });

  it('lists an empty result as a successful page rather than an error', async () => {
    harness.state.rows = [];

    const result = await list('type=CQ');

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ items: [], nextCursor: null, hasMore: false });
  });
});
