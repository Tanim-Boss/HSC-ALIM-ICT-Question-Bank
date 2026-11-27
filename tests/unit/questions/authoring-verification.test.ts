/**
 * Phase 04C — the is_verified reset rule and changed-field detection.
 *
 * Any change to the answer key or rubric resets verification; an identical key
 * (including a rubric re-sent with its properties in another order) keeps it.
 */

import { describe, expect, it } from 'vitest';

import {
  canonicalJson,
  changedFields,
  keyPayloadEquals,
  verificationAfterSave,
  type KeyPayload,
  type StoredKey,
} from '@/server/questions/authoring/verification';

const VERIFIER = '0b000000-0000-4000-8000-000000000003';
const AT = new Date('2026-11-27T09:00:00.000Z');

const mcq = (k: string): KeyPayload => ({ kind: 'mcq', mcqCorrectOptionKey: k });
const rubric = (total: number, extra: Record<string, unknown> = {}): KeyPayload => ({
  kind: 'cq',
  cqRubric: { format: 'cq_rubric', version: 1, totalMaxMarks: total, ...extra },
});
const verified = (payload: KeyPayload): StoredKey => ({
  payload,
  isVerified: true,
  verifiedById: VERIFIER,
  verifiedAt: AT,
});
const UNVERIFIED = { isVerified: false, verifiedById: null, verifiedAt: null };

describe('verificationAfterSave', () => {
  it('keeps verification when the key is unchanged', () => {
    expect(verificationAfterSave(verified(mcq('B')), mcq('B'))).toEqual({
      isVerified: true,
      verifiedById: VERIFIER,
      verifiedAt: AT,
    });
  });

  it('resets when the correct option changes', () => {
    expect(verificationAfterSave(verified(mcq('B')), mcq('C'))).toEqual(UNVERIFIED);
  });

  it('resets when the rubric changes', () => {
    expect(verificationAfterSave(verified(rubric(10)), rubric(9))).toEqual(UNVERIFIED);
  });

  it('keeps verification for the same rubric with properties in another order', () => {
    const reordered: KeyPayload = {
      kind: 'cq',
      cqRubric: { totalMaxMarks: 10, version: 1, format: 'cq_rubric' },
    };
    expect(verificationAfterSave(verified(rubric(10)), reordered)?.isVerified).toBe(true);
  });

  it('a newly added key starts unverified', () => {
    expect(verificationAfterSave(null, mcq('A'))).toEqual(UNVERIFIED);
  });

  it('a removed key leaves nothing to verify', () => {
    expect(verificationAfterSave(verified(mcq('A')), null)).toBeNull();
  });

  it('switching kind (mcq ↔ rubric) is a change', () => {
    expect(verificationAfterSave(verified(mcq('A')), rubric(10))).toEqual(UNVERIFIED);
  });

  it('an unverified key stays unverified when unchanged', () => {
    const stored: StoredKey = { payload: mcq('A'), ...UNVERIFIED };
    expect(verificationAfterSave(stored, mcq('A'))).toEqual(UNVERIFIED);
  });
});

describe('keyPayloadEquals / canonicalJson', () => {
  it('compares structurally, ignoring property order but not array order', () => {
    expect(canonicalJson({ b: 1, a: [2, 1] })).toBe(canonicalJson({ a: [2, 1], b: 1 }));
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
    expect(keyPayloadEquals(null, null)).toBe(true);
    expect(keyPayloadEquals(mcq('A'), null)).toBe(false);
  });
});

describe('changedFields', () => {
  const doc = (text: string) => ({ blocks: [{ type: 'paragraph', data: { text } }] });
  const base = {
    content: doc('প্রশ্ন'),
    options: [{ key: 'A', content: doc('এক') }],
    key: mcq('A'),
  };

  it('names nothing when nothing changed', () => {
    expect(changedFields(base, { ...base })).toEqual([]);
  });

  it('names each changed part, never its value', () => {
    expect(
      changedFields(base, {
        content: doc('নতুন'),
        options: [
          { key: 'A', content: doc('এক') },
          { key: 'B', content: doc('দুই') },
        ],
        key: mcq('B'),
      }),
    ).toEqual(['content', 'options', 'answerKey']);
  });
});
