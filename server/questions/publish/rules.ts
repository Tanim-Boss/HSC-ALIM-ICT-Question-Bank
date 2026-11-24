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

/** ------------------------------------------------------------------ */
/** I-7 — rubric parts mirror the stem's four subquestions               */
/** ------------------------------------------------------------------ */

interface RubricPart {
  readonly part: string;
  readonly maxMarks: number;
  readonly criteria: readonly { readonly marks: number }[];
}

export interface ParsedRubric {
  readonly totalMaxMarks: number;
  readonly parts: readonly RubricPart[];
}

/**
 * Parses a rubric defensively. Returns null rather than throwing so the caller
 * reports a domain violation instead of a crash on malformed JSON.
 */
export function parseRubric(value: unknown): ParsedRubric | null {
  if (typeof value !== 'object' || value === null) return null;
  const root = value as Record<string, unknown>;
  if (root['format'] !== 'cq_rubric') return null;
  if (typeof root['totalMaxMarks'] !== 'number') return null;
  const rawParts = root['parts'];
  if (!Array.isArray(rawParts)) return null;

  const parts: RubricPart[] = [];
  for (const rawPart of rawParts) {
    if (typeof rawPart !== 'object' || rawPart === null) return null;
    const part = rawPart as Record<string, unknown>;
    if (typeof part['part'] !== 'string') return null;
    if (typeof part['maxMarks'] !== 'number') return null;
    const rawCriteria = part['criteria'];
    if (!Array.isArray(rawCriteria)) return null;

    const criteria: { marks: number }[] = [];
    for (const rawCriterion of rawCriteria) {
      if (typeof rawCriterion !== 'object' || rawCriterion === null) return null;
      const marks = (rawCriterion as Record<string, unknown>)['marks'];
      if (typeof marks !== 'number') return null;
      criteria.push({ marks });
    }
    parts.push({ part: part['part'], maxMarks: part['maxMarks'], criteria });
  }

  return { totalMaxMarks: root['totalMaxMarks'], parts };
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

/** §7.5 `option` profile: the only block types an option may contain. */
const ALLOWED_OPTION_TYPES: readonly string[] = ['paragraph', 'math', 'image', 'code'];

/** Property names that would leak an answer if they ever appeared in content. */
const ANSWER_REVEALING_PROPERTIES = [
  'correctAnswer',
  'isCorrect',
  'correct',
  'answerKey',
  'solution',
  'expectedAnswer',
  'explanation',
] as const;

/**
 * Scans raw JSON for an answer-revealing property name at any depth.
 * §7.5 forbids these in stem, option and content documents — a leaked answer in
 * a student-facing document is the single worst failure this system can have.
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
    if ((ANSWER_REVEALING_PROPERTIES as readonly string[]).includes(key)) {
      return `${path}.${key}`;
    }
    const found = findAnswerRevealingProperty(child, `${path}.${key}`);
    if (found !== null) return found;
  }
  return null;
}

export function checkContentProfiles(
  type: QuestionType,
  version: VersionRecordSnapshot,
  violations: ViolationCollector,
): void {
  const where = `version ${version.versionNumber}`;
  const content = version.content;

  if (!isContentDocument(content)) {
    violations.fail({
      code: 'CONTENT_PROFILE_INVALID',
      message: `The content of ${where} is not a valid content document.`,
      field: 'content',
    });
    return;
  }

  const revealed = findAnswerRevealingProperty(content);
  if (revealed !== null) {
    violations.fail({
      code: 'CONTENT_PROFILE_INVALID',
      message: `The content of ${where} carries an answer-revealing property at ${revealed}.`,
      field: 'content',
    });
  }

  if (type === 'MCQ') {
    // mcq_stem: ≥1 block, ≥1 paragraph, no subquestion, no leading heading.
    const blocks = content.blocks;
    if (blocks.length === 0) {
      violations.fail({
        code: 'CONTENT_PROFILE_INVALID',
        message: `The stem of ${where} is empty.`,
        field: 'content.blocks',
      });
    }
    if (!blocks.some((b) => b.type === 'paragraph')) {
      violations.fail({
        code: 'CONTENT_PROFILE_INVALID',
        message: `The stem of ${where} needs at least one paragraph of text.`,
        field: 'content.blocks',
      });
    }
    if (blocks.some((b) => b.type === 'subquestion')) {
      violations.fail({
        code: 'CONTENT_PROFILE_INVALID',
        message: `An MCQ stem (${where}) must not contain subquestions.`,
        field: 'content.blocks',
      });
    }
    if (blocks[0]?.type === 'heading') {
      violations.fail({
        code: 'CONTENT_PROFILE_INVALID',
        message: `An MCQ stem (${where}) must not begin with a heading.`,
        field: 'content.blocks',
      });
    }

    // option profile: 1…3 blocks, only paragraph/math/image/code.
    for (const option of version.options) {
      if (!isContentDocument(option.content)) {
        violations.fail({
          code: 'CONTENT_PROFILE_INVALID',
          message: `Option ${option.key} of ${where} is not a valid content document.`,
          field: `options.${option.key}`,
        });
        continue;
      }
      const bad = option.content.blocks.filter((b) => !ALLOWED_OPTION_TYPES.includes(b.type));
      if (option.content.blocks.length < 1 || option.content.blocks.length > 3 || bad.length > 0) {
        violations.fail({
          code: 'CONTENT_PROFILE_INVALID',
          message:
            `Option ${option.key} of ${where} must hold 1–3 blocks of type ` +
            `paragraph, math, image or code; found ${option.content.blocks.map((b) => b.type).join(', ') || 'none'}.`,
          field: `options.${option.key}`,
        });
      }
      const optionRevealed = findAnswerRevealingProperty(option.content);
      if (optionRevealed !== null) {
        violations.fail({
          code: 'CONTENT_PROFILE_INVALID',
          message: `Option ${option.key} of ${where} carries an answer-revealing property at ${optionRevealed}.`,
          field: `options.${option.key}`,
        });
      }
    }
    return;
  }

  // cq_stem: ≥1 stimulus block (non-subquestion) then exactly four
  // subquestions in ক→ঘ order. I-15 checks the marks; this checks the shape.
  const blocks = content.blocks;
  const stimulusCount = blocks.filter((b) => b.type !== 'subquestion').length;
  if (stimulusCount === 0) {
    violations.fail({
      code: 'CONTENT_PROFILE_INVALID',
      message: `The CQ stem of ${where} needs at least one stimulus block before its subquestions.`,
      field: 'content.blocks',
    });
  }
  const stems = subquestionBlocks(content);
  const firstSubquestionIndex = blocks.findIndex((b) => b.type === 'subquestion');
  if (
    firstSubquestionIndex >= 0 &&
    blocks.slice(firstSubquestionIndex).some((b) => b.type !== 'subquestion')
  ) {
    violations.fail({
      code: 'CONTENT_PROFILE_INVALID',
      message: `All subquestions of ${where} must come last, after the stimulus.`,
      field: 'content.blocks',
    });
  }
  for (const stem of stems) {
    if (stem.data?.['blocks'] !== undefined && Array.isArray(stem.data['blocks'])) {
      const nested = stem.data['blocks'] as readonly unknown[];
      const heading = nested.some(
        (b) =>
          typeof b === 'object' &&
          b !== null &&
          (b as Record<string, unknown>)['type'] === 'heading',
      );
      if (heading) {
        violations.fail({
          code: 'CONTENT_PROFILE_INVALID',
          message: `A subquestion of ${where} must not contain a heading.`,
          field: 'content.blocks',
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
 * I-6: `questions.type` cannot change once a published version exists.
 *
 * AMB-5 — WHICH READING FIRST, THEN WHAT THE CODE DOES.
 *
 * The documents do not say whether the freeze applies once ANY version has been
 * published (including after every version is archived) or only while one is
 * published right now.
 *
 * The code below implements the SECOND reading — "a published version exists
 * now" — because `versions.some(v => v.status === 'PUBLISHED')` is false once
 * everything is archived. That is not a preference: the schema stores a current
 * status per version and nothing else, so "was ever published" is not
 * recoverable once nothing is PUBLISHED. The stricter reading would need a new
 * column, which is a schema change this work is not authorised to make.
 *
 * An earlier revision of this comment claimed the stricter reading was applied.
 * It was not, and the comment was the defect: a reader would have believed a
 * guarantee the code does not provide.
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
