# Phase 04A — Final Database Deployment Decision Package

**Date:** 2026-11-24
**Repository:** `Tanim-Boss/HSC-ALIM-ICT-Question-Bank`
**Branch:** `arena/49496cf8-hsc-alim-ict-question-bank`
**HEAD when written:** `36a444a67a4c7de6ba6f4f292f42b765820e6027` (parent `6376d2a6e70d1ac7ec661d4b5019a5ac06ae21ac`)
**`main` tip:** `0ac7fd26c1aad4f631ff89e3ca86c7b374b6c2f4` (merge commit of PR #11)

**Nature of this document:** a consolidated decision input for the owner. It is **documentation only**.
It changes no schema, no migration, no script, no guard, no workflow and **no decision**. It does not
preselect an answer on the owner's behalf.

**Labels used throughout:** `VERIFIED` · `PARTIALLY VERIFIED` · `NOT VERIFIED` · `BLOCKED` ·
`OWNER DECISION REQUIRED`

**Standing statement, repeated wherever it could be misread:** completing a precondition is not an
approval. Every authorisation below is unchanged from the authoritative register unless this document
says, with a citation, that the register itself changed — and it has not.

---

## 1. Executive verdict

### **DECISION PACKAGE COMPLETE — TWO SEPARATE DECISIONS REMAIN UNAPPROVED**

The technical picture is now measured rather than inferred, and it is unusually clean in one direction
and unusually sharp in another:

- **G-1 — FAILED, and now measured on the real schema.** In GitHub Actions with the pinned Prisma 7.10.1
  and PostgreSQL 16, a **no-change** database→datamodel diff proposes **six destructive statements**:
  `DROP CONSTRAINT` for **C-1…C-5** and `DROP INDEX "uq_question_sources_identity"`. It generates **no
  replacement** for that index. Nothing was executed. Run
  [`45381634139`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45381634139) on
  `6376d2a`. `VERIFIED`
- **G-3 — PASSED** on the full 18-table schema with every control negative-tested
  (run [`45372731345`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45372731345)).
  It verifies the **controlled workflow**, not the unsafe path, and it does not reverse G-1. `VERIFIED`
- **Option C — APPROVED as the workflow only** (B1a), carrying five conditions. `VERIFIED`
- **V-1…V-5 are completed and recorded** (run
  [`45372731513`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45372731513)).
  The register's precondition for *requesting* approval is therefore met. **No approval follows from
  that.** `VERIFIED`

Against that, the blockers that a deployment decision must confront are not technical puzzles:

1. **A newly measured integrity gap.** `uq_question_sources_identity` is the one hand-written index an
   ordinary Prisma diff would delete, and **no current control protects it by definition** — the
   catalog assertion covers C-1…C-5 and seven tables only, and the deploy gate checks migration
   checksums only. G-3 counts the six indexes **by name**, so a same-named index recreated **without**
   `NULLS NOT DISTINCT` would still pass. `VERIFIED` (controls as written) / `OWNER DECISION REQUIRED`
   (whether to add a control).
2. **B1b and B2 are separate, and both are unapproved.** Neither implies the other. `VERIFIED`
3. **No application consumes the schema** (0 route handlers, 0 server actions, 0 imports of the publish
   or type-change services outside `server/` and `tests/`), and **OD-17 — the wire contract — is OPEN**.
   `VERIFIED (absence)`
4. **Production operational readiness is not demonstrated** — no committed runbook, no RTO/RPO, no
   monitoring/alerting plan, no production credential model, and OD-22 (exactly those targets) is open.
   `NOT VERIFIED`

**Recommendation (see §15):** keep **B1b NOT APPROVED** and **B2 WITHHELD** until three named,
finite items are closed — an index-preservation control, an operational readiness set, and the OD-17
decision. That is a recommendation supported by evidence, not a deadline: nothing in the repository
establishes a date, and no deployment is inevitable.

---

## 2. Scope and definitions

### 2.1 What this package covers

The Phase 04A physical database (18 tables, 7 enums, 26 foreign keys, 47 `CHECK` constraints, 6
hand-written indexes, 5 composite foreign keys) as committed in
`prisma/migrations/0001_phase04a_question_bank/`, and the authorisation decision for deploying it to a
production PostgreSQL database.

### 2.2 What it does not cover

Exam tables (Phase 05), users/RLS (OD-15/OD-16), negative marking (`G-2` deferred, `OD-21`,
`OD-NM-1`), moderation states beyond three values (OD-27), Paper Studio or AI tables. None of those
exists in migration 0001.

### 2.3 The decision vocabulary, exactly as the register defines it

| ID | Definition | Source |
|---|---|---|
| **B1a** | Option C is accepted as the **controlled migration workflow**. Workflow-scoped; carries five conditions. | `phase-04a-question-bank-physical-schema-proposal.md` §11.12.1 |
| **B1b** | **Production deployment of migration 0001 _with_ C-1…C-5.** This is the decision that overrides G-1's failed condition. | same, §11.12.2; `phase-04a-audit-decision-package.md` §7.6 (line 725) |
| **B1c** | Deploy 0001 **without** Part D — no composite FKs in production, integrity via service validation (Option A, itself not approved). | same, §7.6 (line 726); §11.12.2 |
| **B2** | **Production authorisation / production creation of C-1…C-5.** Explicitly withheld. | same, §11.12.3; `database-migrations.md:23–43` |

A useful restatement, taken from the register rather than paraphrased: **"No approval here makes the
migration production-approved by itself. B1b and B1c are the only two that would"** — and B2 is the
production gate that §11.12.3 states separately.

### 2.4 Conflicting definitions and stale statements — identified and resolved only against evidence

Two historical documents describe the authorisation question differently. Neither is silently
reinterpreted here; each conflict is stated, the authoritative source is named, and the operational
consequence is written out.

| # | Conflict | Where | Resolution used in this package |
|---|---|---|---|
| **C-DEF-1** | The audit package defines **B2** as *"whether C-1…C-5 may be created in a production database given G-1's failure"*, and lists *"deploy 0001 without Part D"* as a third option — which is B1c. §11.12 instead defines B1b as the deployment-with-Part-D decision and B2 as the production-authorisation gate. | `phase-04a-audit-decision-package.md` §6 (line 621), §7.6 (717–735) vs proposal §11.12.2–11.12.3 | §11.12 is the **decision record** ("Decision received") and `docs/development/database-migrations.md:23–43` restates it operationally; both agree B2 is the production gate. The audit package's §7.6 "B1" family is the *origin* of B1a/B1b/B1c and its B2 row is the earlier framing of the same production-creation question. **Operational rule adopted: a production deployment that includes Part D requires B1b _and_ B2 to be explicitly approved, because neither approval implies the other.** The definitional overlap is a register defect; **only the owner can consolidate it** (§14, Q-5). |
| **C-DEF-2** | §11.12.3 says of V-1…V-5: *"None has been done"*. All five are now recorded as passing in CI. | proposal §11.12.3 vs runs `45372731513`, `45372390200`, `45327791897` | The **factual** sentence is stale; the **decision** is not. §11.12.5 requires *"V-1 … V-5 completed and recorded, **then** an explicit owner approval of B1b and B2"*. Precondition: met. Approval: **not given**. B2 remains WITHHELD. |
| **C-DEF-3** | G-1's blast radius was reported as 19 FK drops + 3 index drops + cascade rewrites (prototype) and, elsewhere, as "the five composite FKs"; the real schema produces 6 statements. | PR #11 body; `APPROVED-DECISIONS-REPORT.md`; B2 review §3.2 (D-B) vs drift report §15 | Run `45381634139` is authoritative for the real schema: **5 `DROP CONSTRAINT` + 1 `DROP INDEX`, 0 referential-action statements**. G-1's verdict is unchanged — it was already FAILED. |
| **C-DEF-4** | "5 hand-written indexes" (§3.14, line 1424) vs 6 in the DDL, the status block and every CI catalog assertion. | proposal §3.14 vs §3.14 DDL list, `:19`, `:64`; B2 review D-A | The **DDL is authoritative: 6**. Recorded as a documentation defect; **not fixed in this session**. |
| **C-DEF-5** | V-3 prints a heading "documented procedure **and timing**" but measures no duration. | `prod-ready/v3/backup-restore-drill.sh:258`, limits at 285–294 | RTO is treated as **unmeasured** throughout this package (B2 review D-C). |
| **C-DEF-6** | Documents cite G-3 run `45273840004` as *the* G-3 evidence; newer runs exist on the current baseline. | `database-migrations.md:9`; proposal `:19`, §11.6.6 vs run `45372731345` | Evidence is **stronger** than cited, not weaker. Both runs are success. Citation updated here without changing the gate. |

**Also clarified, because it is the single most misreadable pair of sentences in the register**
(proposal §11.12.4, post-merge clarification `649c714`):

| Statement | Accurate reading |
|---|---|
| C-1…C-5 are *not authorised* | They are **not authorised for production creation**. The **design** is approved, and the constraints are **present in the repository** migration (PART D, lines 649–708). |
| Migration 0001 is *not authorised* | The **repository artifact** exists and deploys in CI. What is withheld is **production deployment** with Part D. |

---

## 3. Current repository and database state

Measured in this session, on the working tree, not taken from a summary.

### 3.1 Git

| Item | Value | Label |
|---|---|---|
| Branch | `arena/49496cf8-hsc-alim-ict-question-bank` | `VERIFIED` |
| HEAD | `36a444a67a4c7de6ba6f4f292f42b765820e6027` | `VERIFIED` |
| Working tree before this document | clean (`git status --porcelain` empty) | `VERIFIED` |
| `main` | `0ac7fd26c1aad4f631ff89e3ca86c7b374b6c2f4` | `VERIFIED` |
| Commits on this branch used as evidence | `b7eba84`, `d7cce48`, `b94c446`, `6376d2a` (CI measurement harness), `36a444a` (reports committed) | `VERIFIED` |

### 3.2 Committed artifacts and hashes

| Artifact | Detail | SHA-256 | Label |
|---|---|---|---|
| `prisma/schema.prisma` | 18 models, 7 enums | `ae2ef6ffc366b5cc3fe84aac6f55ed0af1e163335f8fad682ae7ae8d044bccfa` | `VERIFIED` |
| `prisma/migrations/0001_phase04a_question_bank/migration.sql` | 708 lines, 30,105 bytes | `bf2fc840ebae92cacec04dfb5f8ee6e0224f1394746d80bea3e56027941a2333` | `VERIFIED` |
| `prisma/migrations/migration_lock.toml` | provider `postgresql` | `1db17a8d051aa136110736752c5e1f8b7ed92b6ea8e803112fbbe2497047c210` | `VERIFIED` |
| `prisma/migrations/` contents | `0001_phase04a_question_bank/` and `migration_lock.toml` only — **no 0002** | none | `VERIFIED` |

### 3.3 Migration 0001 inventory, counted from the file

| Element | Count | Where |
|---|---|---|
| `CREATE TABLE` | **18** | PART A, lines 26–459 |
| `CREATE TYPE … AS ENUM` | **7** | PART A |
| `FOREIGN KEY` total | **26** (21 single-column + 5 composite) | PART A; PART D 649–708 |
| `CHECK (` | **47** | PART B, 461–611 |
| Hand-written indexes | **6** | PART C, 613–648 |
| `CREATE INDEX` lines in PART A | 39 (Prisma-generated) | PART A |
| Down/rollback section | none (forward-only by design) | proposal §3.14 |

### 3.4 Tooling and guards present

| Control | Path | Measured now |
|---|---|---|
| Repository guard (prohibited commands) | `docs/database/g1-spike/option-c/repo-guard.sh` | exit **0** on the real tree |
| Deployment-path guard | `scripts/db/deploy-path-guard.py` | **6 files / 19 invocations**, allowance equals actual, no headroom |
| Checksum gate | `scripts/db/deploy-gate.sh` + `guard.py history` | wired as `npm run db:deploy` |
| Prohibited entry point | `scripts/db/migrate-disabled.sh` | prints alternatives, **exits 1**, touches nothing |
| Catalog assertion | `guard.py catalog` | asserts the **5 FKs** and **7 tables** only (§8) |
| Measurement harness (Session 10) | `.github/workflows/phase04a-real-schema-drift.yml` | committed, path-filtered, no secrets |

### 3.5 Database state

There is **no production database** and no staging database. Every measurement cited below ran on a
disposable PostgreSQL 16 service container inside GitHub Actions, destroyed with the job. **No database
migration has ever been applied outside CI or a developer's local disposable instance.** `VERIFIED`

---

## 4. G-1 findings — the ordinary Prisma migration workflow

**Status: FAILED.** Not re-scored, not softened by any later evidence.

### 4.1 What G-1 asks

*Does Prisma's ordinary workflow preserve C-1…C-5 across a routine schema change?* It is a question about
the **tool**, not about the constraints' correctness. PostgreSQL creates and enforces all five
(`VERIFIED`, enforcement suite 33/33).

### 4.2 The decisive measurement, on the real schema

Harness: `.github/workflows/phase04a-real-schema-drift.yml`; applied migration 0001 through the approved
checksum gate; then:

```
prisma migrate diff --config prisma.config.ts \
  --from-config-datasource --to-schema prisma/schema.prisma --script --exit-code
```

| Item | Result |
|---|---|
| Run | [`45381634139`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45381634139), commit `6376d2a6e70d1ac7ec661d4b5019a5ac06ae21ac`, conclusion **success** |
| Prisma CLI | **7.10.1** (pinned); schema engine `d1b3f377ca835d73fd50954a5e22128b9ebdd6b8` |
| PostgreSQL | **16** service container |
| Exit code | **2** (diff non-empty) |
| Output size | 513 bytes; **6 statements** |
| Executed | **none** (`CATALOG-DELTA=0B` — catalog byte-identical before/after) |

Complete generated SQL:

```sql
-- DropForeignKey
ALTER TABLE "answer_keys" DROP CONSTRAINT "fk_answer_keys_options_of_version";
-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_chapter_subject";
-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_level_subject";
-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_subtopic_topic";
-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_topic_chapter";
-- DropIndex
DROP INDEX "uq_question_sources_identity";
```

### 4.3 Operation inventory

| Operation | Count |
|---|---|
| `DROP CONSTRAINT` | **5** |
| `DROP INDEX` | **1** |
| `ADD CONSTRAINT` | 0 |
| `ADD COLUMN` | 0 |
| `ALTER COLUMN` | 0 |
| `DROP TABLE` | 0 |
| Referential-action statements (`ON DELETE` / `ON UPDATE`) | **0** |
| Replacement `CREATE` for the dropped index | **0** |

### 4.4 C-1 … C-5, individually

| ID | Constraint | In the diff | Form | Survives if applied |
|---|---|---|---|---|
| C-1 | `fk_questions_level_subject` | once | `ALTER TABLE "questions" DROP CONSTRAINT` | **no** |
| C-2 | `fk_questions_chapter_subject` | once | same | **no** |
| C-3 | `fk_questions_topic_chapter` | once | same | **no** |
| C-4 | `fk_questions_subtopic_topic` | once | same | **no** |
| C-5 | `fk_answer_keys_options_of_version` | once | `ALTER TABLE "answer_keys" DROP CONSTRAINT` | **no** |

The five drops carry no `ON DELETE`/`ON UPDATE` rewrite before or after them: the constraints are simply
removed, and their `ON DELETE RESTRICT` semantics disappear with them. `VERIFIED`

### 4.5 Why the ordinary path remains prohibited

The failure recurs on **every** routine schema change, produces a migration that looks ordinary in
review, and silently removes an integrity layer after the schema was believed correct. No test can make
it safe, because the tool regenerates the destructive SQL each time. It is prohibited by
`docs/development/database-migrations.md` **as an approved condition of B1a** — `migrate dev`,
`migrate reset`, `db push` and `migrate diff --from-migrations` — and enforced by `repo-guard.sh`.

### 4.6 What G-1 does **not** say

- It does not say C-1…C-5 are wrong. They are correct, present, and enforced.
- It does not say the controlled workflow is unsafe — that is G-3's question.
- It does not quantify any production consequence: nothing was applied, and the post-application catalog
  is **inferred**, not observed (deliberately).

---

## 5. G-3 findings — full-schema validation of the controlled workflow

**Status: PASSED** on the real 18-table schema.

### 5.1 Evidence

| Item | Value |
|---|---|
| Run (current baseline) | [`45372731345`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45372731345) on `0ac7fd2` — jobs: *Workflow enforcement — repository guard* (success), *G-3 full-schema gate* (success) |
| Run closed in the register | `45273840004` (proposal §11.6.6) |
| Schema under test | the **committed** `schema.prisma` + **committed** migration 0001 |
| Inventory asserted | `tables=18 enums=7 fks=26 checks=47 hand_indexes=6` |
| Enforcement suite | **33/33** cases (`G3F_EXPECTED_CASES=33`) |

### 5.2 The six criteria, and the control satisfying each

| # | Criterion | Control | Result |
|---|---|---|---|
| 1 | Workflow enforcement | `repo-guard.sh`, negative-tested with an injected `migrate dev` | PASS |
| 2 | Migration-history consistency | `migrate status` pending→clean; applied count matches directory | PASS |
| 3 | Protected constraint integrity | `guard.py catalog` on the live catalog, negative-tested by **weakening** and by **dropping** C-4 / C-1 | PASS |
| 4 | Constrained-column migration safety | coercible widening preserved C-5 and it still enforced; non-coercible change refused | PASS |
| 5 | Tampering detection | 6/6 textual variants rejected pre-deployment; edited **applied** migration caught by the checksum control, **not** by Prisma | PASS |
| 6 | Reproducibility | independent empty database replays to 18 tables, 5/5 constraints, 33/33 cases | PASS |

### 5.3 What G-3 proves

That the **committed** migration deploys reproducibly, that the workflow's guards actually fire, that the
live catalog still carries C-1…C-5 with approved columns and actions after deployment, and that changes
to constrained columns do not quietly destroy the composite FKs.

### 5.4 What G-3 does **not** prove — and must not be used to claim

1. **It does not show G-1 passed.** G-1 measures the unsafe path; G-3 measures a workflow in which that
   path is never used. They are not netted off (proposal §11.12.1 qualification 2).
2. **It is not production evidence.** Disposable containers only; no production database was contacted.
3. **It does not validate the indexes' *definitions*.** Criterion 3 counts the six hand-written indexes
   **by name** (`g3-full/run.sh:117`). A same-named index recreated without `NULLS NOT DISTINCT` would
   still count 6 and still pass. `VERIFIED (control as written)`
4. **It does not validate application behaviour.** I-3…I-15 are service responsibilities; the gate
   functions have no production call sites (§9).
5. **It does not validate data at realistic volume** beyond the V-2 seed.

---

## 6. Option C — the controlled migration workflow

### 6.1 Why snapshot-to-snapshot diffing is the approved workflow

Prisma cannot model a foreign key whose referenced key is not the target model's `@@id`, cannot express
two relations over one column set, and does not understand `MATCH SIMPLE` skip semantics. C-1…C-5
therefore live only in SQL, and any workflow that reads the live catalog treats them as drift.

A **schema-to-schema** diff (`migrate diff --from-schema <prev> --to-schema <next> --script`) never opens a
database. The property that makes Prisma unable to manage the constraints makes the diff unable to
delete them. Measured, not assumed — in both directions:

| Experiment | Command shape | Exit | Statements | Meaning |
|---|---|---|---|---|
| **E2** no change | `--from-schema snapshot-prev --to-schema schema.prisma` | 0 | **0** (`-- This is an empty migration.`) | The authoring path reports nothing when there is nothing |
| **E3** additive probe | `--from-schema snapshot-probe-1 --to-schema snapshot-probe-2` (one nullable column added to a copy) | 0 | **1**: `ALTER TABLE "subtopics" ADD COLUMN "probeMarker" TEXT;` | A real change is detected, and nothing destructive accompanies it |

Both in run `45381634139`; raw files `e2-snapshot-nochange.sql` (32 B), `e3-additive.sql` (74 B). `VERIFIED`

### 6.2 Mandatory safeguards — requirements, not hardening

The five B1a conditions (proposal §11.12.1) plus the seven controls (§11.6.1 / §11.6.5):

1. `repo-guard.sh` — prohibited commands rejected across executed surfaces.
2. Live-catalog assertion after deployment — negative-tested twice.
3. Textual guard on every migration — drop-must-be-re-added, column/action checks.
4. Checksum control against `_prisma_migrations` — **necessary** because Prisma does not detect edits to
   applied migrations (measured, criterion 5b).
5. Post-deployment enforcement suite — 33/33.
6. Snapshot-to-snapshot diff on every change.
7. The prohibition documented where operators will read it.

The deployment sequence that follows from these: snapshot → edit datamodel → diff → textual guard →
review → checksum gate → deploy → catalog assertion → enforcement suite.

### 6.3 Known limitations

- **Six of seven controls are process controls, not database locks.** If the team stops running the
  guard, the assertion, the checksum gate or the suite, the guarantees degrade silently.
- **A human with credentials is outside the repository guards** (typing a command in a terminal).
- **Raw SQL (`psql -f`) is outside the checksum guarantee** and outside the history model.
- **The argv-array form** (`["prisma","migrate","deploy"]` composed dynamically) is undetectable textually.
- **Prisma itself will not warn** about an edited applied migration; only the gate refuses.
- **Index definitions are not asserted anywhere** (§8) — the sharpest limitation in this package.
- **Coercible type widenings are not checked for width adequacy** — a review responsibility.

### 6.4 Why B1a does not authorise production

B1a approves a **method**. It names its own exclusion: *"This approval does NOT authorise production
deployment of migration 0001. The workflow is approved; the deployment is not."* Production deployment
with Part D is **B1b**, and production creation is **B2**. Both are unapproved. `VERIFIED`

---

## 7. V-1 … V-5 — verification results

All five are **completed and recorded**. This satisfies the register's precondition to *request*
B1b/B2 approval (§11.12.5); it grants nothing.

| Task | What it verifies | Where | Result |
|---|---|---|---|
| **V-1** | A real **second** migration authored by snapshot-to-snapshot diff, guarded, deployed, verified end-to-end | `prod-ready/v1/v1-second-migration.sh`; workflow job *V-1 real second migration through Option C* | **PASS** |
| **V-2** | Realistic seed data — six ICT chapters, subjects/boards/years, one MCQ + one CQ, plus counter-tests | `prod-ready/v2/seed-{data,verify}.sh`; job *V-2 realistic seed + V-3 backup/restore drill* | **PASS** |
| **V-3** | Backup and restore drill with verification | `prod-ready/v3/backup-restore-drill.sh`; same job | **PASS (with stated limits)** |
| **V-4** | Publish-gate invariants I-3…I-15 | `prod-ready/v45/ACCEPTANCE-AUDIT.md`; job *V-4 publish-gate invariants + V-5 P2002 mapping*; run `45381634112` | **PASS (DB halves) / GAP (no production call sites)** |
| **V-5** | `P2002` mapping for expression-unique violations | same job; 41 unit + 8 integration cases | **PASS** |

Run: [`45372731513`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45372731513) on
`0ac7fd2`, three jobs, all success. Earlier equivalent runs on `7cfc13d` (`45372390200`) and `649c714`
(`45327791897`) also success. Application-side verification:
[`45381634112`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45381634112) —
*Integration suites against real PostgreSQL 16* (47 tests passed, 5 files) and *Unit suites, typecheck,
lint, repo guard* (success), including the **D2 mutation proof** that deliberately makes the regression
test fail against the old behaviour.

### 7.1 V-1 — detail

Authors `0002_v1_recently_added_index` inside a throwaway session directory
(`$REPO_ROOT/.v1-session/run.XXXXXX`), never in `prisma/migrations/`. Ten steps: preconditions (DB at
0001, one applied migration) → capture `prev.prisma` → one additive datamodel change → generate with
`migrate diff --from-schema --to-schema` → assert the generated SQL touches nothing protected → run the
guards → deploy → history/checksums → assert the five FKs survived **and still enforce** → assert the
index exists and is used → replay from empty and compare shape. `VERIFIED`

### 7.2 V-2 — detail

Seeds the real curriculum, then runs **counter-tests**: every invalid row must be rejected, plus a
reverse test that a *valid* row the composite FKs must accept is accepted, plus a check that rejections
did not corrupt the seeded state. This is the task that would surface a `CHECK` that rejects legitimate
curriculum data. It does not prove coverage at production volume. `VERIFIED (on the seed)`

### 7.3 V-3 — detail and limits

`pg_dump --format=custom --no-owner --no-privileges`, restore into a **separate empty** database with
`--exit-on-error`, then verify: inventory, every constraint, ordered row checksums for all 18 tables,
`_prisma_migrations` + checksums, a **second** identical restore (V-3b, in a third container), and that
C-5 and `uq_tags_name_lower` still reject bad rows. `VERIFIED`

**What it does not cover, stated by the drill itself:** point-in-time recovery / WAL archiving (a hosting
capability), restore of a database larger than a dev fixture, restore while clients are connected. **No
restore duration is measured**, so **RTO does not exist as evidence** (C-DEF-5). `PARTIALLY VERIFIED`

### 7.4 V-4 — detail, and the honest gap

Rules layer: strong. Every invariant is pinned by mutation-isolated tests; the audit's defects **D1**
(wrong error code for a duplicate option key), **D2** (snapshot read on a pooled connection rather than
the locking transaction) and **D3** were corrected in `TASK-3-CORRECTIVE-REPORT.md`, and the D2
regression test now runs with a **mutation proof** in CI.

The gap that remains: **the gate functions have no production call sites.**
`assertContentWriteAllowed` and `assertQuestionTypeChangeAllowed` are exported from
`server/questions/publish/gate.ts` and called only from tests. `publishVersion` and `changeQuestionType`
exist, are tested, and are imported by nothing outside `server/` and `tests/`. Prevention therefore
rests on **schema-level guarantees**, not on service composition. `VERIFIED (absence)` /
`OWNER DECISION REQUIRED` (whether that is acceptable for a first deployment)

### 7.5 V-5 — detail

20/20 unique indexes in 0001 registered in the mapping; `toPublicError` strips constraint names;
`meta.target`, `meta.constraint` and message text are all parsed rather than assumed; unregistered
violations fall back to a generic `UNIQUE_CONFLICT`; anti-confusion tests assert `COLLEGE_*` ≠ `TAG_*`.
Validated against **real PostgreSQL**, not mocks, with `SQLSTATE 23505` observed. `VERIFIED`

### 7.6 Application-level versus database-level verification — the distinction that matters

| Class | What it establishes | Evidence |
|---|---|---|
| **Database-level** | What PostgreSQL actually stores and enforces | G-3 criteria 1–6, V-1, V-2, V-3, catalog assertions, 33/33 suite |
| **Application-level** | What the services do when invoked | V-4 rules tests, V-5 mapping, 47 integration tests |
| **Wire-level** | What an external caller may ask for | **None. OD-17 is open; there is no HTTP surface.** |

V-1…V-5 are strong evidence of the first two classes and **no evidence at all** of the third.
A deployment decision should be made knowing that.

---

## 8. Critical integrity requirement — `uq_question_sources_identity`

This finding is given its own section because it is the one place where the *approved* workflow, the
*tooling* and the *guards* are all weaker than the guarantee they appear to protect.

### 8.1 The object

```sql
-- Provenance de-duplication. NULLS NOT DISTINCT (PostgreSQL 15+) is what makes
-- partial sources (board + year, no college) de-duplicate too.
CREATE UNIQUE INDEX "uq_question_sources_identity"
  ON "question_sources" ("question_id", "source_type", "board_id", "college_id", "academic_year_id")
  NULLS NOT DISTINCT;
```

`prisma/migrations/0001_phase04a_question_bank/migration.sql:627–631` (PART C). Proposal §3.10 records it
as an approved design element (line 1237).

### 8.2 Why an ordinary Prisma diff proposes dropping it

Prisma's datamodel **cannot express `NULLS NOT DISTINCT`**, so `prisma/schema.prisma` declares no
`@@unique` on `QuestionSource` — only a comment at `:482–483` explaining the omission. The engine sees a
unique index in the catalog that the datamodel does not declare, classifies it as drift, and proposes
`DROP INDEX`. Measured in run `45381634139`: it appears **once**, as `DROP INDEX`, with **no replacement
generated**. The five other hand-written indexes (three partial, two expression) are invisible to
Prisma and appear **0 times**.

Label discipline: the **effect** is `VERIFIED`; the **mechanism** is `PARTIALLY VERIFIED` (inferred from
the same run, not from Prisma's source).

### 8.3 Why its loss matters

`question_sources` records where a question came from — board, year, college, source type. The index is
what makes *"this question was already imported from Dhaka Board 2023"* a database fact rather than a
service convention. Because the columns are nullable and `NULLS NOT DISTINCT` is set, it de-duplicates
**partial** provenance too — the case a plain unique index silently allows. Remove it and nothing
rejects a duplicate import: the row simply exists twice, and every downstream count, search facet and
"already in your bank" indicator is now wrong. `VERIFIED (guarantee is database-level today)`

### 8.4 Why Option C authoring must preserve it explicitly

Option C's safety argument is that a schema-to-schema diff cannot see hand-written SQL, so it cannot
delete it. **That argument holds for C-1…C-5 and, by the same mechanism, for the five partial/expression
indexes — but not for this one.** A `NULLS NOT DISTINCT` unique is *semi-representable*: Prisma neither
models it nor ignores it. It sits in the narrow band where the engine has an opinion, and its opinion is
"delete". A diff that would never touch C-1…C-5 **will** emit `DROP INDEX "uq_question_sources_identity"`
if a snapshot carrying it is ever diffed against a datamodel that cannot declare it — which is exactly
the situation the ordinary path creates, and is a live hazard the moment anyone authors a migration from a
snapshot that includes PART C while the datamodel cannot express the index.

### 8.5 What protection exists today — measured, and weaker than it looks

| Control | Does it protect this index? | Evidence |
|---|---|---|
| `guard.py sql` (textual, pre-deployment) | **No.** It matches `DROP CONSTRAINT` for the five protected FKs and `DROP TABLE` for seven tables only. No `DROP INDEX` pattern exists. | `guard.py:96–131` |
| `guard.py catalog` (post-deployment) | **No.** The query filters `contype='f'` and the five FK names. It reads `pg_constraint`, not `pg_index`. | `guard.py:155–186` |
| `deploy-gate.sh` | **No.** Verifies migration-history checksums only. | `scripts/db/deploy-gate.sh` |
| G-3 criterion 3 inventory | **Partially.** Counts the six indexes **by name**; a drop lowers the count to 5 and fails CI. A same-named recreation **without** `NULLS NOT DISTINCT` still counts 6 and **passes**. | `g3-full/run.sh:117`, `:124` |
| V-3 restore drill | **Partially.** Same by-name count across restore. | `prod-ready/v3/backup-restore-drill.sh:117–125` |
| Enforcement suite (33 cases) | **Partially.** Exercises the index by inserting duplicates against the deployed schema; a missing index would fail a case. A **weakened** index (no `NULLS NOT DISTINCT`) would only fail if a case inserts a partial-duplicate row. | `g3-full/run.sh` |

**Net position:** a *drop* of the index is likely to be caught in CI by a count or a case; a *weakening*
(it exists, same name, plain unique) is **not** reliably caught anywhere. That is a gap in the control
set, and it is `VERIFIED` by reading the guards, not inferred.

### 8.6 Verification required for every future migration — proposed, not imposed

*(Owner decision Q-4, §14. Nothing below is implemented; this section states what would have to be
true.)*

1. **Textual guard extension:** reject any `DROP INDEX` / `ALTER INDEX` naming one of the six
   hand-written indexes unless the same migration re-creates it **with the approved definition text**.
2. **Catalog assertion extension:** read `pg_index` / `pg_indexes` and assert, per index, the **column
   list**, the **predicate** and `indnullsnotdistinct`, not merely the name.
3. **Every migration's generated SQL reviewed for the six names** before deployment —
   `grep -n 'uq_question_sources_identity\|uq_topics_chapter_order\|uq_question_versions_one_published_per_question\|uq_tags_name_lower\|uq_colleges_name_lower\|ix_question_assets_checksum'`.
4. **A negative test**: deliberately weaken the index in a disposable database and require the assertion
   to fail — otherwise the control is unproven, which is where it stands today for this index.
5. **A duplicate-insert case with a NULL dimension** in the enforcement suite, so the `NULLS NOT
   DISTINCT` behaviour itself is a pinned case rather than an incidental one.

### 8.7 Is it in the current committed migration?

**Yes.** PART C, lines 627–631, `NULLS NOT DISTINCT`, SHA-256 `bf2fc840…a2333`. Nothing needs to change
in the migration. What is missing is not the object — it is a control that would notice if a future
migration removed or weakened it. **No schema or migration change is made or proposed in this session.**

---

## 9. Application integration status — OD-17

### 9.1 Measured state of the application

| Question | Finding | Label |
|---|---|---|
| Route handlers | **0** (`find app -name 'route.ts*'` → 0; `app/api/` holds only `.gitkeep`) | `VERIFIED (absence)` |
| Server actions | **0** (`grep -rl "use server"` over `app/`, `lib/`, `server/` → 0) | `VERIFIED (absence)` |
| `app/` contents | `layout.tsx`, `page.tsx`, `globals.css`, `icon.svg`, three `.gitkeep` dirs | `VERIFIED` |
| Anything outside `server/` importing the publish/type-change services | **0 files** | `VERIFIED (absence)` |
| Call sites of `publishVersion` / `changeQuestionType` outside tests | **none** | `VERIFIED (absence)` |
| Call sites of `assertContentWriteAllowed` / `assertQuestionTypeChangeAllowed` | **tests only** | `VERIFIED (absence)` |
| Call sites of `toStudentQuestion` (student DTO builder) | **tests only** | `VERIFIED (absence)` |
| Zod content-block layer | **exists** (`lib/validation/content-blocks/{blocks,envelope,profiles,index}.ts`) and is imported by `server/questions/publish/rules.ts` and tests — i.e. wired to the **domain rules**, not to a transport | `VERIFIED` |
| OD-17 (wire contract) | **OPEN** — "paths/transport, versions, field names, pagination, limits, errors and HTTP mappings … Before API implementation" (`technology-decisions.md:58`) | `VERIFIED` |

### 9.2 What is implemented versus unconnected

**Implemented and tested:** the publish service (`publishVersion`), the type-change service
(`changeQuestionType`, single-parameter, fail-closed, AMB-5 review gate), the DTO allowlist builders, the
`P2002`/unique-violation mapping, the strict `cqRubricSchema`, the content catalogue, and the database
layer (`lib/db.ts`, `server-only`, single client).

**Unconnected:** everything above. There is no HTTP surface, no server action, no page that calls any of
it, and no approved request/response shape for one to be built against. `OD-17-DEPENDENCY.md` states the
dependency precisely: §7.11 specifies validation of a **content document**; it does not specify a
**request**. Transport, error envelope and field-path format are the three unanswered questions.

### 9.3 Why deploying the schema before the wire contract is approved risks an operationally incomplete system

Deploying today would create **18 tables, 7 enums, 26 FKs, 47 CHECKs and 6 indexes that no running code
reads or writes**, behind a contract that is not approved. Concretely:

- **Nothing can verify the deployment end-to-end.** The only available smoke tests are the CI suites,
  which do not run against production.
- **The first real consumer becomes the first real test** of the constraint set, the `P2002` mapping and
  the DTO boundary — under production conditions, with no rollback path beyond restore.
- **Error behaviour is undefined at the boundary.** `DomainError` exists and `toPublicError` deliberately
  does not choose a status code; until OD-17 is decided, a constraint violation has no approved response.
- **A second change is then blocked behind an unexercised path** — a schema nobody can use is also a
  schema nobody is exercising, so defects surface later, at higher cost.

Schema-first deployment is a legitimate strategy, but it is a **choice with a cost**, not a neutral
default, and it should be made explicitly (§14, Q-3).

---

## 10. Operational readiness

Assessed against what a first production deployment requires. **No claim of readiness is made anywhere
below.**

| # | Requirement | What exists | What is missing | Label |
|---|---|---|---|---|
| 1 | **Backup** | V-3 drill: `pg_dump --format=custom`, includes `_prisma_migrations`, verified | No production backup exists; no schedule, retention, storage location or encryption policy | `PARTIALLY VERIFIED` |
| 2 | **Backup integrity** | Restore compared on inventory, constraints, indexes, ordered row checksums of all 18 tables, history + checksums; second restore identical | Never run on production-sized data | `PARTIALLY VERIFIED` |
| 3 | **Restore / RTO** | Restore into a separate empty database, verified usable | **No duration measured**; no RTO/RPO target; no PITR/WAL policy; no restore-under-load test (C-DEF-5, drill limits 285–294) | `NOT VERIFIED (RTO)` |
| 4 | **Operator runbook** | The V-3 procedure text; `docs/development/database-migrations.md` describes the workflow | **No committed runbook** covering pre-deploy backup → deploy → catalog assertion → rollback → failure decision; the only occurrence of the word "runbook" in `docs/` is the B2 review saying it is absent | `NOT VERIFIED` |
| 5 | **Migration execution procedure** | `npm run db:deploy` → `deploy-gate.sh`; checksum gate refuses unsafe states | No named operator, no change window, no go/no-go checklist | `PARTIALLY VERIFIED` |
| 6 | **Rollback / recovery** | Prisma Migrate is forward-only; rollback = restore or compensating migration; V-1 proves a second migration can be authored and deployed | No compensating-migration rehearsal against production-like data; rollback strategy not chosen or signed off | `OWNER DECISION REQUIRED` |
| 7 | **Credentials and access** | `lib/db.ts` is `server-only`; `DATABASE_URL` via `lib/env.ts`; nothing secret in the tree; CI uses disposable local roles | **No production role model** — no separate migration vs runtime role, no least privilege, no rotation, no secret store | `PARTIALLY VERIFIED` |
| 8 | **Monitoring / alerting** | None | No monitoring plan, no alerting, no post-deploy verification step for schema state | `NOT VERIFIED` |
| 9 | **Responsibilities** | B1a/B1b/B1c/B2 register; guards refuse unsafe states | No RACI; approval checkpoints not operationalised outside this register | `OWNER DECISION REQUIRED` |
| 10 | **Operational targets** | None | **OD-22** (capacity/SLOs, observability, alerting, cost, backup RPO/RTO, recovery, rollback) is **OPEN** — "no operational targets are approved" (`technology-decisions.md:63`) | `VERIFIED (absent)` |
| 11 | **Post-deploy catalog assertion** | `guard.py catalog` exists and is used by G-3 and V-3 | No committed production step that runs it after a deploy | `PARTIALLY VERIFIED` |
| 12 | **Evidence ownership / retention** | Runs and artifacts exist | OD-26-1 (required checks) and OD-26-5 (evidence access) recorded as recommendations, **not ratified** | `OWNER DECISION REQUIRED` |

**Summary — stated plainly:** what exists is a genuine, measured **technical** drill on disposable
infrastructure, plus a well-tested integrity plan. What does not exist is a **production operating
procedure**. A documented drill is not an executed production run, and a disposable PostgreSQL container
is not production evidence. Both statements apply.

---

## 11. Decision and blocker matrix

Every status below was checked against the authoritative register in this session. **None has been
changed, closed or reinterpreted.**

| Decision / Requirement | Current status | Evidence | Remaining blocker | Owner action |
|---|---|---|---|---|
| **G-1** — ordinary Prisma workflow preserves C-1…C-5 | **FAILED** (not re-scored) | Runs `45381634139` (real schema: 5 FK drops + 1 index drop), `45372731457`, `45372731355` (prototype) | None — accepted limitation; ordinary path prohibited | None required; do not re-score |
| **G-3** — controlled workflow safe enough to operate | **PASSED** (full 18-table schema) | Run `45372731345`; six criteria, negative-tested; register cites `45273840004` | None | None |
| **Option C** — controlled migration workflow | **APPROVED — workflow only**, 5 conditions | Proposal §11.12.1; `database-migrations.md:23–43` | Conditions must stay enforced (guards, gate, assertions) | None; do not relax conditions |
| **B1a** — authorise the workflow | **APPROVED** (workflow-scoped) | Proposal §11.12.1 | — | None |
| **B1b** — deploy 0001 **including** C-1…C-5 | **NOT APPROVED** | Proposal §11.12.2; audit package `:725` | Requires explicit approval + operational readiness + index control | **Explicit decision required (Q-1)** |
| **B1c** — deploy 0001 **without** Part D | **NOT APPROVED** | Audit package `:726`, `:733`; §11.12.2 | Would need Option A re-approval; moves integrity to service validation | **Explicit decision required (Q-2), if desired** |
| **B2** — production authorisation / production creation of C-1…C-5 | **WITHHELD** | Proposal §11.12.3; `database-migrations.md:39–43` | V-1…V-5 recorded ✅, but approval not given; definitional overlap with B1b (C-DEF-1) | **Explicit decision required (Q-1)**; consider consolidating (Q-5) |
| **Migration 0001** — the artifact | **Present, deploys in CI**; **NOT AUTHORIZED for production deployment** | Migration file (708 lines), hash `bf2fc840…a2333`; §11.12.4 clarification | Production authorisation withheld (B2); B1b unapproved | None — no change needed to the artifact |
| **Migration 0002** | **DO NOT COMMIT** — does not exist in the repository | `prisma/migrations/` contains only 0001 + lock; V-1's `0002_v1_recently_added_index` exists only in a throwaway session directory | Standing instruction; no candidate is approved | None — keep it uncommitted |
| **G-2** — negative-marking precision/scale | **DEFERRED** | Proposal Revision 13; no `negative_marks` column anywhere | Belongs to the examination model (Phase 05) | None now |
| **OD-17** — API wire contract | **OPEN** | `technology-decisions.md:58`; `OD-17-DEPENDENCY.md` | Transport, error envelope, field-path format undecided | **Decision required (Q-3)** before any API implementation |
| **OD-21** — scoring/analytics incl. negative-marking config | **OPEN** (broadened, not narrowed) | `technology-decisions.md:62` | Needs the examination model | None now |
| **OD-NM-1** — owner of the negative-marking switch/rule | **OPEN** | `technology-decisions.md:62` (named inside OD-21) | Needs the examination model | None now |
| **`uq_question_sources_identity` preservation** | **Present** in migration 0001 (PART C, 627–631); **not protected by definition** by any current guard | Run `45381634139` proposes `DROP INDEX`, no replacement; `guard.py:96–186`; `g3-full/run.sh:117,124` | No textual guard, no catalog assertion, no definition-level check | **Decision required (Q-4)**: add the control or accept the risk explicitly |
| **Production operational readiness** | **NOT READY** | §10: no runbook, no RTO/RPO, no monitoring, no production credential model; OD-22 open | Items 1–12 in §10 | **Decision required (Q-1)**: accept named gaps with owners, or defer |
| *(context)* OD-22 — operational targets | **OPEN** | `technology-decisions.md:63` | — | Owner may pair with Q-1 |
| *(context)* OD-26-1 / OD-26-5 — required checks, evidence access | **Recommendations, not ratified** | `OWNER-DECISION-DOCUMENT.md` §4.1–4.6 | — | Ratify alongside any deployment decision |
| *(context)* D-A … D-D — documentation discrepancies | **Recorded, unresolved** | B2 review §4.3; this package §2.4 | Documentation-only change | Decide now or later |

---

## 12. Decision B1b — production deployment of migration 0001 **with** C-1…C-5

### 12.1 What B1b authorises

Deploying `prisma/migrations/0001_phase04a_question_bank/migration.sql` — all four parts — to a
**production** PostgreSQL database, **including PART D**, the five composite foreign keys. It is the
decision that **overrides G-1's failed condition** and accepts, permanently, that C-1…C-5 live outside
Prisma's model. (Proposal §11.12.2; audit package §7.6, line 725.)

### 12.2 Exact artifacts and constraints it includes

| Element | Count / identity |
|---|---|
| Tables | 18 |
| Enum types | 7 (`BoardType`, `QuestionType`, `QuestionStatus`, `QuestionDifficulty`, `QuestionOrigin`, `VersionStatus`, `SourceType`) |
| Single-column FKs | 21 |
| **Composite FKs (PART D)** | **5** — `fk_questions_level_subject`, `fk_questions_chapter_subject`, `fk_questions_topic_chapter`, `fk_questions_subtopic_topic`, `fk_answer_keys_options_of_version`; all `ON UPDATE CASCADE ON DELETE RESTRICT` |
| `CHECK` constraints (PART B) | 47 |
| Hand-written indexes (PART C) | 6 — 3 partial, 2 expression, 1 `NULLS NOT DISTINCT` |
| Prisma-generated indexes (PART A) | 39 |
| Migration history | `_prisma_migrations` with the committed checksum; `migration_lock.toml` provider `postgresql` |
| Rollback | none — forward-only; recovery is restore or a compensating migration |

### 12.3 Why B1b remains NOT APPROVED

1. **It overrides a failed gate.** G-1's condition — that the ordinary workflow preserve the constraints —
   was not met, and was measured to be unmet on the **real** schema in Session 10.
2. **It is permanent.** The constraints can never be brought under Prisma's management; every future
   schema change must be authored around them.
3. **The register says so explicitly**: *"No production database may receive migration 0001 with the five
   composite FKs on the strength of B1a."*
4. **The supporting controls are process controls**, six of seven, and one of them (§8) does not cover the
   index it appears to.

### 12.4 Evidence available today

Strong: G-3 six criteria (negative-tested), V-1 real second migration, V-2 realistic seed with
counter-tests, V-3 restore drill with row checksums and repeatability, V-4 rules layer with mutation
pins, V-5 `P2002` mapping against real PostgreSQL, 47 integration tests, guards green in CI on every
run cited. `VERIFIED`

### 12.5 Unresolved risks if B1b were approved now

| Risk | Severity | Why it survives approval |
|---|---|---|
| A future migration removes or weakens `uq_question_sources_identity` undetected | **High** | §8.5 — no definition-level control exists |
| No production runbook, RTO or monitoring at the moment of first deploy | **High** | §10 — first deploy becomes the test |
| No application consumer; contract open (OD-17) | **Medium** | §9 — deployment cannot be validated end-to-end |
| A human bypasses the guards with a terminal | **Medium** | documented limit, not closed |
| Restore takes longer than the acceptable outage window | **Medium** | no timing measured |
| Production credential model undefined | **Medium** | no role separation, no rotation |

### 12.6 What an explicit B1b decision requires

A recorded owner statement of the form: *"I authorise production deployment of migration 0001 **including**
Part D (C-1…C-5), accepting that [named risks] are accepted/owned by [named owner], and that G-1 remains
FAILED."* — with the acceptance recorded in the register, not inferred from a chat message. **This
document does not make that statement.**

---

## 13. Decision B2 — production migration creation/deployment authorisation

### 13.1 What B2 authorises

**Production creation of the Phase 04A schema objects, including C-1…C-5.** The register states it as a
decision, not an open question with a default: *"absent a later explicit approval, migration 0001 may not
be deployed to a production database with Part D included."* (Proposal §11.12.3.)

Scope, as the register defines it: the **production** existence of the schema — not the repository
artifact (which exists and is authorised to exist), and not the workflow (B1a). `VERIFIED`

### 13.2 How B2 relates to B1b

| | B1b | B2 |
|---|---|---|
| Question | Do you deploy 0001 **with** Part D, accepting that G-1 stays FAILED? | Do you authorise **production creation** of the schema including C-1…C-5? |
| Scope | The deployment act, and its acceptance of the tool's limitation | The production authorisation gate |
| Register status | NOT APPROVED | WITHHELD |
| Preconditions | Operational readiness, named risk acceptance | V-1…V-5 **and** explicit approval (§11.12.5) |

In practice both must be satisfied for the deployment to be lawful under the register, and **neither
approval implies the other**. The definitional overlap between the two is recorded as **C-DEF-1** and is
**not resolved here**; the conservative operational rule is adopted and stated in §2.4.

### 13.3 Why approval of one must not be read as approval of the other

Because they were separated *precisely so that a workflow approval could not be read as a deployment
approval*. The register's own words on the adjacent case: B1a *"must not be read as"* B1b. The same
discipline applies between B1b and B2: approving the deployment does not silently complete the
authorisation register, and completing the authorisation register does not perform or approve a
deployment. Anything else would collapse three decisions into one and defeat the reason they were
written separately.

### 13.4 Prerequisites before B2 can be reconsidered

| # | Prerequisite | State |
|---|---|---|
| 1 | **V-1…V-5 completed and recorded** | **MET** — run `45372731513`; register text stale (C-DEF-2) |
| 2 | **Explicit owner approval of B1b** | **NOT MET** |
| 3 | **Explicit owner approval of B2** | **NOT MET** — this is the decision itself |
| 4 | Operational readiness items accepted or closed (§10) | **NOT MET** |
| 5 | Index-preservation control (§8) added or risk explicitly accepted | **NOT MET** |
| 6 | OD-17 decided, or schema-first deployment chosen deliberately | **NOT MET** |
| 7 | D-A…D-D documentation defects corrected or accepted | **NOT MET** (documentation only) |

Items 1–3 are the register's own conditions. Items 4–7 are this package's evidence-based additions and
**are not part of the register** — they are recommendations, labelled as such.

### 13.5 What an explicit B2 decision requires

A recorded owner statement authorising production creation of the schema, naming the deployment target,
the operator, the backup taken immediately before, and the verification to be run after. Without it,
B2 remains **WITHHELD**.

---

## 14. Explicit owner approval requirements

**Five questions. Each is independent. None is preselected. Answering one does not answer another.**

### Q-1 — B1b **and** B2 (the deployment decision)

*Do you authorise production deployment of migration 0001 including C-1…C-5 (B1b) and production
creation of those objects (B2)?*

- **If approved:** ~18 tables, 7 enums, 26 FKs, 47 CHECKs, 6 indexes and 5 composite FKs become
  production objects; PostgreSQL begins enforcing them. G-1 remains FAILED; the constraints stay outside
  Prisma's model permanently. Every risk in §12.5 becomes yours to own, and each must be assigned.
- **If rejected or deferred:** no production object is created. Nothing is lost — there is no consumer
  and no data. The migration stays deployable in CI and remains the reference baseline. G-3 evidence does
  not decay; it can be re-run cheaply.
- **Prerequisites:** §13.4 items 1–7. Items 1–3 are the register's; 4–7 are recommendations.
- **Still unauthorised either way:** dropping C-1…C-5 (B1c), any workflow relaxation, migration 0002.

### Q-2 — B1c (deploy without Part D)

*Do you instead authorise deploying the 18 tables without the five composite FKs?*

- **If approved:** the schema exists, but every cross-object integrity guarantee that C-1…C-5 provide
  becomes service-enforced. Option A was assessed and **not approved**; it would need its own
  re-approval, because it converts a declarative design into application logic.
- **If rejected:** the design stays as approved, and the deployment question remains Q-1.
- **Note:** the register's own analysis calls this *"legitimate and coherent"* but warns it should be
  chosen deliberately, never by default.

### Q-3 — OD-17 (the wire contract)

*Do you decide transport, error envelope and field-path format now — or do you deliberately choose a
schema-first deployment with no consumer?*

- **If decided:** the Zod boundary layer can be wired; the services gain a caller; a deployment can then
  be validated end-to-end.
- **If deferred:** the tables (if deployed) have no approved consumer, and the first real API becomes the
  first real test of the schema under production conditions.
- **Prerequisite for:** any production release that exposes these tables.

### Q-4 — `uq_question_sources_identity` preservation

*Do you require a definition-level control over the six hand-written indexes (§8.6) before any production
migration is authored or deployed — or do you explicitly accept that a weakened index would go
undetected?*

- **If required:** implementation is a small, reviewable change to `guard.py sql` and `guard.py catalog`
  plus a negative test. It does not touch the schema or migration 0001.
- **If risk accepted:** record the acceptance; note that the index exists today and only a *future*
  migration endangers it — which is why this is a control question, not a deployment blocker *today*.
- **Not decided here:** no guard, schema or migration has been changed in this session.

### Q-5 — register hygiene (optional, documentation only)

*Do you consolidate the B1b/B2 definitions into one unambiguous pair of decisions (C-DEF-1), and
authorise corrections to D-A…D-D?*

- **If approved:** the next reader cannot misread which decision authorises what.
- **If deferred:** this package's §2.4 remains the working interpretation, and the overlap stays a known
  register defect.

### 14.1 What remains unauthorised no matter what is answered above

- Dropping C-1…C-5 to unblock anything (**B1c**) — unless Q-2 is explicitly approved.
- Relaxing any of the seven safeguards, the four prohibitions, or the deployment-path guard's exceptions
  (6 files / 19 invocations, zero headroom).
- Committing any migration 0002.
- Any production operation performed as part of this decision — approval authorises a future act, and
  that act must itself be executed under the approved workflow with a verified backup and a named
  operator.

---

## 15. Final recommendation

**Recommendation: do not deploy yet. Keep B1b NOT APPROVED and B2 WITHHELD, and close three finite
items first.** This is a recommendation to the owner, supported by the evidence below; the decision
remains the owner's, and no date is implied or manufactured by it.

### 15.1 Why deferral is the evidence-supported position

1. **The destructive path is real and measured on the real schema** — six `DROP` statements from a
   no-change diff, one of them an index with no replacement (§4). Any deployment increases the number of
   places where that behaviour must never be triggered.
2. **The one control that would catch a weakened index does not exist** (§8.5). Deploying before adding
   it means the first production schema runs with a guarantee that the tooling would not notice losing —
   and the guarantee is precisely the kind that fails silently.
3. **There is nothing to deploy for.** Zero route handlers, zero server actions, zero imports of the
   services outside `server/` and `tests/`. Deployment would create tables with no consumer and no
   approved contract (OD-17 OPEN). The cost of waiting is close to zero; the cost of an unverifiable
   first deploy is not.
4. **Operational readiness is a plan, not a procedure** (§10): no runbook, no RTO, no monitoring, no
   production credential model, and OD-22 — the register entry for exactly those — is open.
5. **Repository validation is not production authorisation.** G-3 and V-1…V-5 are strong evidence that
   the schema *and the workflow* behave correctly on disposable infrastructure. They say nothing about
   a production database, a production operator, or a production failure at 02:00.

### 15.2 The three items that would change the recommendation

| # | Item | Why it is the binding constraint | Effort shape |
|---|---|---|---|
| **1** | **Index-preservation control** — textual + catalog assertion over the six hand-written indexes, with a negative test (§8.6) | Closes the only integrity gap no current control covers; makes Option C safe for the index as well as the FKs | Small, reviewable, no schema change |
| **2** | **Operational readiness set** — committed runbook, measured restore time + RTO/RPO, monitoring/alerting for schema and migration state, production credential model (separate migration vs runtime role), named operator | Converts a drill into a procedure; closes RTO/credentials/monitoring rows in §10 | Process + a documentation change; no schema change |
| **3** | **OD-17 decision** (transport, error envelope, field-path format) | Gives the schema a consumer and makes an end-to-end validation possible | One owner decision; unblocks the Zod boundary |

If the owner prefers deployment earlier, the honest framing is **option B of the B2 review §11**:
authorise B1b + B2 after item 1 only, with items 2–3 accepted as named risks with named owners and a
documented emergency path. That is a legitimate choice; it is not what the evidence recommends.

### 15.3 What is explicitly *not* recommended

- **Deploying without Part D (B1c)** to sidestep the question: it converts an approved declarative design
  into service-enforced logic, which has no approval and no equivalent test coverage.
- **Re-scoring or waiving G-1**: it was measured twice on the prototype and once on the real schema; the
  verdict is not a formality to be cleared.
- **Reading B1a, G-3 or V-1…V-5 as authorisation** of anything production-facing. None of them is.

### 15.4 What does not need to change

Migration 0001 is sound and complete: 18 tables, 7 enums, 26 FKs, 47 CHECKs, 6 indexes, 5 composite FKs,
`uq_question_sources_identity` present and correct. **Nothing in the schema or the migration is
defective, and this package proposes no change to either.** The gap is entirely in authorisation,
controls and operations.

---

## 16. Evidence references and limitations

### 16.1 CI runs cited

| Run | Workflow | Commit | Conclusion | Used for |
|---|---|---|---|---|
| [`45381634139`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45381634139) | real 18-table Prisma drift measurement | `6376d2a` | success | G-1 real-schema blast radius; E2/E3; catalog delta 0 B |
| [`45372731345`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45372731345) | G-3 full-schema gate (+ repo guard job) | `0ac7fd2` | success | G-3 six criteria |
| [`45273840004`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45273840004) | G-3 full-schema gate (closed the gate) | pre-merge | success | register citation |
| [`45372731513`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45372731513) | production-readiness V-1…V-5 | `0ac7fd2` | success (3 jobs) | V-1, V-2, V-3, V-4/V-5 |
| [`45372390200`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45372390200) | production-readiness V-1…V-5 | `7cfc13d` | success | independent confirmation |
| [`45327791897`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45327791897) | production-readiness V-1…V-5 | `649c714` | success | independent confirmation |
| [`45381634112`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45381634112) | V-4 / V-5 application verification | `6376d2a` | success | 47 integration tests; D2 mutation proof |
| [`45372731313`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45372731313) | V-4 / V-5 application verification | `0ac7fd2` | success | earlier equivalent |
| [`45372731457`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45372731457), [`45372731355`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45372731355) | G-1 spike / experiment 2 | `0ac7fd2` | failure (**expected evidence**) | G-1 prototype results |
| `45380768045`, `45381042601`, `45381341939` | drift measurement harness iterations | `b7eba84`, `d7cce48`, `b94c446` | failure / failure / success | harness defects, not schema defects |

### 16.2 Repository documents cited

| Path | Sections used |
|---|---|
| `docs/database/phase-04a-question-bank-physical-schema-proposal.md` | §3.10 (indexes), §3.14 (impact/rollback, line 1424), §11.6.1 (criteria), §11.6.5 (residual risk), §11.6.6 (G-3 gate), §11.12.1–11.12.5 (**the decision record**), status blocks `:17`, `:19`, `:64` |
| `docs/database/phase-04a-audit-decision-package.md` | §5.3, §6 (approvals, line 621), §7.1–§7.6 (B1a/B1b/B1c, line 725–735) |
| `docs/database/phase-04a-b2-production-migration-decision-review.md` | §1, §3.2/§3.3, §4.1–§4.3, §6, §7, §8, §9, §10, §11, §12 |
| `docs/database/phase-04a-real-18-table-prisma-drift-investigation.md` | §11 (Session 9 limits), §13.2 (harness), §15.1–§15.12 (**Session 10 results**, verdict FAIL) |
| `docs/development/database-migrations.md` | `:9`, authorisation status `:23–43`, gate `:120–216`, guard limits `:247–266`, open decisions `:281+` |
| `docs/architecture/technology-decisions.md` | OD-17 `:58`, OD-21 `:62`, OD-22 `:63`, OD-26 `:67`, OD-NM-1 (named in OD-21) |
| `docs/database/g1-spike/option-c/prod-ready/v45/OD-17-DEPENDENCY.md` | §2, §4, §5 |
| `docs/database/g1-spike/option-c/prod-ready/v45/ACCEPTANCE-AUDIT.md` | §1–§4 (V-4/V-5 acceptance), §7 (D1–D3), §8 |
| `docs/database/g1-spike/option-c/prod-ready/v45/TASK-3-CORRECTIVE-REPORT.md` | D1/D2/D3 closure |

### 16.3 Code and artifact references

| Path | What it establishes here |
|---|---|
| `prisma/migrations/0001_phase04a_question_bank/migration.sql` | PART A 26–459 (tables/enums/indexes/FKs), PART B 461–611 (47 CHECKs), PART C 613–648 (6 indexes; `uq_question_sources_identity` 627–631), PART D 649–708 (C-1…C-5) |
| `prisma/schema.prisma` | 18 models, 7 enums; `QuestionSource` at `:461–485`, **no `@@unique`**, comment at `:482–483` |
| `docs/database/g1-spike/option-c/guard.py` | `PROTECTED_FKS` `:55–63`, `PROTECTED_TABLES` `:66–70`, `check_migration_sql` `:96–131`, `CATALOG_QUERY` `:155–186` — **no index protection** |
| `docs/database/g1-spike/option-c/g3-full/run.sh` | `assert_shape` `:107–126` (counts the six indexes **by name**), criterion 3 `:332–375`, `G3F_EXPECTED_CASES=33` `:39` |
| `docs/database/g1-spike/option-c/prod-ready/v1/v1-second-migration.sh` | V-1 ten-step driver; session dir `:81`; `0002` created only in the session dir `:295–296` |
| `docs/database/g1-spike/option-c/prod-ready/v2/seed-verify.sh` | V-2 seed, counter-tests `:153`, reverse test `:391` |
| `docs/database/g1-spike/option-c/prod-ready/v3/backup-restore-drill.sh` | V-3 procedure; limits `:285–294`; index count `:117–125` |
| `scripts/db/deploy-gate.sh`, `scripts/db/deploy-path-guard.py`, `scripts/db/migrate-disabled.sh`, `docs/database/g1-spike/option-c/repo-guard.sh` | the four enforcement surfaces |
| `app/` (5 files, 3 `.gitkeep`), `server/` (10 `.ts`), `lib/validation/content-blocks/` (4 `.ts`) | application integration state (§9) |
| `.github/workflows/phase04a-real-schema-drift.yml` | the Session 10 measurement harness (permanent) |

### 16.4 Limitations of this package

1. **No production observation of any kind.** Every measurement is disposable infrastructure. Anything
   about production behaviour is inference and is labelled as such.
2. **The post-application catalog is inferred.** The proposed diff was never executed, by design.
3. **One Prisma version (7.10.1), one PostgreSQL version (16).** Drift behaviour on other versions is
   unmeasured.
4. **The `uq_question_sources_identity` mechanism is inferred**; the effect is measured.
5. **Definitional overlap between B1b and B2 (C-DEF-1) is unresolved** and requires an owner ruling; this
   package adopts the conservative reading (both required) rather than inventing a resolution.
6. **The register's V-1…V-5 sentence is stale** (C-DEF-2). Evidence, not the register text, was used for
   the fact of completion; the register's decision was used for the authorisation.
7. **No measurement of restore duration, no load test, no failure-injection test** in production-like
   conditions.
8. **Nothing was deployed, executed, or applied** in preparing this package.

---

## 17. Revision history

| Revision | Date | Author | Change |
|---|---|---|---|
| 1 | 2026-11-24 | Decision-package session (documentation only) | Initial consolidated package. Reads and reconciles the B2 review (Session 8), the real-schema drift investigation (Sessions 9–10), the physical schema proposal (Revision 15), the audit decision package, the G-1/G-3 evidence, the Option C documentation, the V-1…V-5 records and the migration workflow documentation; verifies claims against the committed artifacts. Adds §8 (index preservation) and §2.4 (conflict register) as new analysis. **No decision changed; no schema, migration, guard, script, workflow or application code modified.** |

**Decisions preserved exactly, as recorded in the register and unchanged by this document:**
G-1 = **FAILED** · G-3 = **PASSED** · Option C = **APPROVED — controlled migration workflow only** ·
B1a = **APPROVED (workflow-scoped)** · B1b = **NOT APPROVED** · B1c = **NOT APPROVED** ·
B2 = **WITHHELD** · Migration 0001 = present in the repository, **NOT AUTHORIZED for production
deployment** · Migration 0002 = **DO NOT COMMIT** · G-2 = **DEFERRED** · OD-17 = **OPEN** ·
OD-21 = **OPEN** · OD-NM-1 = **OPEN** · C-1…C-5 = **approved design, present in migration 0001,
production creation withheld**.

**This package preserves evidence and frames a decision. It authorises no database deployment and changes
no owner decision.**
