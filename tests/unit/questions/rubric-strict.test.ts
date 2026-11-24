/**
 * Strict §7.7 rubric validation.
 *
 * The defect: `parseRubric` kept only `{part, maxMarks, criteria:[{marks}]}` and
 * silently discarded `version`, `criteria[].description`, `criteria[].kind`,
 * `expectedAnswer` and `notes`. A marking guide could therefore be quietly
 * reduced to a different document while every check still passed.
 *
 * These tests cover four things the instruction asked for explicitly:
 *   1. valid documents remain ACCEPTED, and every approved field is PRESERVED;
 *   2. unknown fields are REJECTED, at every level;
 *   3. nested unknown fields cannot be silently discarded;
 *   4. the structured error reaches the application boundary (the gate), rather
 *      than being swallowed by a returning-null parser.
 */

import { describe, expect, it } from 'vitest';

import {
  evaluatePublishGate,
  parseRubric,
  parseRubricStrict,
  RUBRIC_CRITERION_KINDS,
  type QuestionSnapshot,
} from '@/server/questions/publish/rules';
import { cqRubric, cqVersion, taxonomy } from '@/tests/fixtures/questions/publish-fixtures';

/** A structurally valid rubric, deep-cloned so a case can mutate it freely. */
function validRubric(): Record<string, unknown> {
  return structuredClone(cqRubric()) as Record<string, unknown>;
}

function parts(r: Record<string, unknown>): Record<string, unknown>[] {
  return r['parts'] as Record<string, unknown>[];
}

function criteria(part: Record<string, unknown>): Record<string, unknown>[] {
  return part['criteria'] as Record<string, unknown>[];
}

describe('valid rubrics are accepted and every approved §7.7 field is preserved', () => {
  it('accepts the full approved shape', () => {
    const result = parseRubricStrict(validRubric());
    expect(result.ok).toBe(true);
  });

  it('preserves version, totalMaxMarks and part order', () => {
    const result = parseRubricStrict(validRubric());
    if (!result.ok) throw new Error('expected ok');
    expect(result.rubric.version).toBe(1);
    expect(result.rubric.totalMaxMarks).toBe(10);
    expect(result.rubric.parts.map((p) => p.part)).toEqual(['ক', 'খ', 'গ', 'ঘ']);
  });

  it('preserves criteria description and kind — fields the old parser dropped', () => {
    const result = parseRubricStrict(validRubric());
    if (!result.ok) throw new Error('expected ok');
    const first = result.rubric.parts[0]?.criteria[0];
    expect(first?.description).toBe('সংজ্ঞা');
    expect(first?.kind).toBe('knowledge');
  });

  it('preserves optional expectedAnswer and notes when present', () => {
    const result = parseRubricStrict(validRubric());
    if (!result.ok) throw new Error('expected ok');
    expect(result.rubric.parts[0]?.expectedAnswer).toContain('বাইনারি');
    expect(result.rubric.parts[2]?.notes).toContain('ভাগশেষ');
  });

  it('omits optional fields when absent rather than inventing them', () => {
    const r = validRubric();
    for (const p of parts(r)) {
      delete p['expectedAnswer'];
      delete p['notes'];
    }
    const result = parseRubricStrict(r);
    if (!result.ok) throw new Error('expected ok');
    expect(result.rubric.parts[0]).not.toHaveProperty('expectedAnswer');
    expect(result.rubric.parts[0]).not.toHaveProperty('notes');
  });

  it('accepts a criterion with no kind (optional per §7.7)', () => {
    const r = validRubric();
    delete criteria(parts(r)[0] as Record<string, unknown>)[0]!['kind'];
    expect(parseRubricStrict(r).ok).toBe(true);
  });

  it.each([...RUBRIC_CRITERION_KINDS])('accepts the approved kind "%s"', (kind) => {
    const r = validRubric();
    criteria(parts(r)[0] as Record<string, unknown>)[0]!['kind'] = kind;
    expect(parseRubricStrict(r).ok).toBe(true);
  });
});

describe('unknown fields are rejected at every level', () => {
  it('rejects an unknown ROOT field', () => {
    const r = validRubric();
    r['markingScheme'] = 'B';
    const result = parseRubricStrict(r);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.path).toBe('$.markingScheme');
    expect(result.issue.message).toContain('markingScheme');
  });

  it('rejects an unknown PART field', () => {
    const r = validRubric();
    parts(r)[1]!['weighting'] = 2;
    const result = parseRubricStrict(r);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.path).toBe('$.parts[1].weighting');
  });

  it('rejects an unknown NESTED criterion field — the silent-discard case', () => {
    const r = validRubric();
    criteria(parts(r)[2] as Record<string, unknown>)[1]!['bonus'] = true;
    const result = parseRubricStrict(r);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.path).toBe('$.parts[2].criteria[1].bonus');
  });

  it('a nested unknown field cannot be silently discarded', () => {
    // The precise old behaviour: extra fields vanished and parsing succeeded.
    const r = validRubric();
    criteria(parts(r)[0] as Record<string, unknown>)[0]!['hiddenMarks'] = 99;
    const strict = parseRubricStrict(r);
    const lenient = parseRubric(r);
    expect(strict.ok).toBe(false);
    // The lenient wrapper is a thin facade over the strict parser, so it must
    // reject too — the two cannot drift apart the way the two denylists did.
    expect(lenient).toBeNull();
  });

  it('rejects a typo of an approved field rather than ignoring it', () => {
    const r = validRubric();
    const p = parts(r)[0] as Record<string, unknown>;
    p['expectedanswer'] = p['expectedAnswer'];
    const result = parseRubricStrict(r);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.path).toBe('$.parts[0].expectedanswer');
  });

  it('reports the FIRST unknown field with an addressable path', () => {
    const r = validRubric();
    r['alpha'] = 1;
    r['beta'] = 2;
    const result = parseRubricStrict(r);
    if (result.ok) throw new Error('expected failure');
    expect(result.issue.path).toBe('$.alpha');
    expect(result.issue.message).toContain('alpha');
    expect(result.issue.message).toContain('beta');
  });
});

describe('malformed input is rejected with a structured issue, not a throw', () => {
  it.each([
    ['null', null, '$'],
    ['a string', 'cq_rubric', '$'],
    ['an array', [], '$'],
  ])('rejects %s', (_label, value, path) => {
    const result = parseRubricStrict(value);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.path).toBe(path);
  });

  it('rejects a wrong format literal', () => {
    const r = validRubric();
    r['format'] = 'rich_blocks';
    const result = parseRubricStrict(r);
    if (result.ok) throw new Error('expected failure');
    expect(result.issue.path).toBe('$.format');
  });

  it('rejects a missing version with a path', () => {
    const r = validRubric();
    delete r['version'];
    const result = parseRubricStrict(r);
    if (result.ok) throw new Error('expected failure');
    expect(result.issue.path).toBe('$.version');
  });

  it('rejects an unsupported version rather than falling back to v1 (§7.8)', () => {
    const r = validRubric();
    r['version'] = 2;
    const result = parseRubricStrict(r);
    if (result.ok) throw new Error('expected failure');
    expect(result.issue.path).toBe('$.version');
    expect(result.issue.message).toContain('not supported');
  });

  it('rejects a non-integer totalMaxMarks', () => {
    const r = validRubric();
    r['totalMaxMarks'] = 9.5;
    const result = parseRubricStrict(r);
    if (result.ok) throw new Error('expected failure');
    expect(result.issue.path).toBe('$.totalMaxMarks');
  });

  it('rejects parts that are not an array', () => {
    const r = validRubric();
    r['parts'] = 'nope';
    const result = parseRubricStrict(r);
    if (result.ok) throw new Error('expected failure');
    expect(result.issue.path).toBe('$.parts');
  });

  it('rejects a part that is not an object', () => {
    const r = validRubric();
    (r['parts'] as unknown[])[1] = 'খ';
    const result = parseRubricStrict(r);
    if (result.ok) throw new Error('expected failure');
    expect(result.issue.path).toBe('$.parts[1]');
  });

  it('rejects a criterion with no description', () => {
    const r = validRubric();
    delete criteria(parts(r)[0] as Record<string, unknown>)[0]!['description'];
    const result = parseRubricStrict(r);
    if (result.ok) throw new Error('expected failure');
    expect(result.issue.path).toBe('$.parts[0].criteria[0].description');
  });

  it('rejects a non-integer criterion mark', () => {
    const r = validRubric();
    criteria(parts(r)[0] as Record<string, unknown>)[0]!['marks'] = 0.5;
    const result = parseRubricStrict(r);
    if (result.ok) throw new Error('expected failure');
    expect(result.issue.path).toBe('$.parts[0].criteria[0].marks');
  });

  it('rejects an unapproved kind value', () => {
    const r = validRubric();
    criteria(parts(r)[0] as Record<string, unknown>)[0]!['kind'] = 'evaluation';
    const result = parseRubricStrict(r);
    if (result.ok) throw new Error('expected failure');
    expect(result.issue.path).toBe('$.parts[0].criteria[0].kind');
    expect(result.issue.message).toContain('knowledge');
  });

  it('rejects a non-string expectedAnswer', () => {
    const r = validRubric();
    parts(r)[0]!['expectedAnswer'] = 42;
    const result = parseRubricStrict(r);
    if (result.ok) throw new Error('expected failure');
    expect(result.issue.path).toBe('$.parts[0].expectedAnswer');
  });

  it('rejects a non-string notes', () => {
    const r = validRubric();
    parts(r)[2]!['notes'] = ['a'];
    const result = parseRubricStrict(r);
    if (result.ok) throw new Error('expected failure');
    expect(result.issue.path).toBe('$.parts[2].notes');
  });
});

describe('boundary cases from §7.12 and §7.7', () => {
  it('accepts exactly 6 criteria in a part (§7.12 upper bound)', () => {
    const r = validRubric();
    const part = parts(r)[0] as Record<string, unknown>;
    part['criteria'] = Array.from({ length: 6 }, () => ({ description: 'x', marks: 1 }));
    expect(parseRubricStrict(r).ok).toBe(true);
  });

  it('rejects 7 criteria in a part (§7.12 says 6)', () => {
    const r = validRubric();
    const part = parts(r)[0] as Record<string, unknown>;
    part['criteria'] = Array.from({ length: 7 }, () => ({ description: 'x', marks: 1 }));
    const result = parseRubricStrict(r);
    if (result.ok) throw new Error('expected failure');
    expect(result.issue.path).toBe('$.parts[0].criteria');
    expect(result.issue.message).toContain('at most 6');
  });

  it('rejects a part with zero criteria', () => {
    const r = validRubric();
    parts(r)[0]!['criteria'] = [];
    const result = parseRubricStrict(r);
    if (result.ok) throw new Error('expected failure');
    expect(result.issue.path).toBe('$.parts[0].criteria');
  });

  it('accepts zero parts at the shape level — part COUNT is I-7’s job', () => {
    // Deliberately not duplicated here. §7.7 says "exactly 4", but the parts must
    // also match the STEM, which is a cross-document fact. `checkRubricMatchesStem`
    // reports it as I-7. Two enforcers would produce two codes for one problem.
    const r = validRubric();
    r['parts'] = [];
    expect(parseRubricStrict(r).ok).toBe(true);
  });
});

describe('the structured error reaches the application boundary', () => {
  const cqQuestion = (rubric: unknown): QuestionSnapshot => ({
    id: '00000000-0000-4000-8000-000000000501',
    type: 'CQ',
    status: 'DRAFT',
    marks: 10,
    taxonomy: taxonomy(),
    versions: [
      {
        ...cqVersion(),
        answerKey: { mcqCorrectOptionKey: null, cqRubric: rubric, isVerified: true },
      },
    ],
  });

  it('POSITIVE CONTROL: a valid CQ rubric produces no violations at all', () => {
    const { violations } = evaluatePublishGate(cqQuestion(validRubric()));
    expect(violations).toEqual([]);
  });

  it('an unknown rubric field surfaces as CQ_RUBRIC_INVALID, not silence', () => {
    const r = validRubric();
    r['markingScheme'] = 'B';
    const { violations } = evaluatePublishGate(cqQuestion(r));
    const codes = violations.map((v) => v.code);
    expect(codes).toContain('CQ_RUBRIC_INVALID');
  });

  it('the violation carries the field path so a form can map it', () => {
    const r = validRubric();
    criteria(parts(r)[1] as Record<string, unknown>)[0]!['weighting'] = 1;
    const { violations } = evaluatePublishGate(cqQuestion(r));
    const violation = violations.find((v) => v.code === 'CQ_RUBRIC_INVALID');
    expect(violation).toBeDefined();
    expect(violation?.field).toBe('answerKey.cqRubric');
    expect(violation?.message).toContain('$.parts[1].criteria[0].weighting');
  });

  it('a malformed rubric surfaces as CQ_RUBRIC_INVALID rather than being ignored', () => {
    const { violations } = evaluatePublishGate(cqQuestion({ format: 'cq_rubric', parts: 'nope' }));
    expect(violations.map((v) => v.code)).toContain('CQ_RUBRIC_INVALID');
  });

  it('an unknown nested field blocks the publish end to end', () => {
    const r = validRubric();
    criteria(parts(r)[2] as Record<string, unknown>)[1]!['bonus'] = true;
    const { violations } = evaluatePublishGate(cqQuestion(r));
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.map((v) => v.code)).toContain('CQ_RUBRIC_INVALID');
  });

  it('does not report a MISSING rubric as CQ_RUBRIC_INVALID — that is I-13', () => {
    // Double-reporting one problem under two codes would make the gate's output
    // ambiguous. A missing rubric is `checkAnswerKeyShape`'s finding.
    const { violations } = evaluatePublishGate(cqQuestion(null));
    const codes = violations.map((v) => v.code);
    expect(codes).toContain('CQ_ANSWER_KEY_INVALID');
    expect(codes).not.toContain('CQ_RUBRIC_INVALID');
  });

  it('does not apply rubric shape checks to an MCQ', () => {
    // An MCQ carrying a rubric is rejected by I-13; it must not also be parsed
    // as a rubric here.
    const { violations } = evaluatePublishGate({
      ...cqQuestion(validRubric()),
      type: 'MCQ',
    });
    expect(violations.map((v) => v.code)).not.toContain('CQ_RUBRIC_INVALID');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AMB-5 — owner-approved FAIL-CLOSED policy for legacy archived records.
// Appended here because this file already owns the CQ fixture helpers; the
// policy itself is unrelated to rubrics.
// ─────────────────────────────────────────────────────────────────────────────

import {
  assertLegacyArchiveReviewRequired,
  assertTypeChangeAllowed,
} from '@/server/questions/publish/rules';

describe('AMB-5 — fail closed for legacy archived records (owner-approved)', () => {
  const v = (status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED', n: number) => ({
    id: `v${n}`,
    versionNumber: n,
    status,
    content: null,
    options: [],
    answerKey: null,
    assetLinks: [],
  });

  it('REFUSES a type change when every version is ARCHIVED', () => {
    // This is the legacy case: history destroyed, so the answer is "review",
    // not "assume never published".
    expect(() =>
      assertLegacyArchiveReviewRequired('CQ', 'MCQ', [v('ARCHIVED', 1), v('ARCHIVED', 2)]),
    ).toThrow(/archived/i);
  });

  it('the refusal carries its own review-required code and invariant I-6', () => {
    // Task 6 requires a SPECIFIC, structured review-required error — so this is
    // a new code rather than the generic QUESTION_TYPE_IMMUTABLE, which would
    // tell a user "a published version exists" when the actual fact is that
    // publication status is unknowable. It is not an "invented" code: it is the
    // distinction AMB-5 exists to make, declared in `DomainErrorCode` alongside
    // the rest of the gate's vocabulary.
    try {
      assertLegacyArchiveReviewRequired('CQ', 'MCQ', [v('ARCHIVED', 1)]);
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as { code?: string }).code).toBe('QUESTION_TYPE_CHANGE_REVIEW_REQUIRED');
      expect((error as { invariant?: string }).invariant).toBe('I-6');
      // NOT the published-version code.
      expect((error as { code?: string }).code).not.toBe('QUESTION_TYPE_IMMUTABLE');
    }
  });

  it('does NOT treat missing history as proof of non-publication', () => {
    // The heart of the decision. An all-archived question has no recoverable
    // history; the policy must not read that absence in the caller's favour.
    const allArchived = [v('ARCHIVED', 1)];
    expect(() => assertLegacyArchiveReviewRequired('CQ', 'MCQ', allArchived)).toThrow();
  });

  it('does not silently infer: there is no switch and no exception argument', () => {
    // The per-call override flag was REMOVED (AMB-5 hardening): it was never
    // passed by production code, and a boolean that resolves "publication
    // status unknowable" in the caller's favour is exactly the silent inference
    // the owner decision forbids. Forcing one through a cast must change nothing.
    const forced = assertLegacyArchiveReviewRequired as unknown as (
      a: string,
      b: string,
      c: unknown,
      d: unknown,
    ) => void;
    expect(() =>
      forced('CQ', 'MCQ', [v('ARCHIVED', 1)], { allowLegacyArchivedTypeChange: true }),
    ).toThrow();
  });

  it('cannot be disarmed by any caller-supplied argument', () => {
    expect(() => assertLegacyArchiveReviewRequired('CQ', 'MCQ', [v('ARCHIVED', 1)])).toThrow(
      /review/i,
    );
  });

  it('allows a draft-only question — it was demonstrably not published', () => {
    expect(() => assertLegacyArchiveReviewRequired('CQ', 'MCQ', [v('DRAFT', 1)])).not.toThrow();
  });

  it('allows mixed draft+archived — history is not yet at stake', () => {
    expect(() =>
      assertLegacyArchiveReviewRequired('CQ', 'MCQ', [v('ARCHIVED', 1), v('DRAFT', 2)]),
    ).not.toThrow();
  });

  it('does not fire when the type is unchanged', () => {
    expect(() => assertLegacyArchiveReviewRequired('MCQ', 'MCQ', [v('ARCHIVED', 1)])).not.toThrow();
  });

  it('does not fire when there are no versions at all', () => {
    expect(() => assertLegacyArchiveReviewRequired('CQ', 'MCQ', [])).not.toThrow();
  });

  it('leaves the PUBLISHED case to assertTypeChangeAllowed', () => {
    // Two functions, two distinct jobs: "published now" refuses outright;
    // "all archived" requires review. Neither duplicates the other.
    expect(() => assertTypeChangeAllowed('CQ', 'MCQ', [v('PUBLISHED', 1)])).toThrow(/type/i);
    expect(() => assertLegacyArchiveReviewRequired('CQ', 'MCQ', [v('PUBLISHED', 1)])).not.toThrow();
  });

  it('CURRENT GAP: assertTypeChangeAllowed alone still permits the all-archived change', () => {
    // Recorded, not endorsed. The pre-existing function keeps the "currently
    // published" reading; the fail-closed half is the new function. A caller
    // that runs only the old one still gets the permissive behaviour, so wiring
    // both into the service is required work — and that is why this test exists.
    expect(() => assertTypeChangeAllowed('CQ', 'MCQ', [v('ARCHIVED', 1)])).not.toThrow();
  });
});
