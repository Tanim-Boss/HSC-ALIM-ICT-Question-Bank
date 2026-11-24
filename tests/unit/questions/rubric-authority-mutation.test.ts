/**
 * OD-18 — MUTATION TEST: the publish gate really depends on the authoritative
 * rubric schema.
 *
 * WHY A MUTATION TEST AND NOT ANOTHER ASSERTION
 *
 * "The production gate calls the authoritative validator" cannot be proven by
 * observing that a bad rubric is rejected — the gate could reject it for any
 * reason, and a re-introduced second parser would still produce a green suite.
 * The honest proof is to mutate the dependency and watch the behaviour disappear:
 *
 *   · this file replaces `cqRubricSchema` with a permissive schema;
 *   · the same CQ snapshot that IS rejected in the baseline now sails past
 *     `CQ_RUBRIC_INVALID`;
 *   · the real schema, imported with `importActual`, still rejects the document.
 *
 * Together those three facts mean the rejection is produced BY the schema. If
 * `parseRubricStrict` ever grows validation logic of its own again — or starts
 * consulting a different validator — the mutated run stops being permissive and
 * this test fails, which is the alarm OD-18 needs.
 *
 * The baseline (unmocked) assertion lives in `rubric-strict.test.ts`
 * ("reaches the application boundary"), and the agreement corpus in
 * `rubric-authority.test.ts`.
 */

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// The mutation: accept anything that is an object with a `parts` array. This is
// a strictly permissive stand-in for `cqRubricSchema` — it is NOT a candidate
// implementation, it exists only to be permissive so that dependence is visible.
vi.mock('@/lib/validation/content-blocks/profiles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/validation/content-blocks/profiles')>();
  return {
    ...actual,
    cqRubricSchema: z.object({ parts: z.array(z.unknown()) }).passthrough(),
  };
});

const { evaluatePublishGate } = await import('@/server/questions/publish/rules');
const { cqRubricSchema: realSchema } = await vi.importActual<
  typeof import('@/lib/validation/content-blocks/profiles')
>('@/lib/validation/content-blocks/profiles');

const QUESTION_ID = '00000000-0000-4000-8000-000000000901';

/** A CQ whose rubric carries a property §7.7 does not define. */
function snapshotWithUnknownRubricKey(): Parameters<typeof evaluatePublishGate>[0] {
  const rubric = {
    format: 'cq_rubric',
    version: 1,
    totalMaxMarks: 10,
    parts: [
      { part: 'ক', maxMarks: 1, criteria: [{ description: 'a', marks: 1 }] },
      { part: 'খ', maxMarks: 2, criteria: [{ description: 'b', marks: 2 }] },
      { part: 'গ', maxMarks: 3, criteria: [{ description: 'c', marks: 3 }] },
      { part: 'ঘ', maxMarks: 4, criteria: [{ description: 'd', marks: 4 }] },
    ],
    // The injected field. §7.7's example rejects exactly this shape, because a
    // free-text answer beside the rubric is where a key would leak from.
    answerKeyText: 'the answer',
  };

  const subquestionParts = ['ক', 'খ', 'গ', 'ঘ'];
  const subquestions = subquestionParts.map((part, index) => ({
    type: 'subquestion',
    data: {
      part,
      maxMarks: index + 1,
      blocks: [{ type: 'paragraph', data: { text: `part ${part}` } }],
    },
  }));

  return {
    id: QUESTION_ID,
    type: 'CQ',
    status: 'DRAFT',
    marks: 10,
    taxonomy: {
      educationLevelId: '00000000-0000-4000-8000-000000000101',
      subjectId: '00000000-0000-4000-8000-000000000102',
      subjectOfferedAtLevel: true,
      educationLevelActive: true,
      subjectActive: true,
      chapter: {
        id: '00000000-0000-4000-8000-000000000103',
        subjectId: '00000000-0000-4000-8000-000000000102',
        isActive: true,
      },
      topic: null,
      subtopic: null,
    },
    versions: [
      {
        id: '00000000-0000-4000-8000-000000000902',
        versionNumber: 1,
        status: 'DRAFT',
        content: {
          format: 'rich_blocks',
          version: 1,
          blocks: [{ type: 'paragraph', data: { text: 'stem' } }, ...subquestions],
        },
        options: [],
        answerKey: { mcqCorrectOptionKey: null, cqRubric: rubric, isVerified: true },
        assetLinks: [],
      },
    ],
  } as Parameters<typeof evaluatePublishGate>[0];
}

describe('mutating the authoritative schema changes the gate’s verdict', () => {
  it('the permissive mutant lets an unknown rubric key through the gate', () => {
    const result = evaluatePublishGate(snapshotWithUnknownRubricKey());
    const codes = result.violations.map((v) => v.code);

    // The baseline (real schema) reports CQ_RUBRIC_INVALID here — asserted in
    // rubric-strict.test.ts. With the schema mutated, that code is GONE.
    expect(codes).not.toContain('CQ_RUBRIC_INVALID');
  });

  it('the real schema still rejects the same document', () => {
    // So the mutant above is the only reason the gate stopped complaining.
    const rubric = (snapshotWithUnknownRubricKey().versions[0]!.answerKey as { cqRubric: unknown })
      .cqRubric;
    const parsed = realSchema.safeParse(rubric);
    expect(parsed.success).toBe(false);
  });

  it('the gate is otherwise still evaluating — the snapshot is not simply ignored', () => {
    // Guards against "no CQ_RUBRIC_INVALID because the gate threw or returned
    // nothing". The same snapshot with a deliberate cross-document error must
    // still be reported, which shows the gate runs to the end in mutant mode.
    // Spread rather than assign: `QuestionSnapshot` is readonly by design.
    const snapshot = { ...snapshotWithUnknownRubricKey(), marks: 12 };
    const codes = evaluatePublishGate(snapshot).violations.map((v) => v.code);

    expect(codes).toContain('CQ_MARKS_MISMATCH');
    expect(codes).not.toContain('CQ_RUBRIC_INVALID');
  });
});
