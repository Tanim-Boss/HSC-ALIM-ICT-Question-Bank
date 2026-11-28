/**
 * Shared harness for the Phase 04G HTTP/Route Handler tests.
 *
 * WHAT IS REAL AND WHAT IS FAKED
 * ------------------------------
 * Only the two external edges are replaced:
 *
 *   · `@/lib/auth/session` — the Supabase cookie reader, because there is no
 *     request cookie store under Vitest;
 *   · `@/lib/db` — the Prisma singleton, because these are HTTP contract tests,
 *     not database tests.
 *
 * Everything between the handler and those edges is the production code:
 * `requireActor()`, `loadOrProvisionProfile()` (through the faked Postgres
 * client), `authorize()`, `listQuestionsForStaff()` /
 * `getQuestionForStaff()`, the Zod schemas, the domain cursor codec, the
 * transport cursor adapter, the DTO mappers and the error mapper.
 *
 * The fake Prisma client honours the exact `select` passed by the query service
 * and applies the real keyset predicate and ordering. It is a projection +
 * keyset simulator, not a query rewriter: if a service ever stopped passing a
 * `select`, the FULL row would come back and the leak assertions would fail.
 */

import { expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

export const SESSION_USER_ID = '6f1c2b8e-4a3d-4e5f-9a7b-1c2d3e4f5a6b';
export const OTHER_STAFF_ID = '6f1c2b8e-4a3d-4e5f-9a7b-1c2d3e4f5a7c';
export const MISSING_QUESTION_ID = '0c000000-0000-4000-8000-00000000beef';
export const EDUCATION_LEVEL_ID = '1a000000-0000-4000-8000-000000000001';
export const SUBJECT_ID = '1a000000-0000-4000-8000-000000000002';
export const CHAPTER_ID = '1a000000-0000-4000-8000-000000000003';
export const BOARD_ID = '1a000000-0000-4000-8000-000000000004';
export const COLLEGE_ID = '1a000000-0000-4000-8000-000000000005';
export const TAG_ID = '1a000000-0000-4000-8000-000000000006';
export const YEAR_ID = '1a000000-0000-4000-8000-000000000008';

export type Json = Record<string, unknown>;

export interface HarnessState {
  sessionUser: { id: string; email?: string | null; user_metadata?: Json } | null;
  profile: { isActive: boolean; roles: { role: string }[] } | null;
  rows: Json[];
  throwOnQuestionQuery: unknown;
}

export interface HarnessCalls {
  getUser: number;
  profileFindUnique: number;
  questionFindMany: { take?: number; where?: unknown; select?: unknown }[];
  questionFindUnique: { where?: { id?: string }; select?: unknown }[];
}

/** Applies a Prisma `select` allowlist recursively, exactly like the database would. */
function projectWithSelect(row: Json, select: Json | undefined): Json {
  if (select === undefined) return { ...row };
  const projected: Json = {};
  for (const [key, spec] of Object.entries(select)) {
    if (spec === false || spec === undefined || !(key in row)) continue;
    const value = row[key];
    if (spec === true) {
      projected[key] = value;
      continue;
    }
    if (typeof spec === 'object' && spec !== null) {
      const nested = (spec as { select?: Json }).select;
      if (Array.isArray(value)) {
        projected[key] = value.map((item) =>
          typeof item === 'object' && item !== null
            ? projectWithSelect(item as Json, nested)
            : item,
        );
      } else if (typeof value === 'object' && value !== null) {
        projected[key] = projectWithSelect(value as Json, nested);
      } else {
        projected[key] = value;
      }
    }
  }
  return projected;
}

/**
 * The keyset predicate `listQuestionsForStaff` asks for:
 * `createdAt < c OR (createdAt = c AND id < c.id)` in `(createdAt DESC, id DESC)`.
 */
function afterCursor(where: Json | undefined, row: Json): boolean {
  const and = (where as { AND?: unknown[] } | undefined)?.AND;
  if (!Array.isArray(and)) return true;
  for (const clause of and) {
    const after = (clause as { OR?: unknown }).OR;
    if (!Array.isArray(after)) continue;
    const [lt, tie] = after as [
      { createdAt?: { lt?: Date } },
      { createdAt?: Date; id?: { lt?: string } },
    ];
    if (lt?.createdAt?.lt instanceof Date && tie?.createdAt instanceof Date) {
      const created = row['createdAt'] as Date;
      const id = row['id'] as string;
      const before =
        created < lt.createdAt.lt ||
        (created.getTime() === tie.createdAt.getTime() && id < (tie.id?.lt ?? ''));
      return before;
    }
  }
  return true;
}

const hoisted = vi.hoisted(() => {
  const state = {
    sessionUser: null,
    profile: null,
    rows: [],
    throwOnQuestionQuery: null,
  } as HarnessState;

  const calls: HarnessCalls = {
    getUser: 0,
    profileFindUnique: 0,
    questionFindMany: [],
    questionFindUnique: [],
  };

  const db = {
    profile: {
      findUnique: vi.fn(() => {
        calls.profileFindUnique += 1;
        return Promise.resolve(state.profile);
      }),
    },
    question: {
      findMany: vi.fn((args: { take?: number; where?: unknown; select?: unknown }) => {
        calls.questionFindMany.push(args);
        if (state.throwOnQuestionQuery !== null) return Promise.reject(state.throwOnQuestionQuery);
        const ordered = [...state.rows].sort((a, b) => {
          const ca = (a['createdAt'] as Date).getTime();
          const cb = (b['createdAt'] as Date).getTime();
          if (ca !== cb) return cb - ca;
          return (b['id'] as string).localeCompare(a['id'] as string);
        });
        const take = typeof args.take === 'number' ? args.take : ordered.length;
        return Promise.resolve(
          ordered
            .filter((row) => afterCursor(args.where as Json | undefined, row))
            .slice(0, take)
            .map((row) => projectWithSelect(row, args.select as Json | undefined)),
        );
      }),
      findUnique: vi.fn((args: { where?: { id?: string }; select?: unknown }) => {
        calls.questionFindUnique.push(args);
        if (state.throwOnQuestionQuery !== null) return Promise.reject(state.throwOnQuestionQuery);
        const row = state.rows.find((candidate) => candidate['id'] === args.where?.id);
        if (row === undefined) return Promise.resolve(null);
        return Promise.resolve(projectWithSelect(row, args.select as Json | undefined));
      }),
    },
  };

  function resetRoles(roles: string[]): void {
    state.sessionUser = {
      id: SESSION_USER_ID,
      email: 'staff@ictatlas.example',
      user_metadata: { full_name: 'Staff Member' },
    };
    state.profile = { isActive: true, roles: roles.map((role) => ({ role })) };
    state.rows = [];
    state.throwOnQuestionQuery = null;
    calls.getUser = 0;
    calls.profileFindUnique = 0;
    calls.questionFindMany.length = 0;
    calls.questionFindUnique.length = 0;
    db.profile.findUnique.mockClear();
    db.question.findMany.mockClear();
    db.question.findUnique.mockClear();
  }

  /** The domain ordering `(createdAt DESC, id DESC)`, for continuity assertions. */
  function listRowsOrdered(): Json[] {
    return [...state.rows].sort((a, b) => {
      const ca = (a['createdAt'] as Date).getTime();
      const cb = (b['createdAt'] as Date).getTime();
      if (ca !== cb) return cb - ca;
      return (b['id'] as string).localeCompare(a['id'] as string);
    });
  }

  return { state, calls, db, resetRoles, listRowsOrdered };
});

export const harness = hoisted;

vi.mock('@/lib/auth/session', () => ({
  getUser: () => {
    harness.calls.getUser += 1;
    return Promise.resolve(harness.state.sessionUser);
  },
  isAuthenticated: () => Promise.resolve(harness.state.sessionUser !== null),
}));

vi.mock('@/lib/db', () => ({
  getPrisma: () => harness.db,
}));

/**
 * A complete stored question containing EVERY privileged and internal column —
 * answer key, rubric canary, option content, stem content, `searchText`, author
 * ids — so projection assertions prove exclusion rather than absence from the
 * fixture.
 */
export function storedQuestion(
  overrides: { id?: string; createdAt?: Date; type?: 'MCQ' | 'CQ'; status?: string } = {},
): Json {
  const id = overrides.id ?? '0c000000-0000-4000-8000-000000000001';
  const createdAt = overrides.createdAt ?? new Date('2026-11-27T09:00:00.000Z');
  const updatedAt = new Date(createdAt.getTime() + 3_600_000);
  const versionId = '1a000000-0000-4000-8000-000000000007';
  return {
    id,
    type: overrides.type ?? 'MCQ',
    status: overrides.status ?? 'DRAFT',
    difficulty: 'MEDIUM',
    createdVia: 'MANUAL',
    marks: 1,
    educationLevelId: EDUCATION_LEVEL_ID,
    subjectId: SUBJECT_ID,
    chapterId: CHAPTER_ID,
    topicId: null,
    subtopicId: null,
    createdAt,
    updatedAt,
    // Not in LIST_SELECT or DETAIL_SELECT: proves the select is honoured.
    internalPrismaField: 'MUST_NEVER_SURVIVE_SELECT',
    tags: [{ questionId: id, tagId: TAG_ID, createdAt }],
    sources: [
      {
        id: '1a000000-0000-4000-8000-000000000009',
        questionId: id,
        sourceType: 'BOARD',
        boardId: BOARD_ID,
        collegeId: null,
        academicYearId: YEAR_ID,
        sourceName: null,
        createdAt,
      },
    ],
    versions: [
      {
        id: versionId,
        questionId: id,
        versionNumber: 1,
        status: 'DRAFT',
        content: {
          format: 'rich_blocks',
          version: 1,
          blocks: [{ type: 'paragraph', data: { text: 'নিচের কোনটি ইনপুট ডিভাইস?', lang: 'bn' } }],
        },
        searchText: 'SEARCH_TEXT_CANARY',
        createdById: SESSION_USER_ID,
        updatedById: SESSION_USER_ID,
        publishedById: null,
        publishedAt: null,
        createdAt,
        updatedAt,
        options: [
          {
            id: '1a000000-0000-4000-8000-000000000010',
            versionId,
            key: 'A',
            content: {
              format: 'rich_blocks',
              version: 1,
              blocks: [{ type: 'paragraph', data: { text: 'কিবোর্ড', lang: 'bn' } }],
            },
            order: 0,
            createdAt,
          },
        ],
        answerKey: {
          id: '1a000000-0000-4000-8000-000000000011',
          versionId,
          mcqCorrectOptionKey: 'A',
          cqRubric: { totalMaxMarks: 10, parts: [{ part: 'c', criteria: 'RUBRIC_CANARY' }] },
          isVerified: true,
          verifiedById: OTHER_STAFF_ID,
          verifiedAt: updatedAt,
          notes: 'INTERNAL_NOTE_CANARY',
          createdAt,
          updatedAt,
        },
        assets: [],
      },
    ],
  };
}

/** Builds `count` stored questions on distinct, descending `createdAt` values. */
export function storedQuestions(count: number): Json[] {
  const base = Date.parse('2026-11-27T00:00:00.000Z');
  return Array.from({ length: count }, (_, index) =>
    storedQuestion({
      id: `0c000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      createdAt: new Date(base + (count - index) * 60_000),
    }),
  );
}

export interface HttpResult {
  readonly status: number;
  readonly headers: Headers;
  readonly text: string;
  readonly body: Json;
}

/** A Next.js 16 route context: `params` is a promise. */
export interface RouteContext {
  readonly params: Promise<{ id: string }>;
}

/**
 * Performs one HTTP-level call against a Route Handler export.
 *
 * The handlers are typed exactly as they are exported, so this helper is what
 * keeps the tests honest about the Next.js 16 signature instead of casting the
 * handler to something convenient.
 */
export async function call(
  handler: (request: Request, context: RouteContext) => Promise<Response>,
  url: string,
  context?: RouteContext,
): Promise<HttpResult> {
  const response = await handler(
    new Request(url, { method: 'GET' }),
    context ?? { params: Promise.resolve({ id: '' }) },
  );
  const text = await response.text();
  let body: Json = {};
  try {
    body = text === '' ? {} : (JSON.parse(text) as Json);
  } catch {
    body = { __unparsable: text };
  }
  return { status: response.status, headers: response.headers, text, body };
}

/** Asserts the mandatory OD-17 §10 cache behaviour on any response. */
export function expectNoStore(result: HttpResult): void {
  expect(result.headers.get('cache-control')).toBe('private, no-store');
}
