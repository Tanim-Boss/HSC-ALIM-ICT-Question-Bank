/**
 * §7.4 — the ten approved block types, as a discriminated union.
 *
 * §7.11 rule 2: "`z.discriminatedUnion('type', [...])` gives an exhaustive
 * compile-time list and O(1) dispatch. A new block type cannot be added without
 * adding a schema branch, and an unknown branch is unrepresentable."
 *
 * That is literally what happens here: `CONTENT_BLOCK_SCHEMA` is built from the
 * same list the type is derived from, so an eleventh block type requires editing
 * this file. §7.9: the allowlist is closed, resolved recursively, with no
 * skip-with-warning and no passthrough.
 *
 * NOTHING HERE INVENTS A PROPERTY. Every field and every limit is copied from the
 * §7.4 table for that block type and from §7.12. Where the specification marks a
 * property optional, it is `.optional()`; where it marks one required, it is not.
 * The two that are easy to get backwards are called out at their definitions.
 */

import { z } from 'zod';

import {
  ALIGNS,
  assetIdSchema,
  CALLOUT_KINDS,
  CODE_LANGUAGES,
  CQ_PARTS,
  DISPLAYS,
  LANGS,
  langSchema,
  LIMITS,
  listItemSchema,
  tableCellSchema,
} from './envelope';

/** A string of 1 … max characters, the only string rule §7.12 uses. */
function text(max: number) {
  return z.string().min(1).max(max);
}

/** §7.4.1 `paragraph` — text is required; `lang` and `align` optional. */
export const paragraphSchema = z.strictObject({
  type: z.literal('paragraph'),
  data: z.strictObject({
    text: text(LIMITS.paragraphTextMax),
    lang: langSchema,
    align: z.enum(ALIGNS).optional(),
  }),
});

/** §7.4.2 `heading` — text 1…200, level 1…3, both required. */
export const headingSchema = z.strictObject({
  type: z.literal('heading'),
  data: z.strictObject({
    text: text(LIMITS.headingTextMax),
    level: z.number().int().min(1).max(LIMITS.headingLevelMax),
    lang: langSchema,
  }),
});

/**
 * §7.4.3 `list` — `start` is "Only legal when `ordered` is `true`".
 *
 * §7.4.3's own invalid example is `{ordered: false, start: 3}`: "accepting it
 * silently would hide an authoring bug". A plain object schema cannot express
 * that, so it is a refinement — §7.11 rule 5 puts exactly this class of rule in
 * `.superRefine`.
 */
export const listSchema = z
  .strictObject({
    type: z.literal('list'),
    data: z.strictObject({
      ordered: z.boolean(),
      items: z.array(listItemSchema).min(1).max(LIMITS.listItemsMax),
      start: z.number().int().min(1).max(LIMITS.listStartMax).optional(),
      lang: langSchema,
    }),
  })
  .superRefine((block, ctx) => {
    if (block.data.start !== undefined && !block.data.ordered) {
      ctx.addIssue({
        code: 'custom',
        path: ['data', 'start'],
        message: 'start is only legal when ordered is true',
      });
    }
  });

/**
 * §7.4.4 `table` — 1…30 rows, 1…8 cells per row.
 *
 * The per-row cell count is enforced by the array bounds on the inner array, so a
 * ragged table with a 9-cell row is rejected at `blocks[i].data.rows[j]`.
 */
export const tableSchema = z.strictObject({
  type: z.literal('table'),
  data: z.strictObject({
    rows: z
      .array(z.array(tableCellSchema).min(1).max(LIMITS.tableCellsPerRowMax))
      .min(1)
      .max(LIMITS.tableRowsMax),
    headerRow: z.boolean().optional(),
    caption: text(LIMITS.captionMax).optional(),
    lang: langSchema,
  }),
});

/**
 * §7.4.5 `image` — `alt` is OPTIONAL here.
 *
 * §7.4.5: "Falls back to `question_assets.alt_text`, which is `NOT NULL`; an
 * explicit `alt` may refine it." §7.4.8 says the opposite for `flowchart`
 * ("Required here, unlike `image`"). Making `alt` required on an image would
 * reject valid documents, so the distinction is preserved exactly.
 */
export const imageSchema = z.strictObject({
  type: z.literal('image'),
  data: z.strictObject({
    assetId: assetIdSchema,
    alt: text(LIMITS.altMax).optional(),
    longDescription: text(LIMITS.longDescriptionMax).optional(),
    display: z.enum(DISPLAYS).optional(),
    caption: text(LIMITS.captionMax).optional(),
  }),
});

/** §7.4.6 `math` — latex 1…2000, no `$` delimiters. */
export const mathSchema = z
  .strictObject({
    type: z.literal('math'),
    data: z.strictObject({
      latex: text(LIMITS.latexMax),
      display: z.enum(DISPLAYS).optional(),
      label: text(LIMITS.mathLabelMax).optional(),
    }),
  })
  .superRefine((block, ctx) => {
    // §7.4.6: "KaTeX-compatible LaTeX, **no `$` delimiters**". Delimiters belong
    // to inline math inside a paragraph, not to the latex PropertyValue.
    if (/\$/.test(block.data.latex)) {
      ctx.addIssue({
        code: 'custom',
        path: ['data', 'latex'],
        message: 'latex must not contain $ delimiters',
      });
    }
  });

/** §7.4.7 `code` — language is one of four, code 1…5000. */
export const codeSchema = z.strictObject({
  type: z.literal('code'),
  data: z.strictObject({
    language: z.enum(CODE_LANGUAGES),
    code: text(LIMITS.codeMax),
    caption: text(LIMITS.captionMax).optional(),
    showLineNumbers: z.boolean().optional(),
  }),
});

/**
 * §7.4.8 `flowchart` — points at an asset; `alt` is REQUIRED.
 *
 * A flowchart carries no node/edge geometry in content. The diagram lives in the
 * asset, which is what makes the rooted-pointer rule (I-8) enforceable and what
 * puts the diagram under the §7.10 SVG controls.
 */
export const flowchartSchema = z.strictObject({
  type: z.literal('flowchart'),
  data: z.strictObject({
    assetId: assetIdSchema,
    alt: text(LIMITS.altMax),
    description: text(LIMITS.descriptionMax).optional(),
    caption: text(LIMITS.captionMax).optional(),
  }),
});

/** §7.4.9 `callout` — the discriminator is `kind`, not a free-form tone. */
export const calloutSchema = z.strictObject({
  type: z.literal('callout'),
  data: z.strictObject({
    kind: z.enum(CALLOUT_KINDS),
    text: text(LIMITS.calloutTextMax),
    title: text(LIMITS.calloutTitleMax).optional(),
    lang: langSchema,
  }),
});

/**
 * §7.4.10 `subquestion` — the single type that may nest.
 *
 * `blocks` is 0 … 10 and its members come from the NARROWER nested allowlist:
 * "`paragraph`, `list`, `table`, `image`, `math`, `code`, `flowchart`, `callout`.
 * **Not** `subquestion` (no nesting) and **not** `heading`".
 *
 * §7.11 rule 4: recursion is explicit and bounded, and "depth is bounded
 * structurally (no `subquestion` inside `subquestion`) rather than by a runtime
 * depth counter, so there is no unbounded recursion to exploit." The `z.lazy`
 * below therefore refers to the NESTED union, not to the full union — a
 * self-reference to the full union would allow unbounded nesting.
 */
const nonNestingBlockSchemas = [
  paragraphSchema,
  tableSchema,
  z.lazy(() => listSchema),
  imageSchema,
  mathSchema,
  codeSchema,
  flowchartSchema,
  calloutSchema,
] as const;

export const subquestionSchema = z.strictObject({
  type: z.literal('subquestion'),
  data: z.strictObject({
    part: z.enum(CQ_PARTS),
    maxMarks: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    instruction: text(LIMITS.instructionMax).optional(),
    blocks: z
      .array(z.discriminatedUnion('type', nonNestingBlockSchemas))
      .max(LIMITS.nestedBlocksPerSubquestionMax)
      .optional(),
  }),
});

/**
 * §7.4 — all ten block schemas, each tagged with the §7.4 subsection it came
 * from. The tag is metadata for tests and documentation; it is not part of the
 * wire shape (a block has exactly `type` and `data`).
 */
export const BLOCK_SCHEMAS = {
  paragraph: { section: '7.4.1', schema: paragraphSchema },
  heading: { section: '7.4.2', schema: headingSchema },
  list: { section: '7.4.3', schema: listSchema },
  table: { section: '7.4.4', schema: tableSchema },
  image: { section: '7.4.5', schema: imageSchema },
  math: { section: '7.4.6', schema: mathSchema },
  code: { section: '7.4.7', schema: codeSchema },
  flowchart: { section: '7.4.8', schema: flowchartSchema },
  callout: { section: '7.4.9', schema: calloutSchema },
  subquestion: { section: '7.4.10', schema: subquestionSchema },
} as const;

/**
 * §7.4.0: the closed allowlist of ten. §7.9: "no 'unknown block' placeholder
 * type, no skip-with-warning and no passthrough of unrecognised `data`."
 */
export const ALL_BLOCK_SCHEMAS = [
  paragraphSchema,
  headingSchema,
  listSchema,
  tableSchema,
  imageSchema,
  mathSchema,
  codeSchema,
  flowchartSchema,
  calloutSchema,
  subquestionSchema,
] as const;

/** The discriminated union of all ten. */
export const contentBlockSchema = z.discriminatedUnion('type', ALL_BLOCK_SCHEMAS);

export type ContentBlock = z.infer<typeof contentBlockSchema>;
export type ParagraphBlock = z.infer<typeof paragraphSchema>;
export type TableBlock = z.infer<typeof tableSchema>;
export type ImageBlock = z.infer<typeof imageSchema>;
export type FlowchartBlock = z.infer<typeof flowchartSchema>;
export type CalloutBlock = z.infer<typeof calloutSchema>;
export type SubquestionBlock = z.infer<typeof subquestionSchema>;

/** §7.4.10: the nested allowlist, exported for the catalogue-agreement test. */
export const NESTED_BLOCK_TYPES: readonly string[] = [
  'paragraph',
  'list',
  'table',
  'image',
  'math',
  'code',
  'flowchart',
  'callout',
];

/** Re-exported so a consumer needs one import for the language enum. */
export { LANGS };
