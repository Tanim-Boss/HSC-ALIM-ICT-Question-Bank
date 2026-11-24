/**
 * OD-18 — there is ONE authoritative CQ-rubric shape validator.
 *
 * THE DEFECT THIS PINS
 *
 * Two validators existed. The Zod schema `cqRubricSchema`
 * (`lib/validation/content-blocks/profiles.ts`) was strict and complete; the
 * hand-written `parseRubricStrict` (`server/questions/publish/rules.ts`) was the
 * only one on the production path and enforced less — no `part` alphabet, no
 * `maxMarks` bounds, no `marks >= 1`, no string-length limits. They also
 * disagreed on `totalMaxMarks`: the dead schema pinned the literal `10`, the
 * production parser accepted any integer.
 *
 * Two validators where only one is used is not redundancy, it is drift with a
 * review story. `parseRubricStrict` now delegates to the schema and keeps only
 * the translation into the gate's `{path, message}` form.
 *
 * WHAT IS ASSERTED HERE
 *
 *   1. The two entry points cannot disagree — over a corpus that includes the
 *      exact case they used to disagree about.
 *   2. The shape rules the old parser silently skipped are now enforced.
 *   3. The rules that belong to I-7 / I-15 are NOT enforced by the shape layer,
 *      so those invariants still produce their own precise codes. (Enforcing
 *      them twice would mask the better diagnosis — see
 *      `tests/unit/questions/publish-rules.test.ts`.)
 *
 * The mutation proof — that the production gate really depends on this schema —
 * lives in `rubric-authority-mutation.test.ts`, because it needs a module mock.
 */

import { describe, expect, it } from 'vitest';

import { parseRubricStrict } from '@/server/questions/publish/rules';
import { cqRubricSchema } from '@/lib/validation/content-blocks/profiles';
import { cqRubric } from '@/tests/fixtures/questions/publish-fixtures';

function rubric(): Record<string, unknown> {
  return structuredClone(cqRubric()) as Record<string, unknown>;
}

function partsOf(r: Record<string, unknown>): Record<string, unknown>[] {
  return r['parts'] as Record<string, unknown>[];
}

function criteriaOf(part: Record<string, unknown>): Record<string, unknown>[] {
  return part['criteria'] as Record<string, unknown>[];
}

/** A corpus of documents, each labelled with the reason it is interesting. */
function corpus(): { readonly label: string; readonly doc: unknown }[] {
  const cases: { label: string; doc: unknown }[] = [
    { label: 'the approved fixture', doc: rubric() },
    { label: 'null', doc: null },
    { label: 'an array', doc: [] },
    { label: 'a bare string', doc: 'cq_rubric' },
    { label: 'an empty object', doc: {} },
  ];

  // The historical divergence: the dead schema rejected these, production
  // accepted them. Both must now agree — accepted, because the total is I-7's
  // and I-15's business, not the shape layer's.
  for (const total of [6, 8, 10, 12]) {
    const r = rubric();
    r['totalMaxMarks'] = total;
    cases.push({ label: `totalMaxMarks ${String(total)}`, doc: r });
  }

  const mutations: [string, (r: Record<string, unknown>) => void][] = [
    ['unknown root key', (r) => (r['markingScheme'] = 'B')],
    ['unknown part key', (r) => (partsOf(r)[1]!['weighting'] = 3)],
    [
      'unknown criterion key',
      (r) => (criteriaOf(partsOf(r)[2] as Record<string, unknown>)[1]!['bonus'] = 2),
    ],
    ['wrong format literal', (r) => (r['format'] = 'rich_blocks')],
    ['version 2', (r) => (r['version'] = 2)],
    ['fractional total', (r) => (r['totalMaxMarks'] = 9.5)],
    ['parts not an array', (r) => (r['parts'] = 'nope')],
    ['a part that is a string', (r) => ((r['parts'] as unknown[])[1] = 'খ')],
    ['a part label outside the alphabet', (r) => (partsOf(r).at(-1)!['part'] = 'A')],
    ['maxMarks 5', (r) => (partsOf(r).at(-1)!['maxMarks'] = 5)],
    ['zero criteria', (r) => (partsOf(r)[0]!['criteria'] = [])],
    [
      'seven criteria',
      (r) =>
        (partsOf(r)[0]!['criteria'] = Array.from({ length: 7 }, () => ({
          description: 'x',
          marks: 1,
        }))),
    ],
    [
      'criterion marks 0',
      (r) => (criteriaOf(partsOf(r)[0] as Record<string, unknown>)[0]!['marks'] = 0),
    ],
    [
      'criterion marks 1.5',
      (r) => (criteriaOf(partsOf(r)[0] as Record<string, unknown>)[0]!['marks'] = 1.5),
    ],
    [
      'empty description',
      (r) => (criteriaOf(partsOf(r)[0] as Record<string, unknown>)[0]!['description'] = ''),
    ],
    [
      'over-long description',
      (r) =>
        (criteriaOf(partsOf(r)[0] as Record<string, unknown>)[0]!['description'] = 'x'.repeat(501)),
    ],
    [
      'unapproved kind',
      (r) => (criteriaOf(partsOf(r)[0] as Record<string, unknown>)[0]!['kind'] = 'evaluation'),
    ],
    ['over-long expectedAnswer', (r) => (partsOf(r)[0]!['expectedAnswer'] = 'x'.repeat(2001))],
    ['empty notes', (r) => (partsOf(r)[2]!['notes'] = '')],
    ['numeric notes', (r) => (partsOf(r)[2]!['notes'] = 7)],
  ];

  for (const [label, mutate] of mutations) {
    const r = rubric();
    mutate(r);
    cases.push({ label, doc: r });
  }
  return cases;
}

describe('the parser and the schema are one validator, not two', () => {
  it.each(corpus().map((c) => [c.label, c.doc] as const))(
    'agree on whether "%s" is a valid §7.7 shape',
    (_label, doc) => {
      const viaParser = parseRubricStrict(doc).ok;
      const viaSchema = cqRubricSchema.safeParse(doc).success;
      expect(viaParser).toBe(viaSchema);
    },
  );

  it('agree on the approved fixture being valid', () => {
    // Guards the corpus itself: if the fixture ever stopped being valid, every
    // "they agree" assertion above could pass for the wrong reason.
    expect(parseRubricStrict(rubric()).ok).toBe(true);
    expect(cqRubricSchema.safeParse(rubric()).success).toBe(true);
  });
});

describe('shape rules the previous production parser skipped are enforced', () => {
  const rejects = (mutate: (r: Record<string, unknown>) => void): string => {
    const r = rubric();
    mutate(r);
    const result = parseRubricStrict(r);
    if (result.ok) throw new Error('expected the rubric to be rejected');
    return result.issue.path;
  };

  it('rejects a part label outside ক…ঘ (§7.7 allowed values)', () => {
    expect(rejects((r) => (partsOf(r).at(-1)!['part'] = 'A'))).toBe('$.parts[3].part');
  });

  it('rejects maxMarks outside 1…4 (§7.7 allowed values)', () => {
    expect(rejects((r) => (partsOf(r).at(-1)!['maxMarks'] = 5))).toBe('$.parts[3].maxMarks');
  });

  it('rejects a criterion worth zero marks (§7.7: integer ≥ 1)', () => {
    expect(
      rejects((r) => (criteriaOf(partsOf(r)[0] as Record<string, unknown>)[0]!['marks'] = 0)),
    ).toBe('$.parts[0].criteria[0].marks');
  });

  it('rejects an empty description (§7.7: 1…500 characters)', () => {
    expect(
      rejects(
        (r) => (criteriaOf(partsOf(r)[0] as Record<string, unknown>)[0]!['description'] = ''),
      ),
    ).toBe('$.parts[0].criteria[0].description');
  });

  it('rejects a 501-character description (§7.7: 1…500)', () => {
    expect(
      rejects(
        (r) =>
          (criteriaOf(partsOf(r)[0] as Record<string, unknown>)[0]!['description'] = 'x'.repeat(
            501,
          )),
      ),
    ).toBe('$.parts[0].criteria[0].description');
  });

  it('rejects a 2001-character expectedAnswer (§7.7: 1…2000)', () => {
    expect(rejects((r) => (partsOf(r)[0]!['expectedAnswer'] = 'x'.repeat(2001)))).toBe(
      '$.parts[0].expectedAnswer',
    );
  });

  it('rejects empty notes (§7.7: 1…1000)', () => {
    expect(rejects((r) => (partsOf(r)[2]!['notes'] = ''))).toBe('$.parts[2].notes');
  });
});

describe('the cross-document rules stay with I-7 / I-15, not the shape layer', () => {
  it('accepts a rubric whose total disagrees with its part sum — I-7 must report it', () => {
    // If this were rejected here, the gate would report CQ_RUBRIC_INVALID and
    // never reach the more precise CQ_RUBRIC_PARTS_MISMATCH diagnosis.
    const r = rubric();
    r['totalMaxMarks'] = 12;
    expect(parseRubricStrict(r).ok).toBe(true);
  });

  it('accepts three parts — I-7 owns the four-part rule', () => {
    const r = rubric();
    r['parts'] = partsOf(r).slice(0, 3);
    r['totalMaxMarks'] = 6;
    expect(parseRubricStrict(r).ok).toBe(true);
  });

  it('accepts parts out of order — I-7 owns ordering against the stem', () => {
    const r = rubric();
    const parts = partsOf(r);
    const [first, second] = [parts[0], parts[1]];
    if (first === undefined || second === undefined) throw new Error('fixture changed');
    parts[0] = second;
    parts[1] = first;
    expect(parseRubricStrict(r).ok).toBe(true);
  });

  it('accepts a part whose criteria over-award — I-15 owns the mark accounting', () => {
    const r = rubric();
    const part = partsOf(r)[0] as Record<string, unknown>;
    part['criteria'] = [
      { description: 'a', marks: 2 },
      { description: 'b', marks: 2 },
    ];
    expect(parseRubricStrict(r).ok).toBe(true);
  });
});
