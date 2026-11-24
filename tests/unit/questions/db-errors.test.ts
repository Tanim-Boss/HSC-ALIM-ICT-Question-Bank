/**
 * V-5 — unique-violation mapping.
 *
 * Two kinds of case here:
 *
 *  1. **Recorded real errors.** The shapes below are transcribed from what
 *     PostgreSQL 16 + Prisma 7.10.1 actually produced during the V-1…V-5 work
 *     (index name in `meta.target`, index name in the message, no target at
 *     all). They are asserted so a Prisma wording change is caught by a test
 *     rather than by a user seeing a raw `23505`.
 *  2. **Synthetic edge cases.** Target as `string[]`, as a single string, as an
 *     index name, absent entirely, and an error carrying only a driver
 *     `code: '23505'` with no Prisma wrapper.
 *
 * The database half — that these index names actually exist and actually raise
 * 23505 — is in `tests/integration/questions/unique-conflicts.test.ts`, because a
 * mapper tested only against invented objects proves nothing about the database
 * (that is precisely the false-pass risk V-5 names).
 */

import { describe, expect, it } from 'vitest';

import {
  UNIQUE_INDEX_MAP,
  describeForLog,
  extractConstraintNames,
  isUniqueViolation,
  mapUniqueViolation,
  sqlStateOf,
  withUniqueConflictMapping,
} from '@/server/questions/publish/db-errors';
import { DomainError, toPublicError } from '@/server/questions/publish/errors';

/** A Prisma P2002 carrying nothing but a message, as one driver path does. */
function p2002(
  message: string,
  target?: unknown,
): { code: string; message: string; meta?: { target?: unknown } } {
  return target === undefined
    ? { code: 'P2002', message }
    : { code: 'P2002', message, meta: { target } };
}

/**
 * The exact strings PostgreSQL produced. Kept verbatim, including the DETAIL
 * line, because the mapper must survive the whole message, not a sanitised one.
 */
const RECORDED = {
  tagNameExpressionIndex: 'Unique constraint failed on the fields: (`name`)',
  tagNameAsConstraint: 'Unique constraint failed on the constraint: `uq_tags_name_lower`',
  pgErrorPassedThrough:
    'duplicate key value violates unique constraint "uq_tags_name_lower"\nDETAIL:  Key (lower(name))=(computer network) already exists.',
  tagSlug: 'Unique constraint failed on the constraint: `uq_tags_slug`',
  collegeName: 'Unique constraint failed on the constraint: `uq_colleges_name_lower`',
} as const;

describe('isUniqueViolation', () => {
  it('recognises P2002 and nothing else', () => {
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
    expect(isUniqueViolation({ code: 'P2003' })).toBe(false);
    expect(isUniqueViolation({ code: 'P2025' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('P2002')).toBe(false);
  });
});

describe('constraint-name extraction survives every documented target shape', () => {
  it('reads a field list (Prisma-modelled unique)', () => {
    expect(extractConstraintNames(p2002('x', ['slug']))).toContain('slug');
  });

  it('reads a single string target', () => {
    expect(extractConstraintNames(p2002('x', 'slug'))).toContain('slug');
  });

  it('reads an index name in the target (expression unique)', () => {
    expect(extractConstraintNames(p2002('x', 'uq_tags_name_lower'))).toContain(
      'uq_tags_name_lower',
    );
  });

  it('reads Prisma’s `on the constraint:` wording', () => {
    expect(extractConstraintNames(p2002(RECORDED.tagNameAsConstraint))).toContain(
      'uq_tags_name_lower',
    );
  });

  it('reads a PostgreSQL message that was passed through', () => {
    expect(extractConstraintNames(p2002(RECORDED.pgErrorPassedThrough))).toContain(
      'uq_tags_name_lower',
    );
  });

  it('returns an empty list rather than throwing when there is no target', () => {
    expect(extractConstraintNames(p2002('no target at all'))).toEqual([]);
  });

  it('reads meta.constraint when the driver puts it there instead', () => {
    expect(
      extractConstraintNames({
        code: 'P2002',
        message: 'x',
        meta: { constraint: 'uq_colleges_name_lower' },
      }),
    ).toContain('uq_colleges_name_lower');
  });
});

describe('known violations map to their own code — never to each other', () => {
  const cases: ReadonlyArray<{ name: string; error: unknown; code: string; field?: string }> = [
    {
      name: 'tag name via index name in target',
      error: p2002(RECORDED.tagNameAsConstraint, 'uq_tags_name_lower'),
      code: 'TAG_NAME_CONFLICT',
      field: 'name',
    },
    {
      name: 'tag name via message only',
      error: p2002(RECORDED.tagNameAsConstraint),
      code: 'TAG_NAME_CONFLICT',
      field: 'name',
    },
    {
      name: 'tag name via passthrough PostgreSQL message',
      error: p2002(RECORDED.pgErrorPassedThrough),
      code: 'TAG_NAME_CONFLICT',
      field: 'name',
    },
    {
      name: 'college name',
      error: p2002(RECORDED.collegeName, 'uq_colleges_name_lower'),
      code: 'COLLEGE_NAME_CONFLICT',
      field: 'name',
    },
    {
      name: 'tag slug',
      error: p2002(RECORDED.tagSlug, ['slug']),
      code: 'TAG_SLUG_CONFLICT',
      field: 'slug',
    },
    {
      name: 'option key',
      error: p2002('x', 'uq_question_options_version_key'),
      code: 'OPTION_KEY_CONFLICT',
      field: 'key',
    },
    {
      name: 'answer key already exists',
      error: p2002('x', 'uq_answer_keys_version'),
      code: 'ANSWER_KEY_EXISTS_CONFLICT',
    },
  ];

  for (const testCase of cases) {
    it(`maps ${testCase.name} → ${testCase.code}`, () => {
      const mapped = mapUniqueViolation(testCase.error);
      expect(mapped).not.toBeNull();
      expect(mapped?.code).toBe(testCase.code);
      if (testCase.field !== undefined) expect(mapped?.field).toBe(testCase.field);
    });
  }

  it('never reports a tag conflict as a college conflict, or vice versa', () => {
    // The failure mode this guards: a mapper that keys off the FIELD name.
    // Both these indexes produce field 'name', so field alone is ambiguous —
    // only the index name distinguishes them.
    const tag = mapUniqueViolation(p2002('x', 'uq_tags_name_lower'));
    const college = mapUniqueViolation(p2002('x', 'uq_colleges_name_lower'));
    expect(tag?.code).toBe('TAG_NAME_CONFLICT');
    expect(college?.code).toBe('COLLEGE_NAME_CONFLICT');
    expect(tag?.code).not.toBe(college?.code);
  });

  it('distinguishes a tag name conflict from a tag slug conflict', () => {
    // Both are on the same table; the user-facing advice differs (rename vs
    // change the URL identifier), so they must not collapse to one code.
    const name = mapUniqueViolation(p2002('x', 'uq_tags_name_lower'));
    const slug = mapUniqueViolation(p2002('x', 'uq_tags_slug'));
    expect(name?.code).toBe('TAG_NAME_CONFLICT');
    expect(slug?.code).toBe('TAG_SLUG_CONFLICT');
  });

  it('distinguishes two indexes that both map to a `name` field', () => {
    const tag = mapUniqueViolation(p2002('x', 'uq_tags_name_lower'));
    const college = mapUniqueViolation(p2002('x', 'uq_colleges_name_lower'));
    expect(tag?.field).toBe('name');
    expect(college?.field).toBe('name');
    // Same field, different code: field alone would have been ambiguous.
    expect(tag?.code).not.toBe(college?.code);
  });
});

describe('unknown violations are handled generically, never guessed', () => {
  it('an unseen index name becomes UNIQUE_CONFLICT', () => {
    const mapped = mapUniqueViolation(p2002('x', 'uq_something_from_the_future'));
    expect(mapped?.code).toBe('UNIQUE_CONFLICT');
    expect(mapped?.field).toBeUndefined();
  });

  it('a P2002 with no usable metadata becomes UNIQUE_CONFLICT', () => {
    const mapped = mapUniqueViolation(p2002('Unique constraint failed'));
    expect(mapped?.code).toBe('UNIQUE_CONFLICT');
  });

  it('the generic message is safe and action-oriented', () => {
    const mapped = mapUniqueViolation(p2002('x', 'uq_unknown'));
    expect(mapped?.message).toMatch(/already exists|conflicts/i);
    // Must not leak SQL or index detail.
    expect(mapped?.message).not.toMatch(/uq_|23505|constraint|DETAIL/i);
  });

  it('a bare driver 23505 with no Prisma wrapper is still handled', () => {
    const driverError = Object.assign(
      new Error('duplicate key value violates unique constraint "uq_tags_name_lower"'),
      {
        code: '23505',
        constraint: 'uq_tags_name_lower',
      },
    );
    const mapped = mapUniqueViolation(driverError);
    expect(mapped?.code).toBe('TAG_NAME_CONFLICT');
  });

  it('a bare driver 23505 with an unknown constraint is generic', () => {
    const driverError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'mystery_idx',
    });
    expect(mapUniqueViolation(driverError)?.code).toBe('UNIQUE_CONFLICT');
  });
});

describe('non-unique errors are passed through untouched', () => {
  it('returns null for a foreign-key violation', () => {
    expect(mapUniqueViolation({ code: 'P2003', message: 'FK failed' })).toBeNull();
  });

  it('returns null for a record-not-found', () => {
    expect(mapUniqueViolation({ code: 'P2025', message: 'not found' })).toBeNull();
  });

  it('returns null for a plain Error', () => {
    expect(mapUniqueViolation(new Error('boom'))).toBeNull();
  });

  it('withUniqueConflictMapping re-throws an unmapped error unchanged', async () => {
    const original = new Error('boom');
    await expect(withUniqueConflictMapping(async () => Promise.reject(original))).rejects.toBe(
      original,
    );
  });

  it('withUniqueConflictMapping converts a mapped error', async () => {
    await expect(
      withUniqueConflictMapping(async () => Promise.reject(p2002('x', 'uq_tags_slug'))),
    ).rejects.toMatchObject({ code: 'TAG_SLUG_CONFLICT' });
  });
});

describe('nothing internal escapes to a user', () => {
  it('toPublicError drops constraint names even when the mapper captured them', () => {
    const mapped = mapUniqueViolation(p2002('x', 'uq_tags_name_lower'));
    expect(mapped).not.toBeNull();
    if (mapped === null) return;
    // The DomainError carries them for the log...
    expect(mapped.constraintNames).toEqual(['uq_tags_name_lower']);
    // ...the public projection does not.
    const published = toPublicError(mapped);
    expect(JSON.stringify(published)).not.toContain('uq_tags_name_lower');
    expect(published).not.toHaveProperty('constraintNames');
  });

  it('a mapped message never contains the raw database text', () => {
    const mapped = mapUniqueViolation(p2002(RECORDED.pgErrorPassedThrough));
    expect(mapped?.message).not.toContain('DETAIL');
    expect(mapped?.message).not.toContain('lower(name)');
    expect(mapped?.message).not.toContain('23505');
  });

  it('describeForLog does capture the internals, for server logs only', () => {
    const log = describeForLog(p2002('x', 'uq_tags_name_lower'));
    expect(log).toContain('uq_tags_name_lower');
  });

  it('sqlStateOf finds a nested SQLSTATE and gives up safely', () => {
    expect(sqlStateOf({ code: 'P2002', cause: { code: '23505' } })).toBe('23505');
    expect(sqlStateOf(new Error('no code'))).toBeNull();
    expect(sqlStateOf(null)).toBeNull();
  });
});

describe('the registry itself', () => {
  it('every entry has a stable code and a user-safe message', () => {
    for (const [index, mapping] of Object.entries(UNIQUE_INDEX_MAP)) {
      expect(mapping.code, index).toMatch(/^[A-Z_]+$/);
      expect(mapping.message.length, index).toBeGreaterThan(10);
      // Case-sensitive and word-bounded: an earlier version used /DETAIL/i and
      // matched the word "details" in a perfectly safe message. A leak test that
      // fires on prose is as useless as one that never fires.
      expect(mapping.message, index).not.toMatch(
        /\buq_\w+|\bix_\w+|23505|\bDETAIL:\b|constraint "/,
      );
    }
  });

  it('no two indexes with different meanings share a code by accident', () => {
    // Two entries MAY share a code (academic_years label/year are one conflict),
    // but a code must never point at two different user-facing messages.
    const byCode = new Map<string, Set<string>>();
    for (const mapping of Object.values(UNIQUE_INDEX_MAP)) {
      const messages = byCode.get(mapping.code) ?? new Set<string>();
      messages.add(mapping.message);
      byCode.set(mapping.code, messages);
    }
    for (const [code, messages] of byCode) {
      expect(messages.size, `code ${code} has ${String(messages.size)} messages`).toBe(1);
    }
  });

  it('covers the two expression indexes V-5 was written for', () => {
    expect(Object.keys(UNIQUE_INDEX_MAP)).toContain('uq_tags_name_lower');
    expect(Object.keys(UNIQUE_INDEX_MAP)).toContain('uq_colleges_name_lower');
  });

  it('does not map a foreign-key or check constraint as if it were unique', () => {
    expect(Object.keys(UNIQUE_INDEX_MAP).some((k) => k.startsWith('fk_'))).toBe(false);
    expect(Object.keys(UNIQUE_INDEX_MAP).some((k) => k.startsWith('ck_'))).toBe(false);
  });

  it('a P2002 naming a NON-unique constraint still yields a safe generic conflict', () => {
    // Not reachable in practice, but the mapper must not fall over on it.
    const mapped = mapUniqueViolation(p2002('x', 'answer_keys_pkey'));
    expect(mapped).toBeInstanceOf(DomainError);
    expect(mapped?.code).toBe('UNIQUE_CONFLICT');
  });
});
