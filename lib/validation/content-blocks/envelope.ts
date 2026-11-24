/**
 * §7.2 envelope, §7.12 limits and the shared primitives.
 *
 * IMPLEMENTATION OF AN APPROVED SPECIFICATION, NOT A PROPOSAL.
 * OD-18 request B was approved in Revision 4
 * (`docs/database/phase-04a-question-bank-physical-schema-proposal.md` `:5`,
 * `:39`, `:56`). §7 is the specification of record; §7.11 fixes this module
 * layout and §7.12 fixes every numeric limit used below. Nothing here invents a
 * property, a type or a limit.
 *
 * WHY ZOD AND NOT HAND-WRITTEN CHECKS. §7.11 rule 1: "the Zod schemas are the
 * specification's executable form; TypeScript types are `z.infer<>` of them. No
 * parallel hand-written interface". A hand-written validator would be a second
 * representation of §7 that can drift from this one — which is exactly the defect
 * the two answer-name denylists had before they were unified.
 *
 * STRICT EVERYWHERE (§7.2, §7.11 rule 3). `z.strictObject` at the envelope, every
 * block, every nested item. An unexpected property is an error: "Ignoring unknown
 * properties is what lets a typo or an injected field travel silently through
 * publish and appear in a renderer years later."
 */

import { z } from 'zod';

/** §7.12 — the hard limits, in one place, each citing the specification. */
export const LIMITS = {
  /** §7.12: "Blocks per document — 200". §7.2: empty arrays are rejected. */
  blocksPerDocumentMin: 1,
  blocksPerDocumentMax: 200,
  /** §7.12: "Nested blocks per `subquestion` — 10". §7.4.10: 0 … 10. */
  nestedBlocksPerSubquestionMax: 10,
  /** §7.4.1: paragraph text 1 … 5000. */
  paragraphTextMax: 5000,
  /** §7.4.2: heading text 1 … 200; level 1 … 3. */
  headingTextMax: 200,
  headingLevelMax: 3,
  /** §7.4.3: list items 1 … 30, each text 1 … 2000; start 1 … 999. */
  listItemsMax: 30,
  listItemTextMax: 2000,
  listStartMax: 999,
  /** §7.4.4: table rows 1 … 30, cells per row 1 … 8, cell text 1 … 1000, colspan 1 … 8. */
  tableRowsMax: 30,
  tableCellsPerRowMax: 8,
  tableCellTextMax: 1000,
  tableColspanMax: 8,
  /** §7.4.4 / §7.4.5 / §7.4.8: caption and alt 1 … 300. */
  captionMax: 300,
  altMax: 300,
  /** §7.4.5: longDescription 1 … 2000. §7.4.8: description 1 … 2000. */
  longDescriptionMax: 2000,
  descriptionMax: 2000,
  /** §7.4.6: latex 1 … 2000; label 1 … 500. */
  latexMax: 2000,
  mathLabelMax: 500,
  /** §7.4.7: code 1 … 5000. */
  codeMax: 5000,
  /** §7.4.9: callout text 1 … 1000; title 1 … 120. */
  calloutTextMax: 1000,
  calloutTitleMax: 120,
  /** §7.4.10: instruction 1 … 1000. */
  instructionMax: 1000,
  /** §7.12: "Assets per version — 50". Applied at the version level. */
  assetsPerVersionMax: 50,
} as const;

/** §7.4: the two approved text languages. Default `"bn"`. */
export const LANGS = ['bn', 'en'] as const;
/** §7.4.1: logical alignment — never left/right. */
export const ALIGNS = ['start', 'center', 'end'] as const;
/** §7.4.5 / §7.4.6: display mode. */
export const DISPLAYS = ['inline', 'block'] as const;
/** §7.4.7: "the four languages the ICT curriculum exercises". */
export const CODE_LANGUAGES = ['c', 'html', 'sql', 'pseudo'] as const;
/** §7.4.9: callout kinds — "no colour is carried in content". */
export const CALLOUT_KINDS = ['info', 'warning', 'important'] as const;
/** §7.4.10: the four CQ parts. */
export const CQ_PARTS = ['ক', 'খ', 'গ', 'ঘ'] as const;

/** A string of `1 … max` characters. §7.12 limits are all "1 … N chars". */
function text(max: number) {
  return z.string().min(1).max(max);
}

/** The optional language tag every text-bearing block shares. */
export const langSchema = z.enum(LANGS).optional();

/**
 * §7.4.5 / §7.4.8: an asset reference by UUID.
 *
 * Only the SHAPE is checked here. Whether the asset exists and is linked at the
 * right rooted pointer is I-8/I-14 and needs the database — see
 * `checkAssetPointers` in `rules.ts`, which remains the authority for that.
 */
export const assetIdSchema = z.uuid();

/**
 * §7.4.4: a table cell is either a plain string or a rich cell object.
 *
 * The object form is strict for the same reason every other object is: an
 * unrecognised key inside a cell is a typo that would otherwise travel to print.
 */
export const tableCellSchema = z.union([
  text(LIMITS.tableCellTextMax),
  z.strictObject({
    text: text(LIMITS.tableCellTextMax),
    lang: z.enum(LANGS).optional(),
    header: z.boolean().optional(),
    align: z.enum(ALIGNS).optional(),
    colspan: z.number().int().min(1).max(LIMITS.tableColspanMax).optional(),
  }),
]);

/** §7.4.3: a list item is `{ text, lang? }`. */
export const listItemSchema = z.strictObject({
  text: text(LIMITS.listItemTextMax),
  lang: z.enum(LANGS).optional(),
});

/**
 * §7.2: the `rich_blocks` envelope.
 *
 * `format` is a literal and `version` a literal 1 — §7.2: "Any other value is
 * rejected; there is no fallback", and §7.8: "an unknown version is a validation
 * error, not a fallback to the newest schema".
 *
 * The previous implementation checked only that these were *present*
 * (`isContentDocument`), which accepted `{format: "anything", version: 99}` and
 * was recorded as gap G-7 in `OD-18-COVERAGE.md`. This closes it.
 */
export const envelopeShape = {
  format: z.literal('rich_blocks'),
  version: z.literal(1),
};

/** Error text style used throughout, matching §7.9's `blocks[i].prop: reason`. */
export function formatIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path.length === 0 ? '(root)' : issue.path.join('.');
  return `${path}: ${issue.message}`;
}
