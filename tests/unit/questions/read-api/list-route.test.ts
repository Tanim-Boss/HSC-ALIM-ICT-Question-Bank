/**
 * Phase 04G — HTTP contract for `GET /api/v1/staff/questions`.
 *
 * Every case drives the REAL Route Handler export with a real `Request` and
 * asserts on status, headers and the parsed JSON body. Only the Supabase
 * session reader and the Prisma client are faked (see ./harness.ts), so the
 * actor resolution, permission matrix, Zod schemas, cursor adapter, DTO mappers
 * and error mapper are all production code.
 *
 * Pinned here, in the order OD-17 §8–§11 states them:
 *   · deny by default: no session → 401, deactivated profile → 403 (the
 *     documented PROPOSED mapping, tested), STUDENT → 403;
 *   · every authorized staff role succeeds;
 *   · spoofing cannot grant access — the query string carries no actor slot;
 *   · strict transport validation: unknown and repeated parameters are 400,
 *     bad values are 422, defaults and bounds are the approved ones;
 *   · the list DTO cannot carry an answer key, rubric, option, content or the
 *     internal search text, whatever the database row holds;
 *   · pagination is keyset-only, cursor-bound and continuous without gaps or
 *     repeats;
 *   · every response, success or failure, is `private, no-store` with a
 *     trustworthy request id and no internal detail.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  call,
  expectNoStore,
  harness,
  storedQuestions,
  SUBJECT_ID,
  CHAPTER_ID,
  BOARD_ID,
  COLLEGE_ID,
  OTHER_STAFF_ID,
  SESSION_USER_ID,
} from './harness';

import { GET } from '@/app/api/v1/staff/questions/route';
import { decodeCursor, encodeCursor } from '@/server/questions/authoring/cursor';

const BASE = 'http://localhost:3000/api/v1/staff/questions';

const handle = (query = '') => call(GET, `${BASE}${query === '' ? '' : `?${query}`}`);

const STAFF_ROLES = ['EDITOR', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'] as const;

beforeEach(() => {
  harness.resetRoles(['STUDENT', 'EDITOR']);
});

describe('authentication and authorization', () => {
  it('returns 401 UNAUTHENTICATED with the error envelope when there is no verified session', async () => {
    harness.state.sessionUser = null;

    const result = await handle();

    expect(result.status).toBe(401);
    expect(result.body).toEqual({
      error: {
        code: 'UNAUTHENTICATED',
        message: expect.any(String),
        requestId: expect.any(String),
      },
    });
    expect(Object.keys(result.body['error'] as object).sort()).toEqual([
      'code',
      'message',
      'requestId',
    ]);
    // Deny by default: no profile lookup and no question query ran.
    expect(harness.calls.profileFindUnique).toBe(0);
    expect(harness.calls.questionFindMany).toHaveLength(0);
    expectNoStore(result);
  });

  it('returns 403 INACTIVE for a deactivated profile (documented proposed mapping)', async () => {
    harness.state.profile = { isActive: false, roles: [{ role: 'EDITOR' }] };

    const result = await handle();

    expect(result.status).toBe(403);
    expect((result.body['error'] as { code: string }).code).toBe('INACTIVE');
    expect(harness.calls.questionFindMany).toHaveLength(0);
    expectNoStore(result);
  });

  it('returns 403 FORBIDDEN for a STUDENT and runs no question query', async () => {
    harness.resetRoles(['STUDENT']);
    harness.state.rows = storedQuestions(3);

    const result = await handle();

    expect(result.status).toBe(403);
    expect((result.body['error'] as { code: string }).code).toBe('FORBIDDEN');
    expect(harness.calls.questionFindMany).toHaveLength(0);
    expectNoStore(result);
  });

  it.each(STAFF_ROLES)('returns 200 for an authorized %s', async (role) => {
    harness.resetRoles([role]);
    harness.state.rows = storedQuestions(1);

    const result = await handle();

    expect(result.status).toBe(200);
    expect((result.body as { items: unknown[] }).items).toHaveLength(1);
    expectNoStore(result);
  });

  it('ignores client-supplied identity: an actor/role in the query string is rejected, not honoured', async () => {
    harness.resetRoles(['STUDENT']);

    // A spoofing caller has to put the claim somewhere. Parameters are not part
    // of the approved surface, so every such attempt is rejected — and the
    // claim buys nothing: a STUDENT stays a STUDENT, and no question is read.
    for (const attempt of [
      `actorId=${OTHER_STAFF_ID}`,
      `userId=${OTHER_STAFF_ID}`,
      'role=SUPER_ADMIN',
      'roles=SUPER_ADMIN',
      'isStaff=true',
    ]) {
      const result = await handle(attempt);
      // 400 is correct here: this caller IS authenticated and active, so they
      // are allowed to learn that the parameter is unsupported.
      expect(result.status, attempt).toBe(400);
      expect((result.body['error'] as { code: string }).code).toBe('INVALID_REQUEST');
    }
    expect(harness.calls.questionFindMany).toHaveLength(0);

    // The same claim from an anonymous caller grants no disclosure either: the
    // role/actor parameters do not turn an anonymous request into a valid one.
    harness.state.sessionUser = null;
    for (const attempt of ['role=SUPER_ADMIN', `actorId=${OTHER_STAFF_ID}`]) {
      const result = await handle(attempt);
      expect(result.status, attempt).toBe(401);
      expect((result.body['error'] as { code: string }).code).toBe('UNAUTHENTICATED');
    }
    expect(harness.calls.questionFindMany).toHaveLength(0);
  });

  it('derives the actor from the session only: a forged X-Staff-Id header changes nothing', async () => {
    harness.resetRoles(['STUDENT']);
    harness.state.rows = storedQuestions(1);

    const response = await GET(
      new Request(BASE, { headers: { 'X-Staff-Id': OTHER_STAFF_ID, 'X-Role': 'SUPER_ADMIN' } }),
    );

    expect(response.status).toBe(403);
    expect(harness.calls.getUser).toBe(1);
  });
});

describe('request validation', () => {
  it('accepts a bare request and uses the approved default page size of 20', async () => {
    harness.state.rows = storedQuestions(25);

    const result = await handle();

    expect(result.status).toBe(200);
    expect((result.body as { items: unknown[] }).items).toHaveLength(20);
    // The service asks for limit + 1 to detect a further page.
    expect(harness.calls.questionFindMany[0]?.take).toBe(21);
    expect((result.body as { hasMore: boolean }).hasMore).toBe(true);
    expect(typeof (result.body as { nextCursor: string }).nextCursor).toBe('string');
    expectNoStore(result);
  });

  it('accepts the approved filters, including independent board and college', async () => {
    harness.state.rows = storedQuestions(1);

    for (const query of [
      `subjectId=${SUBJECT_ID}`,
      `chapterId=${CHAPTER_ID}`,
      `boardId=${BOARD_ID}`,
      `collegeId=${COLLEGE_ID}`,
      `boardId=${BOARD_ID}&collegeId=${COLLEGE_ID}`,
      'type=MCQ',
      'status=PUBLISHED',
      'difficulty=EASY',
      'q=keyboard',
      'limit=5',
    ]) {
      const result = await handle(query);
      expect(result.status, query).toBe(200);
    }
    expectNoStore(await handle(`boardId=${BOARD_ID}&collegeId=${COLLEGE_ID}`));
  });

  it('rejects an unsupported query parameter with 400 INVALID_REQUEST', async () => {
    for (const query of ['subjetId=' + SUBJECT_ID, 'page=2', 'offset=10', 'sort=createdAt']) {
      const result = await handle(query);
      expect(result.status, query).toBe(400);
      expect((result.body['error'] as { code: string }).code).toBe('INVALID_REQUEST');
      expectNoStore(result);
    }
    expect(harness.calls.questionFindMany).toHaveLength(0);
  });

  it('rejects a repeated query parameter as ambiguous', async () => {
    for (const query of [
      'limit=20&limit=50',
      `subjectId=${SUBJECT_ID}&subjectId=${CHAPTER_ID}`,
      'q=a&q=b',
    ]) {
      const result = await handle(query);
      expect(result.status, query).toBe(400);
      expect((result.body['error'] as { message: string }).message).toMatch(/more than once/);
    }
  });

  it('rejects malformed values with 422 VALIDATION_FAILED', async () => {
    for (const query of [
      'subjectId=not-a-uuid',
      'type=ESSAY',
      'status=LIVE',
      'difficulty=TRIVIAL',
      `limit=0`,
      `limit=51`,
      'q=' + 'x'.repeat(121),
    ]) {
      const result = await handle(query);
      expect(result.status, query).toBe(422);
      expect((result.body['error'] as { code: string }).code).toBe('VALIDATION_FAILED');
    }
  });

  it('enforces the maximum page size of 50 and rejects 51', async () => {
    harness.state.rows = storedQuestions(60);

    const max = await handle('limit=50');
    expect(max.status).toBe(200);
    expect((max.body as { items: unknown[] }).items).toHaveLength(50);

    const over = await handle('limit=51');
    expect(over.status).toBe(422);
  });

  it('rejects a non-numeric page size at the transport layer with 400', async () => {
    // A page size that is not a number is malformed TRANSPORT input, not a
    // domain value that failed its schema: OD-17 §9 assigns that 400.
    const result = await handle('limit=abc');

    expect(result.status).toBe(400);
    expect((result.body['error'] as { code: string }).code).toBe('INVALID_REQUEST');
    // `2.5` is not a whole number, so it is transport-malformed too.
    const fractional = await handle('limit=2.5');
    expect(fractional.status).toBe(400);
  });

  it('validates after authenticating: an unauthenticated bad request is 401, not 422', async () => {
    harness.state.sessionUser = null;

    const result = await handle(`subjectId=not-a-uuid`);

    expect(result.status).toBe(401);
  });
});

describe('list projection', () => {
  it('carries no answer key, rubric, option, content, author or internal field', async () => {
    harness.state.rows = storedQuestions(2);

    const result = await handle();
    const { text, body } = result;

    expect(result.status).toBe(200);
    for (const canary of [
      'answerKey',
      'mcqCorrectOptionKey',
      'cqRubric',
      'RUBRIC_CANARY',
      'INTERNAL_NOTE_CANARY',
      'SEARCH_TEXT_CANARY',
      'options',
      'content',
      'rich_blocks',
      'কিবোর্ড',
      'কোনটি ইনপুট',
      'searchText',
      'internalPrismaField',
      'createdById',
      'updatedById',
      'publishedById',
      'verifiedById',
      'questionId',
    ]) {
      expect(text, canary).not.toContain(canary);
    }
    const first = (body as { items: Record<string, unknown>[] }).items[0] ?? {};
    expect(Object.keys(first).sort()).toEqual([
      'chapterId',
      'createdAt',
      'difficulty',
      'educationLevelId',
      'id',
      'marks',
      'status',
      'subjectId',
      'subtopicId',
      'tagIds',
      'topicId',
      'type',
      'updatedAt',
      'versions',
    ]);
    expectNoStore(result);
  });

  it('serializes timestamps as ISO-8601 UTC and keeps the version summary', async () => {
    harness.state.rows = storedQuestions(1);

    const result = await handle();
    const item = (result.body as { items: Record<string, unknown>[] }).items[0] ?? {};

    expect(item['createdAt']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const versions = item['versions'] as { id: string; versionNumber: number; updatedAt: string }[];
    expect(versions).toHaveLength(1);
    expect(versions[0]?.updatedAt).toMatch(/Z$/);
    expect(Object.keys(versions[0] ?? {}).sort()).toEqual([
      'id',
      'status',
      'updatedAt',
      'versionNumber',
    ]);
  });

  it('reports an empty list as a successful empty page, not an error', async () => {
    harness.state.rows = [];

    const result = await handle();

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ items: [], nextCursor: null, hasMore: false });
  });
});

describe('pagination', () => {
  it('continuity: pages cover every row exactly once, in the domain ordering', async () => {
    const rows = storedQuestions(7);
    harness.state.rows = rows;
    const expected = harness.listRowsOrdered().map((row) => row['id'] as string);

    const seen: string[] = [];
    const pageSizes: number[] = [];
    let cursor: string | null = null;
    let guard = 0;
    do {
      const query: string =
        cursor === null ? 'limit=2' : `limit=2&cursor=${encodeURIComponent(cursor)}`;
      const result = await handle(query);
      expect(result.status, query).toBe(200);
      const body = result.body as { items: { id: string }[]; nextCursor: string | null };
      seen.push(...body.items.map((item) => item.id));
      pageSizes.push(body.items.length);
      cursor = body.nextCursor;
      guard += 1;
      if (guard > 10) throw new Error('pagination did not terminate');
    } while (cursor !== null);

    expect(pageSizes).toEqual([2, 2, 2, 1]);
    expect(seen).toEqual(expected);
    expect(new Set(seen).size).toBe(rows.length);
  });

  it('issues a versioned wire cursor and does not continue from a raw domain cursor', async () => {
    harness.state.rows = storedQuestions(3);

    const first = await handle('limit=2');
    const nextCursor = (first.body as { nextCursor: string }).nextCursor;

    expect(nextCursor).toMatch(/^qsc1\./);
    // The wire cursor wraps — and is not — the domain position it carries.
    const wrapped = JSON.parse(
      Buffer.from(nextCursor.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as { p: string };
    expect(nextCursor).not.toBe(wrapped.p);
    expect(decodeCursor(wrapped.p).id).toMatch(/^0c000000-/);

    const second = await handle(`limit=2&cursor=${encodeURIComponent(nextCursor)}`);
    expect(second.status).toBe(200);

    // The unversioned domain cursor is refused on the wire: it is not
    // filter-bound, so accepting it would answer a different result set.
    const legacy = await handle(
      `limit=2&cursor=${encodeURIComponent(
        encodeCursor({ createdAt: new Date('2026-11-27T00:00:00.000Z'), id: SESSION_USER_ID }),
      )}`,
    );
    expect(legacy.status).toBe(422);
    expect((legacy.body['error'] as { message: string }).message).toMatch(/^cursor:/);
  });

  it('rejects a cursor minted for different filters with 422 cursor filter_mismatch', async () => {
    harness.state.rows = storedQuestions(3);

    const page = await handle(`subjectId=${SUBJECT_ID}&limit=2`);
    const cursor = (page.body as { nextCursor: string }).nextCursor;

    const mismatched = await handle(
      `chapterId=${CHAPTER_ID}&limit=2&cursor=${encodeURIComponent(cursor)}`,
    );

    expect(mismatched.status).toBe(422);
    expect((mismatched.body['error'] as { message: string }).message).toMatch(
      /different filter selection/,
    );
    // The envelope stays the fixed three keys; the field is named in the
    // message, which is how the existing domain errors already report it.
    expect(Object.keys(mismatched.body['error'] as object).sort()).toEqual([
      'code',
      'message',
      'requestId',
    ]);
    // Refused BEFORE the query ran: no widening, no silent re-paging.
    expect(harness.calls.questionFindMany).toHaveLength(1);
  });

  it('rejects a malformed cursor without revealing internals', async () => {
    harness.state.rows = storedQuestions(3);

    const result = await handle('cursor=not-a-real-cursor');

    expect(result.status).toBe(422);
    expect((result.body['error'] as { code: string }).code).toBe('VALIDATION_FAILED');
    expect(result.text).not.toMatch(/at .*\.(ts|js):\d+/);
    expectNoStore(result);
  });

  it('rejects an unsupported cursor version', async () => {
    harness.state.rows = storedQuestions(3);
    const page = await handle('limit=2');
    const cursor = (page.body as { nextCursor: string }).nextCursor as string;
    const payload = cursor.split('.')[1] ?? '';

    const result = await handle(`limit=2&cursor=${encodeURIComponent(`qsc2.${payload}`)}`);

    expect(result.status).toBe(422);
    expect((result.body['error'] as { message: string }).message).toMatch(
      /version is not supported/,
    );
  });
});

describe('failure safety', () => {
  it('maps an unexpected database failure to a safe 500 with a request id and no internals', async () => {
    const original = Object.assign(
      new Error(
        'connect ECONNREFUSED postgresql://owner:hunter2@db.internal:5432/ict?schema=public',
      ),
      { code: 'P1001' },
    );
    harness.state.throwOnQuestionQuery = original;

    const result = await handle();

    expect(result.status).toBe(500);
    expect((result.body['error'] as { code: string }).code).toBe('INTERNAL_ERROR');
    expect((result.body['error'] as { requestId: string }).requestId).toMatch(/^[0-9a-f-]{36}$/);
    for (const leak of [
      'ECONNREFUSED',
      'hunter2',
      'postgresql://',
      'db.internal',
      'P1001',
      'at ',
      '.ts:',
      'SELECT',
    ]) {
      expect(result.text, leak).not.toContain(leak);
    }
    expect(result.headers.get('x-request-id')).toBe(
      (result.body['error'] as { requestId: string }).requestId,
    );
    expectNoStore(result);
  });
});

describe('HTTP headers', () => {
  it('returns the same cache and request-id headers on success and on every failure class', async () => {
    harness.state.rows = storedQuestions(1);

    const responses = [await handle(), await handle('nope=1'), await handle('limit=999')];
    harness.resetRoles(['STUDENT']);
    responses.push(await handle());
    harness.state.sessionUser = null;
    responses.push(await handle());

    const requestIds = new Set<string>();
    for (const response of responses) {
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      const requestId = response.headers.get('x-request-id');
      expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
      requestIds.add(requestId as string);
      if (response.status !== 200) {
        expect((response.body['error'] as { requestId: string }).requestId).toBe(requestId);
      }
    }
    // A new id per request, not a shared constant.
    expect(requestIds.size).toBe(responses.length);
  });

  it('never echoes a caller-supplied request id, and still issues its own', async () => {
    harness.state.sessionUser = null;
    const forged = 'attacker-controlled-id';

    const response = await GET(
      new Request(`${BASE}?requestId=${forged}`, { headers: { 'X-Request-Id': forged } }),
    );
    const body = (await response.json()) as { error: { requestId: string } };

    // An unknown parameter is a 400; either way the id is ours, not theirs.
    expect(body.error.requestId).not.toBe(forged);
    expect(response.headers.get('x-request-id')).not.toBe(forged);
  });
});

describe('transport edge cases', () => {
  it('bounds and sanitises the parameter name it echoes back', async () => {
    const hostile = `x${'\u001b[31m'}${'y'.repeat(400)}`;

    const result = await handle(`${encodeURIComponent(hostile)}=1`);

    expect(result.status).toBe(400);
    const message = (result.body['error'] as { message: string }).message;
    expect(message).not.toContain('\u001b');
    expect(message.length).toBeLessThan(120);
  });

  it('treats an empty parameter value as a validation failure, not a silent default', async () => {
    // `?subjectId=` must not be read as "no subject filter": that would widen
    // the result set behind the caller's back.
    const result = await handle('subjectId=');

    expect(result.status).toBe(422);
    expect((result.body['error'] as { code: string }).code).toBe('VALIDATION_FAILED');
  });

  it('accepts a duplicate of a page-size-only difference across pages', async () => {
    // Page size is not part of the result-set identity, so a cursor is valid at
    // a different page size.
    harness.state.rows = storedQuestions(6);
    const first = await handle('limit=2');
    const cursor = (first.body as { nextCursor: string }).nextCursor;

    const second = await handle(`limit=4&cursor=${encodeURIComponent(cursor)}`);

    expect(second.status).toBe(200);
    expect((second.body as { items: unknown[] }).items).toHaveLength(4);
  });
});
