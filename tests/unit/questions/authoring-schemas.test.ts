/**
 * Phase 04C — authoring input schemas and draft validation.
 *
 * Shape errors are VALIDATION_FAILED with a field path. Content is validated
 * with the EXISTING content-block profiles and reports CONTENT_PROFILE_INVALID.
 * A draft may be incomplete but never structurally invalid.
 */

import { describe, expect, it } from 'vitest';

import { QuestionType } from '@/lib/generated/prisma/enums';
import {
  createQuestionInputSchema,
  draftInputSchema,
  listQuestionsInputSchema,
  parseInput,
  saveDraftInputSchema,
  validateDraft,
} from '@/server/questions/authoring/schemas';
import {
  cqRubric,
  cqStem,
  mcqStem,
  optionContent,
} from '../../fixtures/questions/publish-fixtures';

const U = (n: number) => `0c000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const baseCreate = () => ({
  type: 'MCQ',
  marks: 1,
  educationLevelId: U(1),
  subjectId: U(2),
  draft: { content: mcqStem() },
});

function errorOf(fn: () => unknown): { code?: string; field?: string; message?: string } {
  try {
    fn();
  } catch (error) {
    return error as { code?: string; field?: string; message?: string };
  }
  throw new Error('expected a throw');
}

describe('createQuestion input', () => {
  it('accepts a minimal MCQ and fills the defaults', () => {
    const data = parseInput(createQuestionInputSchema, baseCreate());
    expect(data.difficulty).toBe('MEDIUM');
    expect(data.tagIds).toEqual([]);
    expect(data.sources).toEqual([]);
    expect(data.draft.options).toEqual([]);
    expect(data.draft.answerKey).toBeNull();
  });

  it.each([
    ['a non-UUID subject', { subjectId: 'ict' }, 'subjectId'],
    ['negative marks', { marks: -1 }, 'marks'],
    ['fractional marks', { marks: 1.5 }, 'marks'],
    ['an MCQ worth 0 marks', { marks: 0 }, 'marks'],
    ['a topic without a chapter', { topicId: U(4) }, 'chapterId'],
    ['a subtopic without a topic', { chapterId: U(3), subtopicId: U(5) }, 'topicId'],
    ['an unknown property', { isPublished: true }, ''],
    ['an unknown type', { type: 'ESSAY' }, 'type'],
    ['a duplicated tag', { tagIds: [U(9), U(9)] }, 'tagIds'],
    [
      'a source with both board and college',
      { sources: [{ sourceType: 'BOARD', boardId: U(6), collegeId: U(7) }] },
      'sources[0].collegeId',
    ],
  ])('refuses %s as VALIDATION_FAILED', (_label, patch, field) => {
    const error = errorOf(() =>
      parseInput(createQuestionInputSchema, { ...baseCreate(), ...patch }),
    );
    expect(error.code).toBe('VALIDATION_FAILED');
    if (field !== '') expect(error.field).toBe(field);
  });

  it('a CQ may be worth 0 marks at draft time (the publish gate checks I-15)', () => {
    expect(() =>
      parseInput(createQuestionInputSchema, { ...baseCreate(), type: 'CQ', marks: 0 }),
    ).not.toThrow();
  });
});

describe('draft input shape', () => {
  it('refuses a duplicated option key', () => {
    const error = errorOf(() =>
      parseInput(draftInputSchema, {
        content: mcqStem(),
        options: [
          { key: 'A', content: optionContent() },
          { key: 'A', content: optionContent() },
        ],
      }),
    );
    expect(error).toMatchObject({ code: 'VALIDATION_FAILED', field: 'options[1].key' });
  });

  it('refuses more than four options and keys outside the allowed set', () => {
    const five = ['A', 'B', 'C', 'D', 'ক'].map((key) => ({ key, content: optionContent() }));
    expect(
      errorOf(() => parseInput(draftInputSchema, { content: mcqStem(), options: five })).code,
    ).toBe('VALIDATION_FAILED');
    expect(
      errorOf(() =>
        parseInput(draftInputSchema, {
          content: mcqStem(),
          options: [{ key: 'E', content: optionContent() }],
        }),
      ).field,
    ).toBe('options[0].key');
  });

  it('saveDraft requires expectedUpdatedAt and accepts a Date or an ISO string', () => {
    const base = { questionId: U(1), versionId: U(2), draft: { content: mcqStem() } };
    expect(errorOf(() => parseInput(saveDraftInputSchema, base)).field).toBe('expectedUpdatedAt');
    const iso = parseInput(saveDraftInputSchema, {
      ...base,
      expectedUpdatedAt: '2026-11-27T10:00:00.123Z',
    });
    expect(iso.expectedUpdatedAt.getTime()).toBe(Date.parse('2026-11-27T10:00:00.123Z'));
    const date = parseInput(saveDraftInputSchema, { ...base, expectedUpdatedAt: new Date(5) });
    expect(date.expectedUpdatedAt.getTime()).toBe(5);
    expect(
      errorOf(() => parseInput(saveDraftInputSchema, { ...base, expectedUpdatedAt: 'yesterday' }))
        .code,
    ).toBe('VALIDATION_FAILED');
  });
});

describe('list input', () => {
  it('defaults to 20 and caps the page size at 50', () => {
    expect(parseInput(listQuestionsInputSchema, {}).limit).toBe(20);
    expect(parseInput(listQuestionsInputSchema, { limit: 50 }).limit).toBe(50);
    expect(errorOf(() => parseInput(listQuestionsInputSchema, { limit: 51 })).field).toBe('limit');
    expect(errorOf(() => parseInput(listQuestionsInputSchema, { limit: 0 })).field).toBe('limit');
  });
});

describe('validateDraft — the existing content profiles, not a new model', () => {
  const mcq = (draft: Record<string, unknown>) =>
    validateDraft(QuestionType.MCQ, parseInput(draftInputSchema, draft));
  const cq = (draft: Record<string, unknown>) =>
    validateDraft(QuestionType.CQ, parseInput(draftInputSchema, draft));

  it('accepts an INCOMPLETE MCQ draft: stem only, no options, no key', () => {
    const draft = mcq({ content: mcqStem() });
    expect(draft.options).toEqual([]);
    expect(draft.answerKey).toBeNull();
  });

  it('accepts two options and a key pointing at one of them', () => {
    const draft = mcq({
      content: mcqStem(),
      options: [
        { key: 'A', content: optionContent('এক') },
        { key: 'B', content: optionContent('দুই') },
      ],
      answerKey: { mcqCorrectOptionKey: 'B' },
    });
    expect(draft.options.map((o) => [o.key, o.sortOrder])).toEqual([
      ['A', 0],
      ['B', 1],
    ]);
    expect(draft.answerKey).toEqual({ kind: 'mcq', mcqCorrectOptionKey: 'B' });
  });

  it('refuses a stem that fails the mcq_stem profile (leading heading)', () => {
    const bad = mcqStem({
      blocks: [
        { type: 'heading', data: { text: 'শিরোনাম', level: 2 } },
        { type: 'paragraph', data: { text: 'প্রশ্ন' } },
      ],
    });
    expect(errorOf(() => mcq({ content: bad }))).toMatchObject({
      code: 'CONTENT_PROFILE_INVALID',
      field: 'content',
    });
  });

  it('refuses an MCQ stem sent to a CQ question (profile is chosen by type)', () => {
    expect(errorOf(() => cq({ content: mcqStem() })).field).toBe('content');
  });

  it('refuses an option document that fails the option profile, naming it', () => {
    const error = errorOf(() =>
      mcq({
        content: mcqStem(),
        options: [{ key: 'A', content: { format: 'rich_blocks', version: 1, blocks: [] } }],
      }),
    );
    expect(error).toMatchObject({ code: 'CONTENT_PROFILE_INVALID', field: 'options[0].content' });
  });

  it('refuses a correct option that is not among the options', () => {
    const error = errorOf(() =>
      mcq({
        content: mcqStem(),
        options: [{ key: 'A', content: optionContent() }],
        answerKey: { mcqCorrectOptionKey: 'C' },
      }),
    );
    expect(error).toMatchObject({ code: 'ANSWER_KEY_OPTION_MISSING' });
  });

  it('refuses options on a CQ, and a rubric on an MCQ', () => {
    expect(
      errorOf(() => cq({ content: cqStem(), options: [{ key: 'ক', content: optionContent() }] }))
        .field,
    ).toBe('options');
    expect(
      errorOf(() => mcq({ content: mcqStem(), answerKey: { cqRubric: cqRubric() } })).field,
    ).toBe('answerKey');
  });

  it('accepts a CQ with a valid rubric, and refuses a malformed rubric', () => {
    expect(cq({ content: cqStem(), answerKey: { cqRubric: cqRubric() } }).answerKey?.kind).toBe(
      'cq',
    );
    expect(
      errorOf(() => cq({ content: cqStem(), answerKey: { cqRubric: cqRubric({ parts: 'x' }) } })),
    ).toMatchObject({ code: 'CONTENT_PROFILE_INVALID', field: 'answerKey.cqRubric' });
  });
});
