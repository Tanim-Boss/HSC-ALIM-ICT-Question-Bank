# Final Cross-Boundary Verification — PR #10

**Branch:** `arena/1042a18a-hsc-alim-ict-question-bank`
**HEAD at audit start:** `e19ee25` → **HEAD now:** `8df3db2` (one commit added by this audit)
**PR #10:** OPEN, **UNMERGED**.

---

## 1. Executive verdict

**PASS WITH EXCEPTIONS.**

Every mandatory check was inspected against the repository and CI, not against prior reports. One **genuine coverage defect** was found and fixed (item 3: the row lock had no behavioural test — only a source-substring assertion). Two architectural limitations remain, correctly classified as *not defects*.

**Why not a clean PASS:** the row-lock guarantee that AMB-5 depends on is enforced at the **application level only**. `questions.type` has no database-level guard, and a database guard is explicitly prohibited by this task's restrictions. That is a known, documented limitation — not a failure of this implementation — but it is a real boundary and is not reported as anything else.

**Why not BLOCKED:** no critical bypass remains, every test that should have executed did execute (verified by name), and no mandatory check was skipped.

---

## 2. AMB-5 write-path inventory

Searched the whole repository, not just `server/`, for every operation capable of changing `questions.type`: `.update(`, `.updateMany(`, `.upsert(`, `.create(`, `.createMany(`, `.delete(`, `.deleteMany(`, `$executeRaw`, `$queryRaw`, plus raw SQL text `UPDATE questions`.

| # | Path | Location | Writes `type`? | Enforcement |
|---|---|---|---|---|
| 1 | `changeQuestionType` | `server/questions/change-type.ts:147` | **Yes — the only production write** | ✅ Both gates, after row lock, same `tx` client |
| 2 | `publishVersion` | `server/questions/publish/gate.ts:198` | No — writes `status` only | ✅ No type write; not a bypass |
| 3 | `assertQuestionTypeChangeAllowed` | `server/questions/publish/gate.ts:254` | No — guard only | ✅ Now calls **both** gates (was the bypass) |
| 4 | `assertContentWriteAllowed` | `gate.ts:225` | No | ✅ I-5 guard only |
| 5 | Test-only direct `prisma.question.update` | 3 test files | Yes (deliberate) | ⚠️ **Recorded as a boundary test**, not a bypass of production code |

**Property verification against the actual code:**

1. **All legitimate paths gated** — one production write exists; it is gated. ✅
2. **Row lock** — `SELECT id FROM questions WHERE id = $1::uuid FOR UPDATE` at `change-type.ts:120`, before the read. ✅
3. **Same transaction client** — `loadQuestionSnapshot(db, …)` where `db` is the `tx`; no `getPrisma()` read inside the callback. ✅
4. **Unknown history fails closed** — `assertLegacyArchiveReviewRequired` throws when `versions.every(s => s === 'ARCHIVED')`. ✅
5. **Codes distinct** — `QUESTION_TYPE_CHANGE_REVIEW_REQUIRED` ≠ `QUESTION_TYPE_IMMUTABLE`, both in `DomainErrorCode`. ✅
6. **No override** — the service signature is `{ questionId, nextType }`. No global switch, no exception parameter. The helper's per-call `allowLegacyArchivedTypeChange` exists (Task 5) but is **not reachable from the service**. ✅
7. **No conditional gating** — both calls are unconditional statements executed before the write. ✅

**One nuance worth stating:** the same-type no-op returns *before* the gates. That is correct, not a bypass — no type change occurs, so no gate applies. It is covered by a dedicated test in both suites.

---

## 3. AMB-5 service and concurrency tests

### Previously existing — 14 cases, all executed in CI by name
Archived-refused (specific code / not `IMMUTABLE` / row unchanged / multi-version / both directions / no-op allowed); mixed statuses; three positive controls; bypass analysis (unknown question, raw-Prisma boundary, no unlock parameter).

### Added by this audit — 4 cases, all executed in CI by name

| Test | Result |
|---|---|
| `the service holds a row lock on the question for the duration of the transaction` | ✅ pass |
| `a blocked type change sees post-commit state, not a stale pre-lock read` | ✅ pass |
| `two concurrent type changes both land without interleaving into an inconsistent state` | ✅ pass |
| `a rejected archived change rolls back and leaves no partial state` | ✅ pass |

**Why these were needed (the defect found):** the lock was previously asserted only by a **source substring check**. A substring cannot show that PostgreSQL actually holds a lock. These tests open a second connection that takes `FOR UPDATE` on the row and assert the service **blocks**; they observe the lock through `pg_locks` rather than sleeping and hoping.

**Synchronisation is deterministic.** Lock acquisition is awaited by polling `pg_locks` (bounded at 10s) until the lock is genuinely held. No test assumes it won a race. The one remaining 400 ms window is an *assertion* — "the service is still blocked" — not a synchronisation guess.

**Coverage of the required matrix:**

| Required | Covered by |
|---|---|
| Successful permitted change | positive controls (draft-only, versionless, repeated) |
| Published/immutable rejection | `PUBLISHED + ARCHIVED → QUESTION_TYPE_IMMUTABLE` |
| Review-required for archived/unknown history | 6 archived-group tests |
| Rollback on gate rejection | new rollback test (type **and** version untouched) |
| Concurrent attempts | new race test (serialised, both agree) |
| Transaction-scoped reads + lock consistency | new post-commit-state test |

---

## 4. Mutation-test results

Run against the current implementation. **All five detected.**

| # | Mutation | Result | Detected by |
|---|---|---|---|
| M1 | Archived gate **dead-coded** (`if (false) …`), name retained | **2 failed** / 17 passed | source-wiring tests |
| M2 | Archived gate **deleted** from the service | **1 failed** / 18 passed | source-wiring test |
| M3 | **Other** gate (`assertTypeChangeAllowed`) deleted from service | **1 failed** / 18 passed | source-wiring test |
| M4 | Archived gate deleted from `gate.ts` entry point | **1 failed** / 18 passed | source-wiring test |
| M5 | Gate made **unreachable** (`if (n >= 0) {} else gate()`) | **1 failed** / 18 passed | source-wiring test |
| — | Restored | **19 passed** | — |

**An honest limitation about M1–M5.** I verified *which* tests failed: in every case the failure was in the **source-wiring** tests, not the behavioural ones. The pure-helper behavioural test (`REFUSES a type change when every version is archived`) still passed under M1, because it exercises the helper directly and the helper was untouched.

This is why the integration suite exists and why the two layers are complementary, not redundant:

- **Unit layer** proves the gate is *called* and *not dead-coded* — necessary, because the original AMB-5 defect was a missing call site that no behavioural test of the helper could detect.
- **Integration layer** proves the *service* refuses and rolls back — it runs in CI, where the mutation cannot be injected interactively.

**No coverage is claimed from a function-name check alone.** The source assertions were hardened during Task 6 precisely because a substring match survived the `if (false)` mutation; they now require an unconditional call at line start *and* assert no falsy guard exists. Behavioural enforcement is proven by the PostgreSQL suite.

---

## 5. OD-18 validation audit

**Ten approved block types** — exactly the §7.4 catalogue, one `z.literal` each:
`paragraph`, `heading`, `list`, `table`, `image`, `math`, `code`, `flowchart`, `callout`, `subquestion`. No eleventh type; no `html` escape hatch (explicitly tested absent).

**Four approved profiles** — `PROFILE_SCHEMAS`: `mcq_stem`, `cq_stem`, `option`, `cq_rubric`.

**Envelope / versioning** — `format` is the literal `"rich_blocks"` and `version` the literal `1`. Closes the earlier gap where `content.ts` accepted any string. Unknown versions are reported as a *version* problem, not a shape cascade.

**Centralized `LIMITS`** — **24** constants in one object, each annotated with its clause (block counts, text bounds, table/list/code/maths/asset caps).

**Required vs optional** — spec facts verified in code: image `alt` **optional** (falls back to `assets.alt_text NOT NULL`); flowchart `alt` **required** and carries `assetId` only, no node/edge geometry; callout discriminator is `kind`, not `tone`.

**Nesting** — structurally bounded: `subquestion` nests only the eight-member non-nesting union, so recursion is impossible by construction rather than by depth counter. Invalid combinations (heading inside a subquestion, stimulus after a subquestion, out-of-order ক–ঘ) are rejected.

**Unknown fields** — `z.strictObject` throughout; tested at root, block and nested-criterion level.

**Sanitization** — **correctly out of scope, and not overclaimed.** §7.11 says validation "does not sanitize… sanitization is a renderer property, because a sanitizer that rewrites stored content would break the immutability of a published version." The module header states this. No sanitizer was invented.

**Rubric strictness** — preserved: unknown root field, unknown criterion field, 7 criteria (>6), and unapproved criterion kind all rejected. 52 tests.

**Server-side enforcement before persistence** — `checkContentProfiles` is called from `evaluatePublishGate`, which `publishVersion` runs inside its transaction *before* any write.

**Single authority — verified.** Searching the codebase, only two call sites parse content (`rules.ts:1130` stem, `rules.ts:1157` option), both `safeParseProfile`. `ALLOWED_OPTION_TYPES` no longer exists anywhere. **No competing validator remains.**

**OD-17 wire contract — untouched.** No route, status code, error-envelope document or field-path format was invented. **Editor features (OD-33) — untouched and excluded.**

---

## 6. Security-boundary audit

| Check | Evidence | Verdict |
|---|---|---|
| Student DTO cannot expose answer keys | `dto.test.ts` (17 tests) | ✅ |
| Gate and DTO enforce independently | separate suites; DTO projection is the second layer | ✅ |
| Restricted-name policy consistent | `restricted-names.test.ts` (84 tests) | ✅ |
| `correctness` legitimate where intended | asserted *not* restricted; and permitted inside teaching prose | ✅ |
| Strict rubric rejects unknown fields without silent dropping | strict objects; rejection, not stripping | ✅ |
| Content cannot execute HTML/JS | no HTML block type; §7.9 escape-hatch absence explicitly tested | ✅ |
| Asset references validated to spec | `assetId` UUID-validated; `ASSET_POINTER_*` codes | ✅ |

**No new tests added here** — the instruction was to add tests only where a gap exists, and I found none in this boundary. The sanitization boundary is a stated architectural property (renderer-owned), not an untested claim.

---

## 7. OD-26-5 evidence audit

| Check | Result |
|---|---|
| 90-day cap documented accurately | ✅ stated in 25 places across docs and workflow |
| No claim of 12-month **artifact** retention | ✅ verified by grep; every mention states the cap or the impossibility |
| Committed record carries the 12 months without claiming equivalence | ✅ record and `OD-26-5-EVIDENCE-RETENTION.md` state the split explicitly |
| No secrets | ✅ password stripped by construction; **verified empirically** — a fixture `DATABASE_URL` with a password produced a record containing no password |
| Synthetic merge SHA labelled test-only | ✅ labelled **and** explained as "not a commit on any branch" |
| Single canonical comment, edited in place | ✅ verified live — comment `7121326789` created 03:41, updated 04:06, naming run `45325675163` |
| Comment links correct run + run ID + commit SHA | ✅ `45325675163`, head `e19ee25`→`8df3db2`, synthetic merge labelled separately |

**No new evidence architecture introduced.** The mechanism is the one approved in Task 6.

---

## 8. CI evidence

**Final commit `8df3db2`.** V-4/V-5 application verification: [`45325675163`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45325675163) — **both jobs success**.

| Metric | Value |
|---|---|
| Unit tests | **545 passed** / 13 files |
| Integration tests (real PostgreSQL 16) | **47 passed** / 5 files (was 43; +4 new) |
| Skipped | **0** |
| Failed | **0** |
| New tests executed **by name** | ✅ all 4 concurrency tests confirmed present in run output |
| Prisma generation in CI | ✅ success |
| Generated-client typecheck | ✅ success (**CI-only** — see caveat) |
| Lint / format / repo guard | ✅ success |
| Migration 0001 unchanged | ✅ guard step success |
| Migration 0002 not committed | ✅ guard step success |

**Other workflows on `8df3db2`:** V-1…V-5 `45325675268` ✅ · G-3 full-schema `45325675203` ✅ · G-3 workflow gate `45325675323` ✅ · Option C prototype `45325675149` ✅ · **G-1 experiment 2 `45325675158` ❌** · **G-1 drift spike `45325675139` ❌** — both pre-existing at baseline, G-1 correctly remains **FAILED**.

**Local typecheck caveat, stated plainly:** `prisma generate` cannot run here (TLS to `binaries.prisma.sh`), so the generated client is absent locally. Local `tsc` passes only after filtering the known `lib/generated` TS7006 cascade. **I am not claiming local generated-client typechecking succeeded.** CI is the authoritative check — and it caught two real defects in Task 6 that local checks could not see.

---

## 9. Files and commits changed

**Added by this audit:** `tests/integration/questions/change-type-service.test.ts` (+4 tests, ~130 lines).

**Commit:** `8df3db2` — *test(v45): deterministic row-lock and concurrency coverage for the type-change service*

**Full PR contribution (Task 6 + audit):**

| Commit | Contents |
|---|---|
| `0dd23ff` | AMB-5 service + wiring, OD-18 Zod layer, OD-26-5 mechanism |
| `c2334e9` | Fix `Chapter` field names (CI-caught) |
| `e19ee25` | Task 6 report |
| `8df3db2` | Concurrency and row-lock tests |

**New:** `lib/validation/content-blocks/{envelope,blocks,profiles,index}.ts` · `server/questions/change-type.ts` · `scripts/ci/build-milestone-record.sh` · 4 test files · `OD-26-5-EVIDENCE-RETENTION.md` · `TASK-6-REPORT.md`
**Modified:** `server/questions/publish/{rules,gate,errors}.ts` · `tests/unit/questions/rubric-strict.test.ts` · `.github/workflows/phase04a-v45-application.yml`

---

## 10. Restrictions verification

| Restriction | Status | Evidence |
|---|---|---|
| Migration 0001 byte-identical | ✅ | `git diff 5d53c36..HEAD -- prisma/migrations/` → **0 files**; sha256 `bf2fc840…` |
| No Migration 0002 | ✅ | `git ls-tree` → **0** matches |
| No `prisma/` changes by this work | ✅ | **0 files** from `prisma/` in any Task 6 / audit commit |
| No exam tables | ✅ | `model .*Exam` → 0 |
| No negative-marking fields | ✅ | only two *comments asserting absence*; no column |
| No database-level `questions.type` guard | ✅ | none added — prohibited |
| No production deployment | ✅ | none performed |
| **PR #10 not merged** | ✅ | OPEN, `mergedAt=null` |
| B2 withheld | ✅ | unchanged in all reports |
| **G-1 still FAILED** | ✅ | `45325675158`, `45325675139` — both still failing |
| D-1, D-2, D-3 preserved, not reclassified | ✅ | untouched; D2 mutation proof still enforced |
| No 12-month artifact retention claimed | ✅ | verified by grep |
| No new PR / branch / cherry-pick | ✅ | single branch, single PR |
| Application ≠ database enforcement not misrepresented | ✅ | stated in §1, §11, and in code comments |

---

## 11. Remaining blockers and owner decisions

**Implementation defects:** none outstanding. One was found and fixed this audit (lock had no behavioural test).

**Architectural limitations (not defects, not fixable within restrictions):**

1. **`questions.type` has no database guard.** Enforcement is application-level. A database guard requires a migration, which is prohibited. Recorded as an explicit boundary test.
2. **Historical publication tracking does not exist.** No `first_published_at`, no event table. AMB-5 is a *review gate*, not a record — it refuses to resolve the unknown, which is exactly what was approved.
3. **Artifacts expire at 90 days.** 12-month artifact retention is unachievable on a public repo. The committed record carries months 4–12; this is **not equivalent**, and no document claims it is.

**Open owner decisions (not silently resolved):**

| ID | Question | Blocked consequence |
|---|---|---|
| **OD-17** | Wire contract | Transport layer for `ContentValidationError`; no route/status invented |
| **OD-33** | Allowed editor features | Excluded from the schema |
| **AMB-5 exception** | May an exception mechanism exist? | **Unavailable by design**; exceptions cannot be granted until decided |
| **12-month retention** | Private mirror or paid tier? | Full compliance unreachable on current hosting |
| **AMB-1…AMB-4** | Prior ambiguities | Unchanged, unresolved |

---

## PR status

**PR #10 — OPEN. UNMERGED.** `mergedAt: null`. Branch `arena/1042a18a-hsc-alim-ict-question-bank`, HEAD `8df3db2`. History preserved; no branch, PR or cherry-pick created. No production authorization implied or granted.
