/**
 * Migration 0005 — mapping the frozen-content trigger refusal (SQLSTATE IA001).
 *
 * The shapes are transcribed from what PostgreSQL 16 + Prisma 7.10.1 +
 * @prisma/adapter-pg produced for a real trg_question_versions_frozen /
 * trg_question_options_frozen refusal: `P2039` for a model call, `P2010` for a
 * raw query, with the SQLSTATE only in `meta.driverAdapterError.cause`. The
 * database half is tests/integration/questions/published-immutability.test.ts.
 */

import { describe, expect, it } from 'vitest';

import {
  FOREIGN_KEY_MAP,
  FROZEN_CONTENT_SQLSTATE,
  isFrozenContentViolation,
  mapDatabaseError,
  mapForeignKeyViolation,
  mapFrozenContentViolation,
} from '@/server/questions/publish/db-errors';
import { toPublicError } from '@/server/questions/publish/errors';

const DRIVER_TEXT =
  'question version 00000000-0000-4000-8000-000000000000 (status PUBLISHED) is published content and cannot be changed';

function recorded(prismaCode: 'P2039' | 'P2010') {
  return {
    name: 'PrismaClientKnownRequestError',
    code: prismaCode,
    message: `Database error. Code: \`IA001\`. Message: \`${DRIVER_TEXT}\``,
    meta: {
      modelName: 'QuestionVersion',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: 'IA001',
          originalMessage: DRIVER_TEXT,
          kind: 'postgres',
          code: 'IA001',
          severity: 'ERROR',
          message: DRIVER_TEXT,
        },
      },
    },
  };
}

describe('frozen-content violations (migration 0005)', () => {
  it('uses the SQLSTATE the migration raises', () => {
    expect(FROZEN_CONTENT_SQLSTATE).toBe('IA001');
  });

  it.each(['P2039', 'P2010'] as const)(
    'a recorded %s refusal maps to PUBLISHED_VERSION_IMMUTABLE (I-5)',
    (code) => {
      const error = recorded(code);
      expect(isFrozenContentViolation(error)).toBe(true);
      expect(mapFrozenContentViolation(error)).toMatchObject({
        code: 'PUBLISHED_VERSION_IMMUTABLE',
        invariant: 'I-5',
      });
      expect(mapDatabaseError(error)?.code).toBe('PUBLISHED_VERSION_IMMUTABLE');
    },
  );

  it('a raw pg error carrying code IA001 is recognised too', () => {
    expect(isFrozenContentViolation({ code: 'IA001', message: DRIVER_TEXT })).toBe(true);
  });

  it('other errors are not mistaken for it', () => {
    expect(isFrozenContentViolation(null)).toBe(false);
    expect(isFrozenContentViolation(new Error('IA001'))).toBe(false);
    expect(isFrozenContentViolation({ code: 'P2002' })).toBe(false);
    expect(isFrozenContentViolation({ code: '23505' })).toBe(false);
    expect(mapFrozenContentViolation({ code: 'P2003' })).toBeNull();
  });

  it('no driver text, version id or SQLSTATE reaches the public error', () => {
    const mapped = mapFrozenContentViolation(recorded('P2039'));
    expect(mapped).not.toBeNull();
    const text = JSON.stringify(toPublicError(mapped!));
    expect(text).not.toMatch(/IA001|00000000-0000|question_versions|status PUBLISHED/);
  });
});

describe('question_versions_question_id_fkey (RESTRICT since migration 0005)', () => {
  it('maps to QUESTION_HAS_VERSIONS', () => {
    expect(FOREIGN_KEY_MAP['question_versions_question_id_fkey']?.code).toBe(
      'QUESTION_HAS_VERSIONS',
    );
    const mapped = mapForeignKeyViolation({
      code: 'P2003',
      meta: {
        driverAdapterError: {
          cause: {
            originalCode: '23503',
            constraint: { index: 'question_versions_question_id_fkey' },
          },
        },
      },
    });
    expect(mapped?.code).toBe('QUESTION_HAS_VERSIONS');
  });
});
