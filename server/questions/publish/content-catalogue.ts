/**
 * §7.4 block catalogue — as DATA, because §7 is approved and the code previously
 * had no representation of it.
 *
 * WHY THIS MODULE EXISTS. OD-18 (request B) was approved in Revision 4, but the
 * implementation enforced only the *envelope* and the four *profiles*. The
 * per-block structure in §7.4 — which properties each of the ten block types has,
 * which are required, and the §7.12 character limits — was implemented nowhere.
 * That gap was invisible because the database comment says "block shapes are
 * validated by Zod (§7.11)" and the Zod layer does not exist.
 *
 * WHAT THIS IS AND IS NOT.
 *
 *   - It IS the §7.4 catalogue expressed once, as data, with each entry citing
 *     the §7.4 subsection it comes from. It exists so the block type list and the
 *     per-type field requirements are not re-typed in three places.
 *   - It is NOT a Zod schema and does NOT validate documents. Enforcing it needs
 *     the schema layer, which is blocked on OD-17 for anything wire-facing (see
 *     `docs/database/g1-spike/option-c/prod-ready/v45/OD-17-DEPENDENCY.md`).
 *   - It does NOT invent fields. Every property listed appears in the §7.4 table
 *     for that block type. Where §7.4 and §7.12 disagree, §7.12 governs the limit
 *     and the discrepancy is recorded in the coverage document rather than
 *     resolved here.
 *
 * WHY DATA FIRST RATHER THAN SCHEMAS. A schema that cannot be wired to a boundary
 * is dead code; a catalogue is checkable NOW — the tests assert it matches §7.4's
 * ten types and that the profiles in `rules.ts` are subsets of it. That converts
 * "we believe we implement §7" into an assertion that fails when the two drift.
 */

/** A property requirement from a §7.4 per-block table. */
export interface BlockProperty {
  readonly name: string;
  readonly type: 'string' | 'integer' | 'boolean' | 'array' | 'object';
  readonly required: boolean;
}

export interface BlockTypeSpec {
  readonly type: string;
  /** The §7.4 subsection that specifies this block. */
  readonly specSection: string;
  readonly properties: readonly BlockProperty[];
  /** True only for `subquestion`, which is the single type that may nest. */
  readonly acceptsNestedBlocks: boolean;
}

/**
 * The ten approved block types, in §7.4 order.
 *
 * Ten is not a coincidence to be adjusted: §7.4.0 says "Ten types" and the
 * reviewer approved that list. Adding an eleventh block type requires a schema
 * version bump (§7.8) and a specification change, so this array is deliberately
 * `as const` and its length is asserted by tests.
 */
export const BLOCK_CATALOGUE: readonly BlockTypeSpec[] = [
  {
    type: 'paragraph',
    specSection: '7.4.1',
    acceptsNestedBlocks: false,
    properties: [
      { name: 'text', type: 'string', required: true },
      { name: 'lang', type: 'string', required: false },
      { name: 'align', type: 'string', required: false },
    ],
  },
  {
    type: 'heading',
    specSection: '7.4.2',
    acceptsNestedBlocks: false,
    properties: [
      { name: 'text', type: 'string', required: true },
      { name: 'level', type: 'integer', required: true },
      { name: 'lang', type: 'string', required: false },
    ],
  },
  {
    type: 'list',
    specSection: '7.4.3',
    acceptsNestedBlocks: false,
    properties: [
      { name: 'ordered', type: 'boolean', required: true },
      { name: 'items', type: 'array', required: true },
      { name: 'start', type: 'integer', required: false },
    ],
  },
  {
    type: 'table',
    specSection: '7.4.4',
    acceptsNestedBlocks: false,
    properties: [
      { name: 'rows', type: 'array', required: true },
      { name: 'headerRow', type: 'boolean', required: false },
      { name: 'caption', type: 'string', required: false },
      { name: 'lang', type: 'string', required: false },
    ],
  },
  {
    // §7.4.5: `alt` is OPTIONAL for an image — it falls back to the asset row's
    // NOT NULL alt_text. It is required for a flowchart (§7.4.8). Getting this
    // backwards would reject valid images, so it is called out here.
    type: 'image',
    specSection: '7.4.5',
    acceptsNestedBlocks: false,
    properties: [
      { name: 'assetId', type: 'string', required: true },
      { name: 'alt', type: 'string', required: false },
      { name: 'longDescription', type: 'string', required: false },
      { name: 'display', type: 'string', required: false },
      { name: 'caption', type: 'string', required: false },
    ],
  },
  {
    type: 'math',
    specSection: '7.4.6',
    acceptsNestedBlocks: false,
    properties: [
      { name: 'latex', type: 'string', required: true },
      { name: 'display', type: 'string', required: false },
      { name: 'label', type: 'string', required: false },
    ],
  },
  {
    type: 'code',
    specSection: '7.4.7',
    acceptsNestedBlocks: false,
    properties: [
      { name: 'language', type: 'string', required: true },
      { name: 'code', type: 'string', required: true },
      { name: 'caption', type: 'string', required: false },
      { name: 'showLineNumbers', type: 'boolean', required: false },
    ],
  },
  {
    // §7.4.8: a flowchart carries `assetId` + REQUIRED `alt`, not node/edge
    // geometry. The diagram lives in the asset; the content block only points at
    // it, which is what makes the pointer-integrity rule (I-8) enforceable.
    type: 'flowchart',
    specSection: '7.4.8',
    acceptsNestedBlocks: false,
    properties: [
      { name: 'assetId', type: 'string', required: true },
      { name: 'alt', type: 'string', required: true },
      { name: 'description', type: 'string', required: false },
      { name: 'caption', type: 'string', required: false },
    ],
  },
  {
    // §7.4.9: the discriminator is `kind` ("info" | "warning" | "important"),
    // not a free-form "tone".
    type: 'callout',
    specSection: '7.4.9',
    acceptsNestedBlocks: false,
    properties: [
      { name: 'kind', type: 'string', required: true },
      { name: 'text', type: 'string', required: true },
      { name: 'title', type: 'string', required: false },
      { name: 'lang', type: 'string', required: false },
    ],
  },
  {
    type: 'subquestion',
    specSection: '7.4.10',
    acceptsNestedBlocks: true,
    properties: [
      { name: 'part', type: 'string', required: true },
      { name: 'maxMarks', type: 'integer', required: true },
      { name: 'instruction', type: 'string', required: false },
      { name: 'blocks', type: 'array', required: false },
    ],
  },
] as const;

/** §7.4.10: the nested allowlist. `subquestion` and `heading` are excluded. */
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

/** The §7.4 block type names, in order. */
export const BLOCK_TYPES: readonly string[] = BLOCK_CATALOGUE.map((b) => b.type);

/**
 * The four approved document profiles (§7.5) and where each applies.
 *
 * `rules.ts` implements these by hand (`checkContentProfiles`); this table is the
 * declarative counterpart so a test can assert the two agree.
 */
export const DOCUMENT_PROFILES: readonly {
  readonly name: string;
  readonly home: string;
  readonly specSection: string;
  /** Block types the profile permits; `null` means "any of the ten". */
  readonly allowedTypes: readonly string[] | null;
  /** Block types the profile forbids outright. */
  readonly forbiddenTypes: readonly string[];
}[] = [
  {
    name: 'mcq_stem',
    home: 'question_versions.content where questions.type = MCQ',
    specSection: '7.5',
    allowedTypes: null,
    forbiddenTypes: ['subquestion'],
  },
  {
    name: 'cq_stem',
    home: 'question_versions.content where questions.type = CQ',
    specSection: '7.5',
    allowedTypes: null,
    // A CQ stem forbids `heading` *inside a subquestion*, not at the top level;
    // the top level has no outright ban. Encoded as "no top-level ban" here and
    // checked in `checkContentProfiles`.
    forbiddenTypes: [],
  },
  {
    name: 'option',
    home: 'question_options.content',
    specSection: '7.5',
    allowedTypes: ['paragraph', 'math', 'image', 'code'],
    forbiddenTypes: ['heading', 'list', 'table', 'callout', 'flowchart', 'subquestion'],
  },
  {
    name: 'cq_rubric',
    home: 'answer_keys.cq_rubric',
    specSection: '7.7',
    // The rubric is not a block document at all; see `parseRubricStrict`.
    allowedTypes: [],
    forbiddenTypes: [...BLOCK_TYPES],
  },
] as const;

/** True when `type` is one of the ten approved block types. */
export function isApprovedBlockType(type: string): boolean {
  return BLOCK_TYPES.includes(type);
}
