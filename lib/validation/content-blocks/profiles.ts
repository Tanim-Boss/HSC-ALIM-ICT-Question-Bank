/**
 * §7.5 — the four document profiles, as Zod schemas.
 *
 * "The envelope is shared, but what a *valid document* means depends on where it
 * is stored." So each profile is `envelope + a narrower block union`, and the
 * narrowing is structural (the union simply excludes the forbidden types) rather
 * than a post-hoc `.filter()` — which means a forbidden block type fails with
 * `blocks[i].type: invalid option`, not with a custom message that has to stay in
 * sync with the union.
 *
 * §7.5 also says the profiles live in Zod and NOT in the database: "The database
 * stores `jsonb` and checks only the envelope. Composition rules depend on
 * `questions.type` — a cross-table fact — so they belong to the publish gate."
 */

import { z } from 'zod';

import {
  calloutSchema,
  codeSchema,
  flowchartSchema,
  headingSchema,
  imageSchema,
  listSchema,
  mathSchema,
  paragraphSchema,
  subquestionSchema,
  tableSchema,
} from './blocks';
import { envelopeShape, formatIssue, LIMITS } from './envelope';

/**
 * §7.5 `mcq_stem` — "≥ 1 block; ≥ 1 `paragraph`; at least one text-bearing block",
 * forbidding `subquestion` and a leading `heading`.
 *
 * The forbidden types are expressed by narrowing the union, so an MCQ stem
 * containing a subquestion fails at the block that contains it.
 */
const mcqStemBlocks = z
  .array(
    z.discriminatedUnion('type', [
      paragraphSchema,
      headingSchema,
      listSchema,
      tableSchema,
      imageSchema,
      mathSchema,
      codeSchema,
      flowchartSchema,
      calloutSchema,
    ]),
  )
  .min(LIMITS.blocksPerDocumentMin)
  .max(LIMITS.blocksPerDocumentMax);

export const mcqStemSchema = z
  .strictObject({
    ...envelopeShape,
    blocks: mcqStemBlocks,
  })
  .superRefine((doc, ctx) => {
    // §7.5: "≥ 1 `paragraph`".
    if (!doc.blocks.some((b) => b.type === 'paragraph')) {
      ctx.addIssue({
        code: 'custom',
        path: ['blocks'],
        message: 'an MCQ stem needs at least one paragraph of text',
      });
    }
    // §7.5: `heading` as the FIRST block is forbidden. A heading later in the
    // document is allowed — the rule is about a leading section title, not about
    // headings in general.
    if (doc.blocks[0]?.type === 'heading') {
      ctx.addIssue({
        code: 'custom',
        path: ['blocks', 0, 'type'],
        message: 'an MCQ stem must not begin with a heading',
      });
    }
  });

/** §7.4.10 nested members — the narrower union used inside a subquestion. */
const nestedAllowed = z.discriminatedUnion('type', [
  paragraphSchema,
  listSchema,
  tableSchema,
  imageSchema,
  mathSchema,
  codeSchema,
  flowchartSchema,
  calloutSchema,
]);

/**
 * §7.5 `cq_stem` — "≥ 1 stimulus block (a block that is not `subquestion`), then
 * exactly four `subquestion` blocks in ক→ঘ order with marks 1/2/3/4".
 *
 * Forbidden: a fifth subquestion; duplicate or missing parts; `heading` inside a
 * subquestion. The cross-document marks agreement (I-15) is NOT duplicated here —
 * see the note at the bottom of this file.
 */
export const cqStemSchema = z
  .strictObject({
    ...envelopeShape,
    blocks: z
      .array(z.discriminatedUnion('type', [subquestionSchema, ...nestedAllowed.options]))
      .min(LIMITS.blocksPerDocumentMin)
      .max(LIMITS.blocksPerDocumentMax),
  })
  .superRefine((doc, ctx) => {
    const subquestions = doc.blocks.filter((b) => b.type === 'subquestion');

    if (doc.blocks.every((b) => b.type === 'subquestion')) {
      ctx.addIssue({
        code: 'custom',
        path: ['blocks'],
        message: 'a CQ stem needs at least one stimulus block before its subquestions',
      });
    }

    // §7.5: "then exactly four `subquestion` blocks".
    if (subquestions.length !== 4) {
      ctx.addIssue({
        code: 'custom',
        path: ['blocks'],
        message: `a CQ stem needs exactly four subquestions, found ${subquestions.length}`,
      });
      return;
    }

    // §7.5: "in ক→ঘ order with marks 1/2/3/4".
    const EXPECTED = [
      { part: 'ক', maxMarks: 1 },
      { part: 'খ', maxMarks: 2 },
      { part: 'গ', maxMarks: 3 },
      { part: 'ঘ', maxMarks: 4 },
    ] as const;
    subquestions.forEach((sq, index) => {
      const expected = EXPECTED[index];
      if (expected === undefined) return;
      if (sq.data.part !== expected.part) {
        ctx.addIssue({
          code: 'custom',
          path: ['blocks', index, 'data', 'part'],
          message: `expected "${expected.part}" at position ${index + 1}`,
        });
      }
      if (sq.data.maxMarks !== expected.maxMarks) {
        ctx.addIssue({
          code: 'custom',
          path: ['blocks', index, 'data', 'maxMarks'],
          message: `part "${expected.part}" must be worth ${expected.maxMarks}`,
        });
      }
    });

    // §7.5: subquestions must come last, after the stimulus.
    const firstSub = doc.blocks.findIndex((b) => b.type === 'subquestion');
    if (firstSub >= 0 && doc.blocks.slice(firstSub).some((b) => b.type !== 'subquestion')) {
      ctx.addIssue({
        code: 'custom',
        path: ['blocks'],
        message: 'all subquestions must come last, after the stimulus',
      });
    }

    // §7.4.10: a heading is absent from the nested allowlist, so "no heading
    // inside a subquestion" is enforced structurally by the union above rather
    // than by an ad-hoc check here.
  });

/**
 * §7.5 `option` — "1 … 3 blocks, each `paragraph`, `math`, `image` or `code`".
 *
 * "Why options are narrower than stems. An option renders inside a 4-column grid
 * and inside a single table cell in print."
 */
export const optionContentSchema = z.strictObject({
  ...envelopeShape,
  blocks: z
    .array(z.discriminatedUnion('type', [paragraphSchema, mathSchema, imageSchema, codeSchema]))
    .min(1)
    .max(3),
});

/**
 * §7.7 `cq_rubric` — NOT a block document.
 *
 * "It is a small, strict, part-indexed marking guide that mirrors the four
 * subquestions and adds criteria."
 *
 * ── THE AUTHORITATIVE SHAPE VALIDATOR (OD-18) ────────────────────────────
 *
 * This schema is the ONE implementation of §7.7's *shape* rules. Before OD-18
 * there were two implementations, and only the weaker one was on the production
 * path:
 *
 *   §7.7 / §7.12 shape rule            Zod schema        hand-written parser
 *   -----------------------------------|-----------------|-------------------
 *   `part` ∈ {ক, খ, গ, ঘ}               enforced          NOT enforced
 *   `maxMarks` ∈ {1, 2, 3, 4}            enforced          NOT enforced
 *   `criteria[].marks ≥ 1`               enforced          NOT enforced
 *   `description` 1…500 chars            enforced          NOT enforced
 *   `expectedAnswer` 1…2000              enforced          NOT enforced
 *   `notes` 1…1000                       enforced          NOT enforced
 *   `criteria` 1…6 items                 enforced          enforced
 *   unknown keys rejected                enforced          enforced
 *
 * The schema was stricter almost everywhere and was dead code. A second,
 * unused validator is worse than none: it looks authoritative in review while
 * nothing depends on it, and it drifts until the two disagree — which is exactly
 * what happened on `totalMaxMarks` (see below).
 *
 * `parseRubricStrict` now delegates here and only maps Zod issues onto the
 * `{path, message}` shape the publish gate reports. Consistency between the two
 * entry points is asserted in `tests/unit/questions/rubric-authority.test.ts`,
 * and a mutation test proves the gate really depends on this schema.
 *
 * ── Why `totalMaxMarks` is NOT pinned to the literal 10 ──────────────────
 *
 * The dead schema pinned it with `z.literal(10)`; the hand-written parser
 * accepted any integer. Both readings appear in the specification, so the
 * tie-breaker is which document owns the rule:
 *
 *   · §7.7's *shape* table gives `totalMaxMarks` the type `integer` and lists
 *     `10` under "allowed values", then adds: "Must equal the sum of
 *     `parts[].maxMarks` and `questions.marks`".
 *   · §7.7's "Cross-document validation (publish gate)" section puts the three
 *     totals — the sum of the parts, the curriculum constant, and
 *     `questions.marks` — in the PUBLISH GATE, not in the shape definition.
 *   · E-10 rejected a database `CHECK (type <> 'CQ' OR marks = 10)` because
 *     1+2+3+4 = 10 is a property of the current curriculum, not of the `CQ`
 *     type. The guarantee moved to the `cq_stem` profile plus I-15.
 *
 * So the shape schema takes the type (`integer`) and leaves the value rule to
 * the gate: I-7 compares `totalMaxMarks` with the sum of `parts[].maxMarks`, and
 * I-15 compares it with `questions.marks` and the stem's subquestion marks.
 * Pinning 10 here would have made the shape layer emit `CQ_RUBRIC_INVALID` for
 * documents the gate is supposed to explain precisely — and it would have
 * pre-empted I-7 and I-15, whose tests build internally consistent rubrics with
 * totals of 6 or 12 to exercise those codes. Those tests are the evidence that
 * this division is the approved one, not a convenience.
 *
 * The change is therefore NOT a loosening: production already accepted any
 * integer here, and I-7/I-15 still reject a wrong total. What changed is that
 * the unused schema no longer disagrees with production.
 *
 * NOT enforced here either, for the same reason: exactly four parts, their
 * order, the ক=1 … ঘ=4 mapping and `Σ criteria.marks = maxMarks`. Those are
 * cross-document facts owned by I-7 (`checkRubricMatchesStem`) and I-15 in the
 * publish gate.
 */
export const RUBRIC_CRITERION_KINDS = [
  'knowledge',
  'comprehension',
  'application',
  'analysis',
] as const;

/** §7.12: a marking guide with more criteria than this is a different document. */
export const RUBRIC_MAX_CRITERIA_PER_PART = 6;

/** §7.7: the four subquestion parts, in ক→ঘ order (a set rule, not an order rule). */
export const RUBRIC_PARTS = ['ক', 'খ', 'গ', 'ঘ'] as const;

/** §7.7/§7.8: the only rubric schema version. An unknown version is an error. */
export const RUBRIC_VERSION = 1;

export const rubricCriterionSchema = z.strictObject({
  description: z.string().min(1).max(500),
  marks: z.number().int().min(1),
  kind: z.enum(RUBRIC_CRITERION_KINDS).optional(),
});

export const rubricPartSchema = z.strictObject({
  part: z.enum(RUBRIC_PARTS),
  maxMarks: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  criteria: z.array(rubricCriterionSchema).min(1).max(RUBRIC_MAX_CRITERIA_PER_PART),
  expectedAnswer: z.string().min(1).max(2000).optional(),
  notes: z.string().min(1).max(1000).optional(),
});

export const cqRubricSchema = z.strictObject({
  format: z.literal('cq_rubric'),
  version: z.literal(RUBRIC_VERSION),
  // Type only. The value rule (`= Σ parts[].maxMarks = questions.marks`) is
  // I-7/I-15's, per §7.7's cross-document section and E-10. See the note above.
  totalMaxMarks: z.number().int(),
  parts: z.array(rubricPartSchema),
});

export type McqStemDocument = z.infer<typeof mcqStemSchema>;
export type CqStemDocument = z.infer<typeof cqStemSchema>;
export type OptionContentDocument = z.infer<typeof optionContentSchema>;
export type CqRubricDocument = z.infer<typeof cqRubricSchema>;

/**
 * Runs a schema and returns either the parsed value or formatted issue strings.
 * Kept here so every caller reports errors in one shape (§7.11 rule 11).
 */
export function parseContent<T>(
  schema: z.ZodType<T>,
  value: unknown,
): { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: string[] } {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, issues: result.error.issues.map(formatIssue) };
}
