# Task 6 — Report: AMB-5 Enforcement, Approved OD-18 Zod Implementation & Evidence Retention

**Branch:** `arena/1042a18a-hsc-alim-ict-question-bank`
**Baseline:** `5d53c36` → **HEAD:** `c2334e9` (two commits)
**PR #10:** OPEN, not merged. No new branch, no new PR.

| Commit | Contents |
|---|---|
| `0dd23ff` | AMB-5 enforcement + OD-18 Zod layer + OD-26-5 mechanism |
| `c2334e9` | Fix for two defects CI found that local checks could not |

---

## 1. AMB-5 — enforcement and test evidence

### The blocker, and what was done about it

AMB-5 required a service-level test. There was **no service to test.** A grep for
`.update(`, `.create(`, `.upsert(`, `.delete(` across all of `server/` returned
**nothing**, and the only exported functions were `publishVersion`,
`assertContentWriteAllowed`, `assertQuestionTypeChangeAllowed` and
`loadQuestionSnapshot`. Nothing in the repository could change a question's
type, so the risk was unrealised — and so was the protection. Testing the pure
helper would have proven only that a function throws, which is precisely what
the requirement forbids.

The second, worse finding: `assertQuestionTypeChangeAllowed` — the only exported
type-change entry point — called only `assertTypeChangeAllowed`, which
**permits an all-archived type change**. The AMB-5 gate existed and was called
by nobody. The policy was documented and not enforced.

**Resolution (no owner decision invented, no schema change):**

1. **`server/questions/change-type.ts`** — the missing entry point,
   `changeQuestionType`. Transport-free domain service: row lock
   (`SELECT … FOR UPDATE`), all reads through the transaction client (D2), then
   **both** I-6 gates before any write. It is not an HTTP handler, because OD-17
   is open.
2. **`gate.ts`** — `assertQuestionTypeChangeAllowed` now runs the archived gate
   too, closing the bypass in the already-exported function.
3. **`errors.ts`** — new code `QUESTION_TYPE_CHANGE_REVIEW_REQUIRED`, distinct
   from `QUESTION_TYPE_IMMUTABLE`. "A published version exists" and "publication
   status is unknowable" need different remediation; collapsing them would tell
   users the wrong thing and hide the missing tracking.

**Missing history is never read as non-publication.** The gate fires on
"every version is ARCHIVED" and does nothing else — it does not inspect, infer
or backfill publication state. **There is no override:** no parameter, no global
switch, no exception mechanism. Per the brief, exceptions remain **unavailable**
and the dependency is documented.

### Test evidence — the service, on real PostgreSQL

`tests/integration/questions/change-type-service.test.ts` calls
`changeQuestionType` through its public interface and reads the row back to
prove whether a write occurred. **14 cases, all passing in CI** (confirmed from
the run's own per-case output):

| Group | Cases |
|---|---|
| Archived → refused | specific code; not `QUESTION_TYPE_IMMUTABLE`; row unchanged; multi-version; both directions; same-type no-op allowed |
| Mixed statuses | PUBLISHED+ARCHIVED → `QUESTION_TYPE_IMMUTABLE`; draft-only not refused |
| **Positive controls** | draft-only MCQ→CQ persists; **no versions**; draft-only twice in a row |
| Bypass analysis | unknown question refused; raw Prisma *can* still write (recorded, not passed); no unlock parameter |

**Mutation evidence** (`tests/unit/questions/amb5-type-change.test.ts`, 19 cases):

| Mutation | Result |
|---|---|
| Dead-code the gate: `if (false) assertLegacy…` | **2 failures** |
| Delete the gate call from the service | **1 failure** |
| Delete the gate call from `gate.ts` | **1 failure** |
| Restored | 19 pass |

**A weakness found and fixed, not hidden.** The first version of the wiring test
used a substring search, and mutation 1 **passed it** — the disabled call still
contained the function name. The test was hardened to require an unconditional
call at line start plus an assertion that no falsy guard exists. Only then did
all three mutations fail. This is recorded because a mutation test that stays
green under mutation is worse than none.

---

## 2. OD-18 — coverage

Four modules under `lib/validation/content-blocks/`:

| File | Contents |
|---|---|
| `envelope.ts` | `LIMITS` (§7.12, each constant commented with its clause), primitives, envelope shape |
| `blocks.ts` | Ten §7.4 block schemas, `BLOCK_SCHEMAS` tagged §7.4.1–7.4.10 |
| `profiles.ts` | Four §7.5 profiles + `parseContent` |
| `index.ts` | Version registry, `safeParseProfile`, `parseDocumentOrThrow` / `safeParseDocument` |

**Zod is authoritative.** `checkContentProfiles` delegates to
`safeParseProfile`; the hand-written `ALLOWED_OPTION_TYPES` allowlist is
**deleted**. §7.12 limits live in one object and are enforced only through Zod —
there is no second implementation to drift.

**Envelope gap closed:** `format` is the literal `"rich_blocks"` and `version`
the literal `1`. The previous `content.ts` accepted any string.

**Test counts:** `content-blocks.test.ts` 85 · `profiles.test.ts` 51.

---

## 3. Ten blocks + four profiles — verification

Each block: valid, invalid, boundary-limit, unknown-field, nested-field.
Nesting is bounded **structurally** — a `subquestion` nests only the
eight-member non-nesting union, so recursion cannot occur.

Each profile is verified for shape, ordering, and its own limits, with
**positive controls first** (the real fixtures parse) so a stricter schema
cannot pass by rejecting everything.

Two spec facts preserved exactly, both having been got wrong in an earlier pass:
image `alt` is **optional** (falls back to `assets.alt_text NOT NULL`);
flowchart `alt` is **required**, and flowchart carries `assetId` only — no
node/edge geometry. A callout's discriminator is `kind`, not `tone`.

---

## 4. §7.12 — evidence

All limits in one `LIMITS` object, each pinning its clause:
`blocksPerDocumentMax 200`, `nestedBlocksPerSubquestionMax 10`,
`assetsPerVersionMax 50`, `paragraphTextMax 5000`, `headingTextMax 200`,
`listItemsMax 30`, `listItemTextMax 2000`, `tableRowsMax 30`,
`tableCellsPerRowMax 8`, `codeMax 5000`, `latexMax 2000`, `altMax 300`,
`captionMax 300`, `longDescriptionMax 2000`.

Boundary tests assert **accept at limit, reject at limit + 1** for the block
count (200/201), option blocks (3/4), rubric criteria (6/7) and each text bound.
The gate-level test drives a 201-block document through
`evaluatePublishGate` and expects `CONTENT_PROFILE_INVALID` — a code the gate
cannot produce itself, which is the behavioural proof of delegation.

**Delegation mutation:** disabling it (`if (false && !result.ok)`) →
**6 failures**; restored → all pass.

---

## 5. OD-17 dependencies

OD-17 (wire contract) remains **OPEN**. Nothing invented: no route, no HTTP
status, no error-envelope document, no field-path format, no body-size policy.

Implemented independently: document validation, which §7 fully specifies.

**Exact dependency:** §7.11 rule 11 fixes error *content* (`{path, code,
message}`) but not its *wire shape*. So `ContentValidationError` carries the
structured issues and the transport layer — once OD-17 decides — maps them.
`OD-17-DEPENDENCY.md` and the `index.ts` header record this boundary.

---

## 6. "Allowed editor features" status

**OD-33, still OPEN. Excluded from the approved schema.** No block property,
discriminator value or limit exists for it. The catalogue is neither expanded
nor narrowed.

---

## 7. OD-26-5 — implementation and limitations

**Owner approved 12 months. Public-repo artifacts cap at 90 days.** These cannot
both be satisfied by artifacts, so the mechanism splits the window honestly.

`scripts/ci/build-milestone-record.sh` generates one durable record per run
containing: workflow run URL + ID + attempt, workflow name and identity, branch
commit SHA, **synthetic merge SHA explicitly labelled test-only**, runner/Node/
PostgreSQL and database identity (**password stripped by construction**),
per-suite pass/fail counts parsed from real output, UTC timestamp, and a
four-way evidence classification. Verified: the generated record contains no
password.

The workflow uploads it as `od-26-5-milestone-record`; a human commits it at the
milestone. The workflow does **not** push — a workflow that pushed to the branch
would rewrite the commit it is reporting on.

**No accumulating duplicates.** The PR comment is now **one canonical comment**,
marked `<!-- v45-app-results -->`, **edited in place** by each run and always
naming the exact run. **Verified live:** comment `7121326789` was created at
03:41 and updated at 04:01:29 — exactly when run `45323273654` finished — and
names that run and head SHA `c2334e9`. Earlier runs are superseded in place, not
deleted.

**Artifacts stay at 90 days.** **12-month artifact retention is NOT implemented
and is not claimed anywhere** — the operator-facing documents, the workflow
comments and the generated record all state the 90-day cap and the 3-months-of-12
gap. Limitations documented in `OD-26-5-EVIDENCE-RETENTION.md` (five of them,
including that a record proves a run happened but cannot prove a run nobody
recorded never happened).

---

## 8. CI run identifiers

| Workflow | Run | Result |
|---|---|---|
| **V-4/V-5 application verification** | [`45323273654`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45323273654) | **success — both jobs** |
| ↳ Unit suites, typecheck, lint, repo guard | | success |
| ↳ Integration, real PostgreSQL 16 | | success — **43 cases** (29 prior + 14 new) |
| production-readiness V-1…V-5 | `45323273613` | success |
| G-3 full-schema gate | `45323273769` | success |
| G-3 workflow gate | `45323273587` | success |
| Option C prototype | `45323273687` | success |
| G-1 experiment 2 | `45323273742` | **failure — pre-existing** |
| G-1 Prisma drift spike | `45323273596` | **failure — pre-existing** |

Commit `c2334e9`. Both G-1 workflows also failed at baseline `5d53c36`
(`45321093579`, `45321093614`) with the same messages — the manual composite FKs
are drift to Prisma. **G-1 remains FAILED, as required.** Untouched by this task.

An earlier run of mine, `45323005035`, **failed** and drove commit `c2334e9`.

---

## 9. Files changed

**New (9):**
`lib/validation/content-blocks/{envelope,blocks,profiles,index}.ts` ·
`server/questions/change-type.ts` · `scripts/ci/build-milestone-record.sh` ·
`tests/integration/questions/change-type-service.test.ts` ·
`tests/unit/questions/amb5-type-change.test.ts` ·
`tests/unit/validation/{content-blocks,profiles}.test.ts` ·
`docs/.../v45/OD-26-5-EVIDENCE-RETENTION.md`

**Modified (5):**
`server/questions/publish/{rules,gate,errors}.ts` ·
`tests/unit/questions/rubric-strict.test.ts` ·
`.github/workflows/phase04a-v45-application.yml`

**Untouched:** `prisma/` (verified: zero files from `prisma/` in either commit),
Migration 0001 byte-identical, no 0002.

---

## 10. Test + mutation results

**Unit: 545 passed / 13 files.** **Integration: 43 passed / 5 files** (CI, real
PostgreSQL 16). Typecheck, lint and format clean in CI *and* locally (the latter
with the known `lib/generated` TS7006 noise filtered).

| Mutation | Caught by |
|---|---|
| Zod delegation disabled (`if (false && …)`) | 6 profile tests |
| AMB-5 gate dead-coded | 2 wiring tests |
| AMB-5 gate deleted (service) | 1 wiring test |
| AMB-5 gate deleted (`gate.ts`) | 1 wiring test |
| D2 pre-fix behaviour (pre-existing) | D2 regression test, still enforced |

**Defects CI caught that local checking could not — and why:** `prisma generate`
cannot run in this sandbox (TLS to `binaries.prisma.sh`), so the generated client
is absent and local typecheck cannot see it. CI reported exactly two errors:
`Chapter.number` → `chapterNumber`, and `subjectId_number` →
`subjectId_chapterNumber`. The consequence was worse than a type error: the bad
upsert threw in `beforeAll`, so **all 14 tests were skipped while the file was
reported failed** — "29 passed | 14 skipped". A fixture that never builds makes
a suite look like it ran. Fixed at source; assertions were not loosened. This is
why the brief's warning against relying on local typecheck was correct.

**One pre-existing assertion changed:** `rubric-strict.test.ts` pinned the old
`QUESTION_TYPE_IMMUTABLE` code. Task 6 requires a *specific* review-required
error, so it now asserts the new code and additionally asserts it is **not** the
old one — stronger than before, not weaker.

---

## 11. Restrictions — confirmation

| Restriction | Status |
|---|---|
| Migration 0001 byte-identical | ✅ verified, zero diff |
| No Migration 0002 | ✅ |
| No `prisma/` changes | ✅ zero files in either commit |
| No exam tables, no negative-marking fields | ✅ |
| No production deployment | ✅ |
| B2 WITHHELD · G-1 FAILED | ✅ G-1 still failing, untouched |
| D-1/D-2/D-3 historical audit records preserved | ✅ |
| **PR #10 not merged** | ✅ OPEN, `mergedAt=null` |
| **No new PR or branch** | ✅ |
| No invented override mechanism | ✅ none; exceptions unavailable |
| No new approval workflow | ✅ |
| No `first_published_at`, no event table | ✅ |
| No invented wire contract | ✅ OD-17 untouched |
| No expanded catalogue / invented block properties | ✅ |
| Editor features excluded | ✅ OD-33 open |
| No 12-month artifact retention claimed | ✅ 90-day cap stated everywhere |
| No history rewrite, no deleted evidence | ✅ additive commits |
| Assertions not weakened for green CI | ✅ one assertion **strengthened** |
| Not relying on local typecheck alone | ✅ CI authoritative; it caught 2 real defects |
| D1/D2/D3/V-5 preserved, no Prisma mocks, no mocks replacing service tests | ✅ |

### Open items, not silently resolved

- **OD-17** — wire contract.
- **OD-33** — allowed editor features.
- **AMB-5 exception mechanism** — unavailable by design; needs an owner decision
  before it can exist.
- **12 months vs 90 days** — a private mirror or paid retention tier is the only
  route to full compliance; an infrastructure decision outside this task.
- **`questions.type` has no database-level guard** — the gate is
  application-level, since no 0002 is authorised. Recorded as a boundary test,
  not as a pass.
