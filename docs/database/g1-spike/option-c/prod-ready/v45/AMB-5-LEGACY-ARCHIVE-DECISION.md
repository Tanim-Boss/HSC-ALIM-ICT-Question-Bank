# AMB-5 — owner decision recorded: FAIL CLOSED for legacy archived records

Status: **APPROVED BY OWNER. Implemented as a review gate, NOT as historical
tracking.** Recorded 2026-11-23.

---

## 1. The decision, verbatim in substance

> **AMB-5: Legacy archived records — FAIL CLOSED. APPROVED.**
>
> For fully archived questions whose historical publication status cannot be
> reliably reconstructed:
>
> - Do not automatically permit question-type changes.
> - Require an explicit review/exception path before allowing such a change.
> - Do not treat missing historical data as proof that the question was never
>   published.
> - Do not silently infer historical publication status.

## 2. Exact scope — what this decides and what it does not

**Decides:** the *recovery policy* for legacy question records whose publication
history is unreconstructable. When a question's versions are all `ARCHIVED`, a
type change must not proceed automatically; it needs an explicit exception.

**Does NOT decide, and must not be read as deciding:**

| Not authorised by this decision | Status |
| --- | --- |
| A new database column (`first_published_at` or similar) | **Not created.** No `prisma/` change. |
| A publication-events table | **Not created.** |
| Migration 0002 | **Not created, not committed.** |
| A backfill of historical publication status | **Not performed.** None is possible for the residual set (see §4). |
| Complete historical publication tracking | **Not implemented.** Must not be claimed. |
| The general "ever published" vs "currently published" rule | **Still both readings coexist** — see §3. |

This decision resolves the *legacy recovery policy only*. Broader historical
tracking remains subject to a separate schema and implementation approval.

## 3. Implementation as built

`assertLegacyArchiveReviewRequired(nextType, currentType, versions)` in
`server/questions/publish/rules.ts` — **three parameters, no options argument**.

**Fires when:** the type is changing, there is at least one version, and **every**
version is `ARCHIVED`. It throws `QUESTION_TYPE_CHANGE_REVIEW_REQUIRED`
(invariant I‑6).

**Code correction (post-merge reconciliation, PR #10 `649c714`).** This section
originally recorded `QUESTION_TYPE_IMMUTABLE`, on the reasoning that the gate
should reuse the existing published-version code rather than invent one. The
implementation deliberately does the opposite, and the decision's **intent is
unchanged**: the gate still fails closed on missing publication history, still
carries invariant I‑6, and still invents no *new* mechanism. What changed is that
the refusal reports a **distinct** code, because the two facts need different
remediation — `QUESTION_TYPE_IMMUTABLE` means "a published version exists right
now", whereas `QUESTION_TYPE_CHANGE_REVIEW_REQUIRED` means "publication status
is unknowable, so an explicit review is required". Collapsing them would tell a
user something false about their own question.

The implemented behaviour, verified at `649c714`:

- `server/questions/publish/rules.ts:1311` — `code: 'QUESTION_TYPE_CHANGE_REVIEW_REQUIRED'`
  (line numbers re-measured after the OD-18 consolidation; re-check before citing)
- `tests/unit/questions/amb5-type-change.test.ts:50,59` — asserts the new code
- `tests/unit/questions/rubric-strict.test.ts:409,412` — asserts the new code **and** asserts it is `not` `QUESTION_TYPE_IMMUTABLE`

No application behaviour was changed by this correction; it is documentation only.

**Exception path: NONE EXISTS (changed in the post-merge hardening).** This
section previously documented `{ allowLegacyArchivedTypeChange: true }`, an
explicit per-call argument, on the reasoning that a per-call flag is visible at
every call site and therefore not a "global switch". That parameter has been
**removed from the production API**, because:

- no production caller ever passed it. Both entry points call the helper with
  three arguments; the only code that set the flag was a test asserting that the
  flag worked, which is circular evidence rather than a requirement;
- a boolean that resolves "publication status unknowable" in the caller's
  favour **is** the silent inference the owner decision forbids. Per-call rather
  than global changes how visible the bypass is, not whether it is one;
- the decision requires an explicit **review**. A boolean carries no reviewer,
  no reason and no record, so it is not a review.

Consequence: the helper cannot be disarmed. A fully archived question is refused
with `QUESTION_TYPE_CHANGE_REVIEW_REQUIRED` and the only in-code remedy is to
create a new question.

**OWNER DECISION — 2026-11-24: Option 1 APPROVED (keep the exception mechanism
closed).** The approved policy says such a question "requires an explicit
review/exception path". The owner has decided that the path stays closed:

- Fully archived questions **must fail closed** for question-type changes.
- **No per-call bypass flag and no alternative production bypass is permitted.**
  The removed `allowLegacyArchivedTypeChange` parameter must not be reintroduced
  under another name, shape or default.
- `QUESTION_TYPE_CHANGE_REVIEW_REQUIRED` stays **distinct** from
  `QUESTION_TYPE_IMMUTABLE`: the first says publication status is unknowable, the
  second says a published version exists right now.
- **No exception mechanism is introduced** in this work.
- An **auditable** exception workflow (approver, reason, record, scope) may be
  considered **separately**, if a genuine requirement arises. It does not exist
  today, is not authorised by this decision, and must not be described as
  planned-in-this-work.

**What the current implementation does and does not provide.** It provides a
refusal with a stable code. It provides **no** review-override capability: there
is no flag, no parameter, no environment switch and no service method that
permits the change. The remedy today is to create a new question. Any statement
implying that a reviewed exception can currently be granted through the
application is false.

**Does not fire when:**

- a version is `PUBLISHED` → `assertTypeChangeAllowed` refuses outright;
- a `DRAFT` version exists → history not yet at stake;
- there are no versions → nothing was published by definition;
- the type is unchanged.

### Why this is a second function rather than a change to the first

`assertTypeChangeAllowed` refuses only when a version is published *now*. It
cannot distinguish "all archived, was published" from "all archived, never
published" — the schema destroys that difference on archival.

Making that existing function throw on *every* all-archived question would be
fail-closed, but it would also forbid type changes on questions that were only
ever drafts and then archived. That is a real behaviour change to a live workflow,
and the approved decision says "require an explicit review", not "ban". The review
gate is the faithful implementation; a blanket ban would exceed the approval.

**A test pins the distinction:** `CURRENT GAP: assertTypeChangeAllowed alone still
permits the all-archived change`. A caller that runs only the old function still
gets the permissive behaviour, which is why every entry point runs **both** — see
§5 for the wiring, which is no longer outstanding.

## 4. The limitation, stated plainly

**Historical publication tracking does not exist.** Verified against
`prisma/schema.prisma`:

- `QuestionVersion` has `status VersionStatus @default(DRAFT)` and nothing else;
- there is **no** `published_at`, `first_published_at`, `ever_published`;
- there is **no** publication-event table;
- the enum is `DRAFT | PUBLISHED | ARCHIVED`.

So for a question whose versions are all `ARCHIVED`, the answer to "was it ever
published?" is **not recoverable**. The data was destroyed when the version moved
`PUBLISHED → ARCHIVED`, not merely made hard to query.

This is why the decision is fail-closed **by review rather than by record**: the
system cannot know, so it refuses to guess and asks a human.

**The unrecoverable residual set.** A future backfill could set
`first_published_at = MIN(...)` over versions that are *currently* `PUBLISHED`.
Every question already fully archived is excluded from that — the information is
gone. The owner's fail-closed instruction resolves how to treat that set: treat it
as "unknown, requires review", never as "never published".

## 5. Future implementation dependency

Complete tracking requires, and awaits separate approval for:

1. a schema addition (`questions.first_published_at timestamptz NULL`, set on the
   first `PUBLISHED` transition, never cleared), **or** a publication-event table
   if full *history* rather than the first moment is required;
2. a new migration (Migration 0002) — **not authorised; B2 is WITHHELD**;
3. a backfill, with the residual-set policy the owner has now supplied;
4. replacing the review gate with a flag check (`first_published_at IS NOT NULL`),
   which is also cheaper: no version scan.

**Wiring (was outstanding, now done).** This section previously recorded that
neither `assertTypeChangeAllowed` nor `assertLegacyArchiveReviewRequired` had a
caller outside its own definition, so the rule was implemented but not enforced
in the write path. Both now have production callers, and both gates run on each:

- `changeQuestionType` (`server/questions/change-type.ts`) — the write path. It
  locks the question row `FOR UPDATE`, loads the snapshot **through the same
  transaction client**, runs both gates, and only then writes `questions.type`.
  It exposes exactly one parameter object (`{ questionId, nextType }`).
- `assertQuestionTypeChangeAllowed` (`server/questions/publish/gate.ts`) — the
  pre-flight path, which now runs the archived gate as well.

**Remaining boundary, stated rather than glossed.** `questions.type` has no
database-level guard (AMB-5 authorises no migration; 0002 is NOT authorised), so
a *new* handler that called `prisma.question.update({ data: { type } })`
directly would bypass the application gate. No such call exists in `server/`
today, and the integration suite measures the boundary explicitly rather than
claiming it cannot happen.

## 6. Tests

Three suites, deliberately separated by what each can prove:

- `tests/unit/questions/rubric-strict.test.ts` — the pure rule's boundary cases
  (below);
- `tests/unit/questions/amb5-service-enforcement.test.ts` — **structural and
  behavioural** proof against the real service with a controlled transaction
  client: the gate runs, a caller cannot smuggle a bypass, rejection precedes the
  write and escapes the transaction callback, and lock/read/write share one
  client (D2);
- `tests/integration/questions/change-type-service.test.ts` — the PostgreSQL
  half (real row lock, four concurrency tests, rejected change leaves type and
  version unchanged).

The rule's cases (`rubric-strict.test.ts`) are now:

| Case | Asserts |
| --- | --- |
| refuses all-archived type change | the decision |
| refusal carries I‑6 / `QUESTION_TYPE_CHANGE_REVIEW_REQUIRED` | the review-required code (not the published-version code) |
| does not treat missing history as non-publication | the core instruction |
| no switch and no exception argument | "do not silently infer" — a forced flag changes nothing |
| cannot be disarmed by any caller-supplied argument | there is no pathway |
| allows draft-only | not over-broad |
| allows mixed draft+archived | not over-broad |
| no-op when type unchanged | no false positive |
| no-op with no versions | no false positive |
| leaves PUBLISHED to `assertTypeChangeAllowed` | two jobs, no duplication |
| **current gap**: old function still permits all-archived | recorded, not endorsed |

## 7. What must not be claimed

- Do **not** claim "complete historical publication tracking is implemented".
- Do **not** claim I‑6 is enforced at the database level. It is enforced in the
  two application entry points; a direct `prisma.question.update` would bypass
  it, and no migration is authorised to close that (0002 is NOT authorised).
- Do **not** describe an exception path, review override or approval switch as
  existing. There is none; the owner decided on 2026-11-24 that it stays closed
  (§3), and an auditable exception workflow would be a **separate**, newly
  approved piece of work.
- Do **not** describe this decision as forbidding a future auditable exception
  outright: it forbids *this* work from adding one. A genuine future requirement
  may open that separately.
- Do **not** claim a schema change was made. None was.
- Do claim: the owner's fail-closed legacy policy is implemented as a review gate,
  tested, with its limitation documented.
