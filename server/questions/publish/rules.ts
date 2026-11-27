/**
 * The publish gate — §3.13's invariants as pure rules.
 *
 * WHY THIS IS SEPARATE FROM THE DATABASE LAYER
 *
 * Every rule here takes an explicit, already-loaded `VersionSnapshot` and
 * returns violations. No Prisma import, no I/O, no `server-only`. Two reasons:
 *
 *   1. The rules are testable without a database, so a wrong rule cannot hide
 *      behind a green integration run (see the V-1/V-5 findings — a check that
 *      cannot fail looks exactly like a check that passed).
 *   2. The transactional loader in `./gate.ts` can stay a thin, auditable shell
 *      whose only job is to fetch the snapshot and write the result.
 *
 * WHAT IS ENFORCED WHERE
 *
 * §3.13 assigns each invariant an enforcement point. This module implements the
 * publish-gate half and *relies on* the database half rather than duplicating
 * it:
 *
 *   I-1  storage-enforced by C-1/C-2 where applicable; the gate re-checks the
 *        taxonomy chain because a raw write could still have bypassed it.
 *   I-2  source service, not the publish gate — deliberately absent here.
 *   I-3  rollup — `./gate.ts` writes it in the same transaction as the status
 *        change; `checkStatusRollup` verifies the result.
 *   I-5  immutability of published versions — enforced by refusing the write.
 *   I-6  type immutability once a published version exists.
 *   I-11 contiguity of `version_number` from 1.
 *   I-12 active-row resolution.
 *
 * NO RULE IS INVENTED. Where the documents are silent or ambiguous the code
 * records the ambiguity in a comment and reports it in the final report rather
 * than choosing a behaviour. Those points are listed in `AMBIGUITIES` below so
 * they cannot be lost.
 */

import type { DomainErrorInit } from './errors';
import { isRestrictedAnswerName } from './restricted-names';
// §7.11: the Zod schemas are the specification's executable form. The gate
// enforces §7.2/§7.4/§7.5/§7.12 through them rather than re-implementing
// the rules by hand — see the note on `checkContentProfiles`.
import { safeParseProfile } from '@/lib/validation/content-blocks';
import {
  cqRubricSchema,
  RUBRIC_CRITERION_KINDS,
  RUBRIC_MAX_CRITERIA_PER_PART,
  RUBRIC_PARTS,
  RUBRIC_VERSION,
  type CqRubricDocument,
} from '@/lib/validation/content-blocks/profiles';
import { DomainError, ViolationCollector } from './errors';
import {
  assetIdsIn,
  isContentDocument,
  parseBlockRef,
  subquestionBlocks,
  subquestionMaxMarks,
  subquestionPart,
  walkDocument,
  type LocatedBlock,
} from './content';

/**
 * Ambiguities found while implementing. Listed in code so they travel with the
 * rules; repeated in the final report. NONE is resolved by guessing.
 */
export const AMBIGUITIES = [
  {
    id: 'AMB-1',
    invariant: 'I-5',
    text:
      'I-5 says a published version\'s content, options and key "never change". It does ' +
      'not say whether unpublishing to DRAFT is permitted at all. The database forbids ' +
      'two PUBLISHED versions per question but permits PUBLISHED → DRAFT → PUBLISHED. ' +
      'This implementation therefore treats every write to a version whose status is ' +
      'PUBLISHED as a violation, and does not implement unpublishing.',
    needs: 'Owner decision: is unpublishing a supported transition?',
  },
  {
    id: 'AMB-2',
    invariant: 'I-15',
    text:
      'The part→marks mapping (ক=1, খ=2, গ=3, ঘ=4) is stated as a curriculum fact for ' +
      'the current HSC/ALIM ICT CQ shape. Nothing in the documents says how a different ' +
      'level with a different CQ shape would supply its own mapping. This implementation ' +
      'hard-codes the documented mapping as the single supported profile and fails closed ' +
      'for any other shape, which is the conservative reading.',
    needs: 'Owner decision: is a configurable CQ shape in scope, and where would it live?',
  },
  {
    id: 'AMB-3',
    invariant: 'I-13',
    text:
      '§7.7 rule 5 requires `is_verified` on a published key or rubric. I-13 as tabulated ' +
      'in §3.13 does not mention verification. This implementation enforces the stricter ' +
      'of the two (§7.7 rule 5), because publishing an unverified key is strictly worse ' +
      'than refusing it.',
    needs: 'Owner confirmation that §7.7 rule 5 applies at the publish gate.',
  },
  {
    id: 'AMB-4',
    invariant: 'I-4',
    text:
      'I-4 requires "the four keys are distinct". The database already guarantees ' +
      'distinctness via UNIQUE (version_id, key). The gate additionally requires the four ' +
      'keys to be exactly A–D or exactly ক–ঘ, because a version with keys A, B, C, E would ' +
      'satisfy distinctness while being unusable in the four-column renderer.',
    needs: 'Owner confirmation that the key alphabet is fixed per language.',
  },
  {
    id: 'AMB-5',
    invariant: 'I-6',
    text:
      'I-6 says `questions.type` cannot change "after a published version exists". It does ' +
      'not say whether that means one exists NOW or that one has EVER existed. The two ' +
      'readings differ exactly when every version of a question has been archived: under ' +
      '"ever existed" the type stays frozen forever, under "exists now" the freeze lifts. ' +
      'The schema stores only a current status per version, so "ever existed" is not ' +
      'recoverable once nothing is PUBLISHED.',
    needs:
      'Owner decision: which reading governs? NOTE the current code implements "exists now" ' +
      '(it permits a type change once all versions are ARCHIVED), while the doc-comment above ' +
      'assertTypeChangeAllowed describes "ever existed". The comment is the bug until the rule ' +
      'is decided — see the acceptance audit, section 5.',
  },
] as const;

/** ------------------------------------------------------------------ */
/** Snapshot — exactly what the rules need, in the shape the DB returns. */
/** ------------------------------------------------------------------ */

export type QuestionType = 'MCQ' | 'CQ';
export type QuestionStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type VersionStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface OptionRow {
  readonly id: string;
  readonly key: string;
  readonly sortOrder: number;
  readonly content: unknown;
}

export interface AnswerKeyRow {
  readonly mcqCorrectOptionKey: string | null;
  readonly cqRubric: unknown;
  readonly isVerified: boolean;
}

export interface AssetLinkRow {
  readonly assetId: string;
  readonly blockRef: string;
}

export interface VersionRecordSnapshot {
  readonly id: string;
  readonly versionNumber: number;
  readonly status: VersionStatus;
  readonly content: unknown;
  readonly options: readonly OptionRow[];
  readonly answerKey: AnswerKeyRow | null;
  readonly assetLinks: readonly AssetLinkRow[];
}

/** Taxonomy chain, for I-1 and I-12. Nulls where the column is nullable. */
export interface TaxonomySnapshot {
  readonly educationLevelId: string;
  readonly subjectId: string;
  /** True when the level/subject pair exists in level_subjects (I-1, C-1). */
  readonly subjectOfferedAtLevel: boolean;
  readonly educationLevelActive: boolean;
  readonly subjectActive: boolean;
  readonly chapter: {
    readonly id: string;
    readonly subjectId: string;
    readonly isActive: boolean;
  } | null;
  readonly topic: {
    readonly id: string;
    readonly chapterId: string;
    readonly isActive: boolean;
  } | null;
  readonly subtopic: {
    readonly id: string;
    readonly topicId: string;
    readonly isActive: boolean;
  } | null;
}

export interface QuestionSnapshot {
  readonly id: string;
  readonly type: QuestionType;
  readonly status: QuestionStatus;
  readonly marks: number;
  readonly taxonomy: TaxonomySnapshot;
  readonly versions: readonly VersionRecordSnapshot[];
}

/** ------------------------------------------------------------------ */
/** I-4 — option cardinality and key alphabet                            */
/** ------------------------------------------------------------------ */

/** The four keys an MCQ version must carry. §7.6.2 pins A–D. */
const MCQ_KEYS_EN = ['A', 'B', 'C', 'D'] as const;
/**
 * Bengali option keys as the database allows them (`ck_question_options_key_allowed`).
 * A Bengali-language MCQ uses these four instead; the gate requires one alphabet,
 * not a mixture, because the renderer has four fixed columns.
 */
const MCQ_KEYS_BN = ['ক', 'খ', 'গ', 'ঘ'] as const;

export function checkOptionCardinality(
  type: QuestionType,
  version: VersionRecordSnapshot,
  violations: ViolationCollector,
): void {
  const options = version.options;
  const where = `version ${version.versionNumber}`;

  if (type === 'CQ') {
    if (options.length !== 0) {
      violations.fail({
        code: 'CQ_OPTION_COUNT_INVALID',
        invariant: 'I-4',
        message: `A CQ ${where} must have no options, but ${options.length} were found.`,
        field: 'options',
      });
    }
    return;
  }

  if (options.length !== 4) {
    violations.fail({
      code: 'MCQ_OPTION_COUNT_INVALID',
      invariant: 'I-4',
      message: `An MCQ ${where} must have exactly 4 options, but ${options.length} were found.`,
      field: 'options',
    });
  }

  // The database's UNIQUE (version_id, key) already forbids repeats; this
  // reports it in domain terms before the write would fail on 23505.
  const keys = options.map((o) => o.key);
  if (new Set(keys).size !== keys.length) {
    const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
    violations.fail({
      code: 'OPTION_KEYS_NOT_DISTINCT',
      invariant: 'I-4',
      message: `An MCQ ${where} has duplicate option keys: ${[...new Set(duplicates)].join(', ')}.`,
      field: 'options',
    });
  }

  // AMB-4: the alphabet is not stated as a rule; the renderer's four fixed
  // columns are why it matters. Enforced as one complete alphabet, not a mix.
  if (options.length > 0) {
    const isEn = MCQ_KEYS_EN.every((k) => keys.includes(k));
    const isBn = MCQ_KEYS_BN.every((k) => keys.includes(k));
    if (!isEn && !isBn) {
      // D1: the keys here ARE distinct (A, B, C, E, for instance), so reporting
      // them as "not distinct" told the client the opposite of the truth. The
      // actual failure is the alphabet, and it has its own code.
      violations.fail({
        code: 'OPTION_KEY_ALPHABET_INVALID',
        invariant: 'I-4',
        message:
          `An MCQ ${where} must use the keys A, B, C, D or the keys ক, খ, গ, ঘ ` +
          `(one alphabet, all four). Found: ${keys.join(', ') || '(none)'}.`,
        field: 'options',
      });
    }
  }
}

/** ------------------------------------------------------------------ */
/** I-13 — exactly one valid key, of the right kind, verified            */
/** ------------------------------------------------------------------ */

export function checkAnswerKeyShape(
  type: QuestionType,
  version: VersionRecordSnapshot,
  violations: ViolationCollector,
): void {
  const where = `version ${version.versionNumber}`;
  const key = version.answerKey;

  if (key === null) {
    violations.fail({
      code: type === 'MCQ' ? 'MCQ_ANSWER_KEY_INVALID' : 'CQ_ANSWER_KEY_INVALID',
      invariant: 'I-13',
      message:
        type === 'MCQ'
          ? `An MCQ ${where} needs an answer key naming its correct option; none exists.`
          : `A CQ ${where} needs a marking rubric; none exists.`,
      field: 'answerKey',
    });
    return;
  }

  if (type === 'MCQ') {
    const optionKeys = version.options.map((o) => o.key);
    const mcqKey = key.mcqCorrectOptionKey;
    if (mcqKey === null || !optionKeys.includes(mcqKey)) {
      violations.fail({
        code: 'MCQ_ANSWER_KEY_INVALID',
        invariant: 'I-13',
        message:
          `An MCQ ${where} must name one of its own options as correct` +
          `${mcqKey === null ? '' : `, but "${mcqKey}" is not one of them`}.`,
        field: 'answerKey.mcqCorrectOptionKey',
      });
    }
    if (key.cqRubric !== null && key.cqRubric !== undefined) {
      violations.fail({
        code: 'MCQ_ANSWER_KEY_INVALID',
        invariant: 'I-13',
        message: `An MCQ ${where} must not carry a CQ rubric.`,
        field: 'answerKey.cqRubric',
      });
    }
  } else {
    if (key.mcqCorrectOptionKey !== null) {
      violations.fail({
        code: 'CQ_ANSWER_KEY_INVALID',
        invariant: 'I-13',
        message: `A CQ ${where} must not carry an MCQ answer key.`,
        field: 'answerKey.mcqCorrectOptionKey',
      });
    }
    if (key.cqRubric === null || key.cqRubric === undefined) {
      violations.fail({
        code: 'CQ_ANSWER_KEY_INVALID',
        invariant: 'I-13',
        message: `A CQ ${where} needs a marking rubric.`,
        field: 'answerKey.cqRubric',
      });
    }
  }

  // AMB-3: §7.7 rule 5 requires verification before publish; I-13's table entry
  // does not say so. The stricter reading is applied.
  if (!key.isVerified) {
    violations.fail({
      code: 'ANSWER_KEY_NOT_VERIFIED',
      invariant: 'I-13',
      message:
        `The ${type === 'MCQ' ? 'answer key' : 'rubric'} for ${where} has not been ` +
        `verified. Verify it before publishing.`,
      field: 'answerKey.isVerified',
    });
  }
}

/** /**
 * §7.7 `kind` values for a rubric criterion. Closed list.
 *
 * Defined in the authoritative schema module and re-exported here so existing
 * callers keep one import path; there is no second copy to drift.
 */
export { RUBRIC_CRITERION_KINDS };

export type RubricCriterionKind = (typeof RUBRIC_CRITERION_KINDS)[number];

export interface RubricCriterion {
  readonly description: string;
  readonly marks: number;
  readonly kind?: RubricCriterionKind;
}

export interface RubricPart {
  readonly part: string;
  readonly maxMarks: number;
  readonly criteria: readonly RubricCriterion[];
  readonly expectedAnswer?: string;
  readonly notes?: string;
}

export interface ParsedRubric {
  readonly version: number;
  readonly totalMaxMarks: number;
  readonly parts: readonly RubricPart[];
}

/**
 * Why a rubric was rejected, addressed at the offending property.
 *
 * `path` uses the same `$`-rooted dotted form the leak detector reports and the
 * `field` values the gate already emits, so a form can map it without a second
 * convention. Example: `$.parts[2].criteria[1].kind`.
 */
export interface RubricIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * The subset of a Zod issue this adapter reads. Declared structurally so
 * `rules.ts` does not have to re-export Zod's own types, and so a Zod upgrade
 * that renames an internal type does not ripple through the gate.
 */
interface RubricSchemaIssue {
  readonly code: string;
  readonly path: readonly PropertyKey[];
  readonly message: string;
  readonly keys?: readonly string[];
}

/**
 * Strict §7.7 parse — the PRODUCTION gate's rubric entry point.
 *
 * OD-18: there is exactly ONE validator. This function delegates the entire
 * shape decision to `cqRubricSchema` in
 * `lib/validation/content-blocks/profiles.ts` and does nothing but translate the
 * result into `RubricIssue`. It contains no validation logic of its own, so it
 * cannot disagree with the schema.
 *
 * Why delegation rather than a second implementation: the hand-written parser
 * used to enforce only part of §7.7's shape table (it did not check the `part`
 * alphabet, the 1…4 `maxMarks` bounds, `marks >= 1`, or any of the string-length
 * limits), while the Zod schema enforced all of them but was dead code. Two
 * validators with only one of them on the production path is the defect OD-18
 * names.
 *
 * STRICT still means: an unknown property is an ERROR, not something to discard.
 * A previous generation of this function kept only `{part, maxMarks,
 * criteria:[{marks}]}` and silently dropped `version`, `criteria[].description`,
 * `criteria[].kind`, `expectedAnswer` and `notes` — a marking guide could be
 * quietly reduced to a different document while every check still passed.
 * `strictObject` at every level preserves the same guarantee.
 *
 * Deliberately NOT checked here, matching the schema's scope: the four-part
 * count, part order, the ক=1 … ঘ=4 mapping, `Σ criteria.marks = maxMarks` and
 * `totalMaxMarks = questions.marks`. Those are cross-document facts owned by I-7
 * (`checkRubricMatchesStem`) and I-15 in this same gate. Enforcing them in two
 * places is the second source of truth OD-18 removes.
 */
export function parseRubricStrict(
  value: unknown,
):
  | { readonly ok: true; readonly rubric: ParsedRubric }
  | { readonly ok: false; readonly issue: RubricIssue } {
  const parsed = cqRubricSchema.safeParse(value);
  if (parsed.success) {
    const data: CqRubricDocument = parsed.data;
    return {
      ok: true,
      rubric: {
        version: data.version,
        totalMaxMarks: data.totalMaxMarks,
        parts: data.parts,
      },
    };
  }

  const issue = parsed.error.issues[0] as unknown as RubricSchemaIssue | undefined;
  if (issue === undefined) {
    // Zod reports at least one issue on failure; this branch exists so a future
    // refactor cannot turn "rejected with no detail" into "accepted".
    return { ok: false, issue: { path: '$', message: 'The rubric is not a valid §7.7 document.' } };
  }

  return { ok: false, issue: toRubricIssue(issue) };
}

/** `['parts', 1, 'criteria', 0, 'kind']` → `$.parts[1].criteria[0].kind`. */
function formatRubricPath(path: readonly PropertyKey[]): string {
  let out = '$';
  for (const segment of path) {
    out += typeof segment === 'number' ? `[${String(segment)}]` : `.${String(segment)}`;
  }
  return out;
}

/**
 * Turns a Zod issue into the gate's `{path, message}` form.
 *
 * Messages are written here, not taken from Zod, because they are user-facing
 * (§7.11 rule 11: precise path, no echoing the rejected value) and because Zod's
 * generic wording ("Invalid input: expected 10") would not tell an author what
 * §7.7 requires. Unknown-key issues carry the parent path plus a `keys` list, so
 * the offending level is reconstructed explicitly.
 */
function toRubricIssue(issue: RubricSchemaIssue): RubricIssue {
  const path = formatRubricPath(issue.path);
  const leaf = issue.path[issue.path.length - 1];

  if (issue.code === 'unrecognized_keys') {
    const keys = issue.keys ?? [];
    const noun = keys.length === 1 ? 'property' : 'properties';
    return {
      path: `${path}.${keys[0] ?? '?'}`,
      message:
        `Unrecognised ${noun}: ${keys.join(', ') || '(none reported)'}. ` +
        'Unknown fields are rejected so a marking guide cannot be silently altered.',
    };
  }

  switch (leaf) {
    case 'format':
      return { path, message: 'The rubric format must be the literal "cq_rubric".' };
    case 'version':
      return {
        path,
        message:
          `The rubric version must be the integer ${String(RUBRIC_VERSION)}; ` +
          'any other version is not supported.',
      };
    case 'totalMaxMarks':
      // Type only: §7.7's value rule (`= Σ parts[].maxMarks = questions.marks`)
      // is cross-document and is reported by I-7 / I-15, not by the shape layer.
      return { path, message: 'totalMaxMarks must be an integer (§7.7).' };
    case 'part':
      return {
        path,
        message: `Each part label must be one of ${RUBRIC_PARTS.join(', ')} (§7.7).`,
      };
    case 'maxMarks':
      return { path, message: 'maxMarks must be one of 1, 2, 3, 4 (§7.7).' };
    case 'criteria':
      return issue.code === 'too_big'
        ? {
            path,
            message: `A part may have at most ${String(RUBRIC_MAX_CRITERIA_PER_PART)} criteria (§7.12).`,
          }
        : { path, message: 'A part needs at least one criterion (§7.7).' };
    case 'description':
      return {
        path,
        message: 'Each criterion needs a description of 1 to 500 characters.',
      };
    case 'marks':
      return { path, message: 'Criterion marks must be an integer of at least 1.' };
    case 'kind':
      return {
        path,
        message: `Criterion kind must be one of ${RUBRIC_CRITERION_KINDS.join(', ')}.`,
      };
    case 'expectedAnswer':
      return { path, message: 'expectedAnswer must be a string of 1 to 2000 characters.' };
    case 'notes':
      return { path, message: 'notes must be a string of 1 to 1000 characters.' };
    case 'parts':
      return { path, message: 'The rubric parts must be an array of part objects.' };
    default:
      return { path, message: issue.message };
  }
}

/**
 * Reports a rubric that is present but does not satisfy §7.7's shape.
 *
 * This is the check that makes strictness reach the caller. Before it existed, a
 * malformed or unknown-field rubric made `parseRubric` return null, and every
 * consumer treated null as "already reported elsewhere" and returned — so a
 * rubric rejected for an unknown field produced NO violation at all and the
 * publish would proceed on the strength of the other checks. Rejecting a
 * document and then saying nothing is worse than accepting it.
 *
 * Only runs for a CQ version that HAS a rubric; "missing rubric" is I-13's
 * business (`checkAnswerKeyShape`), and double-reporting it would put two codes
 * on one problem.
 */
export function checkRubricShape(
  version: VersionRecordSnapshot,
  violations: ViolationCollector,
): void {
  const raw = version.answerKey?.cqRubric;
  if (raw === null || raw === undefined) return;

  const result = parseRubricStrict(raw);
  if (result.ok) return;

  violations.fail({
    code: 'CQ_RUBRIC_INVALID',
    message:
      `The rubric of version ${version.versionNumber} is not a valid §7.7 document: ` +
      `${result.issue.message} (at ${result.issue.path})`,
    field: 'answerKey.cqRubric',
  });
}

/**
 * Parses a rubric leniently, returning null on any problem.
 *
 * Kept for the call sites that only need "is this a usable rubric at all" and
 * report their own violation. It is now a thin wrapper over the strict parser,
 * so it can never accept something the strict parser rejects — the two cannot
 * drift the way the two denylists did.
 */
export function parseRubric(value: unknown): ParsedRubric | null {
  const result = parseRubricStrict(value);
  return result.ok ? result.rubric : null;
}

export function checkRubricMatchesStem(
  version: VersionRecordSnapshot,
  violations: ViolationCollector,
): void {
  const where = `version ${version.versionNumber}`;
  const content = version.content;
  const rubric = parseRubric(version.answerKey?.cqRubric);

  if (!isContentDocument(content) || rubric === null) {
    // Already reported by the answer-key and content checks; do not double-count.
    return;
  }

  const stems = subquestionBlocks(content);
  const parts = rubric.parts;

  if (parts.length !== 4) {
    violations.fail({
      code: 'CQ_RUBRIC_PARTS_MISMATCH',
      invariant: 'I-7',
      message: `The rubric for ${where} must have exactly 4 parts, but has ${parts.length}.`,
      field: 'answerKey.cqRubric.parts',
    });
  }

  // §7.7 rule 1: same parts, as a set AND in order.
  const stemParts = stems.map((s) => subquestionPart(s));
  const rubricParts = parts.map((p) => p.part);
  if (stemParts.length !== rubricParts.length || stemParts.some((p, i) => p !== rubricParts[i])) {
    violations.fail({
      code: 'CQ_RUBRIC_PARTS_MISMATCH',
      invariant: 'I-7',
      message:
        `The rubric parts (${rubricParts.join(', ') || 'none'}) must match the ` +
        `subquestions (${stemParts.map((p) => p ?? '?').join(', ') || 'none'}) in order.`,
      field: 'answerKey.cqRubric.parts',
    });
  }

  // §7.7 rule 2: maxMarks agree with the stem.
  stems.forEach((stem, index) => {
    const part = parts[index];
    if (part === undefined) return;
    const stemMarks = subquestionMaxMarks(stem);
    if (stemMarks !== null && stemMarks !== part.maxMarks) {
      violations.fail({
        code: 'CQ_RUBRIC_PARTS_MISMATCH',
        invariant: 'I-7',
        message:
          `Part "${part.part}" is worth ${part.maxMarks} in the rubric but ` +
          `${stemMarks} in the question.`,
        field: `answerKey.cqRubric.parts[${index}].maxMarks`,
      });
    }
  });

  // §7.7 rule 3: the criteria sum to the part's maximum, or the part cannot be
  // awarded in full.
  parts.forEach((part, index) => {
    const sum = part.criteria.reduce((total, c) => total + c.marks, 0);
    if (part.criteria.length === 0 || sum !== part.maxMarks) {
      violations.fail({
        code: 'CQ_RUBRIC_PARTS_MISMATCH',
        invariant: 'I-7',
        message:
          `Part "${part.part}" has criteria worth ${sum} in total, but the part is ` +
          `worth ${part.maxMarks}.`,
        field: `answerKey.cqRubric.parts[${index}].criteria`,
      });
    }
  });

  // §7.7 rule 4: totalMaxMarks equals the sum of the parts.
  const partSum = parts.reduce((total, p) => total + p.maxMarks, 0);
  if (rubric.totalMaxMarks !== partSum) {
    violations.fail({
      code: 'CQ_RUBRIC_PARTS_MISMATCH',
      invariant: 'I-7',
      message: `The rubric's totalMaxMarks is ${rubric.totalMaxMarks} but its parts sum to ${partSum}.`,
      field: 'answerKey.cqRubric.totalMaxMarks',
    });
  }
}

/** ------------------------------------------------------------------ */
/** I-15 — marks agree across three places                               */
/** ------------------------------------------------------------------ */

/**
 * The documented part→marks mapping for the current HSC/ALIM ICT CQ profile.
 * AMB-2: a different curriculum shape is not supported and fails closed.
 */
const CQ_PART_MARKS: ReadonlyArray<{ readonly part: string; readonly marks: number }> = [
  { part: 'ক', marks: 1 },
  { part: 'খ', marks: 2 },
  { part: 'গ', marks: 3 },
  { part: 'ঘ', marks: 4 },
];

export function checkCqMarks(
  questionMarks: number,
  version: VersionRecordSnapshot,
  violations: ViolationCollector,
): void {
  const where = `version ${version.versionNumber}`;
  const content = version.content;
  if (!isContentDocument(content)) return;

  const stems = subquestionBlocks(content);
  const stemMarks = stems.map((s) => subquestionMaxMarks(s));

  // The documented profile: exactly four subquestions with 1/2/3/4.
  const conformsToProfile =
    stems.length === CQ_PART_MARKS.length &&
    CQ_PART_MARKS.every(
      (expected, index) =>
        subquestionPart(stems[index] ?? { type: '' }) === expected.part &&
        stemMarks[index] === expected.marks,
    );

  if (!conformsToProfile) {
    const found = stems
      .map((s, i) => `${subquestionPart(s) ?? '?'}=${stemMarks[i] ?? '?'}`)
      .join(', ');
    violations.fail({
      code: 'CQ_MARKS_MISMATCH',
      invariant: 'I-15',
      message:
        `A CQ ${where} must have four subquestions ক=1, খ=2, গ=3, ঘ=4. ` +
        `Found: ${found || 'none'}.`,
      field: 'content.blocks',
    });
    return;
  }

  const stemSum = stemMarks.reduce<number>((total, m) => total + (m ?? 0), 0);
  const rubric = parseRubric(version.answerKey?.cqRubric);
  const rubricPartSum =
    rubric === null ? null : rubric.parts.reduce<number>((total, p) => total + p.maxMarks, 0);

  if (stemSum !== questionMarks) {
    violations.fail({
      code: 'CQ_MARKS_MISMATCH',
      invariant: 'I-15',
      message: `The subquestions total ${stemSum} marks but the question is worth ${questionMarks}.`,
      field: 'marks',
    });
  }

  if (rubricPartSum !== null && rubricPartSum !== stemSum) {
    violations.fail({
      code: 'CQ_MARKS_MISMATCH',
      invariant: 'I-15',
      message: `The rubric totals ${rubricPartSum} marks but the subquestions total ${stemSum}.`,
      field: 'answerKey.cqRubric',
    });
  }

  if (rubric !== null && rubric.totalMaxMarks !== questionMarks) {
    violations.fail({
      code: 'CQ_MARKS_MISMATCH',
      invariant: 'I-15',
      message: `The rubric's totalMaxMarks is ${rubric.totalMaxMarks} but the question is worth ${questionMarks}.`,
      field: 'answerKey.cqRubric.totalMaxMarks',
    });
  }
}

/** ------------------------------------------------------------------ */
/** I-8 / I-14 — every asset pointer resolves to a block exposing it      */
/** ------------------------------------------------------------------ */

export function checkAssetPointers(
  version: VersionRecordSnapshot,
  violations: ViolationCollector,
): void {
  const where = `version ${version.versionNumber}`;
  const content = version.content;
  const blocks: LocatedBlock[] = [];

  if (isContentDocument(content)) {
    blocks.push(...walkDocument(content, { home: 'content' }));
  }

  for (const option of version.options) {
    if (!isContentDocument(option.content)) continue;
    blocks.push(...walkDocument(option.content, { home: 'option', optionKey: option.key }));
  }

  const byPointer = new Map<string, LocatedBlock>();
  for (const located of blocks) byPointer.set(located.blockRef, located);

  const seen = new Set<string>();
  for (const link of version.assetLinks) {
    if (seen.has(link.blockRef)) {
      violations.fail({
        code: 'ASSET_POINTER_DUPLICATE',
        invariant: 'I-8',
        message: `The asset location "${link.blockRef}" is linked twice.`,
        field: 'assets',
      });
      continue;
    }
    seen.add(link.blockRef);

    // I-14: the pointer must be the documented grammar at all.
    if (parseBlockRef(link.blockRef) === null) {
      violations.fail({
        code: 'ASSET_POINTER_UNRESOLVED',
        invariant: 'I-14',
        message: `"${link.blockRef}" is not a valid asset location.`,
        field: 'assets',
      });
      continue;
    }

    const located = byPointer.get(link.blockRef);
    if (located === undefined) {
      violations.fail({
        code: 'ASSET_POINTER_UNRESOLVED',
        invariant: 'I-14',
        message: `The asset location "${link.blockRef}" does not exist in ${where}'s content.`,
        field: 'assets',
      });
      continue;
    }

    // I-8: the block at that exact location must expose this asset.
    if (!assetIdsIn(located.block).includes(link.assetId)) {
      violations.fail({
        code: 'ASSET_POINTER_UNRESOLVED',
        invariant: 'I-8',
        message:
          `The asset location "${link.blockRef}" does not reference this asset. ` +
          `Check that the block and the link agree.`,
        field: 'assets',
      });
    }
  }

  // The reverse direction: a block that renders an asset with no link is an
  // orphan the renderer would try to fetch from nowhere.
  for (const located of blocks) {
    for (const assetId of assetIdsIn(located.block)) {
      if (
        !version.assetLinks.some((l) => l.blockRef === located.blockRef && l.assetId === assetId)
      ) {
        violations.fail({
          code: 'ASSET_POINTER_UNRESOLVED',
          invariant: 'I-8',
          message: `The block at "${located.blockRef}" uses an asset that is not linked to this version.`,
          field: 'assets',
        });
      }
    }
  }
}

/** ------------------------------------------------------------------ */
/** I-11 — version numbers are contiguous from 1                          */
/** ------------------------------------------------------------------ */

export function checkVersionNumbering(
  versions: readonly VersionRecordSnapshot[],
  violations: ViolationCollector,
): void {
  const numbers = [...versions.map((v) => v.versionNumber)].sort((a, b) => a - b);
  const expected = numbers.map((_, index) => index + 1);
  const missing = expected.filter((n) => !numbers.includes(n));
  const duplicated = numbers.filter((n, i) => numbers.indexOf(n) !== i);
  const hasNonPositive = numbers.some((n) => n < 1);

  if (missing.length > 0 || duplicated.length > 0 || hasNonPositive) {
    violations.fail({
      code: 'VERSION_NUMBER_GAP',
      invariant: 'I-11',
      message:
        `Version numbers must run 1…${numbers.length} with no gaps. ` +
        (missing.length > 0 ? `Missing: ${missing.join(', ')}. ` : '') +
        (duplicated.length > 0 ? `Duplicated: ${[...new Set(duplicated)].join(', ')}. ` : '') +
        (hasNonPositive ? 'A version number is below 1.' : ''),
      field: 'versions',
    });
  }
}

/** ------------------------------------------------------------------ */
/** I-1 / I-12 — taxonomy chain resolves and nothing inactive is used     */
/** ------------------------------------------------------------------ */

export function checkTaxonomy(question: QuestionSnapshot, violations: ViolationCollector): void {
  const t = question.taxonomy;

  // I-1: subject offered at level (also C-1's storage half, re-checked because
  // a raw write can bypass a service but not the FK — and if the FK is ever
  // dropped this check is what remains).
  if (!t.subjectOfferedAtLevel) {
    violations.fail({
      code: 'INACTIVE_ROW_REFERENCED',
      invariant: 'I-1',
      message: 'The chosen subject is not offered at the chosen education level.',
      field: 'subjectId',
    });
  }

  // I-12: archived/retired rows are never the target of new references.
  if (!t.educationLevelActive) {
    violations.fail({
      code: 'INACTIVE_ROW_REFERENCED',
      invariant: 'I-12',
      message: 'The chosen education level is no longer active.',
      field: 'educationLevelId',
    });
  }
  if (!t.subjectActive) {
    violations.fail({
      code: 'INACTIVE_ROW_REFERENCED',
      invariant: 'I-12',
      message: 'The chosen subject is no longer active.',
      field: 'subjectId',
    });
  }
  if (t.chapter !== null) {
    if (!t.chapter.isActive) {
      violations.fail({
        code: 'INACTIVE_ROW_REFERENCED',
        invariant: 'I-12',
        message: 'The chosen chapter is no longer active.',
        field: 'chapterId',
      });
    }
    if (t.chapter.subjectId !== t.subjectId) {
      violations.fail({
        code: 'INACTIVE_ROW_REFERENCED',
        invariant: 'I-1',
        message: 'The chosen chapter does not belong to the chosen subject.',
        field: 'chapterId',
      });
    }
  }
  if (t.topic !== null) {
    if (t.chapter === null) {
      violations.fail({
        code: 'INACTIVE_ROW_REFERENCED',
        invariant: 'I-1',
        message: 'A topic was chosen without its chapter.',
        field: 'topicId',
      });
    } else if (t.topic.chapterId !== t.chapter.id) {
      violations.fail({
        code: 'INACTIVE_ROW_REFERENCED',
        invariant: 'I-1',
        message: 'The chosen topic does not belong to the chosen chapter.',
        field: 'topicId',
      });
    }
    if (!t.topic.isActive) {
      violations.fail({
        code: 'INACTIVE_ROW_REFERENCED',
        invariant: 'I-12',
        message: 'The chosen topic is no longer active.',
        field: 'topicId',
      });
    }
  }
  if (t.subtopic !== null) {
    if (t.topic === null) {
      violations.fail({
        code: 'INACTIVE_ROW_REFERENCED',
        invariant: 'I-1',
        message: 'A subtopic was chosen without its topic.',
        field: 'subtopicId',
      });
    } else if (t.subtopic.topicId !== t.topic.id) {
      violations.fail({
        code: 'INACTIVE_ROW_REFERENCED',
        invariant: 'I-1',
        message: 'The chosen subtopic does not belong to the chosen topic.',
        field: 'subtopicId',
      });
    }
    if (!t.subtopic.isActive) {
      violations.fail({
        code: 'INACTIVE_ROW_REFERENCED',
        invariant: 'I-12',
        message: 'The chosen subtopic is no longer active.',
        field: 'subtopicId',
      });
    }
  }
}

/** ------------------------------------------------------------------ */
/** §7.5 — the content profiles the checks above rely on                  */
/** ------------------------------------------------------------------ */

/**
 * Scans raw JSON for a restricted answer-bearing property name at any depth.
 *
 * §7.5 forbids these in stem, option and content documents — a leaked answer in a
 * student-facing document is the single worst failure this system can have.
 *
 * The name list lives in `restricted-names.ts`, shared with the student
 * projection, so the two boundaries cannot diverge again.
 */
export function findAnswerRevealingProperty(value: unknown, path = '$'): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = findAnswerRevealingProperty(value[i], `${path}[${i}]`);
      if (found !== null) return found;
    }
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isRestrictedAnswerName(key)) {
      return `${path}.${key}`;
    }
    const found = findAnswerRevealingProperty(child, `${path}.${key}`);
    if (found !== null) return found;
  }
  return null;
}

/**
 * §7.5 — maps the question type to the profile schema that governs its content.
 *
 * This is the ONLY place the gate chooses a profile, so the mapping cannot drift
 * between the stem check and any future caller.
 */
function profileFor(type: QuestionType): 'mcq_stem' | 'cq_stem' {
  return type === 'MCQ' ? 'mcq_stem' : 'cq_stem';
}

/**
 * §7.5 profiles, §7.4 block shapes and §7.12 limits — enforced through the
 * approved Zod schemas.
 *
 * THIS FUNCTION NO LONGER CONTAINS THE RULES. It previously re-implemented
 * §7.5 by hand (a `paragraph` presence check, an option type allowlist, a
 * subquestion-ordering scan) while §7.4 and §7.12 were enforced nowhere. That was
 * a second representation of an approved specification, and §7.11 rule 1 forbids
 * exactly that: "the Zod schemas are the specification's executable form".
 *
 * Two boundaries are kept distinct here, deliberately:
 *
 *   1. **Answer-revealing names** (§7.5) are checked FIRST and reported under
 *      their own message. Zod cannot produce that message — the property is
 *      unknown to the schema, so it fails as `unrecognized key`. Keeping the
 *      explicit scan means the operator sees "carries an answer-revealing
 *      property at $.blocks[0].data.correct" instead of "Unrecognized key:
 *      correct". The scan is a REPORTING refinement; the rejection itself is
 *      enforced twice, by the scan and by Zod's strictness.
 *
 *   2. **Domain error codes** are preserved (`CONTENT_PROFILE_INVALID`). A Zod
 *      failure is a schema failure; a `DomainError` is what a caller switches on
 *      and what `toPublicError` serialises. Mapping one to the other here keeps
 *      the gate's contract stable while the enforcement moves.
 */
export function checkContentProfiles(
  type: QuestionType,
  version: VersionRecordSnapshot,
  violations: ViolationCollector,
): void {
  const where = `version ${version.versionNumber}`;
  const content = version.content;

  // (1) Answer-revealing property names — reported precisely, before Zod turns
  // them into a generic unrecognized-key error.
  const revealed = findAnswerRevealingProperty(content);
  if (revealed !== null) {
    violations.fail({
      code: 'CONTENT_PROFILE_INVALID',
      message: `The content of ${where} carries an answer-revealing property at ${revealed}.`,
      field: 'content',
    });
  }

  // (2) The approved schema does the rest: envelope literals (§7.2), ten block
  // shapes (§7.4), profile composition (§7.5) and every §7.12 limit.
  const profile = profileFor(type);
  const result = safeParseProfile(profile, content);
  if (!result.ok) {
    // One violation per distinct issue, capped so a 200-block document cannot
    // produce 200 lines of output. The first issue is the actionable one.
    for (const issue of result.issues.slice(0, 5)) {
      violations.fail({
        code: 'CONTENT_PROFILE_INVALID',
        message: `The ${profile} content of ${where} is not valid — ${issue}`,
        field: 'content',
      });
    }
    if (result.issues.length > 5) {
      violations.fail({
        code: 'CONTENT_PROFILE_INVALID',
        message:
          `The ${profile} content of ${where} has ${result.issues.length} problems; ` +
          'the first five are reported above.',
        field: 'content',
      });
    }
    return;
  }

  // (3) Options are governed by the `option` profile (§7.5), not by the stem
  // profile, so they are validated separately — exactly as they are stored
  // separately.
  for (const option of version.options) {
    const optionResult = safeParseProfile('option', option.content);
    if (!optionResult.ok) {
      for (const issue of optionResult.issues.slice(0, 3)) {
        violations.fail({
          code: 'CONTENT_PROFILE_INVALID',
          message: `Option ${option.key} of ${where} is not valid — ${issue}`,
          field: `options.${option.key}`,
        });
      }
    }
  }
}

/** ------------------------------------------------------------------ */
/** The gate — every check, one entry point                              */
/** ------------------------------------------------------------------ */

export interface PublishGateResult {
  readonly violations: readonly DomainErrorInit[];
}

/**
 * Runs every publish-gate rule against a loaded snapshot and returns all
 * violations at once.
 *
 * I-3 and I-6 are NOT here: they describe what a *write* may do (the status
 * rollup, and forbidding a type change), so they belong to the transactional
 * service in `./gate.ts` where the write is controlled. `checkStatusRollup`
 * below verifies I-3's post-condition.
 */
export function evaluatePublishGate(question: QuestionSnapshot): PublishGateResult {
  const violations = new ViolationCollector();

  checkVersionNumbering(question.versions, violations);
  checkTaxonomy(question, violations);

  for (const version of question.versions) {
    checkContentProfiles(question.type, version, violations);
    checkOptionCardinality(question.type, version, violations);
    checkAnswerKeyShape(question.type, version, violations);

    if (question.type === 'CQ') {
      // Shape first: a rubric with unknown fields is rejected on its own terms
      // rather than only being noticed through a downstream disagreement.
      checkRubricShape(version, violations);
      checkRubricMatchesStem(version, violations);
      checkCqMarks(question.marks, version, violations);
    }

    checkAssetPointers(version, violations);
  }

  return { violations: violations.list().map(toInit) };
}

function toInit(error: DomainError): DomainErrorInit {
  return {
    code: error.code,
    message: error.message,
    ...(error.invariant === undefined ? {} : { invariant: error.invariant }),
    ...(error.field === undefined ? {} : { field: error.field }),
    ...(error.constraintNames === undefined ? {} : { constraintNames: error.constraintNames }),
  };
}

/** True when the gate would allow the publish, given the snapshot. */
export function isPublishable(question: QuestionSnapshot): boolean {
  return evaluatePublishGate(question).violations.length === 0;
}

/** ------------------------------------------------------------------ */
/** I-3 — the status rollup, checked rather than assumed                 */
/** ------------------------------------------------------------------ */

/**
 * I-3: `questions.status` is a rollup of its versions — PUBLISHED iff a
 * published version exists; ARCHIVED iff all versions are archived.
 *
 * The service computes it; this verifies the computed value before it is
 * written, so a bug in the rollup cannot silently persist a wrong status.
 */
export function deriveQuestionStatus(versions: readonly VersionRecordSnapshot[]): QuestionStatus {
  if (versions.length === 0) return 'DRAFT';
  if (versions.some((v) => v.status === 'PUBLISHED')) return 'PUBLISHED';
  if (versions.every((v) => v.status === 'ARCHIVED')) return 'ARCHIVED';
  return 'DRAFT';
}

export function checkStatusRollup(
  question: QuestionSnapshot,
  violations: ViolationCollector,
): void {
  const derived = deriveQuestionStatus(question.versions);
  if (derived !== question.status) {
    violations.fail({
      code: 'QUESTION_STATUS_ROLLUP_MISMATCH',
      invariant: 'I-3',
      message:
        `The question's status is ${question.status}, but its versions make it ${derived}. ` +
        `The status must be derived from the versions, not set independently.`,
      field: 'status',
    });
  }
}

/** ------------------------------------------------------------------ */
/** I-5 / I-6 — write permissions the service must refuse               */
/** ------------------------------------------------------------------ */

/**
 * I-5: a published version's content, options and key never change.
 *
 * Called by the service for every write that targets an existing version. The
 * check is a non-exported guard in spirit: it throws rather than collecting,
 * because a caller attempting this has a bug, not invalid user input.
 */
export function assertVersionMutable(version: {
  readonly status: VersionStatus;
  readonly versionNumber: number;
}): void {
  if (version.status === 'PUBLISHED') {
    throw new DomainError({
      code: 'PUBLISHED_VERSION_IMMUTABLE',
      invariant: 'I-5',
      message:
        `Version ${version.versionNumber} is published and cannot be changed. ` +
        `Create a new version to make a correction.`,
    });
  }
}

/**
 * AMB-5 (owner-approved, fail-closed) — a fully archived question cannot change
 * type without an explicit review.
 *
 * ENFORCES THE OWNER DECISION, NOT A GUESS. The legacy archived-record recovery
 * policy is FAIL CLOSED:
 *
 *   "For fully archived questions whose historical publication status cannot be
 *    reliably reconstructed: do not automatically permit question-type changes;
 *    require an explicit review/exception path; do not treat missing historical
 *    data as proof that the question was never published; do not silently infer
 *    historical publication status."
 *
 * This function throws for a type change on a question with at least one version
 * where EVERY version is `ARCHIVED`. That state is exactly "historical
 * publication status cannot be reliably reconstructed", because the schema keeps
 * only a current status per version.
 *
 * ── Scope, deliberately narrow ───────────────────────────────────────────
 *
 * It fires ONLY when there is at least one version and all of them are archived.
 * It does not fire:
 *   - when a version is published  → `assertTypeChangeAllowed` refuses outright;
 *   - when a draft exists          → history is not yet at stake, and a draft-only
 *                                    question was demonstrably not published in
 *                                    its current form;
 *   - when there are no versions   → nothing was published by definition.
 *
 * ── What this is and is not ──────────────────────────────────────────────
 *
 * It is a REVIEW GATE, not a record. It cannot tell whether an archived version
 * was ever published; it only refuses to let that unknown be resolved silently in
 * the caller's favour.
 *
 * ── No exception parameter exists, deliberately ──────────────────────────
 *
 * An earlier revision took an optional per-call flag that skipped this gate
 * entirely. It was removed rather than documented:
 *
 *   - No production caller ever passed it. Both entry points
 *     (`changeQuestionType`, `assertQuestionTypeChangeAllowed`) invoke this
 *     function with three arguments, and the only code that ever set the flag
 *     was a test asserting the flag worked — circular evidence.
 *   - A flag that resolves "publication status unknowable" in the caller's
 *     favour IS the silent inference the owner decision forbids. Making it
 *     per-call rather than global changes how visible the bypass is, not
 *     whether it is one.
 *   - The owner decision says an exception requires an explicit REVIEW. A
 *     boolean in a domain function is not a review: it carries no reviewer, no
 *     reason and no record.
 *
 * Consequence, stated plainly: this function cannot be disarmed. A fully
 * archived question either gets a new question created instead, or the exception
 * is implemented as a separately-approved, auditable mechanism. That decision is
 * outstanding and is recorded in
 * `docs/database/g1-spike/option-c/prod-ready/v45/AMB-5-LEGACY-ARCHIVE-DECISION.md`.
 * This function must not be described as providing an exception path.
 *
 * Historical publication tracking is NOT implemented, and this function must not
 * be described as implementing it. See the AMB-5 note on
 * `assertTypeChangeAllowed` and `docs/database/g1-spike/option-c/prod-ready/v45/
 * AMB-5-LEGACY-ARCHIVE-DECISION.md` for the limitation and its dependency.
 */
export function assertLegacyArchiveReviewRequired(
  nextType: QuestionType,
  currentType: QuestionType,
  versions: readonly VersionRecordSnapshot[],
): void {
  if (nextType === currentType) return;
  if (versions.length === 0) return;
  if (!versions.every((v) => v.status === 'ARCHIVED')) return;

  // A SPECIFIC code, not QUESTION_TYPE_IMMUTABLE. The distinction is the whole
  // point of AMB-5: "a published version exists" and "publication status is
  // unknown" call for different remediation, and only the second one is a
  // consequence of the missing historical tracking.
  throw new DomainError({
    code: 'QUESTION_TYPE_CHANGE_REVIEW_REQUIRED',
    invariant: 'I-6',
    message:
      "This question's versions are all archived, so whether it was ever published cannot be " +
      'determined. Changing its type (MCQ or CQ) requires an explicit review and exception; ' +
      'missing history is not evidence that it was never published. Create a new question instead.',
  });
}

/**
 * I-6: `questions.type` cannot change once a published version exists.
 *
 * AMB-5 — OWNER DECISION: FAIL CLOSED FOR LEGACY ARCHIVED RECORDS.
 *
 * I-6 says the type cannot change "after a published version exists". The
 * documents did not say whether that means one exists NOW or has EVER existed.
 * The owner has now decided the *recovery policy for legacy archived questions*,
 * and it is fail-closed:
 *
 *   - A question whose versions are all ARCHIVED must NOT have its type changed
 *     automatically. Its historical publication status cannot be reconstructed,
 *     so it must not be treated as never-published.
 *   - Such a question requires an explicit review/exception path before a type
 *     change is allowed. (Owner decision of 2026-11-24, Option 1: that path is
 *     deliberately CLOSED — the review happens outside the application, and no
 *     flag or service method can grant it. See
 *     `AMB-5-LEGACY-ARCHIVE-DECISION.md` §3.)
 *   - Missing history must never be read as proof of non-publication.
 *
 * WHAT THIS FUNCTION DOES, PRECISELY. It still refuses only when a version is
 * published RIGHT NOW (`versions.some(...) === 'PUBLISHED'`), because the schema
 * stores a current status per version and nothing else. `assertTypeChangeAllowed`
 * therefore implements the "currently published" half of the rule. The
 * fail-closed legacy half is enforced by `assertLegacyArchiveReviewRequired`
 * above, which callers must run for the all-archived case.
 *
 * WHY THE FUNCTION IS NOT ITSELF FAIL-CLOSED. It cannot distinguish "all
 * archived, was published" from "all archived, never published" — the schema
 * destroys that difference on archival. Making this function throw on every
 * all-archived question would be fail-closed, but it would ALSO silently forbid
 * type changes on questions that were only ever drafts and then archived. That
 * is a real behaviour change affecting live workflows, so it is not made here.
 * The explicit review requirement is the safe form: refuse to act silently,
 * require a human.
 *
 * ── Known limitation, stated so it is not mistaken for completeness ────────
 *
 * Historical publication tracking is NOT implemented. There is no
 * `first_published_at` column, no publication-event table, and no backfill. The
 * fail-closed policy is a REVIEW GATE, not a record. Complete tracking requires
 * a schema change and a backfill whose residual set is unrecoverable for
 * questions already fully archived — both subject to separate approval
 * (Migration 0002 is NOT authorised; B2 is WITHHELD).
 *
 * An earlier revision of this comment claimed the stricter reading was already
 * applied. It was not, and the comment was the defect.
 */
export function assertTypeChangeAllowed(
  nextType: QuestionType,
  currentType: QuestionType,
  versions: readonly VersionRecordSnapshot[],
): void {
  if (nextType !== currentType && versions.some((v) => v.status === 'PUBLISHED')) {
    throw new DomainError({
      code: 'QUESTION_TYPE_IMMUTABLE',
      invariant: 'I-6',
      message:
        'This question already has a published version, so its type (MCQ or CQ) can no longer change. ' +
        'Create a new question instead.',
    });
  }
}

/** ------------------------------------------------------------------ */
/** Phase 04B — separation of duties                                    */
/** ------------------------------------------------------------------ */

/**
 * The user who last edited a draft version cannot publish it, unless they are
 * SUPER_ADMIN.
 *
 * `lastEditorId` is the version's `updated_by`, falling back to `created_by`
 * (a version nobody has edited since creation was last edited by its author).
 * When both are NULL the version pre-dates migration 0002 and has no recorded
 * author; there is no identity to compare against, so the rule cannot fire.
 *
 * Pure: the caller reads the ids inside its own transaction and passes them in.
 */
export function assertSeparationOfDuties(input: {
  readonly actorId: string;
  readonly actorIsSuperAdmin: boolean;
  readonly lastEditorId: string | null;
}): void {
  if (input.actorIsSuperAdmin) return;
  if (input.lastEditorId === null) return;
  if (input.lastEditorId !== input.actorId) return;
  throw new DomainError({
    code: 'FORBIDDEN',
    invariant: 'separation-of-duties',
    message:
      'You were the last person to edit this version, so someone else must publish it. ' +
      'Ask another moderator to review and publish it.',
  });
}
