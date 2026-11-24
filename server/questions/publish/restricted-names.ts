/**
 * The restricted answer-name policy — ONE list, two boundaries.
 *
 * Two boundaries guard answer material, and they previously carried separate,
 * disagreeing lists:
 *
 *   - the publish gate (`rules.ts`) refused 7 property names;
 *   - the student projection (`dto.ts`) stripped 11.
 *
 * Each list covered a name the other did not. `correct` was REFUSED by the gate
 * but NOT STRIPPED by the projection, so the projection's guarantee held only
 * because the gate had already run. `cqRubric`, `isVerified`,
 * `mcqCorrectOptionKey`, `verifiedAt` and `notes` were STRIPPED but NOT REFUSED,
 * so the gate's guarantee held only because nothing wrote them.
 *
 * Two half-correct guards are not one correct guard, and the composition is what
 * made it look safe. This module is the single source of truth so a name cannot
 * be added to one boundary and forgotten in the other.
 *
 * ── Why a union, and not just the larger list ──────────────────────────────
 *
 * The two boundaries need different strengths, so a single flat list would have
 * to be the WEAKEST of the two — which is how the divergence happened.
 *
 *   ANSWER_REVEALING_PROPERTIES  — content-borne names. These must never appear
 *                                  inside a content document at all, at any
 *                                  depth, so the gate refuses to publish them.
 *                                  §7.5 lists these; see the table there.
 *
 *   ANSWER_KEY_COLUMNS           — names of answer-key *columns* on a record.
 *                                  These are not content and never appear inside
 *                                  a document; they exist as ORM fields. The
 *                                  gate has no business refusing them inside
 *                                  content (a block would never legitimately
 *                                  carry `isVerified`), but the projection must
 *                                  still strip them if a caller ever spreads a
 *                                  row. Kept separate so the gate's rejection
 *                                  message stays truthful about what it found.
 *
 *   RESTRICTED_ANSWER_NAMES      — the union, and the answer to "is this field
 *                                  restricted?". Any boundary that must never
 *                                  expose answer material uses this.
 *
 * ── Scope note, stated because it is easy to get wrong ────────────────────
 *
 * `RESTRICTED_ANSWER_NAMES` applies to STUDENT-facing output and to content
 * documents. It does not apply to authorized staff projections: `toStaffQuestion`
 * legitimately returns `answerKey`, `cqRubric` and `isVerified`, and that is
 * correct — staff surfaces are authorized separately and the rubric is the
 * marker's document. A validator that rejected those names in a staff payload
 * would break the staff review screen. The distinction is "student-facing vs
 * staff-facing", not "safe vs unsafe".
 *
 * Matching is exact and case-sensitive on a property NAME. There is deliberately
 * no prefix/substring/fuzzy rule: it would remove legitimate public fields
 * (`key`, `options`, `notes` is already explicit, and a substring rule on
 * `correct` would strip any future `correctness`-named scoring field from an
 * authorized payload). Option keys — `A`, `B`, `C`, `D`, `ক`, `খ`, `গ`, `ঘ`,
 * and even a distractor key `E` — are values, not names, and are untouched.
 */

/**
 * §7.5 content-borne answer-revealing property names.
 *
 * The publish gate refuses to publish a content document carrying any of these
 * at any depth: an answer leaked into a student-facing document is the single
 * worst failure this system can have.
 */
export const ANSWER_REVEALING_PROPERTIES = [
  'correctAnswer',
  'isCorrect',
  'correct',
  'answerKey',
  'solution',
  'expectedAnswer',
  'explanation',
] as const;

/**
 * Answer-key column names that must never survive into student-facing output.
 *
 * These are ORM field names, not content properties. The projection strips them
 * defensively so that a caller which spreads a row — or a future projection bug
 * — still cannot surface them.
 */
export const ANSWER_KEY_COLUMNS = [
  'mcqCorrectOptionKey',
  'cqRubric',
  'isVerified',
  'verifiedAt',
  'notes',
] as const;

/**
 * Every name that must never reach a student and must never appear in content.
 * The union of the two causes above — this is what boundaries check against.
 */
export const RESTRICTED_ANSWER_NAMES = [
  ...ANSWER_REVEALING_PROPERTIES,
  ...ANSWER_KEY_COLUMNS,
] as const;

export type RestrictedAnswerName = (typeof RESTRICTED_ANSWER_NAMES)[number];

/**
 * Exact-name membership test.
 *
 * Uses a Set for O(1) at document depth; the array form stays exported so tests
 * and documentation can enumerate the policy without reaching into internals.
 */
const RESTRICTED_SET: ReadonlySet<string> = new Set<string>(RESTRICTED_ANSWER_NAMES);

/** True when `name` is a restricted answer-bearing property name. */
export function isRestrictedAnswerName(name: string): boolean {
  return RESTRICTED_SET.has(name);
}
