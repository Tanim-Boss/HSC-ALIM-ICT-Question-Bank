/**
 * Phase 04E — Staff Question Bank server-side application boundary.
 *
 * Exercises `listStaffQuestions` and `getStaffQuestion` end to end through the
 * real `requireActor()`, `authorize()`, Zod schemas (`listQuestionsInputSchema`,
 * `getQuestionInputSchema`) and query services (`listQuestionsForStaff`,
 * `getQuestionForStaff`), with only the external I/O edges (`@/lib/auth/session`
 * and `@/lib/db`) controlled.
 *
 * Security properties pinned here:
 *   · Unauthenticated callers fail closed with `UNAUTHENTICATED` before any
 *     profile or question query runs.
 *   · Deactivated profiles fail closed with `INACTIVE` before any question query.
 *   · Authenticated `STUDENT` callers fail closed with `FORBIDDEN` before input
 *     validation or database question access (no resource existence disclosure).
 *   · Authorized staff roles (`EDITOR`, `MODERATOR`, `ADMIN`, `SUPER_ADMIN`)
 *     succeed and receive the existing purpose-built DTOs.
 *   · Invalid filters, cursors and question IDs fail with `VALIDATION_FAILED`
 *     through the reused authoring Zod schemas; missing questions return
 *     `NOT_FOUND` only after `question.read_staff` succeeds.
 *   · List responses strip `tags` join objects to `tagIds` and carry NO answer
 *     key, rubric, option, content or `searchText` fields; detail responses
 *     expose privileged answer-key/rubric fields only to authorized staff and
 *     rely on `DETAIL_SELECT` rather than raw Prisma rows.
 *   · Client-supplied actor IDs, roles or extra positional arguments cannot
 *     spoof identity or escalate privileges.
 *   · Unexpected infrastructure errors are sanitized so env secrets, database
 *     URLs, SQL text, answer keys and internal stack frames do not leak.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const SESSION_USER_ID = '6f1c2b8e-4a3d-4e5f-9a7b-1c2d3e4f5a6b';
const SPOOFED_USER_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const QUESTION_ID = '0c000000-0000-4000-8000-000000000001';
const MISSING_QUESTION_ID = '0c000000-0000-4000-8000-00000000beef';
const EDUCATION_LEVEL_ID = '1a000000-0000-4000-8000-000000000001';
const SUBJECT_ID = '1a000000-0000-4000-8000-000000000002';
const CHAPTER_ID = '1a000000-0000-4000-8000-000000000003';
const BOARD_ID = '1a000000-0000-4000-8000-000000000004';
const COLLEGE_ID = '1a000000-0000-4000-8000-000000000005';
const TAG_ID = '1a000000-0000-4000-8000-000000000006';
const VERSION_ID = '1a000000-0000-4000-8000-000000000007';

type MockUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
} | null;

type MockProfile = {
  isActive: boolean;
  roles: { role: string }[];
} | null;

const h = vi.hoisted(() => {
  const state = {
    sessionUser: null as MockUser,
    profile: null as MockProfile,
    listRows: [] as Record<string, unknown>[],
    detailRow: null as Record<string, unknown> | null,
    throwOnQuestionQuery: null as unknown,
    throwOnSession: null as unknown,
  };

  const calls = {
    getUser: 0,
    profileFindUnique: [] as unknown[],
    questionFindMany: [] as Record<string, unknown>[],
    questionFindUnique: [] as Record<string, unknown>[],
  };

  /**
   * Applies a Prisma `select` allowlist recursively so the fake honours the
   * exact `select` contract passed by `listQuestionsForStaff` /
   * `getQuestionForStaff`. If a service ever omitted `select` (returning a raw
   * row), the unfiltered object would be returned and the leak assertions below
   * would fail immediately.
   */
  function projectWithSelect(
    row: Record<string, unknown>,
    select: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    if (select === undefined) return { ...row };
    const projected: Record<string, unknown> = {};
    for (const [key, spec] of Object.entries(select)) {
      if (spec === false || spec === undefined || !(key in row)) continue;
      const value = row[key];
      if (spec === true) {
        projected[key] = value;
        continue;
      }
      if (typeof spec === 'object' && spec !== null) {
        const nestedSelect = (spec as { select?: Record<string, unknown> }).select;
        if (Array.isArray(value)) {
          projected[key] = value.map((item) =>
            typeof item === 'object' && item !== null
              ? projectWithSelect(item as Record<string, unknown>, nestedSelect)
              : item,
          );
        } else if (typeof value === 'object' && value !== null) {
          projected[key] = projectWithSelect(value as Record<string, unknown>, nestedSelect);
        } else {
          projected[key] = value;
        }
      }
    }
    return projected;
  }

  const db = {
    profile: {
      findUnique: vi.fn((args: unknown) => {
        calls.profileFindUnique.push(args);
        return Promise.resolve(state.profile);
      }),
    },
    question: {
      findMany: vi.fn((args: Record<string, unknown>) => {
        if (state.throwOnQuestionQuery !== null) {
          return Promise.reject(state.throwOnQuestionQuery);
        }
        calls.questionFindMany.push(args);
        const select = args['select'] as Record<string, unknown> | undefined;
        const take = typeof args['take'] === 'number' ? args['take'] : state.listRows.length;
        return Promise.resolve(
          state.listRows.slice(0, take).map((row) => projectWithSelect(row, select)),
        );
      }),
      findUnique: vi.fn((args: Record<string, unknown>) => {
        if (state.throwOnQuestionQuery !== null) {
          return Promise.reject(state.throwOnQuestionQuery);
        }
        calls.questionFindUnique.push(args);
        const where = args['where'] as { id?: string } | undefined;
        if (state.detailRow === null || where?.id !== state.detailRow['id']) {
          return Promise.resolve(null);
        }
        const select = args['select'] as Record<string, unknown> | undefined;
        return Promise.resolve(projectWithSelect(state.detailRow, select));
      }),
    },
  };

  function reset() {
    state.sessionUser = {
      id: SESSION_USER_ID,
      email: 'staff@ictatlas.example',
      user_metadata: { full_name: 'Staff Member' },
    };
    state.profile = {
      isActive: true,
      roles: [{ role: 'STUDENT' }, { role: 'EDITOR' }],
    };
    state.listRows = [];
    state.detailRow = null;
    state.throwOnQuestionQuery = null;
    state.throwOnSession = null;
    calls.getUser = 0;
    calls.profileFindUnique.length = 0;
    calls.questionFindMany.length = 0;
    calls.questionFindUnique.length = 0;
    db.profile.findUnique.mockClear();
    db.question.findMany.mockClear();
    db.question.findUnique.mockClear();
  }

  return { state, calls, db, reset };
});

vi.mock('@/lib/auth/session', () => ({
  getUser: () => {
    h.calls.getUser += 1;
    if (h.state.throwOnSession !== null) {
      return Promise.reject(h.state.throwOnSession);
    }
    return Promise.resolve(h.state.sessionUser);
  },
}));

vi.mock('@/lib/db', () => ({
  getPrisma: () => h.db,
}));

const { listStaffQuestions, getStaffQuestion } = await import('@/server/questions/staff-boundary');
const { DomainError, toPublicError } = await import('@/server/shared/errors');
const { AppRole } = await import('@/lib/generated/prisma/enums');
type DomainErrorInstance = InstanceType<typeof DomainError>;

async function expectError(promise: Promise<unknown>): Promise<Error> {
  return promise.then(
    () => {
      throw new Error('expected promise to reject');
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(Error);
      return error as Error;
    },
  );
}

/**
 * Full database-shaped question record containing every privileged and internal
 * column (answer key, rubric, notes, search_text, option content, stem content)
 * so projection tests prove prohibited fields are genuinely excluded rather than
 * absent from the fixture.
 */
function fullStoredQuestion(id = QUESTION_ID) {
  const createdAt = new Date('2026-11-27T09:00:00.000Z');
  const updatedAt = new Date('2026-11-27T10:00:00.000Z');
  return {
    id,
    type: 'MCQ',
    status: 'DRAFT',
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
    internalPrismaField: 'MUST_NEVER_SURVIVE_SELECT',
    tags: [{ questionId: id, tagId: TAG_ID, createdAt }],
    sources: [
      {
        id: '1a000000-0000-4000-8000-000000000009',
        questionId: id,
        sourceType: 'BOARD',
        boardId: BOARD_ID,
        collegeId: null,
        academicYearId: null,
        sourceName: null,
        createdAt,
      },
    ],
    versions: [
      {
        id: VERSION_ID,
        questionId: id,
        versionNumber: 1,
        status: 'DRAFT',
        content: {
          format: 'rich_blocks',
          version: 1,
          blocks: [{ type: 'paragraph', data: { text: 'নিচের কোনটি ইনপুট ডিভাইস?', lang: 'bn' } }],
        },
        searchText: 'নিচের কোনটি ইনপুট ডিভাইস? কিবোর্ড মনিটর',
        createdById: SESSION_USER_ID,
        updatedById: SESSION_USER_ID,
        publishedById: null,
        publishedAt: null,
        createdAt,
        updatedAt,
        options: [
          {
            id: '1a000000-0000-4000-8000-000000000010',
            versionId: VERSION_ID,
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
          versionId: VERSION_ID,
          mcqCorrectOptionKey: 'A',
          cqRubric: {
            totalMaxMarks: 10,
            parts: [{ part: 'c', criteria: 'SECRET_RUBRIC_CANARY' }],
          },
          isVerified: true,
          verifiedById: SPOOFED_USER_ID,
          verifiedAt: updatedAt,
          notes: 'INTERNAL_MARKER_NOTE_CANARY',
          createdAt,
          updatedAt,
        },
        assets: [],
      },
    ],
  };
}

beforeEach(() => {
  h.reset();
  const stored = fullStoredQuestion();
  h.state.listRows = [stored];
  h.state.detailRow = stored;
});

describe('unauthenticated and inactive callers (deny by default)', () => {
  it('refuses listStaffQuestions with UNAUTHENTICATED when there is no verified session', async () => {
    h.state.sessionUser = null;

    await expect(listStaffQuestions()).rejects.toMatchObject({
      name: 'DomainError',
      code: 'UNAUTHENTICATED',
    });
    expect(h.calls.profileFindUnique).toHaveLength(0);
    expect(h.calls.questionFindMany).toHaveLength(0);
  });

  it('refuses getStaffQuestion with UNAUTHENTICATED before inspecting questionId or querying', async () => {
    h.state.sessionUser = null;

    // Even with a malformed questionId, unauthenticated callers receive
    // UNAUTHENTICATED — never VALIDATION_FAILED or NOT_FOUND.
    await expect(getStaffQuestion({ questionId: 'not-even-a-uuid' })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(h.calls.profileFindUnique).toHaveLength(0);
    expect(h.calls.questionFindUnique).toHaveLength(0);
  });

  it('refuses a non-UUID session subject as UNAUTHENTICATED', async () => {
    h.state.sessionUser = { id: 'not-a-uuid', email: 'staff@ictatlas.example' };

    await expect(listStaffQuestions()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(h.calls.profileFindUnique).toHaveLength(0);
    expect(h.calls.questionFindMany).toHaveLength(0);
  });

  it('refuses a deactivated staff profile with INACTIVE before running any question query', async () => {
    h.state.profile = {
      isActive: false,
      roles: [{ role: AppRole.ADMIN }],
    };

    await expect(listStaffQuestions()).rejects.toMatchObject({ code: 'INACTIVE' });
    await expect(getStaffQuestion({ questionId: QUESTION_ID })).rejects.toMatchObject({
      code: 'INACTIVE',
    });
    expect(h.calls.questionFindMany).toHaveLength(0);
    expect(h.calls.questionFindUnique).toHaveLength(0);
  });
});

describe('authenticated STUDENT caller and authorization enforcement', () => {
  beforeEach(() => {
    h.state.profile = {
      isActive: true,
      roles: [{ role: AppRole.STUDENT }],
    };
  });

  it('refuses listStaffQuestions for a STUDENT with FORBIDDEN and executes no question query', async () => {
    await expect(listStaffQuestions()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(h.calls.questionFindMany).toHaveLength(0);
  });

  it('refuses getStaffQuestion for a STUDENT with FORBIDDEN without disclosing whether the question exists', async () => {
    const existingErr = await getStaffQuestion({ questionId: QUESTION_ID }).catch(
      (e: unknown) => e,
    );
    const missingErr = await getStaffQuestion({ questionId: MISSING_QUESTION_ID }).catch(
      (e: unknown) => e,
    );

    expect(existingErr).toBeInstanceOf(DomainError);
    expect(missingErr).toBeInstanceOf(DomainError);
    expect(toPublicError(existingErr as DomainErrorInstance)).toEqual(
      toPublicError(missingErr as DomainErrorInstance),
    );
    expect((existingErr as DomainErrorInstance).code).toBe('FORBIDDEN');
    expect(h.calls.questionFindUnique).toHaveLength(0);
  });

  it('enforces authorization BEFORE input validation so invalid STUDENT inputs still return FORBIDDEN', async () => {
    await expect(listStaffQuestions({ limit: 9999 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(getStaffQuestion({ questionId: 'bad-id' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(h.calls.questionFindMany).toHaveLength(0);
    expect(h.calls.questionFindUnique).toHaveLength(0);
  });

  it('refuses an active profile that holds zero roles (deny by default)', async () => {
    h.state.profile = { isActive: true, roles: [] };

    await expect(listStaffQuestions()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(getStaffQuestion({ questionId: QUESTION_ID })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('authorized staff callers across all permitted roles', () => {
  it.each([AppRole.EDITOR, AppRole.MODERATOR, AppRole.ADMIN, AppRole.SUPER_ADMIN])(
    'allows %s to list and retrieve staff questions',
    async (role) => {
      h.state.profile = { isActive: true, roles: [{ role }] };

      const page = await listStaffQuestions({
        boardId: BOARD_ID,
        collegeId: COLLEGE_ID,
        q: 'কিবোর্ড',
        limit: 10,
      });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.id).toBe(QUESTION_ID);
      expect(page.nextCursor).toBeNull();

      const detail = await getStaffQuestion({ questionId: QUESTION_ID });
      expect(detail.id).toBe(QUESTION_ID);
      expect(detail.versions[0]?.answerKey?.mcqCorrectOptionKey).toBe('A');
    },
  );

  it('forwards independent board + college filters, search tokens and keyset pagination to Prisma', async () => {
    const secondId = '0c000000-0000-4000-8000-000000000002';
    h.state.listRows = [fullStoredQuestion(QUESTION_ID), fullStoredQuestion(secondId)];

    const page = await listStaffQuestions({
      boardId: BOARD_ID,
      collegeId: COLLEGE_ID,
      chapterId: CHAPTER_ID,
      q: 'HTML ওয়েব',
      limit: 1,
    });

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(h.calls.questionFindMany).toHaveLength(1);
    expect(h.calls.questionFindMany[0]).toMatchObject({
      take: 2,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      where: {
        AND: [
          { chapterId: CHAPTER_ID },
          { sources: { some: { boardId: BOARD_ID } } },
          { sources: { some: { collegeId: COLLEGE_ID } } },
          {
            versions: {
              some: {
                AND: [{ searchText: { contains: 'html' } }, { searchText: { contains: 'ওয়েব' } }],
              },
            },
          },
        ],
      },
    });
  });

  it('returns NOT_FOUND with field="questionId" when an authorized staff caller requests an unknown question', async () => {
    await expect(getStaffQuestion({ questionId: MISSING_QUESTION_ID })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      field: 'questionId',
    });
  });
});

describe('input validation via reused authoring Zod schemas', () => {
  it.each([
    { label: 'limit above PAGE_SIZE_MAX (50)', badInput: { limit: 51 }, field: 'limit' },
    { label: 'limit of 0', badInput: { limit: 0 }, field: 'limit' },
    { label: 'fractional limit', badInput: { limit: 2.5 }, field: 'limit' },
    { label: 'non-UUID chapterId', badInput: { chapterId: 'chapter-1' }, field: 'chapterId' },
    { label: 'non-UUID boardId', badInput: { boardId: 'dhaka' }, field: 'boardId' },
    { label: 'non-UUID collegeId', badInput: { collegeId: 'notre-dame' }, field: 'collegeId' },
    { label: 'invalid QuestionStatus', badInput: { status: 'PENDING' }, field: 'status' },
    { label: 'invalid QuestionType', badInput: { type: 'ESSAY' }, field: 'type' },
    { label: 'blank search query', badInput: { q: '   ' }, field: 'q' },
    { label: 'search query over 120 chars', badInput: { q: 'ক'.repeat(121) }, field: 'q' },
    { label: 'search query with only LIKE wildcards', badInput: { q: '%%%___' }, field: 'q' },
    { label: 'forged cursor', badInput: { cursor: 'not-a-valid-cursor' }, field: 'cursor' },
  ])(
    'listStaffQuestions rejects $label with VALIDATION_FAILED ($field)',
    async ({ badInput, field }) => {
      await expect(listStaffQuestions(badInput as never)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        field,
      });
      expect(h.calls.questionFindMany).toHaveLength(0);
    },
  );

  it.each([
    { label: 'non-UUID questionId', badInput: { questionId: '123' }, field: 'questionId' },
    { label: 'empty questionId', badInput: { questionId: '' }, field: 'questionId' },
    { label: 'missing questionId', badInput: {}, field: 'questionId' },
    { label: 'null input', badInput: null, field: undefined },
    {
      label: 'primitive input',
      badInput: '0c000000-0000-4000-8000-000000000001',
      field: undefined,
    },
  ])('getStaffQuestion rejects $label with VALIDATION_FAILED', async ({ badInput, field }) => {
    await expect(getStaffQuestion(badInput as never)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      ...(field === undefined ? {} : { field }),
    });
    expect(h.calls.questionFindUnique).toHaveLength(0);
  });
});

describe('DTO projections and absence of prohibited fields', () => {
  it('POSITIVE CONTROL: the backing fixture contains answer key, rubric, option, content and internal fields', () => {
    const raw = JSON.stringify(h.state.listRows[0]);
    expect(raw).toContain('mcqCorrectOptionKey');
    expect(raw).toContain('SECRET_RUBRIC_CANARY');
    expect(raw).toContain('INTERNAL_MARKER_NOTE_CANARY');
    expect(raw).toContain('MUST_NEVER_SURVIVE_SELECT');
    expect(raw).toContain('searchText');
  });

  it('listStaffQuestions returns StaffQuestionPage and excludes answer keys, rubrics, options, content and searchText', async () => {
    const page = await listStaffQuestions();
    const item = page.items[0];
    expect(item).toBeDefined();

    expect(Object.keys(item ?? {}).sort()).toEqual(
      [
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
      ].sort(),
    );
    expect(item?.tagIds).toEqual([TAG_ID]);
    expect(Object.keys(item?.versions[0] ?? {}).sort()).toEqual([
      'id',
      'status',
      'updatedAt',
      'versionNumber',
    ]);

    const serialized = JSON.stringify(page);
    expect(serialized).not.toMatch(
      /answerKey|mcqCorrectOptionKey|cqRubric|SECRET_RUBRIC_CANARY|INTERNAL_MARKER_NOTE_CANARY|MUST_NEVER_SURVIVE_SELECT|searchText|"options"|"content"|blocks/,
    );
  });

  it('getStaffQuestion returns only the allowlisted DETAIL_SELECT shape — never unprojected Prisma columns', async () => {
    const detail = await getStaffQuestion({ questionId: QUESTION_ID });

    expect(detail.id).toBe(QUESTION_ID);
    expect(detail.versions).toHaveLength(1);
    expect(detail.versions[0]?.answerKey).toEqual({
      mcqCorrectOptionKey: 'A',
      cqRubric: {
        totalMaxMarks: 10,
        parts: [{ part: 'c', criteria: 'SECRET_RUBRIC_CANARY' }],
      },
      isVerified: true,
      verifiedById: SPOOFED_USER_ID,
      verifiedAt: new Date('2026-11-27T10:00:00.000Z'),
    });

    const serialized = JSON.stringify(detail);
    // Unselected columns on Question, QuestionVersion, QuestionOption and AnswerKey
    // (including AnswerKey.notes and QuestionVersion.searchText) do not leak.
    expect(serialized).not.toContain('MUST_NEVER_SURVIVE_SELECT');
    expect(serialized).not.toContain('INTERNAL_MARKER_NOTE_CANARY');
    expect(serialized).not.toContain('searchText');
  });
});

describe('no actor or role spoofing through caller input', () => {
  it('a STUDENT cannot escalate privileges by passing actor, userId, roles or permissions in the input object', async () => {
    h.state.profile = {
      isActive: true,
      roles: [{ role: AppRole.STUDENT }],
    };

    const spoofedListInput = {
      actor: { userId: SPOOFED_USER_ID, roles: new Set([AppRole.SUPER_ADMIN]) },
      actorId: SPOOFED_USER_ID,
      userId: SPOOFED_USER_ID,
      role: AppRole.SUPER_ADMIN,
      roles: [AppRole.SUPER_ADMIN],
      permissions: ['question.read_staff'],
    };

    await expect(listStaffQuestions(spoofedListInput as never)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      getStaffQuestion({
        questionId: QUESTION_ID,
        actor: { userId: SPOOFED_USER_ID, roles: new Set([AppRole.SUPER_ADMIN]) },
        role: AppRole.SUPER_ADMIN,
      } as never),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    expect(h.calls.profileFindUnique).toHaveLength(2);
    // Profile lookup always used the verified Supabase user ID, never SPOOFED_USER_ID.
    for (const call of h.calls.profileFindUnique) {
      expect(JSON.stringify(call)).toContain(SESSION_USER_ID);
      expect(JSON.stringify(call)).not.toContain(SPOOFED_USER_ID);
    }
    expect(h.calls.questionFindMany).toHaveLength(0);
    expect(h.calls.questionFindUnique).toHaveLength(0);
  });

  it('a STUDENT passing a forged Actor as a first positional argument (domain signature confusion) is still FORBIDDEN', async () => {
    h.state.profile = {
      isActive: true,
      roles: [{ role: AppRole.STUDENT }],
    };
    const forgedActor = { userId: SPOOFED_USER_ID, roles: new Set([AppRole.SUPER_ADMIN]) };
    const untypedList = listStaffQuestions as unknown as (...a: unknown[]) => Promise<unknown>;
    const untypedGet = getStaffQuestion as unknown as (...a: unknown[]) => Promise<unknown>;

    await expect(untypedList(forgedActor, {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(untypedGet(forgedActor, { questionId: QUESTION_ID })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(h.calls.questionFindMany).toHaveLength(0);
    expect(h.calls.questionFindUnique).toHaveLength(0);
  });

  it('even for authorized staff, strict schemas reject extra actor/role fields or extra arguments as VALIDATION_FAILED', async () => {
    await expect(listStaffQuestions({ userId: SPOOFED_USER_ID } as never)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(
      getStaffQuestion({ questionId: QUESTION_ID, roles: ['SUPER_ADMIN'] } as never),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const untypedList = listStaffQuestions as unknown as (...a: unknown[]) => Promise<unknown>;
    const untypedGet = getStaffQuestion as unknown as (...a: unknown[]) => Promise<unknown>;
    await expect(untypedList({}, { extra: true })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(untypedGet({ questionId: QUESTION_ID }, { extra: true })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(untypedGet()).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('ignores role claims placed inside Supabase user_metadata (roles come only from user_roles)', async () => {
    h.state.sessionUser = {
      id: SESSION_USER_ID,
      email: 'student@ictatlas.example',
      user_metadata: {
        role: 'SUPER_ADMIN',
        roles: ['SUPER_ADMIN', 'EDITOR'],
        permissions: ['question.read_staff'],
      },
    };
    h.state.profile = {
      isActive: true,
      roles: [{ role: AppRole.STUDENT }],
    };

    await expect(listStaffQuestions()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(h.calls.questionFindMany).toHaveLength(0);
  });
});

describe('error sanitization — no secret, database or stack-trace leakage', () => {
  it('sanitizes unexpected database/driver failures so connection URLs, SQL, keys and causes never escape', async () => {
    const rawDriverError = new Error(
      'connection to postgresql://postgres:super-secret-pw@db.internal:5432/ict failed while reading mcq_correct_option_key="A" and SUPABASE_SERVICE_ROLE_KEY=eyJ-secret',
    );
    (rawDriverError as Error & { cause?: unknown }).cause = {
      sql: 'SELECT * FROM answer_keys WHERE mcq_correct_option_key = $1',
      detail: 'internal pg trace /app/node_modules/pg/lib/client.js:542:11',
    };
    h.state.throwOnQuestionQuery = rawDriverError;

    const listFailure = await expectError(listStaffQuestions());
    const detailFailure = await expectError(getStaffQuestion({ questionId: QUESTION_ID }));

    for (const failure of [listFailure, detailFailure]) {
      expect(failure).toBeInstanceOf(Error);
      expect(failure).not.toBeInstanceOf(DomainError);
      expect(failure.message).toBe('The request could not be completed. Please try again.');
      expect((failure as Error & { cause?: unknown }).cause).toBeUndefined();

      const serialized = `${failure.name} ${failure.message} ${failure.stack ?? ''} ${JSON.stringify(failure)}`;
      expect(serialized).not.toMatch(
        /postgresql:\/\/|super-secret-pw|SUPABASE_SERVICE_ROLE_KEY|eyJ-secret|mcq_correct_option_key|answer_keys|node_modules\/pg/i,
      );
    }
  });

  it('sanitizes unexpected session/env failures (e.g. EnvValidationError) without leaking env details', async () => {
    h.state.throwOnSession = new Error(
      'Invalid server environment variables: DATABASE_URL=postgresql://admin:pw@host/db',
    );

    const failure = await expectError(listStaffQuestions());
    expect(failure.message).toBe('The request could not be completed. Please try again.');
    expect(`${failure.message} ${failure.stack ?? ''}`).not.toMatch(/DATABASE_URL|postgresql:\/\//);
  });
});
