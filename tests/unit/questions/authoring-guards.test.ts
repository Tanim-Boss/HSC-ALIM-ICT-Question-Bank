/**
 * Phase 04C — guards that need no database:
 *   · every authoring command and read refuses a STUDENT with FORBIDDEN before
 *     it touches the database (the client below throws if it is ever used);
 *   · FK violations (23503 / P2003) map to clean DomainErrors, using the error
 *     shape measured from Prisma 7.10.1 + @prisma/adapter-pg;
 *   · the list cursor round-trips and rejects anything it did not issue.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  getPrisma: () => {
    throw new Error('the database was touched before authorization');
  },
}));

const authoring = await import('@/server/questions/authoring');
const { decodeCursor, encodeCursor } = await import('@/server/questions/authoring/queries');
const { mapDatabaseError, mapForeignKeyViolation } =
  await import('@/server/questions/publish/db-errors');
const { AppRole } = await import('@/lib/generated/prisma/enums');

const student = {
  userId: '0b000000-0000-4000-8000-000000000001',
  roles: new Set([AppRole.STUDENT]),
};
const ID = '0c000000-0000-4000-8000-000000000001';

describe('STUDENT is refused by every command and read, before any database access', () => {
  const calls: [string, () => Promise<unknown>][] = [
    [
      'createQuestion',
      () =>
        authoring.createQuestion(student, {
          type: 'MCQ',
          marks: 1,
          educationLevelId: ID,
          subjectId: ID,
          draft: { content: {} },
        }),
    ],
    [
      'saveDraft',
      () =>
        authoring.saveDraft(student, {
          questionId: ID,
          versionId: ID,
          expectedUpdatedAt: new Date(),
          draft: { content: {} },
        }),
    ],
    ['createRevision', () => authoring.createRevision(student, { questionId: ID })],
    [
      'verifyAnswerKey',
      () => authoring.verifyAnswerKey(student, { questionId: ID, versionId: ID }),
    ],
    ['archiveVersion', () => authoring.archiveVersion(student, { questionId: ID, versionId: ID })],
    ['archiveQuestion', () => authoring.archiveQuestion(student, { questionId: ID })],
    ['listQuestionsForStaff', () => authoring.listQuestionsForStaff(student, {})],
    ['getQuestionForStaff', () => authoring.getQuestionForStaff(student, { questionId: ID })],
  ];

  it.each(calls)('%s → FORBIDDEN', async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('authorization precedes input validation: garbage input from a STUDENT is still FORBIDDEN', async () => {
    await expect(authoring.createQuestion(student, 'garbage' as never)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

/** The measured shape of a P2003 from Prisma 7.10.1 + @prisma/adapter-pg. */
function p2003(constraint: string) {
  return {
    name: 'PrismaClientKnownRequestError',
    code: 'P2003',
    message: `Invalid \`prisma.question.create()\` invocation: Foreign key constraint violated on the constraint: \`${constraint}\``,
    meta: {
      modelName: 'Question',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: '23503',
          originalMessage: `insert or update on table "questions" violates foreign key constraint "${constraint}"`,
          kind: 'ForeignKeyConstraintViolation',
          constraint: { index: constraint },
        },
      },
    },
  };
}

describe('foreign-key violation mapping (23503 / P2003)', () => {
  it.each([
    ['fk_questions_level_subject', 'TAXONOMY_CHAIN_INVALID', 'subjectId'],
    ['fk_questions_chapter_subject', 'TAXONOMY_CHAIN_INVALID', 'chapterId'],
    ['fk_questions_topic_chapter', 'TAXONOMY_CHAIN_INVALID', 'topicId'],
    ['fk_questions_subtopic_topic', 'TAXONOMY_CHAIN_INVALID', 'subtopicId'],
    ['fk_answer_keys_options_of_version', 'ANSWER_KEY_OPTION_MISSING', 'answerKey'],
    ['questions_chapter_id_fkey', 'REFERENCE_NOT_FOUND', 'chapterId'],
    ['question_tags_tag_id_fkey', 'REFERENCE_NOT_FOUND', 'tagIds'],
  ])('%s → %s on %s', (constraint, code, field) => {
    const mapped = mapForeignKeyViolation(p2003(constraint));
    expect(mapped).toMatchObject({ code, field, constraintNames: [constraint] });
    // No driver text in what a user sees.
    expect(mapped?.message).not.toMatch(/constraint|violates|23503|fk_/i);
  });

  it('an unknown FK becomes the generic FOREIGN_KEY_CONFLICT, never a guessed field', () => {
    const mapped = mapForeignKeyViolation(p2003('some_future_fkey'));
    expect(mapped).toMatchObject({ code: 'FOREIGN_KEY_CONFLICT' });
    expect(mapped?.field).toBeUndefined();
  });

  it('reads the name from the message when adapter metadata is absent', () => {
    const bare = {
      code: 'P2003',
      message: 'Foreign key constraint violated on the constraint: `fk_questions_topic_chapter`',
    };
    expect(mapForeignKeyViolation(bare)?.code).toBe('TAXONOMY_CHAIN_INVALID');
  });

  it('a raw pg error with SQLSTATE 23503 is recognised too', () => {
    const raw = { code: '23503', constraint: 'fk_questions_level_subject', message: 'x' };
    // The quoted-name path covers the raw driver message form.
    const withMessage = {
      ...raw,
      message:
        'insert or update on table "questions" violates foreign key constraint "fk_questions_level_subject"',
    };
    expect(mapForeignKeyViolation(withMessage)?.code).toBe('TAXONOMY_CHAIN_INVALID');
  });

  it('leaves non-FK errors alone, and mapDatabaseError still maps unique violations', () => {
    expect(mapForeignKeyViolation(new Error('boom'))).toBeNull();
    expect(mapForeignKeyViolation({ code: 'P2002' })).toBeNull();
    expect(mapDatabaseError({ code: 'P2002', meta: { target: 'uq_tags_slug' } })?.code).toBe(
      'TAG_SLUG_CONFLICT',
    );
    expect(mapDatabaseError(p2003('fk_questions_topic_chapter'))?.code).toBe(
      'TAXONOMY_CHAIN_INVALID',
    );
  });
});

describe('list cursor', () => {
  it('round-trips (created_at, id) exactly, to the millisecond', () => {
    const position = { createdAt: new Date('2026-11-27T10:00:00.123Z'), id: ID };
    expect(decodeCursor(encodeCursor(position))).toEqual(position);
  });

  it.each([
    'not-a-cursor',
    Buffer.from('2026-11-27T10:00:00.123Z|not-a-uuid').toString('base64url'),
    Buffer.from(`yesterday|${ID}`).toString('base64url'),
    Buffer.from(`2026-11-27T10:00:00.123Z|${ID}|extra`).toString('base64url'),
  ])('rejects %s as VALIDATION_FAILED', (cursor) => {
    expect(() => decodeCursor(cursor)).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    );
  });
});
