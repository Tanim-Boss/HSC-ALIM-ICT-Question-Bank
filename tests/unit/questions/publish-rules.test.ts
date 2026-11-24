/**
 * Publish-gate rules — one describe block per invariant (§3.13).
 *
 * EVERY negative test is preceded by a positive control that asserts the fixture
 * is publishable. Without that, a test asserting "the gate rejects X" would also
 * pass if the gate rejected *everything* — which is exactly the class of false
 * pass found in V-1 (an empty diff that "proved" no changes) and V-5 (a duplicate
 * probe that collided with nothing). The helper `expectRejected` therefore
 * throws if the baseline was already invalid.
 */

import { describe, expect, it } from 'vitest';

import {
  evaluatePublishGate,
  deriveQuestionStatus,
  assertVersionMutable,
  assertTypeChangeAllowed,
  checkStatusRollup,
  findAnswerRevealingProperty,
  parseRubric,
  AMBIGUITIES,
  type QuestionSnapshot,
} from '@/server/questions/publish/rules';
import { DomainError, ViolationCollector } from '@/server/questions/publish/errors';
import {
  IDS,
  cqQuestion,
  cqRubric,
  cqStem,
  cqVersion,
  mcqQuestion,
  mcqStem,
  mcqVersion,
  optionContent,
  taxonomy,
} from '@/tests/fixtures/questions/publish-fixtures';

/**
 * Asserts the baseline publishes, then that `mutate` produces `expectedCodes`.
 *
 * The positive control is not decoration: it is the difference between "the
 * gate rejected this defect" and "the gate rejects everything".
 */
function expectRejected(
  baseline: QuestionSnapshot,
  mutate: (valid: QuestionSnapshot) => QuestionSnapshot,
  expectedCodes: readonly string[],
): void {
  // POSITIVE CONTROL — the unmodified fixture must pass.
  const control = evaluatePublishGate(baseline);
  expect(
    control.violations,
    `positive control failed: the valid ${baseline.type} fixture is not publishable`,
  ).toEqual([]);

  const result = evaluatePublishGate(mutate(baseline));
  expect(result.violations.length).toBeGreaterThan(0);
  const codes = result.violations.map((v) => v.code);
  for (const expected of expectedCodes) {
    expect(codes, `expected ${expected}, got ${codes.join(', ')}`).toContain(expected);
  }
}

describe('positive controls for both question types', () => {
  it('a fully valid MCQ question is publishable', () => {
    expect(evaluatePublishGate(mcqQuestion()).violations).toEqual([]);
  });

  it('a fully valid CQ question is publishable', () => {
    expect(evaluatePublishGate(cqQuestion()).violations).toEqual([]);
  });

  it('the fixtures actually differ from each other (so the pair is not degenerate)', () => {
    // If both fixtures were secretly the same object, every type-specific test
    // below would be meaningless.
    expect(mcqQuestion().type).toBe('MCQ');
    expect(cqQuestion().type).toBe('CQ');
    expect(mcqQuestion().marks).not.toBe(cqQuestion().marks);
    expect(mcqQuestion().versions[0]?.content).not.toEqual(cqQuestion().versions[0]?.content);
  });
});

describe('I-3 — question status is a rollup of its versions', () => {
  it('derives PUBLISHED when any version is published', () => {
    expect(deriveQuestionStatus([mcqVersion({ status: 'PUBLISHED' })])).toBe('PUBLISHED');
  });

  it('derives ARCHIVED when every version is archived', () => {
    expect(deriveQuestionStatus([{ ...mcqVersion(), status: 'ARCHIVED' }])).toBe('ARCHIVED');
  });

  it('derives DRAFT when versions exist but none is published or all-archived', () => {
    expect(deriveQuestionStatus([{ ...mcqVersion(), status: 'DRAFT' }])).toBe('DRAFT');
    expect(
      deriveQuestionStatus([
        { ...mcqVersion({ versionNumber: 1 }), status: 'ARCHIVED' },
        { ...mcqVersion({ versionNumber: 2 }), status: 'DRAFT' },
      ]),
    ).toBe('DRAFT');
  });

  it('rejects a question whose stored status contradicts its versions', () => {
    const violations = new ViolationCollector();
    checkStatusRollup({ ...mcqQuestion(), status: 'DRAFT' }, violations);
    expect(violations.list().map((v) => v.code)).toEqual(['QUESTION_STATUS_ROLLUP_MISMATCH']);
  });

  it('accepts a question whose stored status matches its versions', () => {
    const violations = new ViolationCollector();
    checkStatusRollup(mcqQuestion(), violations);
    expect(violations.isEmpty).toBe(true);
  });
});

describe('I-4 — option cardinality and key alphabet', () => {
  it('rejects an MCQ version with three options', () => {
    expectRejected(
      mcqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        return { ...q, versions: [{ ...v, options: v.options.slice(0, 3) }] };
      },
      ['MCQ_OPTION_COUNT_INVALID'],
    );
  });

  it('rejects an MCQ version with five options', () => {
    expectRejected(
      mcqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        const extra = {
          id: '00000000-0000-4000-8000-000000000205',
          key: 'E',
          sortOrder: 4,
          content: optionContent('E'),
        };
        return { ...q, versions: [{ ...v, options: [...v.options, extra] }] };
      },
      ['MCQ_OPTION_COUNT_INVALID'],
    );
  });

  it('rejects a CQ version that carries options', () => {
    expectRejected(
      cqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        const option = {
          id: '00000000-0000-4000-8000-000000000206',
          key: 'A',
          sortOrder: 0,
          content: optionContent('A'),
        };
        return { ...q, versions: [{ ...v, options: [option] }] };
      },
      ['CQ_OPTION_COUNT_INVALID'],
    );
  });

  it('rejects duplicate option keys', () => {
    expectRejected(
      mcqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        const options = v.options.map((o, index) => (index === 1 ? { ...o, key: 'A' } : o));
        return { ...q, versions: [{ ...v, options }] };
      },
      ['OPTION_KEYS_NOT_DISTINCT'],
    );
  });

  it('rejects a mixed key alphabet (A, B, C, ঘ)', () => {
    expectRejected(
      mcqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        const options = v.options.map((o, index) => (index === 3 ? { ...o, key: 'ঘ' } : o));
        return { ...q, versions: [{ ...v, options }] };
      },
      ['OPTION_KEYS_NOT_DISTINCT'],
    );
  });

  it('accepts the Bengali alphabet ক খ গ ঘ as a complete set', () => {
    // Positive case for a rule that is easy to implement as English-only by
    // accident: the Bengali keys are what the real content uses.
    const question = mcqQuestion();
    const [v] = question.versions;
    if (v === undefined) throw new Error('fixture has no version');
    const options = v.options.map((o, index) => ({
      ...o,
      key: ['ক', 'খ', 'গ', 'ঘ'][index] ?? o.key,
    }));
    const result = evaluatePublishGate({
      ...question,
      versions: [
        {
          ...v,
          options,
          answerKey: { mcqCorrectOptionKey: 'ক', cqRubric: null, isVerified: true },
        },
      ],
    });
    expect(result.violations).toEqual([]);
  });
});

describe('I-13 — exactly one answer key, of the right kind, verified', () => {
  it('rejects an MCQ version with no answer key', () => {
    expectRejected(
      mcqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        return { ...q, versions: [{ ...v, answerKey: null }] };
      },
      ['MCQ_ANSWER_KEY_INVALID'],
    );
  });

  it('rejects an MCQ key naming an option that is not in the version', () => {
    expectRejected(
      mcqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        return {
          ...q,
          versions: [
            { ...v, answerKey: { mcqCorrectOptionKey: 'Z', cqRubric: null, isVerified: true } },
          ],
        };
      },
      ['MCQ_ANSWER_KEY_INVALID'],
    );
  });

  it('rejects an MCQ version carrying a rubric', () => {
    expectRejected(
      mcqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        return {
          ...q,
          versions: [
            {
              ...v,
              answerKey: { mcqCorrectOptionKey: 'A', cqRubric: cqRubric(), isVerified: true },
            },
          ],
        };
      },
      ['MCQ_ANSWER_KEY_INVALID'],
    );
  });

  it('rejects a CQ version carrying an MCQ key', () => {
    expectRejected(
      cqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        return {
          ...q,
          versions: [
            {
              ...v,
              answerKey: { mcqCorrectOptionKey: 'A', cqRubric: cqRubric(), isVerified: true },
            },
          ],
        };
      },
      ['CQ_ANSWER_KEY_INVALID'],
    );
  });

  it('rejects a CQ version with no rubric', () => {
    expectRejected(
      cqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        return {
          ...q,
          versions: [
            { ...v, answerKey: { mcqCorrectOptionKey: null, cqRubric: null, isVerified: true } },
          ],
        };
      },
      ['CQ_ANSWER_KEY_INVALID'],
    );
  });

  it('rejects an unverified key (AMB-3: §7.7 rule 5 applied)', () => {
    expectRejected(
      mcqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        return {
          ...q,
          versions: [
            { ...v, answerKey: { mcqCorrectOptionKey: 'A', cqRubric: null, isVerified: false } },
          ],
        };
      },
      ['ANSWER_KEY_NOT_VERIFIED'],
    );
  });
});

describe('I-7 — rubric parts mirror the stem', () => {
  const withRubric =
    (mutate: (r: Record<string, unknown>) => Record<string, unknown>) =>
    (q: QuestionSnapshot): QuestionSnapshot => {
      const [v] = q.versions;
      if (v === undefined) throw new Error('fixture has no version');
      const base = cqRubric() as Record<string, unknown>;
      return {
        ...q,
        versions: [
          {
            ...v,
            answerKey: { mcqCorrectOptionKey: null, cqRubric: mutate(base), isVerified: true },
          },
        ],
      };
    };

  it('rejects a rubric with three parts', () => {
    expectRejected(
      cqQuestion(),
      withRubric((r) => ({ ...r, parts: (r['parts'] as unknown[]).slice(0, 3), totalMaxMarks: 6 })),
      ['CQ_RUBRIC_PARTS_MISMATCH'],
    );
  });

  it('rejects a rubric whose parts are out of order', () => {
    expectRejected(
      cqQuestion(),
      withRubric((r) => {
        const parts = [...(r['parts'] as Record<string, unknown>[])];
        const [first, second] = [parts[0], parts[1]];
        if (first === undefined || second === undefined) return r;
        parts[0] = second;
        parts[1] = first;
        return { ...r, parts };
      }),
      ['CQ_RUBRIC_PARTS_MISMATCH'],
    );
  });

  it('rejects a rubric part whose maxMarks disagrees with the stem', () => {
    expectRejected(
      cqQuestion(),
      withRubric((r) => {
        const parts = [...(r['parts'] as Record<string, unknown>[])];
        const first = parts[0];
        if (first === undefined) return r;
        parts[0] = { ...first, maxMarks: 2 };
        return { ...r, parts, totalMaxMarks: 11 };
      }),
      ['CQ_RUBRIC_PARTS_MISMATCH'],
    );
  });

  it('rejects a part whose criteria cannot award its full marks', () => {
    expectRejected(
      cqQuestion(),
      withRubric((r) => {
        const parts = [...(r['parts'] as Record<string, unknown>[])];
        const third = parts[2];
        if (third === undefined) return r;
        parts[2] = { ...third, criteria: [{ description: 'only one', marks: 1 }] };
        return { ...r, parts };
      }),
      ['CQ_RUBRIC_PARTS_MISMATCH'],
    );
  });

  it('rejects a rubric whose totalMaxMarks does not equal its part sum', () => {
    expectRejected(
      cqQuestion(),
      withRubric((r) => ({ ...r, totalMaxMarks: 12 })),
      ['CQ_RUBRIC_PARTS_MISMATCH'],
    );
  });

  it('parses a well-formed rubric and refuses a malformed one', () => {
    expect(parseRubric(cqRubric())).not.toBeNull();
    expect(parseRubric({ format: 'rich_blocks', version: 1, blocks: [] })).toBeNull();
    expect(parseRubric(null)).toBeNull();
    expect(
      parseRubric({ format: 'cq_rubric', version: 1, totalMaxMarks: 10, parts: 'nope' }),
    ).toBeNull();
  });
});

describe('I-15 — CQ marks agree across three places', () => {
  it('rejects a CQ whose subquestions total 9 while the question is worth 10', () => {
    expectRejected(
      cqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        const content = cqStem() as { blocks: Record<string, unknown>[] };
        const blocks = [...content.blocks];
        const last = blocks[4];
        if (last === undefined) throw new Error('fixture malformed');
        blocks[4] = {
          ...last,
          data: { ...(last['data'] as Record<string, unknown>), maxMarks: 3 },
        };
        return { ...q, versions: [{ ...v, content: { ...content, blocks } }] };
      },
      ['CQ_MARKS_MISMATCH'],
    );
  });

  it('rejects a CQ where the stem and rubric totals disagree but each is internally consistent', () => {
    expectRejected(
      cqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        const base = cqRubric() as { parts: Record<string, unknown>[] };
        const parts = base.parts.map((p, index) => {
          const maxMarks = [1, 2, 3, 4][index] ?? 1;
          return {
            ...p,
            maxMarks,
            criteria: Array.from({ length: maxMarks }, (_, i) => ({
              description: `c${i}`,
              marks: 1,
            })),
          };
        });
        // rubric now totals 10 but claims 11
        return {
          ...q,
          versions: [
            {
              ...v,
              answerKey: {
                mcqCorrectOptionKey: null,
                cqRubric: { ...base, parts, totalMaxMarks: 11 },
                isVerified: true,
              },
            },
          ],
        };
      },
      ['CQ_MARKS_MISMATCH'],
    );
  });

  it('rejects a CQ with the wrong part mapping (ক=2, খ=1)', () => {
    expectRejected(
      cqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        const content = cqStem() as { blocks: Record<string, unknown>[] };
        const blocks = content.blocks.map((b, index) => {
          if (index !== 1 && index !== 2) return b;
          const data = b['data'] as Record<string, unknown>;
          return { ...b, data: { ...data, maxMarks: index === 1 ? 2 : 1 } };
        });
        return { ...q, versions: [{ ...v, content: { ...content, blocks } }] };
      },
      ['CQ_MARKS_MISMATCH'],
    );
  });

  it('accepts a CQ whose three sources agree', () => {
    expect(evaluatePublishGate(cqQuestion()).violations).toEqual([]);
  });
});

describe('I-8 / I-14 — asset pointers resolve to blocks that expose them', () => {
  const stemWithImage = (): unknown => ({
    format: 'rich_blocks',
    version: 1,
    blocks: [
      { type: 'paragraph', data: { text: 'চিত্র দেখো' } },
      { type: 'image', data: { assetId: IDS.asset1, alt: 'বর্তনী' } },
    ],
  });

  it('accepts a link whose pointer matches the block exposing the asset', () => {
    const question = mcqQuestion();
    const [v] = question.versions;
    if (v === undefined) throw new Error('fixture has no version');
    const result = evaluatePublishGate({
      ...question,
      versions: [
        {
          ...v,
          content: stemWithImage(),
          assetLinks: [{ assetId: IDS.asset1, blockRef: '/content/blocks/1' }],
        },
      ],
    });
    expect(result.violations).toEqual([]);
  });

  it('rejects a pointer to a block that does not exist', () => {
    expectRejected(
      mcqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        return {
          ...q,
          versions: [
            {
              ...v,
              content: stemWithImage(),
              assetLinks: [{ assetId: IDS.asset1, blockRef: '/content/blocks/7' }],
            },
          ],
        };
      },
      ['ASSET_POINTER_UNRESOLVED'],
    );
  });

  it('rejects a pointer that exists but exposes a different asset', () => {
    expectRejected(
      mcqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        return {
          ...q,
          versions: [
            {
              ...v,
              content: stemWithImage(),
              assetLinks: [{ assetId: IDS.asset2, blockRef: '/content/blocks/1' }],
            },
          ],
        };
      },
      ['ASSET_POINTER_UNRESOLVED'],
    );
  });

  it('rejects a pointer without a root', () => {
    expectRejected(
      mcqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        return {
          ...q,
          versions: [
            {
              ...v,
              content: stemWithImage(),
              assetLinks: [{ assetId: IDS.asset1, blockRef: '/blocks/1' }],
            },
          ],
        };
      },
      ['ASSET_POINTER_UNRESOLVED'],
    );
  });

  it('rejects a leading-zero index', () => {
    expectRejected(
      mcqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        return {
          ...q,
          versions: [
            {
              ...v,
              content: stemWithImage(),
              assetLinks: [{ assetId: IDS.asset1, blockRef: '/content/blocks/01' }],
            },
          ],
        };
      },
      ['ASSET_POINTER_UNRESOLVED'],
    );
  });

  it('rejects an asset used by a block but never linked (orphan)', () => {
    expectRejected(
      mcqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        return { ...q, versions: [{ ...v, content: stemWithImage(), assetLinks: [] }] };
      },
      ['ASSET_POINTER_UNRESOLVED'],
    );
  });

  it('resolves a nested subquestion pointer in a CQ stem', () => {
    const question = cqQuestion();
    const [v] = question.versions;
    if (v === undefined) throw new Error('fixture has no version');
    const content = cqStem() as { blocks: Record<string, unknown>[] };
    const blocks = content.blocks.map((b, index) =>
      index === 4
        ? {
            ...b,
            data: {
              ...(b['data'] as Record<string, unknown>),
              blocks: [{ type: 'flowchart', data: { assetId: IDS.asset3, alt: 'ধাপ' } }],
            },
          }
        : b,
    );
    const result = evaluatePublishGate({
      ...question,
      versions: [
        {
          ...v,
          content: { ...content, blocks },
          assetLinks: [{ assetId: IDS.asset3, blockRef: '/content/blocks/4/data/blocks/0' }],
        },
      ],
    });
    expect(result.violations).toEqual([]);
  });

  it('resolves an option-rooted pointer', () => {
    const question = mcqQuestion();
    const [v] = question.versions;
    if (v === undefined) throw new Error('fixture has no version');
    const options = v.options.map((o, index) =>
      index === 1
        ? {
            ...o,
            content: {
              format: 'rich_blocks',
              version: 1,
              blocks: [{ type: 'image', data: { assetId: IDS.asset2, alt: 'সংকেত' } }],
            },
          }
        : o,
    );
    const result = evaluatePublishGate({
      ...question,
      versions: [
        { ...v, options, assetLinks: [{ assetId: IDS.asset2, blockRef: '/options/B/blocks/0' }] },
      ],
    });
    expect(result.violations).toEqual([]);
  });

  it('rejects an option pointer that names a key the version does not have', () => {
    expectRejected(
      mcqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        return {
          ...q,
          versions: [
            {
              ...v,
              options: v.options.map((o, index) =>
                index === 1
                  ? {
                      ...o,
                      content: {
                        format: 'rich_blocks',
                        version: 1,
                        blocks: [{ type: 'image', data: { assetId: IDS.asset2, alt: 'x' } }],
                      },
                    }
                  : o,
              ),
              assetLinks: [{ assetId: IDS.asset2, blockRef: '/options/Z/blocks/0' }],
            },
          ],
        };
      },
      ['ASSET_POINTER_UNRESOLVED'],
    );
  });
});

describe('I-11 — version numbers are contiguous from 1', () => {
  it('rejects a gap (versions 1 and 3)', () => {
    expectRejected(
      mcqQuestion(),
      (q) => ({
        ...q,
        versions: [
          { ...mcqVersion({ versionNumber: 1 }), status: 'ARCHIVED' as const },
          {
            ...mcqVersion({ versionNumber: 3, id: '00000000-0000-4000-8000-000000000101' }),
            status: 'PUBLISHED' as const,
          },
        ],
      }),
      ['VERSION_NUMBER_GAP'],
    );
  });

  it('rejects a duplicate version number', () => {
    expectRejected(
      mcqQuestion(),
      (q) => ({
        ...q,
        versions: [
          { ...mcqVersion({ versionNumber: 1 }), status: 'ARCHIVED' as const },
          {
            ...mcqVersion({ versionNumber: 1, id: '00000000-0000-4000-8000-000000000102' }),
            status: 'PUBLISHED' as const,
          },
        ],
      }),
      ['VERSION_NUMBER_GAP'],
    );
  });

  it('rejects a version numbered 0', () => {
    expectRejected(
      mcqQuestion(),
      (q) => ({
        ...q,
        versions: [{ ...mcqVersion({ versionNumber: 0 }), status: 'PUBLISHED' as const }],
      }),
      ['VERSION_NUMBER_GAP'],
    );
  });

  it('accepts contiguous versions 1 and 2', () => {
    const question = mcqQuestion();
    const result = evaluatePublishGate({
      ...question,
      versions: [
        { ...mcqVersion({ versionNumber: 1 }), status: 'ARCHIVED' },
        {
          ...mcqVersion({ versionNumber: 2, id: '00000000-0000-4000-8000-000000000103' }),
          status: 'PUBLISHED',
        },
      ],
    });
    expect(result.violations).toEqual([]);
  });
});

describe('I-1 / I-12 — taxonomy chain and active rows', () => {
  it('rejects a subject not offered at the chosen level', () => {
    expectRejected(
      mcqQuestion(),
      (q) => ({ ...q, taxonomy: taxonomy({ subjectOfferedAtLevel: false }) }),
      ['INACTIVE_ROW_REFERENCED'],
    );
  });

  it('rejects an inactive education level', () => {
    expectRejected(
      mcqQuestion(),
      (q) => ({ ...q, taxonomy: taxonomy({ educationLevelActive: false }) }),
      ['INACTIVE_ROW_REFERENCED'],
    );
  });

  it('rejects an inactive subject', () => {
    expectRejected(mcqQuestion(), (q) => ({ ...q, taxonomy: taxonomy({ subjectActive: false }) }), [
      'INACTIVE_ROW_REFERENCED',
    ]);
  });

  it('rejects an inactive chapter, topic and subtopic', () => {
    for (const patch of [
      { chapter: { id: IDS.chapter, subjectId: IDS.subject, isActive: false } },
      { topic: { id: IDS.topic, chapterId: IDS.chapter, isActive: false } },
      { subtopic: { id: IDS.subtopic, topicId: IDS.topic, isActive: false } },
    ]) {
      expectRejected(mcqQuestion(), (q) => ({ ...q, taxonomy: taxonomy(patch) }), [
        'INACTIVE_ROW_REFERENCED',
      ]);
    }
  });

  it('rejects a chapter belonging to another subject', () => {
    expectRejected(
      mcqQuestion(),
      (q) => ({
        ...q,
        taxonomy: taxonomy({ chapter: { id: IDS.chapter, subjectId: IDS.asset1, isActive: true } }),
      }),
      ['INACTIVE_ROW_REFERENCED'],
    );
  });

  it('rejects a topic without its chapter', () => {
    expectRejected(mcqQuestion(), (q) => ({ ...q, taxonomy: taxonomy({ chapter: null }) }), [
      'INACTIVE_ROW_REFERENCED',
    ]);
  });

  it('rejects a subtopic whose topic does not match', () => {
    expectRejected(
      mcqQuestion(),
      (q) => ({
        ...q,
        taxonomy: taxonomy({ subtopic: { id: IDS.subtopic, topicId: IDS.asset2, isActive: true } }),
      }),
      ['INACTIVE_ROW_REFERENCED'],
    );
  });
});

describe('§7.5 — content profiles', () => {
  it('rejects an MCQ stem with no paragraph', () => {
    expectRejected(
      mcqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        return {
          ...q,
          versions: [
            {
              ...v,
              content: {
                format: 'rich_blocks',
                version: 1,
                blocks: [{ type: 'math', data: { latex: 'x' } }],
              },
            },
          ],
        };
      },
      ['CONTENT_PROFILE_INVALID'],
    );
  });

  it('rejects an MCQ stem containing a subquestion', () => {
    expectRejected(
      mcqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        const content = mcqStem() as { blocks: unknown[] };
        return {
          ...q,
          versions: [
            {
              ...v,
              content: {
                ...content,
                blocks: [
                  ...content.blocks,
                  { type: 'subquestion', data: { part: 'ক', maxMarks: 1 } },
                ],
              },
            },
          ],
        };
      },
      ['CONTENT_PROFILE_INVALID'],
    );
  });

  it('rejects an MCQ stem that begins with a heading', () => {
    expectRejected(
      mcqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        return {
          ...q,
          versions: [
            {
              ...v,
              content: {
                format: 'rich_blocks',
                version: 1,
                blocks: [
                  { type: 'heading', data: { text: 'H' } },
                  { type: 'paragraph', data: { text: 'p' } },
                ],
              },
            },
          ],
        };
      },
      ['CONTENT_PROFILE_INVALID'],
    );
  });

  it('rejects an option containing a table', () => {
    expectRejected(
      mcqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        const options = v.options.map((o, index) =>
          index === 0
            ? {
                ...o,
                content: {
                  format: 'rich_blocks',
                  version: 1,
                  blocks: [{ type: 'table', data: { rows: [] } }],
                },
              }
            : o,
        );
        return { ...q, versions: [{ ...v, options }] };
      },
      ['CONTENT_PROFILE_INVALID'],
    );
  });

  it('rejects an option with four blocks', () => {
    expectRejected(
      mcqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        const four = {
          format: 'rich_blocks',
          version: 1,
          blocks: Array.from({ length: 4 }, () => ({ type: 'paragraph', data: { text: 'p' } })),
        };
        const options = v.options.map((o, index) => (index === 0 ? { ...o, content: four } : o));
        return { ...q, versions: [{ ...v, options }] };
      },
      ['CONTENT_PROFILE_INVALID'],
    );
  });

  it('rejects a CQ stem with no stimulus block', () => {
    expectRejected(
      cqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        const content = cqStem() as { blocks: Record<string, unknown>[] };
        return {
          ...q,
          versions: [
            {
              ...v,
              content: {
                ...content,
                blocks: content.blocks.filter((b) => b['type'] === 'subquestion'),
              },
            },
          ],
        };
      },
      ['CONTENT_PROFILE_INVALID'],
    );
  });

  it('rejects a stimulus block appearing after a subquestion', () => {
    expectRejected(
      cqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        const content = cqStem() as { blocks: Record<string, unknown>[] };
        return {
          ...q,
          versions: [
            {
              ...v,
              content: {
                ...content,
                blocks: [...content.blocks, { type: 'paragraph', data: { text: 'late' } }],
              },
            },
          ],
        };
      },
      ['CONTENT_PROFILE_INVALID'],
    );
  });

  it('rejects a heading inside a subquestion', () => {
    expectRejected(
      cqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        const content = cqStem() as { blocks: Record<string, unknown>[] };
        const blocks = content.blocks.map((b, index) =>
          index === 1
            ? {
                ...b,
                data: {
                  ...(b['data'] as Record<string, unknown>),
                  blocks: [{ type: 'heading', data: { text: 'H' } }],
                },
              }
            : b,
        );
        return { ...q, versions: [{ ...v, content: { ...content, blocks } }] };
      },
      ['CONTENT_PROFILE_INVALID'],
    );
  });

  it('rejects an answer-revealing property anywhere in the content', () => {
    expectRejected(
      mcqQuestion(),
      (q) => {
        const [v] = q.versions;
        if (v === undefined) throw new Error('fixture has no version');
        const content = mcqStem() as { blocks: Record<string, unknown>[] };
        const blocks = content.blocks.map((b, index) =>
          index === 0
            ? { ...b, data: { ...(b['data'] as Record<string, unknown>), correctAnswer: 'A' } }
            : b,
        );
        return { ...q, versions: [{ ...v, content: { ...content, blocks } }] };
      },
      ['CONTENT_PROFILE_INVALID'],
    );
  });

  it('finds an answer-revealing property at depth, and reports its path', () => {
    const path = findAnswerRevealingProperty({ a: [{ b: { solution: 'x' } }] });
    expect(path).toBe('$.a[0].b.solution');
    expect(findAnswerRevealingProperty({ a: { b: 'safe' } })).toBeNull();
  });
});

describe('I-5 — a published version is immutable', () => {
  it('refuses a write to a published version', () => {
    expect(() => assertVersionMutable({ status: 'PUBLISHED', versionNumber: 1 })).toThrow(
      DomainError,
    );
    try {
      assertVersionMutable({ status: 'PUBLISHED', versionNumber: 2 });
    } catch (error) {
      const domain = error as DomainError;
      expect(domain.code).toBe('PUBLISHED_VERSION_IMMUTABLE');
      expect(domain.invariant).toBe('I-5');
      // The message must name the version, so a user knows which one.
      expect(domain.message).toContain('2');
    }
  });

  it('allows a write to a draft or archived version', () => {
    expect(() => assertVersionMutable({ status: 'DRAFT', versionNumber: 1 })).not.toThrow();
    expect(() => assertVersionMutable({ status: 'ARCHIVED', versionNumber: 1 })).not.toThrow();
  });
});

describe('I-6 — the question type cannot change after a published version', () => {
  it('refuses a type change when a published version exists', () => {
    expect(() =>
      assertTypeChangeAllowed('CQ', 'MCQ', [{ ...mcqVersion(), status: 'PUBLISHED' }]),
    ).toThrow(DomainError);
  });

  it('allows a type change while no version is published', () => {
    expect(() =>
      assertTypeChangeAllowed('CQ', 'MCQ', [{ ...mcqVersion(), status: 'DRAFT' }]),
    ).not.toThrow();
  });

  it('allows re-stating the same type after publication', () => {
    expect(() =>
      assertTypeChangeAllowed('MCQ', 'MCQ', [{ ...mcqVersion(), status: 'PUBLISHED' }]),
    ).not.toThrow();
  });
});

describe('violation reporting', () => {
  it('reports every violation at once rather than the first', () => {
    const question: QuestionSnapshot = {
      ...mcqQuestion(),
      taxonomy: taxonomy({ subjectActive: false }),
      versions: [
        {
          ...mcqVersion({ status: 'PUBLISHED' }),
          options: [],
          answerKey: null,
        },
      ],
    };
    const codes = evaluatePublishGate(question).violations.map((v) => v.code);
    // A broken version should surface option count, answer key AND taxonomy.
    expect(codes).toContain('MCQ_OPTION_COUNT_INVALID');
    expect(codes).toContain('MCQ_ANSWER_KEY_INVALID');
    expect(codes).toContain('INACTIVE_ROW_REFERENCED');
    expect(codes.length).toBeGreaterThanOrEqual(3);
  });
});

describe('I-15 — a CQ whose rubric is present but whose draft state is not yet verified', () => {
  it('rejects a CQ version built from cqVersion() with an unverified rubric', () => {
    // Exercises cqVersion() directly so both fixture builders are proven to
    // produce a gate-passing shape before a single field is broken.
    const draft = cqVersion();
    expect(draft.options).toEqual([]);
    const question: QuestionSnapshot = { ...cqQuestion(), versions: [draft] };
    expect(evaluatePublishGate(question).violations).toEqual([]);

    const unverified: QuestionSnapshot = {
      ...question,
      versions: [
        {
          ...draft,
          answerKey: { mcqCorrectOptionKey: null, cqRubric: cqRubric(), isVerified: false },
        },
      ],
    };
    expect(evaluatePublishGate(unverified).violations.map((v) => v.code)).toContain(
      'ANSWER_KEY_NOT_VERIFIED',
    );
  });
});

describe('recorded ambiguities', () => {
  it('every ambiguity names the invariant and the decision it needs', () => {
    // Guards against someone quietly deleting an ambiguity instead of resolving it.
    expect(AMBIGUITIES.length).toBeGreaterThanOrEqual(4);
    for (const ambiguity of AMBIGUITIES) {
      expect(ambiguity.invariant).toMatch(/^I-\d+$/);
      expect(ambiguity.needs.length).toBeGreaterThan(10);
    }
    expect(AMBIGUITIES.map((a) => a.id)).toEqual(['AMB-1', 'AMB-2', 'AMB-3', 'AMB-4']);
  });
});
