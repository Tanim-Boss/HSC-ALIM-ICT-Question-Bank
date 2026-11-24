# Approved decisions and corrective implementation — final report

Branch `arena/1042a18a-hsc-alim-ict-question-bank` · HEAD `4a738e2` · PR #10
**OPEN, unmerged** (`mergedAt: null`).
CI run [`45320827011`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45320827011)
— **both jobs green**.
Prepared 2026-11-23.

---

## 1. AMB-5 legacy fail-closed — implementation status

> **RECONCILIATION NOTE — 2026-11-24.** This section is the report as written
> when the decision was made. **It is preserved verbatim below and has not been
> rewritten.** The implementation has since diverged from it in two ways, and the
> divergence is recorded here so the rest of the document is not read as current
> behaviour:
>
> | This report says (§1) | Actual behaviour since the implementation | Why |
> | --- | --- | --- |
> | The gate throws **`QUESTION_TYPE_IMMUTABLE`** — "the existing code, not a new one" | It throws **`QUESTION_TYPE_CHANGE_REVIEW_REQUIRED`** (invariant I‑6) | The two facts need different remediation: "a published version exists right now" vs "publication status is unknowable". Collapsing them tells a user something false about their own question. `QUESTION_TYPE_IMMUTABLE` is still thrown, by `assertTypeChangeAllowed`, for the published-now case. |
> | An **exception path** exists: `{ allowLegacyArchivedTypeChange: true }`, a per-call argument | The parameter has been **REMOVED from the production API**. No per-call bypass flag exists. | No production caller ever passed it; the only code that set it was a test asserting it worked. A boolean that resolves "unknowable" in the caller's favour is the silent inference the decision forbids, and it carries no reviewer, reason or record — so it is not a review. |
>
> **Current policy, decided by the owner on 2026-11-24 (Option 1 — keep the
> exception mechanism closed):** fully archived questions fail closed for
> question-type changes; no production bypass of any kind is permitted; an
> auditable exception workflow may be considered separately if a genuine
> requirement arises, and does not exist today. See
> `AMB-5-LEGACY-ARCHIVE-DECISION.md` §3 and §7 for the authoritative statement
> and for the boundary that remains (no database-level guard, because 0002 is not
> authorised).
>
> Nothing above changes the *decision* this report recorded. It records that the
> implementation of that decision is stricter and differently coded than the
> sketch below.

**Status: IMPLEMENTED as a review gate. Historical tracking NOT implemented.**

`assertLegacyArchiveReviewRequired(nextType, currentType, versions, options?)` —
`server/questions/publish/rules.ts`.

Fires when the type is changing, at least one version exists, and **every** version
is `ARCHIVED`. Throws `QUESTION_TYPE_IMMUTABLE` (invariant I‑6) — the existing
code, not a new one.

- **Exception path:** `{ allowLegacyArchivedTypeChange: true }`, a per-call
  argument. Deliberately **no global switch** — a global flag is what "do not
  silently infer" decays into.
- **Does not fire:** when a version is `PUBLISHED` (the older guard refuses
  outright), when a `DRAFT` exists, when there are no versions, when the type is
  unchanged.

**Why a second function rather than a change to the first.** `assertTypeChangeAllowed`
refuses only when a version is published *now*; it cannot distinguish "all
archived, was published" from "all archived, never published", because the schema
destroys that difference on archival. Making it throw on *every* all-archived
question would also forbid type changes on questions that were only ever drafts
and then archived — a live-workflow change the decision did not authorise. The
decision says "require an explicit review", so the review gate is the faithful
implementation.

**Tests:** 11 cases in `rubric-strict.test.ts` (describe block
`AMB-5 — fail closed for legacy archived records`). Includes a test that pins the
remaining gap explicitly:

```
CURRENT GAP: assertTypeChangeAllowed alone still permits the all-archived change
```

## 2. Exact scope of the AMB-5 decision, and what remains unbuilt

**Decided:** the *recovery policy* for legacy records whose publication history is
unreconstructable — fail closed, require review, never infer.

| Not authorised by this decision | State |
| --- | --- |
| `first_published_at` column or publication-event table | **not created** |
| Migration 0002 | **not created, not committed** |
| Backfill of historical publication status | **not performed, not possible for the residual set** |
| Complete historical publication tracking | **not implemented, not claimed** |

**The limitation, verified against `prisma/schema.prisma`:** `QuestionVersion` has
`status VersionStatus @default(DRAFT)` and nothing else — no `published_at`, no
`ever_published`, no event table. So for an all-archived question the answer to
"was it ever published?" is **not recoverable**; the data was destroyed on
archival, not merely hard to query. The system therefore refuses to guess and asks
a human.

**Future dependency** (separate approval required): schema addition or event
table, Migration 0002, backfill with the residual-set policy now supplied, then
replace the review gate with a flag check. Full record:
`AMB-5-LEGACY-ARCHIVE-DECISION.md`.

**Outstanding wiring, independent of all of that:** neither
`assertTypeChangeAllowed` nor `assertLegacyArchiveReviewRequired` has a caller
outside its own definition. They are exported pre-conditions. Until a service
calls both, the rule is implemented but **not enforced in the write path**.

## 3. OD-18 register correction

Register row `docs/architecture/technology-decisions.md:59` corrected from the
stale "Before editor/schema / choice of exact shapes is open" to record the actual
authority:

- **Revision 4** of `phase-04a-question-bank-physical-schema-proposal.md` — `:5`
  (request **B** approved), `:39` (all Phase 04A requests decided), `:56`
  (reviewer row 5: envelope, ten block types, profiles, validation, versioning,
  sanitization, Zod strategy).
- Specification of record: **§7**, `:2260`–`:3400`.

**History preserved:** no Revision 4/5/… text was rewritten; the correction is the
register row plus one new row (**OD‑33**). No competing schema proposal was
created — `OD-18-COVERAGE.md` and `content-catalogue.ts` cite §7 rather than
restate it as an alternative.

## 4. §7 implementation coverage (ten block types, four profiles)

Measured element by element in `OD-18-COVERAGE.md`. Summary:

| Element | Status |
| --- | --- |
| Envelope presence (§7.2) | MET |
| `format` literal pinned to `rich_blocks` | **GAP** — any string accepted (`content.ts:57`) |
| Content-envelope `version` dispatched | **GAP** — only checked to be a number |
| Ten block types, closed allowlist (§7.4.0) | **PARTIAL** — now data + tested for exactly ten; not enforced on a document |
| Per-block **field** validation (§7.4.1–.10) | **GAP** |
| Four profiles (§7.5) | **MET** — `checkContentProfiles`, mutation-tested |
| §7.4.10 nested allowlist | PARTIAL — recorded as data; only `heading` rejected inside a subquestion |
| Rubric envelope + strict fields (§7.7) | **MET (new)** |
| Criteria bound = 6 (§7.12) | **MET (new)** |
| Blocks ≤200 / nested ≤10 / assets ≤50 (§7.12) | **GAP** |
| Character limits (§7.12) | **GAP** |
| Answer-revealing scan (§7.5) | **MET (strengthened)**, 7 → 12 names |
| Student projection strip (§7.5) | **MET (strengthened)**, independent of the gate |
| Sanitisation (§7.10) | N/A — renderer property, no renderer exists |

**Ten block types** are now recorded in `content-catalogue.ts` with their §7.4
subsection, fields, requiredness and the nested allowlist; **four profiles** in the
same file with their permitted/forbidden types. Tests
(`content-catalogue.test.ts`) assert exactly ten types, subsections 7.4.1–7.4.10
one each, and the facts that are easy to invert.

**I got four of those facts wrong on the first pass** and corrected them against
§7.4.4–§7.4.10: image `alt` is *optional* (falls back to `question_assets.alt_text`)
while flowchart `alt` is *required*; a flowchart carries `assetId`, not
node/edge geometry; a callout uses `kind`, not `tone`. That is the case for the
catalogue existing — the errors were only findable by checking the source.

**The four gaps are all block-field and limit validation** — the part §7.11
assigns to Zod. None is an answer-secrecy hole; they are input-integrity gaps.
Recorded as gaps, not presented as coverage.

## 5. Zod implementation status and the OD-17 dependency

**No Zod schema was written.** That is the honest status, not an omission.

§7.12 says limits are "enforced in Zod". Hand-writing them in `rules.ts` would
create exactly the parallel representation §7.11 rule 1 forbids ("no parallel
hand-written interface"), and it would have to be deleted when the Zod layer
lands. So what can be done without duplication was done:

- the §7.4 catalogue as **data** (consumed by the Zod layer later, checked now);
- the §7.7 rubric **strictly** — a self-contained document with no block tree, so
  a hand-written parser is the Zod schema in waiting rather than a rival;
- policy constants in one place (`RUBRIC_MAX_CRITERIA_PER_PART`,
  `NESTED_BLOCK_TYPES`).

**The exact OD-17 dependency** (`OD-17-DEPENDENCY.md`): §7.11 specifies validation
of a *content document*; it does not specify a *request*. Missing, and genuinely
OD‑17:

1. transport (server action vs route handler) for a `parseRequest` helper;
2. the wire error envelope and status mapping — §7.11 rule 7 says a failure
   propagates "as a validated 422 with field paths", and **422-to-what is OD‑17**;
3. the field-path format — `$.blocks[4].data.part` is currently a convention
   inside a message string, not a contract;
4. body-size policy (edge vs handler).

**Kept isolated:** no wire-facing module was created, so nothing was invented.
**Remaining dependency reported:** those four questions; answering 1–3 unblocks
the layer.

## 6. Editor-features decision — separate and OPEN

New register row **OD‑33**: which of the ten approved block types the authoring UI
exposes, whether `flowchart`/`table` ship first, and what inline affordances exist.
Explicitly **not** part of the approved OD‑18 schema, because conflating them lets
a UI that emits four block types silently narrow an approved schema of ten.

## 7. Answer-name denylist — changes and evidence

**The defect.** The gate refused 7 names; the projection stripped 11. `correct` was
gated but **not stripped** — the projection's guarantee held only because the gate
had run. `cqRubric`, `isVerified`, `mcqCorrectOptionKey`, `verifiedAt`, `notes`
were stripped but **not gated** — the gate's guarantee held only because nothing
wrote them. Two half-correct guards composed into something that looked safe.

**The fix.** `server/questions/publish/restricted-names.ts` is the single source of
truth. It keeps the two causes separate — content-borne names the gate must
refuse, answer-key column names the projection must strip — because a single flat
list would have to be the *weaker* of the two, which is how the divergence
happened. Both boundaries check the union (`RESTRICTED_ANSWER_NAMES`, 12 names).

Matching is **exact on the property name**. No prefix/substring rule: `correctness`
is legitimate teaching text inside a paragraph *value*, and a substring rule would
also strip any future `correctness`-named field from an authorized payload.

**Requirements met:**

| Requirement | Evidence |
| --- | --- |
| One documented policy / single source | `restricted-names.ts`; test asserts the union is complete and duplicate-free |
| Gate rejects forbidden fields | `it.each(ALL_RESTRICTED)` at top level, nested in a block, nested in an option — 36 cases |
| DTO removes them **independently** | `stripAnswerRevealing` + `findLeakedField` use the same policy; no gate call |
| DTO security not dependent on the gate | dedicated test projects a gate-violating row and asserts it is clean |
| Option keys A/B/C/D/**E** and ক–ঘ preserved | positive controls, one per key |
| No broad matching | `correctness`, `solutionSet`, `isCorrectFlag`, `notesInternal` all survive |
| Tests at both boundaries for every field | 12 names × 3 gate placements + 12 × 2 projection paths |
| Bypass test | `the projection does not depend on the publish gate having run` |

**Mutation evidence (required):**

| Mutation | Result |
| --- | --- |
| Remove the DTO exclusion for `correct` | **3 tests fail** |
| Remove the gate rejection (scan disabled) | **38 tests fail** |
| Restored | 84 pass |

## 8. Strict `parseRubric` — changes and evidence

**The defect.** The old parser kept `{part, maxMarks, criteria:[{marks}]}` and
silently dropped `version`, `criteria[].description`, `criteria[].kind`,
`expectedAnswer` and `notes`. For a marking guide that is not tidiness: dropping
`expectedAnswer` changes what the marker is asked to award.

**The fix — `parseRubricStrict`.** Rejects unknown properties at **root, part and
criterion** level; preserves every §7.7 field; enforces §7.12's 6-criteria bound and
a non-empty criteria list; rejects unknown `version` (§7.8: an error, not a
fallback). Returns a structured issue rather than throwing:

```ts
{ path: '$.parts[2].criteria[1].bonus', message: '…' }
```

`parseRubric` is now a thin facade over it, so lenient and strict cannot drift.

**The part that made it matter.** A stricter parser alone was nearly worthless:
returning null made every consumer treat a rejected rubric as "already reported"
and `return`, so a rubric refused for an unknown field produced **no violation at
all** and the publish proceeded on the other checks. New `checkRubricShape` emits
**`CQ_RUBRIC_INVALID`** so the rejection reaches the caller, with the field path in
the message.

**Deliberately not duplicated:** the part alphabet and the 1/2/3/4 mapping are
cross-document facts I‑7 and I‑15 check against the stem. Enforcing them here too
would be a second source of truth that can disagree with the first.

**Tests:** 41 rubric cases (52 in the file with AMB‑5) covering valid input,
unknown fields at three levels, malformed input (null/string/array/wrong format/
missing version/unsupported version/non-integer marks/non-object parts),
boundaries (6 vs 7 criteria, zero criteria), nested unknown fields, and the
application boundary.

| Requirement | Evidence |
| --- | --- |
| Unknown fields rejected | root, part, nested criterion — each with an addressable path |
| Valid documents still accepted | full §7.7 fixture with every optional field; gate returns `[]` |
| Nested unknowns not silently discarded | `a nested unknown field cannot be silently discarded` — both parsers reject |
| Structured, actionable error | `{path, message}`; gate violation carries `answerKey.cqRubric` + `$.parts[…].…` |
| Reaches the boundary safely | `CQ_RUBRIC_INVALID` on the gate; no throw, no crash |
| No invented properties | only §7.7 fields; `kind` closed to the four approved values |

**Mutation evidence (required):**

| Mutation | Result |
| --- | --- |
| Disable all three unknown-field rejections | **9 tests fail** |
| Restored | 41 pass |

**Gap recorded, not invented:** §7.7 requires `totalMaxMarks` = 10 and exactly four
parts; both are **cross-document** facts checked against the stem by I‑7/I‑15, so
they are not re-enforced here (a test pins that zero parts passes the *shape* parse
and is caught by I‑7). §7.7's character limits (`expectedAnswer` 1–2000, `notes`
1–1000, `description` 1–500) are **not** enforced — §7.12 assigns limits to Zod,
which is deferred; recorded as a gap.

## 9. OD-26-5 — 12-month retention configuration and verification

**The approved value is not reachable on this platform, and that is reported
rather than worked around.**

| Fact | Value | Source |
| --- | --- | --- |
| Owner-approved retention | 12 months | owner decision |
| GitHub default | 90 days | GitHub Docs |
| **Public** repo configurable range | **1–90 days** | GitHub Docs |
| Private repo configurable range | 1–400 days | GitHub Docs |
| This repository | **public** (`private=false`) | `gh api repos/…` |

So **365 days cannot be configured here**; requesting it would fail the upload.
**Applied:** all nine `retention-days` values raised **30 → 90**, the maximum the
platform permits, with the v45 workflow carrying a comment that 90 is a ceiling
rather than the policy.

**Not claimed:** that 12-month retention is implemented. It is not, for artifacts.
The remainder must come from a committed milestone record — which is why §11 treats
that record as required rather than optional.

**Verified actual availability, not assumed:** artifacts on run `45317576586` had
`expires_at` 2026‑12‑24 (30 days at the time), and the zip download failed — so the
retention change is a configuration change whose effect can only be confirmed on
future runs. **Not claimed as verified.**

## 10. Remaining OD-26 decisions

| Sub-item | Status |
| --- | --- |
| 26‑1 required checks | **OPEN** — branch protection not enabled; a green run is still advisory |
| 26‑2 isolation | **OPEN** — per-job container in use; not ratified |
| 26‑3 performance thresholds | **OPEN** — nothing enforced; no value invented |
| 26‑4 security-test ownership | **OPEN** — unassigned; no owner invented |
| 26‑5 retention period | **APPROVED (12 months)**; evidence *architecture* still open |
| 26‑6 fixture scope | **OPEN** — minimal fixtures in use; not ratified |

No threshold, isolation level, security owner or fixture scope was invented.

## 11. CI evidence architecture — proposal and unresolved choices

`CI-EVIDENCE-ARCHITECTURE.md`.

**Measured channels** (runs `45317576586`, `45320827011`):

| Channel | Reachable here | Run-linked | Survives 12 mo |
| --- | --- | --- | --- |
| Job log | **NO** (blob host unreachable) | yes | no |
| Artifact zip | **NO** (same) | yes | no (90 d max) |
| Step summary | **NO** | yes | no |
| Check annotations | YES | via id | no |
| PR comment | YES | **was NO — fixed** | no |
| Committed file | YES | via SHA | **YES** |

**Fixed this pass (approved scope, no new architecture):** the evidence comment now
carries head SHA, PR head SHA, the synthetic merge SHA **labelled as synthetic**,
run id as a URL, run attempt, event, ref and the PostgreSQL image. Previously it
named only `GITHUB_SHA` — GitHub's merge commit on a `pull_request` event — so a
reviewer could not get from the comment back to the branch code that ran.

Verified live on run `45320827011`: head `9e9287c…`, PR head `4a738e2…`, run URL
present.

**Duplicate comments — measured, unresolved:** 19 evidence comments on PR #10 out
of 107 total; the workflow appends rather than edits. Three options in the doc;
recommendation is *index per run in the PR body* rather than collapsing to one
comment, because collapsing destroys the per-run history a reviewer needs.

**Unresolved owner choices for the committed record:**
1. **cadence** — per milestone, per release, or per merge to `main`?
2. **location** — in-tree, or a separate evidence branch?
3. **authoring** — written by the workflow (needs `contents: write`, awkward from
   forks) or by hand at acceptance?
4. **what the 12-month figure governs** — artifacts cannot reach it (90‑day
   platform cap), so either it governs the committed record (retained indefinitely,
   which conflicts with a 12-month *deletion* policy) or it is aspirational for
   artifacts and the committed record is the durable answer. **This needs an
   explicit decision.**

**PR comments are not a durable audit record** — PR-scoped, append-only,
unindexed. The added run identity makes them *traceable*; it does not make them
*retained*.

## 12. Files changed, test results, CI, commits

**Commit `4a738e2`** — 15 files, +2 180 / −176.

| File | Change |
| --- | --- |
| `server/questions/publish/restricted-names.ts` | **new** — single-source answer-name policy |
| `server/questions/publish/content-catalogue.ts` | **new** — §7.4 ten types, §7.4.10 nested list, §7.5 four profiles |
| `server/questions/publish/rules.ts` | strict rubric parser, `checkRubricShape`, `CQ_RUBRIC_INVALID` wiring, `assertLegacyArchiveReviewRequired`, AMB‑5 doc-comment, shared policy import |
| `server/questions/publish/dto.ts` | shared policy; `assertNoLeak` production no-op documented |
| `server/questions/publish/errors.ts` | `CQ_RUBRIC_INVALID` code |
| `tests/fixtures/questions/publish-fixtures.ts` | rubric fixture to full §7.7 shape |
| `tests/unit/questions/restricted-names.test.ts` | **new** — 84 cases |
| `tests/unit/questions/rubric-strict.test.ts` | **new** — 52 cases |
| `tests/unit/questions/content-catalogue.test.ts` | **new** — 33 cases |
| `.github/workflows/*.yml` (7 files) | retention 30 → 90 |
| `.github/workflows/phase04a-v45-application.yml` | run identity in evidence comment; unit count floor 390 |
| `docs/architecture/technology-decisions.md` | OD‑18 corrected; OD‑33 added |
| `…/AMB-5-LEGACY-ARCHIVE-DECISION.md` | **new** |
| `…/OD-18-COVERAGE.md` | **new** |
| `…/OD-17-DEPENDENCY.md` | **new** |
| `…/CI-EVIDENCE-ARCHITECTURE.md` | **new** |

**Verification layers, separately:**

| Layer | Result | Where |
| --- | --- | --- |
| Unit tests | **390 passed / 10 files** (was 307 / 7) | local + CI |
| Zod schema validation tests | **none exist** — no schema written (§5) | — |
| Student DTO projection & leakage | **included in the 390** (84 restricted-names cases incl. bypass test) | local + CI |
| Mutation tests (new protections) | **3 mutations, 3/3 fail correctly** (§7, §8) | local |
| Typecheck **with generated client** | **0 errors** | **CI only** — authoritative |
| Typecheck locally (no generated client) | 8 errors, **all** the documented `lib/generated` cascade: 4 × TS2307 + 4 × TS7006 on `tx` | local |
| Lint | **0 errors, 0 warnings** | local + CI |
| Formatting | clean on all changed application files (`token-parity.test.ts` is pre-existing and out of scope) | local + CI |
| Repository guard | `OK: no prohibited Prisma migration command` | local + CI |
| Real PostgreSQL integration | **29/29 passed**, 4 suites, `postgres:16`, migration 0001 | **CI** run `45320827011` |
| Prisma-level integration | **29/29 passed** — real generated client, no mocks | **CI** |
| D2 mutation regression | passed (step green) | **CI** |

**Local vs CI, kept separate.** `prisma generate` cannot run here (TLS to
`binaries.prisma.sh`), so **no Prisma execution and no Prisma-dependent type
correctness is claimed locally**. Integration suites import cleanly but fail
without a generated client; that is the known gap, not a regression. The
authoritative typecheck is CI's, and it passed.

**Locally observed raw PostgreSQL evidence** (from earlier passes, unchanged):
D2's mechanism proven with `pg` — `viaTx = PUBLISHED`, `viaPool = DRAFT`.

## 13. Restrictions — confirmation

| Restriction | State |
| --- | --- |
| Migration 0001 byte-identical | **YES** — `git diff 1fa7aaf..HEAD -- prisma/` is empty |
| No Migration 0002 created/committed | **YES** — none exists |
| No `prisma/` modifications | **YES** — empty diff |
| No exam tables | **YES** |
| No negative-marking fields | **YES** |
| No production deployment | **YES** |
| B2 WITHHELD | **YES** |
| G‑1 remains FAILED, not re-scored | **YES** |
| D‑1…D‑3 audit trail preserved | **YES** — untouched |
| D1/D2/D3/V‑5 corrective fixes preserved | **YES** — no source change to the D1/D2/D3 logic; the D2 mutation step still runs and is green |
| Real PG integration tests preserved | **YES** — 29 cases, unchanged |
| No mocked Prisma introduced | **YES** |
| PR #10 not merged | **YES** — OPEN, `mergedAt: null` |
| No new branch or PR created | **YES** |

**One scope note for the reviewer.** §7.4 catalogue facts were corrected against
the specification after a first pass had four of them wrong (image `alt`
requiredness, flowchart geometry, callout `kind`). Those corrections are in the
committed work and cited in `OD-18-COVERAGE.md`. No approved schema element was
reinterpreted, expanded, or narrowed.

---

Stopping here. **PR #10 remains OPEN and unmerged.**
