## V‑4 / V‑5 Acceptance Audit & Ambiguity Decision Package

**Audit target:** `a24cde2` (`arena/1042a18a-hsc-alim-ict-question-bank`), PR #10.
**Nature of this task:** investigation and decision preparation only. **No code was changed.** The working tree is clean and nothing arising from an unresolved ambiguity was implemented.

---

### 0. Corrections to the previous report

The audit found four claims in `APPLICATION-REPORT.md` that do not survive inspection. They are corrected here rather than quietly edited.

| # | Previous claim | Audited reality |
|---|---|---|
| A1 | "AMB‑1…AMB‑5 recorded in `rules.ts` (`AMBIGUITIES`)" | `AMBIGUITIES` holds **AMB‑1…AMB‑4 only**. AMB‑5 exists only as a doc-comment above `assertTypeChangeAllowed` and is absent from the array, so it is the one ambiguity a reader of the array would never see. |
| A2 | "Transactional publishing behaves atomically" / "reads the snapshot inside the transaction" | **The snapshot read is NOT on the transaction connection.** `publishVersion` locks via `db` (the `tx`) but calls `loadQuestionSnapshot`, which calls `getPrisma()` — a *different* pooled connection. Proven below. |
| A3 | "No bypass via direct API/alternate entry points" | Only partially achieved. **No write path exists above the service layer**, and `assertContentWriteAllowed` / `assertQuestionTypeChangeAllowed` are called by **nothing**. Prevention currently rests on schema-level guarantees, not on service composition. |
| A4 | "no answer keys or restricted data in student-facing DTOs — verified" | The *builders* are correct and strong. But `toStudentQuestion` has **no production call site**, so the DTO suite verifies a function, not reachable behaviour. |

---

### 1. Acceptance status of each V‑4 invariant

Enforcement code and test mapping were read directly from source, then each rule was **mutation-tested** to confirm the tests exercise that rule and not a neighbouring one.

| Inv. | Authoritative definition | Enforcement code | Unit tests | Integration | Mutation pin | Status |
|---|---|---|---|---|---|---|
| **I‑3** | §3.13 row I‑3 | `deriveQuestionStatus`, `checkStatusRollup` (`rules.ts:1003,1010`); written in `publishVersion` | 1 describe + 2 in gate suite | 2 (rollup asserted after write) | gate suite only | **PASS (rule) / GAP (service untested)** |
| **I‑4** | §3.13 row I‑4 | `checkOptionCardinality` (`rules.ts:182`) | 6 | via fixture only | **6 fail** | **PASS with defect D1** |
| **I‑5** | §3.13 row I‑5 | `assertVersionMutable` (`rules.ts:1038`), `assertContentWriteAllowed` (`gate.ts:398`), inline guard in `publishVersion` | 2 + 4 | 1 (re-publish refused) | gate suite | **PASS (guard) / GAP (no callers)** |
| **I‑6** | §3.13 row I‑6 | `assertTypeChangeAllowed` (`rules.ts:1062`), `assertQuestionTypeChangeAllowed` (`gate.ts:417`) | 1 + 2 | none | gate suite | **PASS (guard) / GAP (no callers)** |
| **I‑7** | §3.13 row I‑7; §7.7 rules 1–4 | `checkRubricMatchesStem` (`rules.ts:370`) | 5 | none | **5 fail** | **PASS** |
| **I‑8** | §3.13 row I‑8 | `checkAssetPointers` (`rules.ts:542`), both directions | 6 | none | **6 fail** | **PASS** |
| **I‑11** | §3.13 row I‑11 | `checkVersionNumbering` (`rules.ts:632`) | 3 | none | **3 fail** | **PASS** |
| **I‑13** | §3.13 row I‑13; §7.7 rule 5 | `checkAnswerKeyShape` (`rules.ts:246`) | 8 | 2 (DB halves) | **8 fail** | **PASS** |
| **I‑15** | §3.13 row I‑15; §7.5 CQ paragraph | `checkCqMarks` (`rules.ts:469`) | 3 (+1 dedicated) | none | **3 fail** | **PASS** |
| I‑1 / I‑12 | §3.13 rows I‑1, I‑12 | `checkTaxonomy` (`rules.ts:660`) | 8 | none | **8 fail** | PASS (context) |

**Fidelity check.** Each rule was compared against its §3.13 wording line by line. I‑3, I‑7, I‑8, I‑11, I‑13 and I‑15 implement their text faithfully, including §7.7 rules 1–4 (set **and order**, `maxMarks` agreement, criteria summing to the part maximum, `totalMaxMarks` = Σ parts).

**I‑2 is correctly absent.** No reference to `question_sources`, `source_type`, `BOARD`/`COLLEGE`/`TEST_EXAM` exists in `server/questions/`, and the snapshot does not load `sources`. The two hits in `db-errors.ts` are unique-conflict mappings for `boards`/`question_sources`, not I‑2 logic. This matches §3.13's assignment to the **source service**. ✅

---

### 2. V‑5 acceptance status

| Requirement | Evidence | Status |
|---|---|---|
| Map known unique violations to stable, user-safe codes | 20/20 unique indexes in 0001 registered | **PASS** |
| Never expose raw DB errors / SQL | `toPublicError` strips `constraintNames`; asserted `message` matches no `uq_`/`23505`/`DETAIL` | **PASS** |
| Do not assume uniform `P2002` target shape | parses `meta.target`, `meta.constraint`, message text | **PASS** |
| Unknown violations stay generic | unregistered → `UNIQUE_CONFLICT`, no `field` | **PASS** |
| No over-broad mapping | keyed by constraint name; anti-confusion test asserts `COLLEGE_*` ≠ `TAG_*` | **PASS** |
| Per-mapping tests + unknown case | 41 unit cases | **PASS** |
| Confirmed against real PostgreSQL, not mocks | 8 integration cases, CI-verified | **PASS (CI)** |

**Measured Prisma reality (from CI log output, quoted verbatim):**
`sqlStateOnError=null isP2002=true names=[ 'uq_tags_name_lower' ]`

This confirms the design decision: Prisma reports **`P2002`**, not SQLSTATE `23505`, and it *does* surface the index name for an expression index. The mapper handles both, and `sqlStateOf` correctly refuses to accept `P2002` as a SQLSTATE. Verification went the right way here — a real database refuted an assumption, and the assertion was corrected rather than the code bent to the test.

**V‑5 verdict: PASS.** This is the strongest half of the work.

---

### 3. OD‑26 test status

**Register entry** (`docs/architecture/technology-decisions.md:67`), status *Before implementation*:

> CI provider, required checks, test isolation/fixtures, performance thresholds and security-test ownership. Vitest/RTL/Playwright/PostgreSQL tests are intended; no pipeline or complete budgets exist.

**The two normative passages that actually constrain testing:**

- §3.13: "Each invariant needs at least one integration test against a disposable PostgreSQL instance before 0001 is considered done (**OD‑26** still owns the pipeline)."
- §7.11.10: "Every rule in §7.4–§7.7 has a paired valid/invalid fixture; **the invalid fixture asserts the failing path, not just 'it threw'.** The publish gate gets integration tests against a disposable PostgreSQL instance (**OD‑26**)."

**Narrowest defensible interpretation — MET:** every invariant has an integration test or a database-half test on a disposable `postgres:16`; CI applies 0001 verbatim from the committed file.

**Additional requirements requiring explicit approval (NOT implemented, NOT assumed):**

| # | Requirement | Source | Why not satisfied |
|---|---|---|---|
| O1 | Paired valid/**invalid** fixture for **every** rule in §7.4–§7.7 asserting the failing path | §7.11.10 | Only the §7.4–§7.7 rules that are *invariants* have such pairs. Block-level §7.4 rules (per-type required properties, ordered-list `start`, table `colspan` widths, §7.12 limits of 200 blocks / 10 nested / 50 assets) have **no** fixtures. |
| O2 | Required-checks policy; which jobs block a merge | OD‑26 register | Not a pipeline implementation detail I can invent. |
| O3 | Test isolation/fixture strategy as policy | OD‑26 register | I adopted per-file fixtures + `fileParallelism: false`; that is an implementation choice, **not** an approved policy. |
| O4 | Performance thresholds | OD‑26 register | **No numeric budget exists anywhere.** Not invented. |
| O5 | Security-test ownership + the §7.10 renderer negative tests (XSS, KaTeX, SVG-with-script, oversized doc, deep nesting, unknown block type, answer-revealing property, older `version`) | §7.10 review checkpoints | These are **renderer** tests and the renderer does not exist. |
| O6 | CI provider | OD‑26 register | I used GitHub Actions because the repo already does. That is an observation, not an approval. |

**OD‑26 verdict: narrowest interpretation MET; the register remains open on O1–O6.** O1 is the only one with an arguable implementation gap; O2–O6 are genuinely undecidable from the documents.

---

### 4. Defects found by this audit

#### D1 — I‑4 uses a factually false error code for wrong-alphabet keys (real, reproducible)

`checkOptionCardinality` reports keys that **are distinct** with code `OPTION_KEYS_NOT_DISTINCT`:

```
A, B, C, E  →  code: OPTION_KEYS_NOT_DISTINCT
               msg:  "must use the keys A, B, C, D or ক, খ, গ, ঘ (one alphabet, all four)"
```

The *rejection* is correct and desirable. The **code and the invariant attribution are wrong** — a client matching on the code is told the opposite of the truth, and this is precisely the class of mis-attribution V‑5 was built to prevent. There is no dedicated code in `DomainErrorCode` for it.

**A test currently pins the wrong behaviour:** `rejects a mixed key alphabet (A, B, C, ঘ)` asserts `['OPTION_KEYS_NOT_DISTINCT']`. Fixing D1 therefore requires a one-line test change — which is why it is **reported, not fixed** under this task's "do not implement" instruction.

#### D2 — the snapshot is read outside the transaction (real, reproducible)

`publishVersion` documents "read the snapshot inside the transaction" and locks with `db` (= `tx`), but calls `loadQuestionSnapshot(questionId)`, which does `getPrisma()` — a separate pooled connection.

**Consequence, demonstrated on real PostgreSQL 16.2.** Inside an open transaction holding the row lock, a write is visible to the transaction and invisible to every other connection:

```
t+3s  same txn (tx) would see          : PUBLISHED
t+3s  separate conn (getPrisma()) sees : DRAFT
after ROLLBACK                         : DRAFT
```

So the gate always evaluates the **pre-transaction committed state**. The `FOR UPDATE` lock consequently protects nothing that is read. Two effects:

1. `checkStatusRollup`, which validates the prospective rollup, can be evaluated against a stale sibling-version set.
2. **No integration test would catch this**, because `publishVersion` is never invoked by any test (see D3).

The lock is genuinely held (verified: a second `SELECT … FOR UPDATE` blocks for 4 s), so the *serialisation* intent is real — only the read is on the wrong connection.

#### D3 — `gate.ts` is never loaded by any test

`grep` for `from '@/server/questions/publish/gate'` across `tests/` returns nothing. Consequences:

- `publishVersion`, `assertContentWriteAllowed`, `assertQuestionTypeChangeAllowed` have **zero execution coverage**.
- The integration test named *"a refused publish leaves nothing behind (transaction boundary)"* exercises `prisma.$transaction` + a thrown `Error` — i.e. **Prisma's rollback**, not `publishVersion`. It is a true statement about Prisma and a misleading statement about our service.
- `gate-behaviour.test.ts` re-implements the orchestration in a local `simulatePublish` and tests *that*. Its header says so honestly, but the result is that the real orchestration is untested.

#### D4 — §7.5 profile enforcement has two documented gaps

| §7.5 requirement | Implemented? |
|---|---|
| `mcq_stem`: ≥1 block, ≥1 paragraph, no `subquestion`, no leading `heading`, no answer-revealing property | ✅ all |
| `option`: 1–3 blocks, only paragraph/math/image/code, no answer-revealing property | ✅ |
| `option`: **"nested blocks"** forbidden | ❌ **not checked** — a nested `data.blocks` inside an option block passes |
| `cq_stem`: stimulus first, exactly four subquestions, ক→ঘ order, no `heading` in a subquestion | ✅ |
| `cq_rubric`: "forbids every block type; options; assets" | ❌ **not checked** — `parseRubric` reads only `format`/`totalMaxMarks`/`parts[].{part,maxMarks,criteria[].marks}` and silently ignores any `blocks`, `assets` or `options` smuggled in |
| §7.7 `criteria` cardinality "1 … 6 items" | ❌ only `length === 0` is rejected; 7+ criteria pass |

These are fail-open on a published payload, so they matter.

---

### 5. AMB‑1 … AMB‑5 decision table

**AMB‑1 — is unpublishing a supported transition?**
- **Source:** §3.13 I‑5: "A published version's content, options and key never change; corrections create a new version." `AMBIGUITIES` (`rules.ts`).
- **Why ambiguous:** the sentence forbids *mutation of content*, not a *status transition*. The database forbids two `PUBLISHED` versions per question but permits `PUBLISHED → DRAFT → PUBLISHED`.
- **Current interpretation:** every write to a version whose status is `PUBLISHED` is a violation; unpublishing is **not implemented**.
- **Consequence:** a wrongly published question cannot be withdrawn through this service — only archived, or superseded by a new version. Students would keep seeing it until archival.
- **Alternatives:** (a) forbid unpublish entirely *(recommended)*; (b) allow `PUBLISHED → ARCHIVED` only, with unpublish to `DRAFT` refused; (c) allow unpublish gated on a separate `unpublished_at`+reason audit trail.
- **Recommendation: (b).** (a) over-restricts: a mis-published question must be *removable from student view*, and `ARCHIVED` already exists for exactly that and is rollup-compatible. (b) preserves the immutability guarantee (content still never changes) while restoring the escape hatch. (c) invents a column, which is a schema change and out of bounds.
- **Owner decision:** is `PUBLISHED → ARCHIVED` a supported transition, and is unpublish-to-`DRAFT` permanently refused?
- **If approved (b):** `rules.ts` (+1 function), `gate.ts` (dispatch), tests. No schema change.

**AMB‑2 — is a configurable CQ shape in scope?**
- **Source:** §7.5: "the subquestion `maxMarks` values must be exactly the part mapping (ক = 1, খ = 2, গ = 3, ঘ = 4) … so a future level with a different CQ shape can be supported **without a migration**." §7.7: `parts` "exactly 4 items", `maxMarks` ∈ {1,2,3,4}, `totalMaxMarks` = `10`.
- **Why ambiguous:** the documents *anticipate* a future different shape and say no migration is needed, but never say where the mapping lives.
- **Current interpretation:** `CQ_PART_MARKS` hard-codes ক=1…ঘ=4; any other shape fails closed.
- **Consequence:** correct for the current HSC/ALIM curriculum (revised 2026). A future level cannot publish CQ until code changes.
- **Alternatives:** (a) keep hard-coded *(recommended for now)*; (b) a per-level profile table (new table → **schema change, out of bounds**); (c) a per-version `profile` key inside the content envelope (no schema change, but invents an envelope field OD‑18 has not approved).
- **Recommendation: (a).** Every alternative either changes the approved 18-table schema (b) or invents structured-content fields while **OD‑18 is open** (c). Failing closed is the only choice that adds no unapproved structure.
- **Owner decision:** confirm hard-coded for Phase 04A, and record that configurability is deferred to whichever decision owns multi-curriculum support (likely OD‑18 or a new OD).
- **If approved (a):** **no change** — this is the current behaviour.

**AMB‑3 — does §7.7 rule 5 apply at the publish gate?**
- **Source:** §7.7 cross-document rule 5: "`is_verified` may be `false` on a draft; a **published** CQ version requires a verified rubric, and a published MCQ version requires a verified MCQ key (OD‑10's condition, enforced by the publish gate)." §3.13 I‑13 does **not** mention verification.
- **Why ambiguous:** I‑13's table entry omits it; §7.7 rule 5 states it explicitly *and names the publish gate as the enforcement point*.
- **Current interpretation:** enforced (the stricter reading).
- **Consequence:** an unverified key cannot be published. Content authored but not verified is blocked from student view.
- **Alternatives:** (a) enforce *(recommended)*; (b) enforce only for MCQ; (c) do not enforce at the gate.
- **Recommendation: (a).** §7.7 rule 5 is not ambiguous about the *gate* — it names it. It is only absent from I‑13's row. Publishing an unverified key is strictly worse than refusing it, and OD‑10 is cited as the source of the condition. This is the one ambiguity I would argue is already **effectively resolved by the text**; the owner merely ratifies it.
- **Owner decision:** ratify that §7.7 rule 5 applies at the gate for **both** MCQ and CQ.
- **If approved (a):** **no change**.

**AMB‑4 — is the key alphabet fixed per language?**
- **Source:** §3.13 I‑4: "the four keys are distinct". `ck_question_options_key_allowed`: `key IN ('A','B','C','D','ক','খ','গ','ঘ')`.
- **Why ambiguous:** "distinct" does not imply "exactly one complete alphabet". The CHECK permits a mixture at the database level.
- **Current interpretation:** require exactly `{A,B,C,D}` or exactly `{ক,খ,গ,ঘ}`; a mixture or substitution is refused.
- **Consequence:** `A,B,C,E` and `A,B,C,ঘ` are refused — desirable, since the renderer has four fixed columns.
- **Alternatives:** (a) one complete alphabet *(recommended)*; (b) distinctness only, trusting the CHECK; (c) allow any subset of the eight permitted characters.
- **Recommendation: (a).** (b) lets `A,B,C,E` publish and break the renderer; (c) is worse and contradicts the four-column contract. **But note D1:** the *rule* is right and its *code* is wrong — approve (a) and D1 becomes a defect fix, not a rule change.
- **Owner decision:** confirm the alphabet is exactly one of the two complete sets (and authorise the D1 code fix + its test change).
- **If approved:** `rules.ts` (+1 code), `errors.ts` (+1 union member), 1 test assertion. No schema change.

**AMB‑5 — does the I‑6 type freeze survive archival?**
- **Source:** §3.13 I‑6: "`questions.type` cannot change after a published version exists." Implemented at `rules.ts:1062`; documented **only** as a doc-comment.
- **Why ambiguous:** "after a published version exists" — exists *now*, or *has ever existed*? Once every version is `ARCHIVED`, does the freeze lift?
- **Current interpretation:** "ever published" (stricter). If every version is later archived, no version has status `PUBLISHED`, so the implementation's `versions.some(v => v.status === 'PUBLISHED')` returns **false** and the type *can* then change. **So the code is the loose reading, while the comment claims the strict one — the comment and code disagree.**
- **Consequence:** a question could change MCQ→CQ after archival, silently reinterpreting historical references.
- **Alternatives:** (a) freeze permanently once any version was ever published — requires persisting "was published", which the schema does not store *(would need a schema change — out of bounds)*; (b) freeze while any version is currently `PUBLISHED` *(what the code does)*; (c) forbid type change whenever any version exists at all.
- **Recommendation: (b), with the comment corrected.** (a) is impossible without a new column; (c) is stricter than the documents and would block correcting a draft-created mistake. (b) is the only reading implementable on the approved schema — which is itself the finding: **the strict reading is unimplementable, so it cannot have been the intent.**
- **Owner decision:** confirm (b) and authorise correcting the AMB‑5 comment; **also add AMB‑5 to the `AMBIGUITIES` array** so it stops being invisible.
- **If approved:** comment/array edit only for (b). A code change only if (a) is chosen, which would require an unapproved schema change — **that would need a separate evidence-backed proposal.**

---

### 6. Exact owner decisions required

1. **AMB‑1:** approve `PUBLISHED → ARCHIVED` as the only status escape, with unpublish-to-`DRAFT` refused. *(or: refuse all transitions)*
2. **AMB‑2:** confirm the CQ part→marks map stays hard-coded for Phase 04A; record configurability as deferred.
3. **AMB‑3:** ratify §7.7 rule 5 at the gate for both MCQ and CQ.
4. **AMB‑4:** confirm "exactly one complete alphabet"; authorise fixing **D1** (new `OPTION_KEY_ALPHABET_INVALID` code) including its one pinning test.
5. **AMB‑5:** confirm the "currently published" reading; authorise correcting the misleading comment **and** adding AMB‑5 to `AMBIGUITIES`.
6. **D2:** authorise the fix for the out-of-transaction snapshot read (pass `tx` into `loadQuestionSnapshot`, or give it an explicit client parameter). **This is a correctness bug, not a business-rule choice.**
7. **D3:** authorise tests that actually load `gate.ts` (needs the generated Prisma client → CI-only, per the standing `ci_only` constraint).
8. **D4:** authorise closing the three §7.5/§7.7 fail-open gaps (nested option blocks; rubric forbidden-property scan; criteria 1–6 bound).
9. **OD‑26 O1:** decide whether the §7.11.10 "every rule in §7.4–§7.7 has a paired invalid fixture" requirement applies to block-level §7.4 rules and the §7.12 limits in this phase.
10. **OD‑26 O2–O6:** required-checks policy, isolation policy, performance thresholds, security-test ownership, CI-provider confirmation. **None have approved values; none were invented.**

---

### 7. Discrepancies between documentation, implementation and tests

| # | Documentation says | Implementation does | Test asserts | Severity |
|---|---|---|---|---|
| A1 | report: AMB‑1…AMB‑5 in array | array has AMB‑1…AMB‑4 | — | reporting defect |
| A2 | gate: "read inside the transaction" | reads on a separate connection | not tested | **correctness bug (D2)** |
| A3 | report: "no bypass via alternate entry points" | no callers, no routes | not tested | **unproven claim (D3)** |
| D1 | I‑4 = distinct keys; alphabet is AMB‑4 | distinct keys → `OPTION_KEYS_NOT_DISTINCT` | pins the wrong code | **semantic bug** |
| AMB‑5 | comment: "ever published" | "currently published" | not tested | comment/code disagreement |
| §7.5 | option forbids nested blocks | not checked | not tested | fail-open gap |
| §7.5 | `cq_rubric` forbids blocks/assets/options | ignored silently | not tested | fail-open gap |
| §7.7 | criteria 1…6 | only ≥1 enforced | not tested | fail-open gap |
| §7.11 | Zod boundary schemas required | **no Zod schemas exist** (`lib/validation/` still `.gitkeep`) | — | **decision-blocked by OD‑17/OD‑18** |

**On the Zod gap, deliberately not treated as a defect to fix:** §7.11 mandates it, but OD‑17 (wire contract) and OD‑18 (structured-content schema) are both *open*, with OD‑18 explicitly saying "choice of exact shapes and migrations is open". Building the Zod layer now would convert an open decision into an assumption — precisely what this task forbids. **This is the single largest outstanding item and needs an owner decision on sequencing.**

---

### 8. Test and CI evidence — separated by evidentiary class

**Unit (local, reproduced this session)**

```
publish-rules  68 passed
db-errors      41 passed
dto            17 passed
gate-behaviour 12 passed
full suite    177 passed (7 files)   [+39 pre-existing regression included]
question suites only: 138 passed
```

**Mutation (local, reproduced this session — per-rule isolation)**

```
baseline                                 68 passed
neutralise evaluatePublishGate           46 failed
disable checkCqMarks                      3 failed
disable checkOptionCardinality            6 failed
disable checkRubricMatchesStem            5 failed
disable checkAssetPointers                6 failed
disable checkVersionNumbering             3 failed
disable checkAnswerKeyShape               8 failed
disable checkTaxonomy                     8 failed
each reverted → 68 passed
```

Every rule is independently pinned. The suites are not decorative.

**PostgreSQL integration — CI-verified, `postgres:16`, 0001 applied verbatim**

```
Integration suites against real PostgreSQL 16 => success
18 passed (2 files)   [count asserted by the workflow; skips are a hard failure]
```

**Prisma-level integration — CI-verified only.** I did **not** execute Prisma against a database in this environment: `prisma generate` cannot run here (network-blocked), so `PrismaClient` is unavailable and the integration suites cannot load. **I am not reporting any Prisma execution as locally verified.**

**Locally observed PostgreSQL evidence — explicitly NOT Prisma integration evidence.** I ran a disposable PostgreSQL 16.2 directly with `psql` and applied migration 0001. These are raw-database observations only:

- migration 0001 applies cleanly → **18 tables**
- `uq_question_versions_one_published_per_question` → `23505` on a second published version
- `fk_answer_keys_options_of_version` rejects key `Z`, accepts a real key
- expression index `uq_tags_name_lower` → `23505` naming the **index**, not a field
- row lock is genuinely held (second `FOR UPDATE` blocks 4 s)
- **transaction isolation: own-txn sees `PUBLISHED`, separate connection sees `DRAFT`** ← the D2 proof

**Static**

```
tsc --noEmit   3 × TS2307 + 4 × TS7006 — all downstream of the missing generated client;
               CI "Typecheck" step => success (client generated there)
eslint         0 errors, 0 warnings
prettier       clean (my files)
repo-guard     OK: no prohibited Prisma migration command
```

**Not reproducible here, reported honestly:** anything requiring the generated Prisma client — hence D2/D3 fixes cannot be verified locally and would have to be CI-verified.

---

### 9. Remaining blockers and risks

| Risk | Impact |
|---|---|
| **D2 (snapshot read off-transaction)** | The gate can evaluate a stale snapshot; the `FOR UPDATE` lock currently guarantees nothing about what is read. Highest-severity finding. Fix is small but **must be tested through `gate.ts`**, i.e. in CI. |
| **D3 (gate.ts untested)** | Service orchestration — the part that actually writes — has no execution coverage. The "atomicity" test proves Prisma rolls back, not that the service does. |
| **No Zod boundary (OD‑17/OD‑18 open)** | "No bypass via direct API" is currently a schema-level property plus unwired guards. Until Zod + routes exist, the claim is prospective. |
| **D4 fail-open profile gaps** | Published payloads can carry nested option blocks, rubric-embedded blocks/assets, and >6 criteria. |
| **D1 wrong error code** | Clients matching on codes are misinformed; contradicts V‑5's central goal. |
| **AMB‑5 comment/code disagreement** | A reader trusting the comment believes a stronger guarantee than exists. |
| **OD‑26 O1** | "Every rule in §7.4–§7.7 has a paired invalid fixture" is broader than what exists. |

---

### 10. Restriction compliance

| Restriction | Status |
|---|---|
| Migration 0001 unmodified | ✅ byte-identical to `cac5c4b` |
| Migration 0002 not created/committed | ✅ 0 commits in any ref |
| 18-table schema unchanged | ✅ `prisma/` untouched by my commits (0 files) |
| No negative-marking fields | ✅ 0 |
| No exam tables | ✅ 0 |
| No production deploy | ✅ disposable local + CI PostgreSQL only |
| PR #10 not merged | ✅ `OPEN`, `mergedAt: null` |
| B2 stays WITHHELD | ✅ not revisited |
| D‑1…D‑3 not resolved | ✅ untouched |
| No assumption converted into an approved rule | ✅ all six ambiguities remain recorded, none resolved |
| Work confined to PR #10 / this branch | ✅ no second PR, no branch change |
| No implementation arising from ambiguities | ✅ **working tree clean; zero code changes this turn** |

---

### 11. Recommendation

**V‑5: ACCEPT.** Faithful, well-tested, and validated against real PostgreSQL in CI.

**V‑4: ACCEPT WITH EXCEPTIONS.** The *rules* are strong — every invariant is pinned by mutation-isolated tests and matches its source text. But the **service layer around them is unwritten-with-respect-to-verification**: D2 is a real correctness bug and D3 means the code containing it has never executed under test. Neither is a business-rule question, so neither needed a decision — but both must be fixed before this layer is relied upon.

Sequence I recommend: **D2 + D3 together** (one change, CI-verified), then **D1 + AMB‑5 comment** (small, mechanical, also fixes the reporting defects), then **D4**, then the **Zod boundary** once OD‑17/OD‑18 are decided.

**Stopping here for owner review.** No ambiguity has been resolved, no rule invented, and no code changed.
