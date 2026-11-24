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
 * This schema is the executable form of §7.7; `parseRubricStrict` in `rules.ts`
 * is being migrated to consume it (see the note in `lib/validation/content-blocks/
 * index.ts`). Both reject the same documents, and a test asserts that.
 */
export const rubricCriterionSchema = z.strictObject({
  description: z.string().min(1).max(500),
  marks: z.number().int().min(1),
  kind: z.enum(['knowledge', 'comprehension', 'application', 'analysis']).optional(),
});

export const rubricPartSchema = z.strictObject({
  part: z.enum(['ক', 'খ', 'গ', 'ঘ']),
  maxMarks: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  criteria: z.array(rubricCriterionSchema).min(1).max(6),
  expectedAnswer: z.string().min(1).max(2000).optional(),
  notes: z.string().min(1).max(1000).optional(),
});

export const cqRubricSchema = z.strictObject({
  format: z.literal('cq_rubric'),
  version: z.literal(1),
  totalMaxMarks: z.literal(10),
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
