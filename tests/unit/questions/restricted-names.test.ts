/**
 * The restricted answer-name policy — one list, two boundaries, proven apart.
 *
 * The defect this file exists for: `rules.ts` refused 7 property names and
 * `dto.ts` stripped 11, and each list missed something the other had. Every
 * test here is written so that it FAILS if the two boundaries drift again, and
 * so that it fails for the right reason rather than because a fixture broke.
 *
 * The central property asserted throughout: **the DTO boundary does not depend
 * on the publish gate having run.** A row that was never validated — a legacy
 * row, a row written by a future path that forgot the gate, a row built by a bug
 * — must still project without answer material. That is why the last suite
 * constructs a deliberately gate-violating row and asserts on the projection.
 */

import { describe, expect, it } from 'vitest';

import {
  ANSWER_KEY_COLUMNS,
  ANSWER_REVEALING_PROPERTIES,
  isRestrictedAnswerName,
  RESTRICTED_ANSWER_NAMES,
} from '@/server/questions/publish/restricted-names';
import {
  findAnswerRevealingProperty,
  evaluatePublishGate,
  type QuestionSnapshot,
} from '@/server/questions/publish/rules';
import {
  findLeakedField,
  stripAnswerRevealing,
  toStaffQuestion,
  toStudentQuestion,
  type QuestionRowLike,
} from '@/server/questions/publish/dto';
import {
  mcqStem,
  mcqVersion,
  optionContent,
  taxonomy,
  cqStem,
  cqVersion,
  cqRubric,
} from '@/tests/fixtures/questions/publish-fixtures';

/** Every name the policy protects, enumerated rather than hard-coded twice. */
const ALL_RESTRICTED: readonly string[] = [...RESTRICTED_ANSWER_NAMES];

/** Options that MUST survive: the public option surface a student sees. */
const PUBLIC_OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'ক', 'খ', 'গ', 'ঘ'];

function mcqRow(contentOverride?: unknown): QuestionRowLike {
  return {
    id: '00000000-0000-4000-8000-000000000201',
    type: 'MCQ',
    status: 'PUBLISHED',
    difficulty: 'MEDIUM',
    marks: 1,
    version: {
      id: '00000000-0000-4000-8000-000000000202',
      status: 'PUBLISHED',
      content: contentOverride ?? mcqStem(),
      options: [
        { key: 'A', content: optionContent('ক') },
        { key: 'B', content: optionContent('খ') },
        { key: 'C', content: optionContent('গ') },
        { key: 'D', content: optionContent('ঘ') },
        { key: 'E', content: optionContent('ঙ') },
      ],
      answerKey: { mcqCorrectOptionKey: 'B', cqRubric: null, isVerified: true },
    },
  };
}

describe('the restricted-name policy itself', () => {
  it('is a single list, and every name in either cause is in it', () => {
    expect(RESTRICTED_ANSWER_NAMES.length).toBe(
      ANSWER_REVEALING_PROPERTIES.length + ANSWER_KEY_COLUMNS.length,
    );
    for (const name of [...ANSWER_REVEALING_PROPERTIES, ...ANSWER_KEY_COLUMNS]) {
      expect(isRestrictedAnswerName(name)).toBe(true);
    }
  });

  it('contains no duplicates', () => {
    expect(new Set(ALL_RESTRICTED).size).toBe(ALL_RESTRICTED.length);
  });

  it('covers the six names the audit found diverging', () => {
    // These are the exact names from the audit. If a refactor drops one, the
    // two boundaries silently diverge again — which is the whole defect.
    for (const name of [
      'correct',
      'cqRubric',
      'isVerified',
      'mcqCorrectOptionKey',
      'verifiedAt',
      'notes',
    ]) {
      expect(isRestrictedAnswerName(name)).toBe(true);
    }
  });

  it('does not restrict legitimate public field names', () => {
    // A broad or substring rule would fail here. `key` and `options` are the
    // public surface; `id`, `content`, `marks` are ordinary DTO fields.
    for (const name of ['key', 'options', 'content', 'marks', 'id', 'text', 'blocks']) {
      expect(isRestrictedAnswerName(name)).toBe(false);
    }
  });

  it('matches on exact name, not substring', () => {
    // `correctness` and `solutionSet` are not in the policy. A substring rule
    // would strip them from an authorized payload — the reason exact matching
    // is deliberate rather than lazy.
    expect(isRestrictedAnswerName('correctness')).toBe(false);
    expect(isRestrictedAnswerName('solutionSet')).toBe(false);
    expect(isRestrictedAnswerName('isCorrectFlag')).toBe(false);
    expect(isRestrictedAnswerName('notesInternal')).toBe(false);
  });
});

describe('boundary 1 — the publish gate rejects every restricted name', () => {
  const question = (content: unknown): QuestionSnapshot => ({
    id: '00000000-0000-4000-8000-000000000301',
    type: 'MCQ',
    status: 'DRAFT',
    marks: 1,
    taxonomy: taxonomy(),
    versions: [{ ...mcqVersion(), content }],
  });

  it.each(ALL_RESTRICTED)('refuses content carrying "%s" at the top level', (name) => {
    const content = {
      ...(mcqStem() as Record<string, unknown>),
      [name]: 'leaked',
    };
    const { violations } = evaluatePublishGate(question(content));
    expect(violations.map((v) => v.code)).toContain('CONTENT_PROFILE_INVALID');
  });

  it.each(ALL_RESTRICTED)('refuses "%s" nested inside a block', (name) => {
    const content = {
      format: 'rich_blocks',
      version: 1,
      blocks: [{ type: 'paragraph', data: { text: 'ok', [name]: 'leaked' } }],
    };
    const { violations } = evaluatePublishGate(question(content));
    expect(violations.map((v) => v.code)).toContain('CONTENT_PROFILE_INVALID');
  });

  it.each(ALL_RESTRICTED)('refuses "%s" nested inside an option', (name) => {
    const row = mcqVersion({
      options: [
        { id: 'o1', key: 'A', sortOrder: 0, content: optionContent('a') },
        { id: 'o2', key: 'B', sortOrder: 1, content: optionContent('b') },
        { id: 'o3', key: 'C', sortOrder: 2, content: optionContent('c') },
        {
          id: 'o4',
          key: 'D',
          sortOrder: 3,
          content: {
            format: 'rich_blocks',
            version: 1,
            blocks: [{ type: 'paragraph', data: { text: 'd', [name]: 'leaked' } }],
          },
        },
      ],
    });
    const { violations } = evaluatePublishGate({ ...question(mcqStem()), versions: [row] });
    expect(violations.map((v) => v.code)).toContain('CONTENT_PROFILE_INVALID');
  });

  it('reports the path of the offending property, not just a generic failure', () => {
    const content = {
      format: 'rich_blocks',
      version: 1,
      blocks: [{ type: 'paragraph', data: { text: 'ok', correctAnswer: 'A' } }],
    };
    const found = findAnswerRevealingProperty(content);
    expect(found).toBe('$.blocks[0].data.correctAnswer');
  });

  it('POSITIVE CONTROL: clean content yields no answer-revealing violation', () => {
    const { violations } = evaluatePublishGate({
      ...question(mcqStem()),
      versions: [{ ...mcqVersion(), status: 'PUBLISHED' }],
    });
    expect(violations.map((v) => v.code)).not.toContain('CONTENT_PROFILE_INVALID');
  });
});

describe('boundary 2 — the student projection strips every restricted name independently', () => {
  it.each(ALL_RESTRICTED)('strips "%s" from a content document at depth', (name) => {
    const stripped = stripAnswerRevealing({
      level1: { level2: [{ [name]: 'secret', safe: 'keep' }] },
    });
    expect(JSON.stringify(stripped)).not.toContain('secret');
    expect(JSON.stringify(stripped)).toContain('keep');
  });

  it.each(ALL_RESTRICTED)('strips "%s" from the projected content, not just a walk', (name) => {
    const content = {
      format: 'rich_blocks',
      version: 1,
      blocks: [{ type: 'paragraph', data: { text: 'ok', [name]: 'leaked-value' } }],
    };
    const dto = toStudentQuestion(mcqRow(content));
    expect(JSON.stringify(dto)).not.toContain('leaked-value');
    expect(findLeakedField(dto)).toBeNull();
  });

  it('the projection does not depend on the publish gate having run', () => {
    // A row that the gate WOULD reject is projected anyway. This is the
    // property the audit asked to see proven: DTO security is independent.
    const gateViolating = {
      format: 'rich_blocks',
      version: 1,
      blocks: [
        {
          type: 'paragraph',
          data: {
            text: 'ok',
            correctAnswer: 'B',
            mcqCorrectOptionKey: 'B',
            cqRubric: { format: 'cq_rubric', parts: [] },
            isVerified: true,
            notes: 'marker only',
            verifiedAt: '2026-01-01',
          },
        },
      ],
    };

    // Prove the gate really does reject it, so the test is not vacuous.
    const { violations } = evaluatePublishGate({
      id: '00000000-0000-4000-8000-000000000302',
      type: 'MCQ',
      status: 'DRAFT',
      marks: 1,
      taxonomy: taxonomy(),
      versions: [{ ...mcqVersion(), content: gateViolating }],
    });
    expect(violations.map((v) => v.code)).toContain('CONTENT_PROFILE_INVALID');

    // …and the projection is still clean, having never seen the gate.
    const dto = toStudentQuestion(mcqRow(gateViolating));
    const serialised = JSON.stringify(dto);
    for (const leaked of [
      'correctAnswer',
      'mcqCorrectOptionKey',
      'cqRubric',
      'isVerified',
      'notes',
      'verifiedAt',
    ]) {
      expect(serialised).not.toContain(leaked);
    }
    expect(findLeakedField(dto)).toBeNull();
  });

  it('PROTECTS AGAINST THE OLD HOLE: "correct" is stripped, not only gated', () => {
    // Under the old split, `correct` was refused by the gate but NOT stripped by
    // the projection — so this exact payload would have reached a student if the
    // gate had ever been bypassed. It is now stripped independently.
    const dto = toStudentQuestion(
      mcqRow({
        format: 'rich_blocks',
        version: 1,
        blocks: [{ type: 'paragraph', data: { text: 'ok', correct: 'B' } }],
      }),
    );
    expect(JSON.stringify(dto)).not.toContain('"correct"');
  });

  it('the student DTO never carries the answerKey object at all', () => {
    const dto = toStudentQuestion(mcqRow());
    expect(dto).not.toHaveProperty('answerKey');
    expect(dto).not.toHaveProperty('isVerified');
    expect(dto).not.toHaveProperty('versionStatus');
  });
});

describe('POSITIVE CONTROLS — legitimate public fields survive both boundaries', () => {
  it('preserves every option key, including a distractor key E', () => {
    const dto = toStudentQuestion(mcqRow());
    expect(dto.options.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it.each(PUBLIC_OPTION_KEYS)('treats option key "%s" as data, not a restricted name', (key) => {
    expect(isRestrictedAnswerName(key)).toBe(false);
    const dto = toStudentQuestion(
      mcqRow({
        format: 'rich_blocks',
        version: 1,
        blocks: [{ type: 'paragraph', data: { text: 'ok', marker: key } }],
      }),
    );
    // The key appears as a VALUE and must survive.
    expect(JSON.stringify(dto)).toContain(`"marker":"${key}"`);
  });

  it('keeps ordinary content: text, blocks, marks, id, type, difficulty', () => {
    const dto = toStudentQuestion(mcqRow());
    expect(dto.id).toBeTruthy();
    expect(dto.type).toBe('MCQ');
    expect(dto.difficulty).toBe('MEDIUM');
    expect(dto.marks).toBe(1);
    expect(JSON.stringify(dto.content)).toContain('নিচের HTML কোডটি লক্ষ করো:');
    expect(JSON.stringify(dto.options)).toContain('ক');
  });

  it('keeps a value that merely contains a restricted substring', () => {
    // Exact-name matching means a VALUE is never inspected. A paragraph
    // explaining "correctness" is legitimate teaching content.
    const dto = toStudentQuestion(
      mcqRow({
        format: 'rich_blocks',
        version: 1,
        blocks: [
          { type: 'paragraph', data: { text: 'the correctness of an algorithm', lang: 'en' } },
        ],
      }),
    );
    expect(JSON.stringify(dto)).toContain('correctness of an algorithm');
  });
});

describe('staff projection is unaffected — the policy is audience-scoped', () => {
  it('staff still receive the answer key and rubric', () => {
    // A validator that stripped these from the staff payload would break the
    // review screen. `RESTRICTED_ANSWER_NAMES` governs student output and
    // content documents, not authorized staff surfaces.
    const row: QuestionRowLike = {
      id: '00000000-0000-4000-8000-000000000401',
      type: 'CQ',
      status: 'DRAFT',
      difficulty: 'MEDIUM',
      marks: 10,
      version: {
        id: '00000000-0000-4000-8000-000000000402',
        status: 'DRAFT',
        content: cqStem(),
        options: [],
        answerKey: { mcqCorrectOptionKey: null, cqRubric: cqRubric(), isVerified: true },
      },
    };
    const staffDto = toStaffQuestion(row);
    expect(staffDto.answerKey?.cqRubric).not.toBeNull();
    expect(staffDto.isVerified).toBe(true);
  });

  it('the CQ fixture still satisfies the gate after the strict rubric change', () => {
    const { violations } = evaluatePublishGate({
      id: '00000000-0000-4000-8000-000000000403',
      type: 'CQ',
      status: 'DRAFT',
      marks: 10,
      taxonomy: taxonomy(),
      versions: [{ ...cqVersion(), status: 'PUBLISHED' }],
    });
    expect(violations).toEqual([]);
  });
});
