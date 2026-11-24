/**
 * Fixtures for the publish gate.
 *
 * Deliberately built so that a VALID fixture passes every rule. If a change to
 * the rules makes the valid fixture fail, that is a signal the rule changed
 * meaning — not something to paper over by loosening the fixture.
 *
 * The fixtures are also used as positive controls: every negative test asserts
 * that the baseline is publishable first, so a rejection can only be attributed
 * to the deliberate defect that was introduced.
 */

import type {
  QuestionSnapshot,
  QuestionType,
  TaxonomySnapshot,
  VersionRecordSnapshot,
} from '@/server/questions/publish/rules';

export const IDS = {
  level: '00000000-0000-4000-8000-000000000001',
  subject: '00000000-0000-4000-8000-000000000002',
  chapter: '00000000-0000-4000-8000-000000000003',
  topic: '00000000-0000-4000-8000-000000000004',
  subtopic: '00000000-0000-4000-8000-000000000005',
  asset1: '00000000-0000-4000-8000-000000000010',
  asset2: '00000000-0000-4000-8000-000000000011',
  asset3: '00000000-0000-4000-8000-000000000012',
} as const;

/** A content document that satisfies the `mcq_stem` profile. */
export function mcqStem(overrides: Record<string, unknown> = {}): unknown {
  return {
    format: 'rich_blocks',
    version: 1,
    blocks: [
      { type: 'paragraph', data: { text: 'নিচের HTML কোডটি লক্ষ করো:', lang: 'bn' } },
      { type: 'code', data: { language: 'html', code: '<h1>Hello</h1>' } },
    ],
    ...overrides,
  };
}

/** A content document that satisfies the `option` profile. */
export function optionContent(text = 'Option'): unknown {
  return {
    format: 'rich_blocks',
    version: 1,
    blocks: [{ type: 'paragraph', data: { text, lang: 'bn' } }],
  };
}

/** A CQ stem: one stimulus block, then exactly four subquestions ক→ঘ, 1/2/3/4. */
export function cqStem(): unknown {
  return {
    format: 'rich_blocks',
    version: 1,
    blocks: [
      { type: 'paragraph', data: { text: 'রফিক বাইনারি সংখ্যা নিয়ে কাজ করছে।' } },
      { type: 'subquestion', data: { part: 'ক', maxMarks: 1, instruction: 'বাইনারি কী?' } },
      { type: 'subquestion', data: { part: 'খ', maxMarks: 2, instruction: '(১০১১)₂ → দশমিক' } },
      { type: 'subquestion', data: { part: 'গ', maxMarks: 3, instruction: '১৩ → বাইনারি' } },
      { type: 'subquestion', data: { part: 'ঘ', maxMarks: 4, instruction: 'বিশ্লেষণ করো' } },
    ],
  };
}

/** A rubric matching `cqStem()` exactly, per §7.7. */
export function cqRubric(overrides: Record<string, unknown> = {}): unknown {
  return {
    format: 'cq_rubric',
    version: 1,
    totalMaxMarks: 10,
    parts: [
      { part: 'ক', maxMarks: 1, criteria: [{ description: 'সংজ্ঞা', marks: 1 }] },
      {
        part: 'খ',
        maxMarks: 2,
        criteria: [
          { description: 'পদ্ধতি', marks: 1 },
          { description: 'ফল', marks: 1 },
        ],
      },
      {
        part: 'গ',
        maxMarks: 3,
        criteria: [
          { description: 'ভাগ', marks: 1 },
          { description: 'ক্রম', marks: 1 },
          { description: 'ফল', marks: 1 },
        ],
      },
      {
        part: 'ঘ',
        maxMarks: 4,
        criteria: [
          { description: 'ক', marks: 1 },
          { description: 'খ', marks: 1 },
          { description: 'গ', marks: 1 },
          { description: 'ঘ', marks: 1 },
        ],
      },
    ],
    ...overrides,
  };
}

const VALID_TAXONOMY: TaxonomySnapshot = {
  educationLevelId: IDS.level,
  subjectId: IDS.subject,
  subjectOfferedAtLevel: true,
  educationLevelActive: true,
  subjectActive: true,
  chapter: { id: IDS.chapter, subjectId: IDS.subject, isActive: true },
  topic: { id: IDS.topic, chapterId: IDS.chapter, isActive: true },
  subtopic: { id: IDS.subtopic, topicId: IDS.topic, isActive: true },
};

export function taxonomy(overrides: Partial<TaxonomySnapshot> = {}): TaxonomySnapshot {
  return { ...VALID_TAXONOMY, ...overrides };
}

/** A version that satisfies every rule for an MCQ. */
export function mcqVersion(overrides: Partial<VersionRecordSnapshot> = {}): VersionRecordSnapshot {
  return {
    id: '00000000-0000-4000-8000-000000000100',
    versionNumber: 1,
    status: 'DRAFT',
    content: mcqStem(),
    options: [
      {
        id: '00000000-0000-4000-8000-000000000201',
        key: 'A',
        sortOrder: 0,
        content: optionContent('A'),
      },
      {
        id: '00000000-0000-4000-8000-000000000202',
        key: 'B',
        sortOrder: 1,
        content: optionContent('B'),
      },
      {
        id: '00000000-0000-4000-8000-000000000203',
        key: 'C',
        sortOrder: 2,
        content: optionContent('C'),
      },
      {
        id: '00000000-0000-4000-8000-000000000204',
        key: 'D',
        sortOrder: 3,
        content: optionContent('D'),
      },
    ],
    answerKey: { mcqCorrectOptionKey: 'A', cqRubric: null, isVerified: true },
    assetLinks: [],
    ...overrides,
  };
}

/** A version that satisfies every rule for a CQ. */
export function cqVersion(overrides: Partial<VersionRecordSnapshot> = {}): VersionRecordSnapshot {
  return {
    id: '00000000-0000-4000-8000-000000000300',
    versionNumber: 1,
    status: 'DRAFT',
    content: cqStem(),
    options: [],
    answerKey: { mcqCorrectOptionKey: null, cqRubric: cqRubric(), isVerified: true },
    assetLinks: [],
    ...overrides,
  };
}

/** A published, fully valid MCQ question. */
export function mcqQuestion(overrides: Partial<QuestionSnapshot> = {}): QuestionSnapshot {
  return {
    id: '00000000-0000-4000-8000-000000000900',
    type: 'MCQ',
    status: 'PUBLISHED',
    marks: 1,
    taxonomy: taxonomy(),
    versions: [mcqVersion({ status: 'PUBLISHED' })],
    ...overrides,
  };
}

/** A published, fully valid CQ question. */
export function cqQuestion(overrides: Partial<QuestionSnapshot> = {}): QuestionSnapshot {
  return {
    id: '00000000-0000-4000-8000-000000000901',
    type: 'CQ',
    status: 'PUBLISHED',
    marks: 10,
    taxonomy: taxonomy(),
    versions: [cqVersion({ status: 'PUBLISHED' })],
    ...overrides,
  };
}

/** Builds a question of the given type with the valid shape for that type. */
export function questionOfType(type: QuestionType): QuestionSnapshot {
  return type === 'MCQ' ? mcqQuestion() : cqQuestion();
}

/** The codes the gate reports for a snapshot. */
export function codesOf(result: { violations: readonly { code: string }[] }): string[] {
  return result.violations.map((v) => v.code);
}
