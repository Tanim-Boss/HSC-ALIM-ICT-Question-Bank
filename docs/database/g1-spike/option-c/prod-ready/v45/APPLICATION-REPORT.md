## V-4 / V-5 Application Implementation — Report

**1. Branch, PR, commit**

- Branch: `arena/1042a18a-hsc-alim-ict-question-bank`
- PR: https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/pull/10 — **OPEN, unmerged**
- Base of this work: `cac5c4b` → HEAD **`023937f`**, **16 commits**
- No second PR was opened.

---

**2. Exact files changed** (16 files, all additions except the driver)

```
server/questions/publish/errors.ts          new   domain error vocabulary
server/questions/publish/content.ts         new   JSONB walker + pointer grammar
server/questions/publish/rules.ts          new   the publish-gate rules
server/questions/publish/dto.ts            new   allowlist projections
server/questions/publish/gate.ts           new   transactional publish path
server/questions/publish/db-errors.ts      new   V-5 unique-violation mapping
tests/fixtures/questions/publish-fixtures.ts      new   valid-by-construction fixtures
tests/unit/questions/publish-rules.test.ts        new   68 cases
tests/unit/questions/db-errors.test.ts            new   41 cases
tests/unit/questions/dto.test.ts                  new   17 cases
tests/unit/questions/gate-behaviour.test.ts       new   12 cases
tests/integration/questions/unique-conflicts.test.ts  new  8 cases (real PG)
tests/integration/questions/publish-gate.test.ts      new 10 cases (real PG)
vitest.integration.config.ts               new   node-env config for integration
.github/workflows/phase04a-v45-application.yml    new   CI job on postgres:16
docs/.../v45/publish-gate-verify.sh        edited stale BLOCKED verdict retired
```

**Nothing under `prisma/` was touched.** Confirmed by hash against `cac5c4b`:
`0001/migration.sql` and `schema.prisma` are **byte-identical**.

---

**3. Implementation mapped to each invariant**

Rules are pure functions over an explicitly-loaded snapshot; the database stays the last line of defence. No rule duplicates a DB guarantee — each explains a violation in domain terms.

| Inv. | Rule | Enforcing boundary | Files |
|---|---|---|---|
| **I‑3** | status is a rollup of versions | `deriveQuestionStatus` + `checkStatusRollup`; written in the publish transaction | `rules.ts`, `gate.ts` |
| **I‑4** | MCQ = 4 options, CQ = 0; keys distinct; one complete alphabet (AMB‑4) | gate, per version | `rules.ts` |
| **I‑5** | published content is immutable | `assertVersionMutable` / `assertContentWriteAllowed` — on **every** content write, not just publish | `rules.ts`, `gate.ts` |
| **I‑6** | type frozen once a published version exists | `assertTypeChangeAllowed` (AMB‑5: "ever published") | `rules.ts`, `gate.ts` |
| **I‑7** | rubric parts mirror the stem; criteria can award each part in full; totals agree | gate | `rules.ts` |
| **I‑8** | asset pointer resolves to a block that exposes that asset | gate, both directions | `rules.ts`, `content.ts` |
| **I‑11** | `version_number` contiguous from 1 | gate | `rules.ts` |
| **I‑13** | exactly one key, right kind, verified (AMB‑3) | gate | `rules.ts` |
| **I‑15** | marks agree across stem, rubric, `questions.marks` (ক১ খ২ গ৩ ঘ৪ = 10) | gate; other shapes fail closed (AMB‑2) | `rules.ts` |
| **§7.5** | four document profiles + answer-revealing-property guard | gate, non-publish writes too | `rules.ts`, `content.ts` |

**No answer keys in student responses:** `toStudentQuestion` is an **allowlist** — it names what it copies. A denylist fails open the moment a column is added, and this is the one place where failing open hands a student the key.

**Server-side, no bypass:** the gate **returns** violations instead of throwing, so a route handler cannot catch-and-continue. `publishVersion` locks the row `SELECT … FOR UPDATE`, reads the snapshot **inside** the transaction, evaluates the gate against the **prospective** state, and only then writes — a refusal rolls back and writes nothing.

**No negative-marking fields, no exam tables, no Phase 04A expansion.** Verified by grep over the new code.

**I‑2 was deliberately not implemented** — §3.13 assigns it to the source service, not the publish gate.

---

**4. V‑5 mapping**

`UNIQUE_INDEX_MAP` covers **all 20** unique indexes in migration 0001, keyed by **constraint name** — never by field name. Three properties matter:

- **Does not assume a uniform `P2002` target.** Prisma reports modelled uniques as a field list and expression indexes as an index name. All three carriers are parsed: `meta.target`, `meta.constraint`, message text.
- **Does not map by field name.** A field-name match would report a college collision as a tag collision. An unregistered name falls through to `UNIQUE_CONFLICT` — never guessed.
- **SQLSTATE-first.** `sqlStateOf` refuses to accept a Prisma code as a SQLSTATE (`P2002` and a SQLSTATE have the same shape); `isSqlState()` requires the 5-char form **and** rejects `Pnnnn`. This was a live bug found and fixed.

Three composite-FK support uniques (`uq_chapters_id_subject`, `uq_topics_id_chapter`, `uq_subtopics_id_topic`) get `REFERENCE_TARGET_CONFLICT` — a collision there is an internal bug, not a form field to correct, so they do not borrow a user-facing message.

Coverage is asserted **both ways**: every unique index has an entry, and no entry names an index 0001 does not create.

**OD‑26 — ambiguity reported, not resolved.** The register entry is a *planning* item ("CI provider, required checks, test isolation/fixtures, performance thresholds, security-test ownership", status *Before implementation*). §3.13/§7.4/§7.7 only say "the publish gate gets integration tests against a disposable PostgreSQL instance (OD‑26 owns the pipeline)". **The exact test requirement is not specified.** I implemented integration tests on a disposable `postgres:16` (the narrowest reading that satisfies the text) and did not invent thresholds or isolation policies.

---

**5. Test commands and actual results**

| Command | Result |
|---|---|
| `npx vitest run tests/unit/` | **177 passed** (7 files) |
| ↳ `publish-rules` / `db-errors` / `dto` / `gate-behaviour` | **68 / 41 / 17 / 12** |
| ↳ pre-existing `env`, `theme-toggle`, `token-parity` | **39 passed** (no regression) |
| CI `unit-and-static` (generate, tsc, lint, prettier, repo-guard, 0001 checks, 0002-absence) | **success** |
| CI `integration` (postgres:16, 0001 applied verbatim) | **success — 18 passed** |
| CI `Phase 04A — V-1…V-5` (V-1, V-2/V-3, V-4/V-5 jobs) | **success** |
| `npx tsc --noEmit` | **0 errors** with the generated client present |
| `eslint` (my files) | **0 errors, 0 warnings** |
| `prettier --check` (my files) | **clean** |
| `repo-guard.sh` | `OK: no prohibited Prisma migration command` |

The only baseline typecheck error is `lib/db.ts` `TS2307` for the un-generated client — an environment limitation, not a defect. I verified **0 errors** against a local stand-in reproducing the real client signatures.

**Local DB verification (in addition to CI).** `prisma generate` cannot run here, so the *Prisma-level* integration suite is CI-verified. To avoid reporting DB behaviour I had not observed, I ran a **local PostgreSQL 16.2** with migration 0001 + the V‑2 seed and measured directly:

- migration 0001 applies cleanly → **18 tables**
- `uq_question_versions_one_published_per_question` fires as `23505` on a second published version
- `fk_answer_keys_options_of_version` rejects key `Z` with the exact composite-FK error and accepts a real key
- V‑4/V‑5 driver re-run: `V45_FAILS=0`, `V4_DB_INVARIANTS=PASS (I-1 I-2 I-10 I-12 I-14)`, `V5_DB_UNIQUENESS=PASS`, `V5_SQLSTATE=23505`

---

**6. Positive and negative evidence**

**Positive controls** (a harness that could false-pass is made to prove it can fail):
- Every invariant block asserts the fixture produces **zero** violations *before* breaking one field.
- `findLeakedField` is proven to return non-null on a deliberately leaky object before being trusted on projections.
- The integration DTO leak scan is paired with the **staff** projection on the same row carrying `mcqCorrectOptionKey` and its value.
- The unique-index coverage test asserts a length floor, so a broken parser fails instead of passing vacuously.

**Negative evidence** (rule → failing test):
- `uq_colleges_name_lower` maps to `COLLEGE_NAME_CONFLICT` and is asserted **not** to be `TAG_NAME_CONFLICT`, against real PostgreSQL.
- An unregistered index yields `UNIQUE_CONFLICT` with no `field`.
- A refused publish leaves the row `DRAFT` — asserted after the rollback.

**Mutation testing** (a suite that passes is not evidence until it can fail):

| Mutation | Failures |
|---|---|
| gate early-returns `{violations: []}` | **45** |
| disable only `checkCqMarks` | **3** |
| neutralize the index registry lookup | **12** |
| map by field name instead of constraint name | **3** |
| leak the answer key into the student DTO | **3** |

Each was reverted and the suite re-run green.

**Four defects found by running real tests, not by reading code:**
1. `sqlStateOf` returned `P2002` as a SQLSTATE — fixed with `isSqlState()`.
2. Three composite-FK uniques missing from the registry — now mapped.
3. Fixture used `nameBn/nameEn` on `Chapter` (real columns are `titleBn/titleEn`) and a lowercase code the CHECK rejects.
4. Two **wrong assertions of mine**: `sqlStateOf(error) === '23505'` (Prisma reports `P2002`; measured `sqlStateOnError=null`, `isP2002=true`) and a `not.toContain('A"')` DTO check that failed because a student projection legitimately lists the option key `"A"` — the key is public, which one is *correct* is not. Both were replaced with assertions of the real property, not weakened.

---

**7. Blocked or ambiguous items** (recorded, not guessed)

- **AMB‑1** unpublishing is unsupported — needs an owner decision.
- **AMB‑2** CQ shapes other than ক১ খ২ গ৩ ঘ৪ fail closed — needs a decision.
- **AMB‑3** whether §7.7 rule 5 verification applies at the gate.
- **AMB‑4** whether the option alphabet is fixed per language.
- **AMB‑5** "ever published" for I‑6.
- **OD‑26** exact test requirement unspecified (see §4).
- **I‑2** intentionally out of scope (§3.13 assigns it to the source service).

---

**8–11. Confirmations**

- ✅ **Migration 0001 unchanged** — byte-identical to `cac5c4b` (`bf2fc840…a2333`).
- ✅ **Candidate 0002 not committed** — `git log --all` shows nothing; only `0001_phase04a_question_bank` exists.
- ✅ **B2 still withheld** — no production database contacted; every run used a disposable local or CI PostgreSQL.
- ✅ **D‑1…D‑3 still OPEN/PENDING** — not corrected, not reinterpreted.
- ✅ **G‑1 preserved as FAILED**, **G‑3 as PASSED**.
- ✅ **PR #10 untouched, OPEN, unmerged** (`mergedAt: null`). Nothing was merged.

---

### Handoff — PR title and body for the separate PR

**Title**

```
feat(questions): server-side publish gate and unique-violation mapping (V-4 / V-5)
```

**Body**

```markdown
## What this adds

The application half of the Phase 04A publish gate, plus V-5's database-error
mapping. Pure rules, transactional persistence, allowlisted projections, and a
PostgreSQL 16 CI job.

Split out from #10, whose scope is the database/schema documentation.

## Invariants enforced (server-side)

I-3, I-4, I-5, I-6, I-7, I-8, I-11, I-13, I-15, and the §7.5 document profiles
including the answer-revealing-property guard.

I-2 is deliberately absent: §3.13 assigns it to the source service.

## Design points worth reviewing

1. **The gate returns violations; it does not throw.** A route handler cannot
   catch-and-continue.
2. **`publishVersion` evaluates the PROSPECTIVE snapshot.** Evaluating the
   current state would let a publish leave the I-3 rollup inconsistent.
3. **`toStudentQuestion` is an allowlist.** A denylist fails open when a column
   is added, and this is where failing open leaks the answer key.
4. **V-5 maps by constraint name, never field name.** Assumes no uniform P2002
   target: field list, index name, or message text are all parsed.
5. **The database stays the last line of defence.** No rule replaces a
   constraint; the integration suite asserts the constraint fires on its own.

## Verification

- 177 unit cases; 18 integration cases on a real `postgres:16`
- `tsc --noEmit` clean, eslint clean, prettier clean, repo-guard OK
- Five mutation runs, each reverted; the suites fail when the logic is broken
- `0001` unchanged, `0002` not committed

## Ambiguities recorded, not resolved

AMB-1…AMB-5 and OD-26 need owner decisions; see `rules.ts` (`AMBIGUITIES`) and
the PR report. No rule was invented where the documents are ambiguous.

## Not in scope

No schema change, no migration, no production deploy, no exam tables, no
negative-marking fields. B2 remains withheld.
```
