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

`assertLegacyArchiveReviewRequired(nextType, currentType, versions, options?)` in
`server/questions/publish/rules.ts`.

**Fires when:** the type is changing, there is at least one version, and **every**
version is `ARCHIVED`. It throws `QUESTION_TYPE_IMMUTABLE` (invariant I‑6) —
reusing the existing code rather than inventing one, so a caller that already
handles I‑6 handles this too.

**Exception path:** `{ allowLegacyArchivedTypeChange: true }`, an explicit
per-call argument. There is deliberately **no global switch** — a global flag is
what "do not silently infer" decays into after a few refactors.

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
gets the permissive behaviour. **Wiring both into the service is outstanding
work** — see §5.

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

**Outstanding wiring, independent of all of the above:** neither
`assertTypeChangeAllowed` nor `assertLegacyArchiveReviewRequired` has a caller
outside its own definition. They are exported pre-conditions. Until a service
calls both, the *rule* is implemented but not *enforced in the write path*.

## 6. Tests

`tests/unit/questions/rubric-strict.test.ts`, describe block
`AMB-5 — fail closed for legacy archived records (owner-approved)` — 11 cases:

| Case | Asserts |
| --- | --- |
| refuses all-archived type change | the decision |
| refusal carries I‑6 / `QUESTION_TYPE_IMMUTABLE` | no invented code |
| does not treat missing history as non-publication | the core instruction |
| no global switch, only a per-call exception | "do not silently infer" |
| permits only through the exception | the pathway |
| allows draft-only | not over-broad |
| allows mixed draft+archived | not over-broad |
| no-op when type unchanged | no false positive |
| no-op with no versions | no false positive |
| leaves PUBLISHED to `assertTypeChangeAllowed` | two jobs, no duplication |
| **current gap**: old function still permits all-archived | recorded, not endorsed |

## 7. What must not be claimed

- Do **not** claim "complete historical publication tracking is implemented".
- Do **not** claim I‑6 is now fully enforced: the new gate has no caller yet.
- Do **not** claim a schema change was made. None was.
- Do claim: the owner's fail-closed legacy policy is implemented as a review gate,
  tested, with its limitation documented.
