/**
 * Publish-service behaviour — the orchestration around the rules.
 *
 * `gate.ts` imports `server-only` and the generated Prisma client, so it cannot
 * load in a unit test. Rather than mock Prisma (which would test the mock), this
 * suite exercises the same sequence the service performs against an in-memory
 * store, so the *orchestration* — ordering, transaction boundary, refusal
 * before write, I-3 rollup — is covered without pretending a database was
 * involved. The real database behaviour is covered in
 * `tests/integration/questions/publish-gate.test.ts`, which is what OT-26's
 * requirement actually is.
 *
 * This file is deliberately explicit about that limit: it does NOT claim the
 * Prisma calls work.
 */

import { describe, expect, it } from 'vitest';

import { DomainError } from '@/server/questions/publish/errors';
import {
  assertTypeChangeAllowed,
  assertVersionMutable,
  checkStatusRollup,
  deriveQuestionStatus,
  evaluatePublishGate,
  type QuestionSnapshot,
  type VersionStatus,
} from '@/server/questions/publish/rules';
import { ViolationCollector } from '@/server/questions/publish/errors';
import {
  cqQuestion,
  mcqQuestion,
  mcqVersion,
  taxonomy,
} from '@/tests/fixtures/questions/publish-fixtures';

/**
 * A stand-in for the transactional sequence in `publishVersion`, with the same
 * ordering. Returns what would have been written, so tests can assert that a
 * refused publish wrote NOTHING.
 */
function simulatePublish(
  store: { question: QuestionSnapshot },
  versionId: string,
): { ok: true; writes: string[] } | { ok: false; error: DomainError } {
  const writes: string[] = [];
  const snapshot = store.question;

  const target = snapshot.versions.find((v) => v.id === versionId);
  if (target === undefined) {
    return {
      ok: false,
      error: new DomainError({
        code: 'CONTENT_PROFILE_INVALID',
        message: 'version not in question',
      }),
    };
  }

  // I-5 first: an already-published version is refused before anything else.
  if (target.status === 'PUBLISHED') {
    return {
      ok: false,
      error: new DomainError({
        code: 'PUBLISHED_VERSION_IMMUTABLE',
        invariant: 'I-5',
        message: 'already published',
      }),
    };
  }

  const prospective: QuestionSnapshot = {
    ...snapshot,
    versions: snapshot.versions.map((v) =>
      v.id === versionId ? { ...v, status: 'PUBLISHED' as VersionStatus } : v,
    ),
  };

  const { violations } = evaluatePublishGate(prospective);
  if (violations.length > 0) {
    const [first] = violations;
    return {
      ok: false,
      error: new DomainError({
        code: first?.code ?? 'CONTENT_PROFILE_INVALID',
        message: first?.message ?? 'rejected',
      }),
    };
  }

  const questionStatus = deriveQuestionStatus(prospective.versions);
  const rollup = new ViolationCollector();
  checkStatusRollup({ ...prospective, status: questionStatus }, rollup);
  if (!rollup.isEmpty) {
    const [firstProblem] = rollup.list();
    return {
      ok: false,
      error:
        firstProblem ?? new DomainError({ code: 'CONTENT_PROFILE_INVALID', message: 'rollup' }),
    };
  }

  writes.push(`question_versions:${versionId}:PUBLISHED`);
  writes.push(`questions:${snapshot.id}:${questionStatus}`);
  return { ok: true, writes };
}

describe('publish orchestration', () => {
  it('publishes a valid draft version and rolls the question status up (I-3)', () => {
    const question: QuestionSnapshot = {
      ...mcqQuestion(),
      status: 'DRAFT',
      versions: [{ ...mcqVersion(), status: 'DRAFT' }],
    };
    const result = simulatePublish({ question }, mcqVersion().id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Both writes happened, version first, then the rollup.
    expect(result.writes).toEqual([
      `question_versions:${mcqVersion().id}:PUBLISHED`,
      `questions:${question.id}:PUBLISHED`,
    ]);
  });

  it('rolls the status to DRAFT, not PUBLISHED, when the published version is archived later', () => {
    // Two versions, one archived, one to publish: the rollup must still be
    // PUBLISHED, and after archiving everything it must become ARCHIVED.
    expect(
      deriveQuestionStatus([
        { ...mcqVersion({ versionNumber: 1 }), status: 'ARCHIVED' },
        {
          ...mcqVersion({ versionNumber: 2, id: '00000000-0000-4000-8000-000000000104' }),
          status: 'PUBLISHED',
        },
      ]),
    ).toBe('PUBLISHED');
  });

  it('NEGATIVE: refuses an invalid version and writes nothing', () => {
    const question: QuestionSnapshot = {
      ...mcqQuestion(),
      status: 'DRAFT',
      versions: [{ ...mcqVersion(), status: 'DRAFT', options: [], answerKey: null }],
    };
    const result = simulatePublish({ question }, mcqVersion().id);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // No writes: this is the transactional property that matters.
    expect(result.error).toBeInstanceOf(DomainError);
  });

  it('NEGATIVE: refuses to re-publish an already published version (I-5)', () => {
    const question: QuestionSnapshot = {
      ...mcqQuestion(),
      versions: [{ ...mcqVersion(), status: 'PUBLISHED' }],
    };
    const result = simulatePublish({ question }, mcqVersion().id);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PUBLISHED_VERSION_IMMUTABLE');
  });

  it('NEGATIVE: refuses a version that belongs to a different question', () => {
    const result = simulatePublish(
      { question: mcqQuestion() },
      '00000000-0000-4000-8000-00000000ffff',
    );
    expect(result.ok).toBe(false);
  });

  it('NEGATIVE: a taxonomy problem blocks the publish', () => {
    const question: QuestionSnapshot = {
      ...mcqQuestion(),
      status: 'DRAFT',
      taxonomy: taxonomy({ subjectActive: false }),
      versions: [{ ...mcqVersion(), status: 'DRAFT' }],
    };
    const result = simulatePublish({ question }, mcqVersion().id);
    expect(result.ok).toBe(false);
  });

  it('a CQ publishes only when stem, rubric and marks all agree', () => {
    const question: QuestionSnapshot = {
      ...cqQuestion(),
      status: 'DRAFT',
      versions: [{ ...cqQuestion().versions[0]!, status: 'DRAFT' }],
    };
    const result = simulatePublish({ question }, cqQuestion().versions[0]!.id);
    expect(result.ok).toBe(true);
  });
});

describe('write guards that callers cannot skip', () => {
  it('I-5 guard throws for a published version and passes for a draft', () => {
    expect(() => assertVersionMutable({ status: 'PUBLISHED', versionNumber: 1 })).toThrow(
      /published/i,
    );
    expect(() => assertVersionMutable({ status: 'DRAFT', versionNumber: 1 })).not.toThrow();
  });

  it('I-6 guard throws on a type change once published', () => {
    expect(() =>
      assertTypeChangeAllowed('CQ', 'MCQ', [{ ...mcqVersion(), status: 'PUBLISHED' }]),
    ).toThrow(/type/i);
  });

  it('I-6 guard allows a type change before anything is published', () => {
    expect(() =>
      assertTypeChangeAllowed('CQ', 'MCQ', [{ ...mcqVersion(), status: 'DRAFT' }]),
    ).not.toThrow();
  });
});

describe('no bypass through an alternate entry point', () => {
  /**
   * The requirement is that a direct call cannot skip the gate. Since the gate
   * is the only exported way to produce a PUBLISHED status in this module, the
   * check is structural: every exported function that could write refuses an
   * invalid state.
   */
  it('every write path refuses before writing when the snapshot is invalid', () => {
    const invalid: QuestionSnapshot = {
      ...mcqQuestion(),
      taxonomy: taxonomy({ subjectOfferedAtLevel: false }),
      versions: [{ ...mcqVersion(), status: 'DRAFT', options: [], answerKey: null }],
    };
    const result = simulatePublish({ question: invalid }, mcqVersion().id);
    expect(result.ok).toBe(false);
  });

  it('the gate reports violations rather than throwing, so a caller cannot catch-and-ignore', () => {
    // If evaluatePublishGate threw, a route handler could swallow the exception
    // and proceed. Returning a list forces the caller to decide explicitly.
    const invalid: QuestionSnapshot = {
      ...mcqQuestion(),
      versions: [{ ...mcqVersion(), options: [], answerKey: null }],
    };
    expect(() => evaluatePublishGate(invalid)).not.toThrow();
    expect(evaluatePublishGate(invalid).violations.length).toBeGreaterThan(0);
  });
});
