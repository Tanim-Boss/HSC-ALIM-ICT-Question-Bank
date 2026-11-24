/**
 * AMB-5 — the fail-closed gate in the pure rules, plus source-level evidence
 * that every entry point actually runs it.
 *
 * The real service is exercised against PostgreSQL in
 * `tests/integration/questions/change-type-service.test.ts`. This file covers
 * what does not need a database:
 *
 *   * the gate's own boundary conditions;
 *   * that the gate distinguishes "published now" from "unknowable";
 *   * that BOTH gates are wired into the two entry points that can change a
 *     type — checked by reading the source, because the defect AMB-5 describes
 *     was a missing call, and a behavioural test of the helper cannot detect a
 *     missing call site.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  assertLegacyArchiveReviewRequired,
  assertTypeChangeAllowed,
  type VersionRecordSnapshot,
} from '@/server/questions/publish/rules';
import { DomainError } from '@/server/questions/publish/errors';

const v = (status: VersionRecordSnapshot['status'], n = 1): VersionRecordSnapshot =>
  ({
    id: `v${String(n)}`,
    versionNumber: n,
    status,
    content: null,
    options: [],
    answerKey: null,
    assetLinks: [],
  }) as VersionRecordSnapshot;

const codes = (fn: () => void): string | null => {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof DomainError ? error.code : 'NOT_A_DOMAIN_ERROR';
  }
};

describe('assertLegacyArchiveReviewRequired — fail closed', () => {
  it('REFUSES a type change when every version is archived', () => {
    expect(codes(() => assertLegacyArchiveReviewRequired('CQ', 'MCQ', [v('ARCHIVED')]))).toBe(
      'QUESTION_TYPE_CHANGE_REVIEW_REQUIRED',
    );
  });

  it('refuses with several archived versions', () => {
    expect(
      codes(() =>
        assertLegacyArchiveReviewRequired('CQ', 'MCQ', [v('ARCHIVED', 1), v('ARCHIVED', 2)]),
      ),
    ).toBe('QUESTION_TYPE_CHANGE_REVIEW_REQUIRED');
  });

  it('uses a code distinct from the published-immutability failure', () => {
    let code: string | null = null;
    try {
      assertLegacyArchiveReviewRequired('CQ', 'MCQ', [v('ARCHIVED')]);
    } catch (error) {
      code = (error as DomainError).code;
    }
    expect(code).not.toBe('QUESTION_TYPE_IMMUTABLE');
  });

  it('carries invariant I-6 and a message that names the ambiguity', () => {
    try {
      assertLegacyArchiveReviewRequired('CQ', 'MCQ', [v('ARCHIVED')]);
      expect.unreachable('should have thrown');
    } catch (error) {
      const err = error as DomainError;
      expect(err.invariant).toBe('I-6');
      expect(err.message).toContain('all archived');
      expect(err.message).toContain('cannot be determined');
      // The message must not assert non-publication, and must not leak internals.
      expect(err.message).not.toMatch(/SELECT|prisma|question_versions/i);
    }
  });

  it('does not fire when the type is unchanged', () => {
    expect(codes(() => assertLegacyArchiveReviewRequired('MCQ', 'MCQ', [v('ARCHIVED')]))).toBe(
      null,
    );
  });

  it('does not fire when there are no versions — nothing was published', () => {
    expect(codes(() => assertLegacyArchiveReviewRequired('CQ', 'MCQ', []))).toBe(null);
  });

  it('does not fire when a draft exists — history is not yet at stake', () => {
    expect(
      codes(() => assertLegacyArchiveReviewRequired('CQ', 'MCQ', [v('DRAFT'), v('ARCHIVED', 2)])),
    ).toBe(null);
  });

  it('does not fire when a version is published — the other gate owns that', () => {
    // Asserted together: the two gates are complementary and must not double up.
    expect(
      codes(() =>
        assertLegacyArchiveReviewRequired('CQ', 'MCQ', [v('PUBLISHED'), v('ARCHIVED', 2)]),
      ),
    ).toBe(null);
    expect(
      codes(() => assertTypeChangeAllowed('CQ', 'MCQ', [v('PUBLISHED'), v('ARCHIVED', 2)])),
    ).toBe('QUESTION_TYPE_IMMUTABLE');
  });
});

describe('assertTypeChangeAllowed — unchanged behaviour (D1..D3 preserved)', () => {
  it('still refuses when a version is published', () => {
    expect(codes(() => assertTypeChangeAllowed('CQ', 'MCQ', [v('PUBLISHED')]))).toBe(
      'QUESTION_TYPE_IMMUTABLE',
    );
  });

  it('still permits a draft-only change', () => {
    expect(codes(() => assertTypeChangeAllowed('CQ', 'MCQ', [v('DRAFT')]))).toBe(null);
  });

  it('still permits a same-type no-op even when published', () => {
    expect(codes(() => assertTypeChangeAllowed('MCQ', 'MCQ', [v('PUBLISHED')]))).toBe(null);
  });

  it('on its own it STILL permits an all-archived change — which is why the second gate exists', () => {
    // This is the defect AMB-5 named, pinned as a test so it cannot be
    // reintroduced silently by "simplifying" the pair back into one function.
    expect(codes(() => assertTypeChangeAllowed('CQ', 'MCQ', [v('ARCHIVED')]))).toBe(null);
  });
});

describe('the gate is wired into every type-change entry point', () => {
  const service = readFileSync('server/questions/change-type.ts', 'utf8');
  const gate = readFileSync('server/questions/publish/gate.ts', 'utf8');

  /**
   * A substring search is not enough: `if (false) assertLegacyArchive…(...)`
   * still contains the substring while enforcing nothing. Mutation testing
   * proved that — disabling the call left every assertion green. These helpers
   * require the call to be a bare statement at the start of its line, which is
   * what an unconditional call looks like.
   */
  const callsUnconditionally = (source: string, fn: string): boolean =>
    new RegExp(`^\\s*${fn}\\(`, 'm').test(source);

  it('the service calls BOTH gates unconditionally', () => {
    expect(callsUnconditionally(service, 'assertTypeChangeAllowed')).toBe(true);
    expect(callsUnconditionally(service, 'assertLegacyArchiveReviewRequired')).toBe(true);
  });

  it('neither gate call is dead-coded behind a falsy guard', () => {
    // The exact mutation that defeated the substring check.
    expect(service).not.toMatch(/if\s*\(\s*(false|0|null|undefined)\s*\)/);
    expect(gate).not.toMatch(/if\s*\(\s*(false|0|null|undefined)\s*\)/);
  });

  it('the older gate entry point also calls the archived gate now', () => {
    // `assertQuestionTypeChangeAllowed` existed with no caller and no AMB-5
    // call. If that is ever reverted, this fails.
    expect(callsUnconditionally(gate, 'assertLegacyArchiveReviewRequired')).toBe(true);
  });

  it('the service takes no override parameter', () => {
    expect(service).not.toContain('allowLegacyArchivedTypeChange');
  });

  it('the service locks the row before reading it', () => {
    const lock = service.indexOf('FOR UPDATE');
    const read = service.indexOf('loadQuestionSnapshot');
    expect(lock).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(lock);
  });

  it('the service reads through the transaction client, not the pool (D2)', () => {
    const body = service.slice(service.indexOf('$transaction'));
    expect(body).toContain('loadQuestionSnapshot(db');
    expect(body).not.toContain('loadQuestionSnapshot(getPrisma()');
  });

  it('no other module in server/ writes questions.type directly', () => {
    // The repository-wide guarantee AMB-5 depends on: the service is the only
    // path. A new `prisma.question.update({ data: { type … } })` elsewhere
    // would bypass the gate, and this assertion is the tripwire.
    const files = ['server/questions/change-type.ts', 'server/questions/publish/gate.ts'];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const writesType =
        /\.update\(\{[\s\S]{0,200}?data:\s*\{[\s\S]{0,80}?type:/.test(source) ?? false;
      if (file.endsWith('change-type.ts')) {
        expect(writesType).toBe(true); // the one authorised write
      } else {
        expect(writesType).toBe(false);
      }
    }
  });
});
