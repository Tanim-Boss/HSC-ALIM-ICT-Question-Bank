/**
 * Phase 04G — HTTP contract for `GET /api/v1/staff/questions/[id]`.
 *
 * The handler is driven directly with a real `Request` and the Next.js 16
 * asynchronous `params` promise. As in the list suite, only the Supabase
 * session reader and the Prisma client are faked, so `requireActor()`,
 * `authorize()`, the `getQuestionInputSchema` path, the detail projection and
 * the error mapper are production code.
 *
 * Pinned here:
 *   · no session → 401, deactivated profile → 403, STUDENT → 403, and none of
 *     them discloses whether the id exists;
 *   · every authorized staff role receives the authorized detail projection,
 *     including answer key and rubric — which is why this route is staff-only;
 *   · a malformed id is 422 and a missing question is a safe 404;
 *   · the response is an explicit camelCase DTO with ISO-8601 UTC timestamps,
 *     not a Prisma row: unknown columns and internal notes never appear;
 *   · every response is `private, no-store` with its own request id.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { call, expectNoStore, harness, storedQuestion, MISSING_QUESTION_ID } from './harness';

import { GET } from '@/app/api/v1/staff/questions/[id]/route';

const QUESTION_ID = '0c000000-0000-4000-8000-000000000001';
const BASE = 'http://localhost:3000/api/v1/staff/questions';

const handle = (id: string) =>
  call(GET, `${BASE}/${encodeURIComponent(id)}`, { params: Promise.resolve({ id }) });

const STAFF_ROLES = ['EDITOR', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'] as const;

beforeEach(() => {
  harness.resetRoles(['STUDENT', 'EDITOR']);
  harness.state.rows = [storedQuestion({ id: QUESTION_ID })];
});

describe('authentication and authorization', () => {
  it('returns 401 UNAUTHENTICATED without a verified session, before reading anything', async () => {
    harness.state.sessionUser = null;

    const result = await handle(QUESTION_ID);

    expect(result.status).toBe(401);
    expect(result.body).toEqual({
      error: {
        code: 'UNAUTHENTICATED',
        message: expect.any(String),
        requestId: expect.any(String),
      },
    });
    expect(harness.calls.profileFindUnique).toBe(0);
    expect(harness.calls.questionFindUnique).toHaveLength(0);
    expectNoStore(result);
  });

  it('returns 403 INACTIVE for a deactivated profile', async () => {
    harness.state.profile = { isActive: false, roles: [{ role: 'EDITOR' }] };

    const result = await handle(QUESTION_ID);

    expect(result.status).toBe(403);
    expect((result.body['error'] as { code: string }).code).toBe('INACTIVE');
    expect(harness.calls.questionFindUnique).toHaveLength(0);
    expectNoStore(result);
  });

  it('returns 403 FORBIDDEN for a STUDENT and performs no read', async () => {
    harness.resetRoles(['STUDENT']);

    const result = await handle(QUESTION_ID);

    expect(result.status).toBe(403);
    expect((result.body['error'] as { code: string }).code).toBe('FORBIDDEN');
    expect(result.text).not.toContain(QUESTION_ID);
    expect(harness.calls.questionFindUnique).toHaveLength(0);
    expectNoStore(result);
  });

  it('does not disclose existence to an unauthorized caller', async () => {
    harness.resetRoles(['STUDENT']);
    const existing = await handle(QUESTION_ID);
    const missing = await handle(MISSING_QUESTION_ID);

    expect(existing.status).toBe(403);
    expect(missing.status).toBe(403);
    expect(existing.body['error']).toMatchObject({ code: 'FORBIDDEN' });
    expect(missing.body['error']).toMatchObject({ code: 'FORBIDDEN' });
    expect(existing.text.replace(/"requestId":"[^"]+"/, '')).toBe(
      missing.text.replace(/"requestId":"[^"]+"/, ''),
    );
  });

  it.each(STAFF_ROLES)('returns 200 for an authorized %s', async (role) => {
    harness.resetRoles([role]);
    harness.state.rows = [storedQuestion({ id: QUESTION_ID })];

    const result = await handle(QUESTION_ID);

    expect(result.status).toBe(200);
    expect((result.body as { id: string }).id).toBe(QUESTION_ID);
    expectNoStore(result);
  });

  it('accepts an authorized staff actor whose impersonation attempt is only in headers', async () => {
    harness.resetRoles(['EDITOR']);
    harness.state.rows = [storedQuestion({ id: QUESTION_ID })];

    const response = await GET(
      new Request(`${BASE}/${QUESTION_ID}`, {
        headers: { 'X-Actor-Id': MISSING_QUESTION_ID, 'X-Role': 'SUPER_ADMIN' },
      }),
      { params: Promise.resolve({ id: QUESTION_ID }) },
    );

    // The header is inert: the record answered is the one in the path, resolved
    // through the session actor.
    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string };
    expect(body.id).toBe(QUESTION_ID);
  });
});

describe('input validation and safe errors', () => {
  it('returns 422 for a non-UUID id and performs no read', async () => {
    const result = await handle('not-a-uuid');

    expect(result.status).toBe(422);
    expect((result.body['error'] as { code: string }).code).toBe('VALIDATION_FAILED');
    expect(harness.calls.questionFindUnique).toHaveLength(0);
    expectNoStore(result);
  });

  it('reports authentication before validation for an anonymous bad id', async () => {
    harness.state.sessionUser = null;

    const result = await handle('not-a-uuid');

    expect(result.status).toBe(401);
  });

  it('returns a safe 404 for a missing question', async () => {
    const result = await handle(MISSING_QUESTION_ID);

    expect(result.status).toBe(404);
    expect((result.body['error'] as { code: string }).code).toBe('NOT_FOUND');
    expect(Object.keys(result.body['error'] as object).sort()).toEqual([
      'code',
      'message',
      'requestId',
    ]);
    expectNoStore(result);
  });

  it('returns a safe 500 for an unexpected failure without driver text or a stack trace', async () => {
    harness.state.throwOnQuestionQuery = Object.assign(
      new Error('SELECT * FROM answer_keys WHERE "versionId" = $1 — relation does not exist'),
      { code: 'P2021' },
    );

    const result = await handle(QUESTION_ID);

    expect(result.status).toBe(500);
    expect((result.body['error'] as { code: string }).code).toBe('INTERNAL_ERROR');
    for (const leak of ['SELECT', 'answer_keys', 'P2021', 'relation does not exist', '.ts:']) {
      expect(result.text, leak).not.toContain(leak);
    }
    expectNoStore(result);
  });
});

describe('detail projection', () => {
  it('returns an explicit camelCase DTO with ISO-8601 UTC timestamps', async () => {
    const result = await handle(QUESTION_ID);
    const body = result.body;

    expect(Object.keys(body).sort()).toEqual([
      'chapterId',
      'createdAt',
      'createdVia',
      'difficulty',
      'educationLevelId',
      'id',
      'marks',
      'sources',
      'status',
      'subjectId',
      'subtopicId',
      'tagIds',
      'topicId',
      'type',
      'updatedAt',
      'versions',
    ]);
    expect(body['createdAt']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(body['updatedAt']).toMatch(/Z$/);

    const version = (body['versions'] as Record<string, unknown>[])[0] ?? {};
    expect(Object.keys(version).sort()).toEqual([
      'answerKey',
      'assetIds',
      'content',
      'createdAt',
      'createdById',
      'id',
      'options',
      'publishedAt',
      'publishedById',
      'status',
      'updatedAt',
      'updatedById',
      'versionNumber',
    ]);
    expect(version['publishedAt']).toBeNull();
    expect(version['createdAt']).toMatch(/Z$/);
  });

  it('includes the authorized staff answer key and rubric, nested per version', async () => {
    const result = await handle(QUESTION_ID);
    const version = (result.body['versions'] as Record<string, unknown>[])[0] ?? {};
    const answerKey = version['answerKey'] as Record<string, unknown>;

    // The whole point of the staff detail projection: EDITOR and up may see it.
    expect(answerKey).toMatchObject({
      mcqCorrectOptionKey: 'A',
      isVerified: true,
    });
    expect(answerKey['cqRubric']).toMatchObject({ totalMaxMarks: 10 });
    expect(answerKey['verifiedAt']).toMatch(/Z$/);

    const options = version['options'] as Record<string, unknown>[];
    expect(options).toHaveLength(1);
    expect(Object.keys(options[0] ?? {}).sort()).toEqual(['content', 'key', 'order']);
  });

  it('never exposes internal database fields or unprojected columns', async () => {
    const result = await handle(QUESTION_ID);

    for (const leak of [
      'internalPrismaField',
      'MUST_NEVER_SURVIVE_SELECT',
      'INTERNAL_NOTE_CANARY',
      'notes',
      'searchText',
      'SEARCH_TEXT_CANARY',
      'questionId',
      'versionId',
    ]) {
      expect(result.text, leak).not.toContain(leak);
    }
    // The domain `select` was applied — a raw row would have carried these.
    const select = harness.calls.questionFindUnique[0]?.select as Record<string, unknown>;
    expect(select['internalPrismaField']).toBeUndefined();
    expect(select['searchText']).toBeUndefined();
  });

  it('uses the domain id validator rather than trusting the path segment', async () => {
    const result = await handle('0c000000-0000-4000-8000-00000000000Z');

    expect(result.status).toBe(422);
    expect(harness.calls.questionFindUnique).toHaveLength(0);
  });
});

describe('HTTP headers', () => {
  it('returns private/no-store and a fresh request id for success and every failure', async () => {
    const success = await handle(QUESTION_ID);
    const invalid = await handle('nope');
    const missing = await handle(MISSING_QUESTION_ID);
    harness.state.sessionUser = null;
    const anonymous = await handle(QUESTION_ID);

    const requestIds = new Set<string>();
    for (const response of [success, invalid, missing, anonymous]) {
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      const requestId = response.headers.get('x-request-id');
      expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
      requestIds.add(requestId as string);
    }
    expect(requestIds.size).toBe(4);
  });
});
