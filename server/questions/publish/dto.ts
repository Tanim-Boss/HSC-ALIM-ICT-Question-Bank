/**
 * Response shaping — the boundary where answer keys stop.
 *
 * §7.7 states the rubric is "read only by staff-authorized surfaces", and §7.5
 * forbids answer-revealing properties in any content document. Both are only
 * worth anything if the *serialisation* boundary enforces them, because a
 * service that returns a full row to a route handler will eventually be wired
 * to a student-facing page by someone in a hurry.
 *
 * So this module is an allowlist, not a blocklist: each DTO lists the fields it
 * may carry and copies exactly those. A column added to the schema tomorrow is
 * therefore absent from every student DTO by default, and adding it is a
 * deliberate act. `tests/unit/questions/dto.test.ts` asserts the negative — that
 * no key, rubric or verification field survives the student projection even
 * when the input object is a complete row.
 *
 * Deliberately dependency-free so it can be unit-tested and reused anywhere.
 */

import type { QuestionStatus, QuestionType, VersionStatus } from './rules';

/** Who is asking. There is no 'anonymous' case: auth happens before this. */
export type Audience = 'student' | 'staff';

/** A question as a student may see it. No correctness, no provenance detail. */
export interface StudentQuestionDTO {
  readonly id: string;
  readonly type: QuestionType;
  readonly difficulty: string;
  readonly marks: number;
  /** The published version's content, with answer-revealing properties removed. */
  readonly content: unknown;
  /** Option keys and content only — correctness lives in `answer_keys`, never here. */
  readonly options: readonly { readonly key: string; readonly content: unknown }[];
}

/** A question as staff may see it. Staff surfaces are authenticated + authorized. */
export interface StaffQuestionDTO extends StudentQuestionDTO {
  readonly status: QuestionStatus;
  readonly versionId: string;
  readonly versionStatus: VersionStatus;
  readonly isVerified: boolean;
  readonly answerKey: {
    readonly mcqCorrectOptionKey: string | null;
    readonly cqRubric: unknown;
    readonly isVerified: boolean;
  } | null;
}

/** The subset of a loaded row these projections read. */
export interface QuestionRowLike {
  readonly id: string;
  readonly type: QuestionType;
  readonly status: QuestionStatus;
  readonly difficulty: string;
  readonly marks: number;
  readonly version: {
    readonly id: string;
    readonly status: VersionStatus;
    readonly content: unknown;
    readonly options: readonly { readonly key: string; readonly content: unknown }[];
    readonly answerKey: {
      readonly mcqCorrectOptionKey: string | null;
      readonly cqRubric: unknown;
      readonly isVerified: boolean;
    } | null;
  };
}

/** Keys that must never reach a student, checked again at the boundary. */
const FORBIDDEN_IN_STUDENT_OUTPUT = [
  'mcqCorrectOptionKey',
  'cqRubric',
  'answerKey',
  'isVerified',
  'verifiedAt',
  'notes',
  'correctAnswer',
  'isCorrect',
  'solution',
  'expectedAnswer',
  'explanation',
] as const;

/**
 * Removes answer-revealing properties from a content document at any depth.
 *
 * This is belt-and-braces: the publish gate already refuses to publish content
 * that contains them (§7.5). This exists because the gate protects what is
 * *written*, and this protects what is *returned* — and the second is what a
 * student actually sees.
 */
export function stripAnswerRevealing(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripAnswerRevealing);
  if (typeof value !== 'object' || value === null) return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if ((FORBIDDEN_IN_STUDENT_OUTPUT as readonly string[]).includes(key)) continue;
    out[key] = stripAnswerRevealing(child);
  }
  return out;
}

/** Builds the student projection. Copies an allowlist; never spreads the row. */
export function toStudentQuestion(row: QuestionRowLike): StudentQuestionDTO {
  return {
    id: row.id,
    type: row.type,
    difficulty: row.difficulty,
    marks: row.marks,
    content: stripAnswerRevealing(row.version.content),
    options: row.version.options.map((option) => ({
      key: option.key,
      content: stripAnswerRevealing(option.content),
    })),
  };
}

/**
 * Builds the staff projection. Only call this from a surface that has already
 * authorized a staff role — it cannot check the caller itself, by design: an
 * authorization check inside a mapper is the kind of thing that gets copied
 * into a student path along with the mapper.
 */
export function toStaffQuestion(row: QuestionRowLike): StaffQuestionDTO {
  const answerKey = row.version.answerKey;
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    difficulty: row.difficulty,
    marks: row.marks,
    versionId: row.version.id,
    versionStatus: row.version.status,
    isVerified: answerKey?.isVerified ?? false,
    content: row.version.content,
    options: row.version.options.map((option) => ({
      key: option.key,
      content: option.content,
    })),
    answerKey:
      answerKey === null
        ? null
        : {
            mcqCorrectOptionKey: answerKey.mcqCorrectOptionKey,
            cqRubric: answerKey.cqRubric,
            isVerified: answerKey.isVerified,
          },
  };
}

/**
 * Verifies a produced object contains no forbidden key at any depth.
 *
 * Exported so tests — and a runtime assertion in development — can prove the
 * projection rather than trusting the allowlist by inspection.
 */
export function findLeakedField(value: unknown, path = '$'): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = findLeakedField(value[i], `${path}[${i}]`);
      if (found !== null) return found;
    }
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if ((FORBIDDEN_IN_STUDENT_OUTPUT as readonly string[]).includes(key)) {
      return `${path}.${key}`;
    }
    const found = findLeakedField(child, `${path}.${key}`);
    if (found !== null) return found;
  }
  return null;
}

/** Throws in non-production when a student projection leaks a forbidden field. */
export function assertNoLeak(dto: unknown, label: string): void {
  if (process.env['NODE_ENV'] === 'production') return;
  const leaked = findLeakedField(dto);
  if (leaked !== null) {
    throw new Error(`${label}: student DTO leaked a protected field at ${leaked}`);
  }
}
