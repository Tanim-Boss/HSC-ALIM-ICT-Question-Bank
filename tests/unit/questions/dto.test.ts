/**
 * Response shaping — the assertion that answer keys do not reach a student.
 *
 * The critical test here is not "the DTO has the fields I listed". It is "the
 * DTO omits the fields I did not list, even when the input row has them all".
 * So the fixture is a COMPLETE row — every answer-bearing column populated —
 * and the student projection is asserted against it. A blocklist would pass a
 * test that checks only today's forbidden names; the allowlist is what makes
 * tomorrow's new column absent by default.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertNoLeak,
  findLeakedField,
  stripAnswerRevealing,
  toStaffQuestion,
  toStudentQuestion,
  type QuestionRowLike,
} from '@/server/questions/publish/dto';
import {
  cqRubric,
  cqStem,
  mcqStem,
  optionContent,
} from '@/tests/fixtures/questions/publish-fixtures';

/** A completely populated MCQ row, including everything a student must not see. */
function fullMcqRow(): QuestionRowLike {
  return {
    id: '00000000-0000-4000-8000-000000000900',
    type: 'MCQ',
    status: 'PUBLISHED',
    difficulty: 'MEDIUM',
    marks: 1,
    version: {
      id: '00000000-0000-4000-8000-000000000100',
      status: 'PUBLISHED',
      content: mcqStem(),
      options: ['A', 'B', 'C', 'D'].map((key) => ({
        key,
        content: optionContent(key),
      })),
      answerKey: {
        mcqCorrectOptionKey: 'A',
        cqRubric: null,
        isVerified: true,
      },
    },
  };
}

function fullCqRow(): QuestionRowLike {
  return {
    id: '00000000-0000-4000-8000-000000000901',
    type: 'CQ',
    status: 'PUBLISHED',
    difficulty: 'HARD',
    marks: 10,
    version: {
      id: '00000000-0000-4000-8000-000000000300',
      status: 'PUBLISHED',
      content: cqStem(),
      options: [],
      answerKey: {
        mcqCorrectOptionKey: null,
        cqRubric: cqRubric(),
        isVerified: true,
      },
    },
  };
}

describe('student projection', () => {
  it('POSITIVE CONTROL: the input row really does contain a correct answer and a rubric', () => {
    // Without this, "the student DTO has no answer key" could pass because the
    // input never had one — a vacuous pass, the exact failure V-5 recorded.
    const row = fullMcqRow();
    expect(row.version.answerKey?.mcqCorrectOptionKey).toBe('A');
    expect(fullCqRow().version.answerKey?.cqRubric).not.toBeNull();
    // And the leaked-field detector must actually detect, not always return null.
    expect(findLeakedField(row)).not.toBeNull();
  });

  it('an MCQ student projection carries no answer key of any kind', () => {
    const dto = toStudentQuestion(fullMcqRow());
    const serialised = JSON.stringify(dto);
    expect(serialised).not.toContain('mcqCorrectOptionKey');
    expect(dto).not.toHaveProperty('answerKey');
    // Specifically: the correct option's identity must not be inferable.
    expect(serialised).not.toMatch(/"correct/i);
    expect(findLeakedField(dto)).toBeNull();
  });

  it('a CQ student projection carries no rubric', () => {
    const dto = toStudentQuestion(fullCqRow());
    const serialised = JSON.stringify(dto);
    expect(serialised).not.toContain('cqRubric');
    expect(serialised).not.toContain('criteria');
    expect(serialised).not.toContain('expectedAnswer');
    expect(findLeakedField(dto)).toBeNull();
  });

  it('carries the fields a student legitimately needs', () => {
    const dto = toStudentQuestion(fullMcqRow());
    expect(dto.id).toBe('00000000-0000-4000-8000-000000000900');
    expect(dto.type).toBe('MCQ');
    expect(dto.marks).toBe(1);
    expect(dto.options).toHaveLength(4);
    expect(dto.options.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D']);
    // The question text itself must survive — a DTO that strips everything is
    // safe but useless, and this test is what stops over-stripping.
    expect(JSON.stringify(dto.content)).toContain('নিচের HTML কোডটি লক্ষ করো');
  });

  it('does not carry authoring metadata a student has no use for', () => {
    const dto = toStudentQuestion(fullCqRow());
    expect(dto).not.toHaveProperty('status');
    expect(dto).not.toHaveProperty('versionStatus');
    expect(dto).not.toHaveProperty('isVerified');
    expect(dto).not.toHaveProperty('versionId');
  });

  it('strips an answer-revealing property hidden inside the content', () => {
    // Belt and braces: the publish gate refuses this, but a row that predates
    // the gate must still not leak it.
    const row = fullMcqRow();
    const content = row.version.content as { blocks: Record<string, unknown>[] };
    const blocks = content.blocks.map((b, index) =>
      index === 0
        ? { ...b, data: { ...(b['data'] as Record<string, unknown>), correctAnswer: 'A' } }
        : b,
    );
    const patched: QuestionRowLike = {
      ...row,
      version: { ...row.version, content: { ...content, blocks } },
    };
    const dto = toStudentQuestion(patched);
    expect(JSON.stringify(dto)).not.toContain('correctAnswer');
    expect(findLeakedField(dto)).toBeNull();
  });

  it('strips an answer-revealing property nested in an option', () => {
    const row = fullMcqRow();
    const options = row.version.options.map((o, index) => ({
      ...o,
      content:
        index === 1
          ? {
              format: 'rich_blocks',
              version: 1,
              blocks: [{ type: 'paragraph', data: { text: 'B', isCorrect: true } }],
            }
          : o.content,
    }));
    const dto = toStudentQuestion({ ...row, version: { ...row.version, options } });
    expect(JSON.stringify(dto)).not.toContain('isCorrect');
  });
});

describe('staff projection', () => {
  it('carries the answer key, because staff surfaces are authorized separately', () => {
    const dto = toStaffQuestion(fullMcqRow());
    expect(dto.answerKey?.mcqCorrectOptionKey).toBe('A');
    expect(dto.isVerified).toBe(true);
    expect(dto.status).toBe('PUBLISHED');
  });

  it('carries the rubric for a CQ', () => {
    const dto = toStaffQuestion(fullCqRow());
    expect(dto.answerKey?.cqRubric).not.toBeNull();
    expect(JSON.stringify(dto.answerKey?.cqRubric)).toContain('totalMaxMarks');
  });

  it('marks an unverified key as unverified rather than omitting it', () => {
    const row = fullMcqRow();
    const dto = toStaffQuestion({
      ...row,
      version: {
        ...row.version,
        answerKey: { mcqCorrectOptionKey: 'A', cqRubric: null, isVerified: false },
      },
    });
    expect(dto.isVerified).toBe(false);
    expect(dto.answerKey?.isVerified).toBe(false);
  });

  it('handles a null answer key without throwing', () => {
    const row = fullMcqRow();
    const dto = toStaffQuestion({ ...row, version: { ...row.version, answerKey: null } });
    expect(dto.answerKey).toBeNull();
    expect(dto.isVerified).toBe(false);
  });
});

describe('the leak detector itself', () => {
  it('finds a forbidden key at depth and reports its path', () => {
    expect(findLeakedField({ a: [{ b: { expectedAnswer: 'x' } }] })).toBe(
      '$.a[0].b.expectedAnswer',
    );
  });

  it('returns null on a clean object', () => {
    expect(findLeakedField({ a: { b: 'safe' }, c: [1, 2] })).toBeNull();
  });

  it('POSITIVE CONTROL: the detector is not returning null unconditionally', () => {
    // If findLeakedField always returned null, every "no leak" assertion above
    // would pass for the wrong reason. This proves it detects.
    expect(findLeakedField({ notes: 'marker guidance' })).toBe('$.notes');
    expect(findLeakedField({ answerKey: {} })).toBe('$.answerKey');
  });

  it('stripAnswerRevealing removes nested forbidden keys but keeps the rest', () => {
    const stripped = stripAnswerRevealing({
      keep: 1,
      notes: 'secret',
      nested: { solution: 'x', keep2: 2 },
    }) as Record<string, unknown>;
    expect(stripped).toEqual({ keep: 1, nested: { keep2: 2 } });
  });

  it('assertNoLeak throws on a leak outside production', () => {
    vi.stubEnv('NODE_ENV', 'test');
    expect(() => assertNoLeak({ answerKey: null }, 'test dto')).toThrow(/leaked/);
    expect(() => assertNoLeak({ id: 'x' }, 'test dto')).not.toThrow();
    vi.unstubAllEnvs();
  });

  it('assertNoLeak is a no-op in production (the allowlist is the real guard)', () => {
    // The development-time assertion must not throw in production and take the
    // process down; the allowlist in toStudentQuestion is what protects users.
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => assertNoLeak({ answerKey: null }, 'test dto')).not.toThrow();
    vi.unstubAllEnvs();
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});
