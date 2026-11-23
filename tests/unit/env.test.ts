import { describe, expect, it } from 'vitest';
import {
  EnvValidationError,
  getDatabaseUrl,
  parsePublicEnv,
  parseServerEnv,
  requireDatabaseUrl,
} from '@/lib/env';

describe('parsePublicEnv', () => {
  it('accepts an empty environment (Supabase optional until provisioned)', () => {
    expect(parsePublicEnv({})).toEqual({});
  });

  it('rejects a malformed Supabase URL', () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: 'not-a-url' })).toThrow(
      EnvValidationError,
    );
  });

  it('accepts a well-formed public environment', () => {
    const env = parsePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://example.supabase.co');
  });
});

describe('parseServerEnv', () => {
  it('accepts a PostgreSQL connection string', () => {
    const env = parseServerEnv({ DATABASE_URL: 'postgresql://u:p@localhost:5432/ict_atlas' });
    expect(env.DATABASE_URL).toBe('postgresql://u:p@localhost:5432/ict_atlas');
  });

  it('coerces the exam grace window from string to number', () => {
    const env = parseServerEnv({ EXAM_GRACE_WINDOW_MS: '5000' });
    expect(env.EXAM_GRACE_WINDOW_MS).toBe(5000);
  });

  it('rejects a negative grace window', () => {
    expect(() => parseServerEnv({ EXAM_GRACE_WINDOW_MS: '-1' })).toThrow(EnvValidationError);
  });

  it('aggregates multiple issues into one descriptive error', () => {
    try {
      parseServerEnv({ NEXT_PUBLIC_APP_URL: 'not-a-url', EXAM_GRACE_WINDOW_MS: '-5' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).issues.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('database URL helpers', () => {
  it('returns undefined when DATABASE_URL is unset (CI/lint tolerant)', () => {
    expect(getDatabaseUrl({})).toBeUndefined();
  });

  it('requireDatabaseUrl throws a descriptive error when unset', () => {
    expect(() => requireDatabaseUrl({})).toThrow(/DATABASE_URL/);
  });

  it('requireDatabaseUrl returns the URL when set', () => {
    expect(requireDatabaseUrl({ DATABASE_URL: 'postgresql://u:p@h:5432/db' })).toBe(
      'postgresql://u:p@h:5432/db',
    );
  });
});
