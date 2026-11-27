/**
 * Input validation for the authoring commands.
 *
 * Two layers, deliberately separate:
 *
 *   1. SHAPE — Zod schemas below. Ids are UUIDs, enums are the generated Prisma
 *      enums, numbers are bounded, unknown properties are rejected. A failure is
 *      `VALIDATION_FAILED` with the field path.
 *   2. CONTENT — `validateDraft`, which runs the EXISTING content-block profiles
 *      from lib/validation/content-blocks (`mcq_stem` / `cq_stem`, `option`,
 *      `cq_rubric`). There is no third content model here. A failure is
 *      `CONTENT_PROFILE_INVALID` with the field path.
 *
 * A draft may be INCOMPLETE: fewer than four options, no answer key yet, no
 * rubric yet. Completeness (I-4, I-7, I-13, I-15, …) stays the publish gate's
 * job. What a draft may not be is structurally invalid: a stem document must
 * pass its profile, each option document must pass `option`, a rubric must pass
 * `cq_rubric`, and the correct option must be one of the draft's options.
 *
 * Pure: no Prisma client, no `server-only`.
 */

import { z } from 'zod';

import type { Prisma } from '@/lib/generated/prisma/client';
import {
  QuestionDifficulty,
  QuestionStatus,
  QuestionType,
  SourceType,
} from '@/lib/generated/prisma/enums';
import { safeParseProfile } from '@/lib/validation/content-blocks';
import { DomainError } from '@/server/shared/errors';

/** The option keys the database accepts (ck_question_options_key_allowed). */
export const OPTION_KEYS = ['A', 'B', 'C', 'D', 'ক', 'খ', 'গ', 'ঘ'] as const;
export type OptionKey = (typeof OPTION_KEYS)[number];

export const PAGE_SIZE_MAX = 50;
export const PAGE_SIZE_DEFAULT = 20;

const id = z.uuid();
const requestId = z.string().trim().min(1).max(128).optional();
const json = z.json();

/** A timestamp from the client: a Date or an ISO-8601 string with offset. */
const timestamp = z
  .union([z.date(), z.iso.datetime({ offset: true })])
  .transform((value) => (value instanceof Date ? value : new Date(value)));

const optionInput = z.strictObject({
  key: z.enum(OPTION_KEYS),
  content: json,
});

const answerKeyInput = z.union([
  z.strictObject({ mcqCorrectOptionKey: z.enum(OPTION_KEYS) }),
  z.strictObject({ cqRubric: json }),
]);

/**
 * The editable part of a version. Replacement semantics: what is sent is what
 * the version holds afterwards. Omitted `options` means none; omitted or null
 * `answerKey` means no key yet.
 */
export const draftInputSchema = z
  .strictObject({
    content: json,
    options: z.array(optionInput).max(4).default([]),
    answerKey: answerKeyInput.nullable().default(null),
  })
  .superRefine((draft, ctx) => {
    const seen = new Set<string>();
    draft.options.forEach((option, index) => {
      if (seen.has(option.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['options', index, 'key'],
          message: `option key ${option.key} is used twice`,
        });
      }
      seen.add(option.key);
    });
  });

export type DraftInput = z.infer<typeof draftInputSchema>;

const sourceInput = z
  .strictObject({
    sourceType: z.enum(SourceType),
    boardId: id.optional(),
    collegeId: id.optional(),
    academicYearId: id.optional(),
    sourceName: z.string().trim().min(1).max(200).optional(),
  })
  .refine((s) => s.boardId === undefined || s.collegeId === undefined, {
    message: 'a source names a board or a college, not both',
    path: ['collegeId'],
  });

export const createQuestionInputSchema = z
  .strictObject({
    type: z.enum(QuestionType),
    difficulty: z.enum(QuestionDifficulty).default(QuestionDifficulty.MEDIUM),
    marks: z.number().int().min(0).max(100),
    educationLevelId: id,
    subjectId: id,
    chapterId: id.optional(),
    topicId: id.optional(),
    subtopicId: id.optional(),
    tagIds: z.array(id).max(20).default([]),
    sources: z.array(sourceInput).max(10).default([]),
    draft: draftInputSchema,
    requestId,
  })
  .superRefine((input, ctx) => {
    if (input.topicId !== undefined && input.chapterId === undefined) {
      ctx.addIssue({ code: 'custom', path: ['chapterId'], message: 'a topic requires a chapter' });
    }
    if (input.subtopicId !== undefined && input.topicId === undefined) {
      ctx.addIssue({ code: 'custom', path: ['topicId'], message: 'a subtopic requires a topic' });
    }
    if (input.type === QuestionType.MCQ && input.marks < 1) {
      ctx.addIssue({ code: 'custom', path: ['marks'], message: 'an MCQ is worth at least 1 mark' });
    }
    if (new Set(input.tagIds).size !== input.tagIds.length) {
      ctx.addIssue({ code: 'custom', path: ['tagIds'], message: 'a tag is listed twice' });
    }
  });

export const saveDraftInputSchema = z.strictObject({
  questionId: id,
  versionId: id,
  expectedUpdatedAt: timestamp,
  draft: draftInputSchema,
  requestId,
});

export const createRevisionInputSchema = z.strictObject({ questionId: id, requestId });

export const verifyAnswerKeyInputSchema = z.strictObject({
  questionId: id,
  versionId: id,
  requestId,
});

export const archiveQuestionInputSchema = z.strictObject({ questionId: id, requestId });

export const archiveVersionInputSchema = z.strictObject({
  questionId: id,
  versionId: id,
  requestId,
});

export const listQuestionsInputSchema = z.strictObject({
  educationLevelId: id.optional(),
  subjectId: id.optional(),
  chapterId: id.optional(),
  topicId: id.optional(),
  type: z.enum(QuestionType).optional(),
  status: z.enum(QuestionStatus).optional(),
  difficulty: z.enum(QuestionDifficulty).optional(),
  boardId: id.optional(),
  academicYearId: id.optional(),
  tagId: id.optional(),
  limit: z.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
  cursor: z.string().min(1).max(200).optional(),
});

export const getQuestionInputSchema = z.strictObject({ questionId: id });

/** What callers pass. Validated again at runtime: the types are a convenience, not a guard. */
export type CreateQuestionInput = z.input<typeof createQuestionInputSchema>;
export type SaveDraftInput = z.input<typeof saveDraftInputSchema>;
export type CreateRevisionInput = z.input<typeof createRevisionInputSchema>;
export type VerifyAnswerKeyInput = z.input<typeof verifyAnswerKeyInputSchema>;
export type ArchiveQuestionInput = z.input<typeof archiveQuestionInputSchema>;
export type ArchiveVersionInput = z.input<typeof archiveVersionInputSchema>;
export type ListQuestionsInput = z.input<typeof listQuestionsInputSchema>;
export type GetQuestionInput = z.input<typeof getQuestionInputSchema>;

/* ------------------------------------------------------------------------- */

function pathOf(path: readonly PropertyKey[]): string {
  return path
    .map((part, index) =>
      typeof part === 'number' ? `[${part}]` : `${index === 0 ? '' : '.'}${String(part)}`,
    )
    .join('');
}

/** Parses `input` or throws `VALIDATION_FAILED` naming the first bad field. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issues = result.error.issues;
  const first = issues[0];
  const field = first === undefined ? undefined : pathOf(first.path);
  throw new DomainError({
    code: 'VALIDATION_FAILED',
    message:
      issues
        .slice(0, 3)
        .map((issue) => `${pathOf(issue.path) || '(input)'}: ${issue.message}`)
        .join('; ') + (issues.length > 3 ? ` (+${String(issues.length - 3)} more)` : ''),
    ...(field === undefined || field === '' ? {} : { field }),
  });
}

/* ------------------------------------------------------------------------- */

export type ValidAnswerKey =
  | { readonly kind: 'mcq'; readonly mcqCorrectOptionKey: OptionKey }
  | { readonly kind: 'cq'; readonly cqRubric: Prisma.InputJsonObject };

export interface ValidDraft {
  readonly content: Prisma.InputJsonObject;
  readonly options: readonly {
    readonly key: OptionKey;
    readonly content: Prisma.InputJsonObject;
    readonly sortOrder: number;
  }[];
  readonly answerKey: ValidAnswerKey | null;
}

/** JSON already parsed by Zod, narrowed to an object (the profiles guarantee it). */
function asObject(value: z.infer<typeof json>, field: string): Prisma.InputJsonObject {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value;
  throw new DomainError({
    code: 'CONTENT_PROFILE_INVALID',
    message: `${field}: must be a document object`,
    field,
  });
}

function assertProfile(
  profile: 'mcq_stem' | 'cq_stem' | 'option' | 'cq_rubric',
  value: unknown,
  field: string,
): void {
  const result = safeParseProfile(profile, value);
  if (result.ok) return;
  throw new DomainError({
    code: 'CONTENT_PROFILE_INVALID',
    message: `${field} is not a valid ${profile} document: ${result.issues.slice(0, 3).join('; ')}`,
    field,
  });
}

/**
 * Structural validation of a draft against the question type, using the
 * existing content-block profiles. Order: stem, options, answer key.
 */
export function validateDraft(type: QuestionType, draft: DraftInput): ValidDraft {
  assertProfile(type === QuestionType.MCQ ? 'mcq_stem' : 'cq_stem', draft.content, 'content');
  const content = asObject(draft.content, 'content');

  if (type === QuestionType.CQ && draft.options.length > 0) {
    throw new DomainError({
      code: 'CONTENT_PROFILE_INVALID',
      message: 'options: a CQ question has no options',
      field: 'options',
    });
  }

  const options = draft.options.map((option, index) => {
    const field = `options[${String(index)}].content`;
    assertProfile('option', option.content, field);
    return { key: option.key, content: asObject(option.content, field), sortOrder: index };
  });

  const key = draft.answerKey;
  if (key === null) return { content, options, answerKey: null };

  if ('mcqCorrectOptionKey' in key) {
    if (type !== QuestionType.MCQ) {
      throw new DomainError({
        code: 'CONTENT_PROFILE_INVALID',
        message: 'answerKey: a CQ question is marked with a rubric, not a correct option',
        field: 'answerKey',
      });
    }
    if (!options.some((o) => o.key === key.mcqCorrectOptionKey)) {
      throw new DomainError({
        code: 'ANSWER_KEY_OPTION_MISSING',
        message: 'The correct answer must be one of this question’s options.',
        field: 'answerKey.mcqCorrectOptionKey',
      });
    }
    return {
      content,
      options,
      answerKey: { kind: 'mcq', mcqCorrectOptionKey: key.mcqCorrectOptionKey },
    };
  }

  if (type !== QuestionType.CQ) {
    throw new DomainError({
      code: 'CONTENT_PROFILE_INVALID',
      message: 'answerKey: an MCQ question is marked with a correct option, not a rubric',
      field: 'answerKey',
    });
  }
  assertProfile('cq_rubric', key.cqRubric, 'answerKey.cqRubric');
  return {
    content,
    options,
    answerKey: { kind: 'cq', cqRubric: asObject(key.cqRubric, 'answerKey.cqRubric') },
  };
}
