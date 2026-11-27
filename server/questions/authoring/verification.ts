/**
 * What a draft save does to answer-key verification, and which fields changed.
 *
 * Rule: ANY change to the answer key or the rubric — a different correct
 * option, a different rubric, a key added, a key removed — resets verification
 * (is_verified = false, verified_by = NULL, verified_at = NULL). A save that
 * leaves the key exactly as it was keeps its verification.
 *
 * "Exactly as it was" is a structural JSON comparison with object keys sorted,
 * so re-sending the same rubric with properties in a different order is not a
 * change.
 *
 * Pure: unit-tested without a database.
 */

export type KeyPayload =
  | { readonly kind: 'mcq'; readonly mcqCorrectOptionKey: string }
  | { readonly kind: 'cq'; readonly cqRubric: unknown };

export interface StoredKey {
  readonly payload: KeyPayload;
  readonly isVerified: boolean;
  readonly verifiedById: string | null;
  readonly verifiedAt: Date | null;
}

export interface VerificationState {
  readonly isVerified: boolean;
  readonly verifiedById: string | null;
  readonly verifiedAt: Date | null;
}

const UNVERIFIED: VerificationState = { isVerified: false, verifiedById: null, verifiedAt: null };

/** JSON with object keys sorted, so equal documents compare equal as strings. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function keyPayloadEquals(a: KeyPayload | null, b: KeyPayload | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'mcq' && b.kind === 'mcq') return a.mcqCorrectOptionKey === b.mcqCorrectOptionKey;
  if (a.kind === 'cq' && b.kind === 'cq')
    return canonicalJson(a.cqRubric) === canonicalJson(b.cqRubric);
  return false;
}

/**
 * The verification the saved key must carry. `null` when the save leaves no key
 * (there is nothing to be verified).
 */
export function verificationAfterSave(
  previous: StoredKey | null,
  next: KeyPayload | null,
): VerificationState | null {
  if (next === null) return null;
  if (previous === null || !keyPayloadEquals(previous.payload, next)) return UNVERIFIED;
  return {
    isVerified: previous.isVerified,
    verifiedById: previous.verifiedById,
    verifiedAt: previous.verifiedAt,
  };
}

export type ChangedField = 'content' | 'options' | 'answerKey';

/** Names (never values) of what a save changed — what the audit row records. */
export function changedFields(
  previous: {
    readonly content: unknown;
    readonly options: readonly { readonly key: string; readonly content: unknown }[];
    readonly key: KeyPayload | null;
  },
  next: {
    readonly content: unknown;
    readonly options: readonly { readonly key: string; readonly content: unknown }[];
    readonly key: KeyPayload | null;
  },
): ChangedField[] {
  const fields: ChangedField[] = [];
  if (canonicalJson(previous.content) !== canonicalJson(next.content)) fields.push('content');
  const optionsOf = (list: typeof previous.options) =>
    canonicalJson(list.map((o) => ({ key: o.key, content: o.content })));
  if (optionsOf(previous.options) !== optionsOf(next.options)) fields.push('options');
  if (!keyPayloadEquals(previous.key, next.key)) fields.push('answerKey');
  return fields;
}
