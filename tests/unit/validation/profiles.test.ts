/**
 * §7.5 — the four document profiles, plus the proof that `rules.ts` no longer
 * duplicates the approved schema.
 *
 * The last describe block is the one that matters structurally: it asserts that
 * the gate's verdict is produced BY the Zod schemas. If `rules.ts` were to
 * re-implement a profile rule by hand again, these tests would still pass — so
 * the anti-duplication proof is a source-level assertion plus a mutation test
 * recorded in the report, not merely a behavioural one.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  cqRubricSchema,
  cqStemSchema,
  mcqStemSchema,
  optionContentSchema,
  safeParseProfile,
} from '@/lib/validation/content-blocks';
import { LIMITS } from '@/lib/validation/content-blocks/envelope';
import { evaluatePublishGate, type QuestionSnapshot } from '@/server/questions/publish/rules';
import {
  cqRubric,
  cqStem,
  cqVersion,
  IDS,
  mcqStem,
  mcqVersion,
  optionContent,
  taxonomy,
} from '@/tests/fixtures/questions/publish-fixtures';

const UUID = '00000000-0000-4000-8000-000000000001';
const para = (text = 'x') => ({ type: 'paragraph', data: { text } });
const envelope = (blocks: unknown[], version = 1) => ({ format: 'rich_blocks', version, blocks });

describe('§7.2 envelope — literals and bounds', () => {
  it('accepts the documented envelope', () => {
    expect(mcqStemSchema.safeParse(envelope([para()])).success).toBe(true);
  });

  it('rejects a wrong format literal — there is no fallback', () => {
    const result = mcqStemSchema.safeParse({ format: 'blocks', version: 1, blocks: [para()] });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown document version (§7.8)', () => {
    expect(mcqStemSchema.safeParse(envelope([para()], 2)).success).toBe(false);
  });

  it('rejects an empty blocks array (§7.2)', () => {
    expect(mcqStemSchema.safeParse(envelope([])).success).toBe(false);
    expect(cqStemSchema.safeParse(envelope([])).success).toBe(false);
  });

  it('rejects an unknown top-level property', () => {
    expect(mcqStemSchema.safeParse({ ...envelope([para()]), extra: 1 }).success).toBe(false);
  });

  it('accepts 200 blocks and rejects 201 (§7.12)', () => {
    const many = (n: number) => envelope(Array.from({ length: n }, () => para()));
    expect(mcqStemSchema.safeParse(many(LIMITS.blocksPerDocumentMax)).success).toBe(true);
    expect(mcqStemSchema.safeParse(many(LIMITS.blocksPerDocumentMax + 1)).success).toBe(false);
  });
});

describe('§7.5 mcq_stem profile', () => {
  it('accepts a valid stem', () => {
    expect(mcqStemSchema.safeParse(mcqStem()).success).toBe(true);
  });

  it('accepts a stem with a heading that is NOT first', () => {
    expect(
      mcqStemSchema.safeParse(
        envelope([para(), { type: 'heading', data: { text: 'অংশ ক', level: 2 } }]),
      ).success,
    ).toBe(true);
  });

  it('REJECTS a leading heading', () => {
    expect(
      mcqStemSchema.safeParse(
        envelope([{ type: 'heading', data: { text: 'শিরোনাম', level: 1 } }, para()]),
      ).success,
    ).toBe(false);
  });

  it('REJECTS a stem with no paragraph', () => {
    expect(
      mcqStemSchema.safeParse(envelope([{ type: 'math', data: { latex: 'x' } }])).success,
    ).toBe(false);
  });

  it('REJECTS a subquestion inside an MCQ stem', () => {
    expect(
      mcqStemSchema.safeParse(
        envelope([para(), { type: 'subquestion', data: { part: 'ক', maxMarks: 1 } }]),
      ).success,
    ).toBe(false);
  });

  it('accepts every non-subquestion block type', () => {
    const ok = [
      para(),
      { type: 'heading', data: { text: 'h', level: 1 } },
      { type: 'list', data: { ordered: true, items: [{ text: 'a' }] } },
      { type: 'table', data: { rows: [[{ text: 'a', header: true }], ['b']] } },
      { type: 'image', data: { assetId: UUID, alt: 'চিত্র' } },
      { type: 'math', data: { latex: 'x' } },
      { type: 'code', data: { language: 'html', code: '<p>' } },
      { type: 'flowchart', data: { assetId: UUID, alt: 'প্রবাহচিত্র' } },
      { type: 'callout', data: { kind: 'warning', text: 'w' } },
    ];
    expect(mcqStemSchema.safeParse(envelope(ok)).success).toBe(true);
  });
});

describe('§7.5 cq_stem profile', () => {
  it('accepts the valid CQ fixture', () => {
    expect(cqStemSchema.safeParse(cqStem()).success).toBe(true);
  });

  it('REJECTS a CQ stem with no stimulus block', () => {
    const subs = (cqStem() as { blocks: unknown[] }).blocks.filter(
      (b) => (b as { type: string }).type === 'subquestion',
    );
    expect(cqStemSchema.safeParse(envelope(subs)).success).toBe(false);
  });

  it('REJECTS three subquestions (exactly four required)', () => {
    const blocks = (cqStem() as { blocks: unknown[] }).blocks.slice(0, 4);
    expect(cqStemSchema.safeParse(envelope(blocks)).success).toBe(false);
  });

  it('REJECTS five subquestions', () => {
    const src = cqStem() as { blocks: unknown[] };
    const five = [...src.blocks, { type: 'subquestion', data: { part: 'ক', maxMarks: 1 } }];
    expect(cqStemSchema.safeParse(envelope(five)).success).toBe(false);
  });

  it('REJECTS subquestions out of ক→ঘ order', () => {
    const src = cqStem() as { blocks: Record<string, unknown>[] };
    const swapped = [...src.blocks];
    const i = swapped.findIndex((b) => b['type'] === 'subquestion');
    const j = i + 1;
    [swapped[i], swapped[j]] = [swapped[j]!, swapped[i]!];
    expect(cqStemSchema.safeParse(envelope(swapped)).success).toBe(false);
  });

  it('REJECTS a wrong maxMarks mapping (ক must be 1)', () => {
    const src = structuredClone(cqStem()) as { blocks: Record<string, unknown>[] };
    const first = src.blocks.find((b) => b['type'] === 'subquestion');
    (first!['data'] as Record<string, unknown>)['maxMarks'] = 2;
    expect(cqStemSchema.safeParse(src).success).toBe(false);
  });

  it('REJECTS a stimulus block after a subquestion', () => {
    const src = structuredClone(cqStem()) as { blocks: unknown[] };
    src.blocks.push(para('late stimulus'));
    expect(cqStemSchema.safeParse(src).success).toBe(false);
  });

  it('REJECTS a nested heading inside a subquestion', () => {
    const src = structuredClone(cqStem()) as { blocks: Record<string, unknown>[] };
    const first = src.blocks.find((b) => b['type'] === 'subquestion');
    (first!['data'] as Record<string, unknown>)['blocks'] = [
      { type: 'heading', data: { text: 'h', level: 1 } },
    ];
    expect(cqStemSchema.safeParse(src).success).toBe(false);
  });

  it('accepts a subquestion carrying allowed nested blocks', () => {
    const src = structuredClone(cqStem()) as { blocks: Record<string, unknown>[] };
    const first = src.blocks.find((b) => b['type'] === 'subquestion');
    (first!['data'] as Record<string, unknown>)['blocks'] = [
      para('nested'),
      { type: 'code', data: { language: 'sql', code: 'SELECT 1' } },
    ];
    expect(cqStemSchema.safeParse(src).success).toBe(true);
  });
});

describe('§7.5 option profile', () => {
  it('accepts the valid option fixture', () => {
    expect(optionContentSchema.safeParse(optionContent()).success).toBe(true);
  });

  it.each(['paragraph', 'math', 'image', 'code'])('accepts a %s block', (type) => {
    const block =
      type === 'paragraph'
        ? para()
        : type === 'math'
          ? { type: 'math', data: { latex: 'x' } }
          : type === 'image'
            ? { type: 'image', data: { assetId: UUID } }
            : { type: 'code', data: { language: 'c', code: 'x' } };
    expect(optionContentSchema.safeParse(envelope([block])).success).toBe(true);
  });

  it.each(['heading', 'list', 'table', 'callout', 'flowchart', 'subquestion'])(
    'REJECTS a %s block — it breaks the 4-column grid and the print cell',
    (type) => {
      const block =
        type === 'heading'
          ? { type: 'heading', data: { text: 'h', level: 1 } }
          : type === 'list'
            ? { type: 'list', data: { ordered: false, items: [{ text: 'a' }] } }
            : type === 'table'
              ? { type: 'table', data: { rows: [['a']] } }
              : type === 'callout'
                ? { type: 'callout', data: { kind: 'info', text: 'x' } }
                : type === 'flowchart'
                  ? { type: 'flowchart', data: { assetId: UUID, alt: 'a' } }
                  : { type: 'subquestion', data: { part: 'ক', maxMarks: 1 } };
      expect(optionContentSchema.safeParse(envelope([block])).success).toBe(false);
    },
  );

  it('accepts 3 blocks and rejects 4 (§7.5: 1…3)', () => {
    expect(optionContentSchema.safeParse(envelope([para(), para(), para()])).success).toBe(true);
    expect(optionContentSchema.safeParse(envelope([para(), para(), para(), para()])).success).toBe(
      false,
    );
  });

  it('rejects an empty option', () => {
    expect(optionContentSchema.safeParse(envelope([])).success).toBe(false);
  });
});

describe('§7.7 cq_rubric profile', () => {
  it('accepts the valid rubric fixture', () => {
    expect(cqRubricSchema.safeParse(cqRubric()).success).toBe(true);
  });

  it('rejects the wrong format literal', () => {
    expect(
      cqRubricSchema.safeParse({ ...(cqRubric() as object), format: 'rich_blocks' }).success,
    ).toBe(false);
  });

  it('rejects an unknown root field', () => {
    expect(
      cqRubricSchema.safeParse({ ...(cqRubric() as object), markingScheme: 'B' }).success,
    ).toBe(false);
  });

  it('rejects an unknown nested criterion field', () => {
    const r = structuredClone(cqRubric()) as { parts: { criteria: Record<string, unknown>[] }[] };
    r.parts[2]!.criteria[1]!['bonus'] = true;
    expect(cqRubricSchema.safeParse(r).success).toBe(false);
  });

  it('rejects 7 criteria in a part (§7.12: max 6)', () => {
    const r = structuredClone(cqRubric()) as { parts: { criteria: unknown[] }[] };
    r.parts[0]!.criteria = Array.from({ length: 7 }, () => ({ description: 'x', marks: 1 }));
    expect(cqRubricSchema.safeParse(r).success).toBe(false);
  });

  it('rejects an unapproved criterion kind', () => {
    const r = structuredClone(cqRubric()) as { parts: { criteria: Record<string, unknown>[] }[] };
    r.parts[0]!.criteria[0]!['kind'] = 'evaluation';
    expect(cqRubricSchema.safeParse(r).success).toBe(false);
  });
});

describe('the four profiles are exactly four', () => {
  it.each(['mcq_stem', 'cq_stem', 'option', 'cq_rubric'] as const)(
    'safeParseProfile dispatches "%s"',
    (profile) => {
      const value =
        profile === 'mcq_stem'
          ? mcqStem()
          : profile === 'cq_stem'
            ? cqStem()
            : profile === 'option'
              ? optionContent()
              : cqRubric();
      expect(safeParseProfile(profile, value).ok).toBe(true);
    },
  );

  it('reports an unsupported document version as a version problem, not a shape cascade', () => {
    const result = safeParseProfile('mcq_stem', envelope([para()], 7));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]).toContain('version');
  });
});

describe('the gate enforces §7 through Zod, not a parallel implementation', () => {
  const cqQuestion = (content: unknown): QuestionSnapshot => ({
    id: IDS.level,
    type: 'CQ',
    status: 'DRAFT',
    marks: 10,
    taxonomy: taxonomy(),
    versions: [{ ...cqVersion(), status: 'PUBLISHED', content }],
  });

  it('POSITIVE CONTROL: the valid CQ fixture produces no violations', () => {
    expect(evaluatePublishGate(cqQuestion(cqStem())).violations).toEqual([]);
  });

  it('a §7.12 limit breach is reported by the gate', () => {
    // 201 blocks — only the Zod schema knows this limit; the gate has no rule of
    // its own for it. If delegation were removed, this test fails.
    const blocks = Array.from({ length: 201 }, () => ({ type: 'paragraph', data: { text: 'x' } }));
    const { violations } = evaluatePublishGate(cqQuestion(envelope(blocks)));
    expect(violations.map((v) => v.code)).toContain('CONTENT_PROFILE_INVALID');
  });

  it('an MCQ stem containing a subquestion is reported by the gate', () => {
    // The content must actually reach the version under test — an earlier
    // version of this test spread the envelope onto the question and then
    // replaced `versions`, so the bad content was discarded and the assertion
    // was vacuous.
    const content = envelope([para(), { type: 'subquestion', data: { part: 'ক', maxMarks: 1 } }]);
    const { violations } = evaluatePublishGate({
      ...cqQuestion(content),
      type: 'MCQ',
      versions: [{ ...mcqVersion(), status: 'PUBLISHED', content }],
    });
    expect(violations.map((v) => v.code)).toContain('CONTENT_PROFILE_INVALID');
  });

  it('rules.ts contains no hand-written option type allowlist any more', () => {
    // Source-level assertion. The old code had
    // `const ALLOWED_OPTION_TYPES = ['paragraph','math','image','code']`, a second
    // representation of §7.5's option profile. §7.11 rule 1 forbids that.
    const source = readFileSync('server/questions/publish/rules.ts', 'utf8');
    expect(source).not.toContain('ALLOWED_OPTION_TYPES');
  });

  it('rules.ts imports the approved schemas rather than defining its own', () => {
    const source = readFileSync('server/questions/publish/rules.ts', 'utf8');
    expect(source).toContain('safeParseProfile');
    expect(source).toContain('@/lib/validation/content-blocks');
  });

  it('rules.ts no longer re-implements the mcq_stem paragraph rule by hand', () => {
    // The old message text was produced by a bespoke `blocks.some(b => b.type ===
    // 'paragraph')` check. It is now produced by the Zod refinement, so the exact
    // old wording is gone.
    const source = readFileSync('server/questions/publish/rules.ts', 'utf8');
    expect(source).not.toContain('needs at least one paragraph of text');
  });
});
