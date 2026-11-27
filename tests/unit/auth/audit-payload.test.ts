/**
 * Phase 04B — audit payloads carry ids and status fields only. Answer keys and
 * rubric content must never be copied into audit_events.
 */

import { describe, expect, it } from 'vitest';

import { assertAuditStateIsSafe } from '@/server/auth/audit';

describe('assertAuditStateIsSafe', () => {
  it('accepts ids, statuses, numbers, booleans and role lists', () => {
    expect(() =>
      assertAuditStateIsSafe({
        questionId: '0b000000-0000-4000-8000-000000000001',
        status: 'PUBLISHED',
        versionNumber: 2,
        isActive: true,
        publishedBy: null,
        roles: ['STUDENT'],
      }),
    ).not.toThrow();
    expect(() => assertAuditStateIsSafe(undefined)).not.toThrow();
  });

  it.each(['mcqCorrectOptionKey', 'answerKey', 'cqRubric', 'rubric', 'content', 'correct'])(
    'refuses the key %s',
    (key) => {
      expect(() => assertAuditStateIsSafe({ [key]: 'A' })).toThrow(/not allowed/);
    },
  );

  it('refuses a nested object even under an innocent key', () => {
    // Untyped input, as plain JavaScript or a careless spread would produce.
    const smuggled: unknown = JSON.parse('{"snapshot":{"mcq":"A"}}');
    expect(() => assertAuditStateIsSafe(smuggled as Record<string, string>)).toThrow(/flat/);
  });
});
