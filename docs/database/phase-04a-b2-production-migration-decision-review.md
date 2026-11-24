# Phase 04A — B2 Production Migration Decision Review

**Date:** 2026-11-24
**Reviewed baseline:** `main` at `0ac7fd26c1aad4f631ff89e3ca86c7b374b6c2f4`
**Review branch (read-only):** `arena/49496cf8-hsc-alim-ict-question-bank` at the same commit, clean tree
**Nature of this document:** decision input. It does not authorise anything and it does not change any owner decision.

> **Baseline note.** The session brief quoted the baseline commit as `0ac7fd26…f2`. The repository's actual
> commit is `0ac7fd26c1aad4f631ff89e3ca86c7b374b6c2f4` (`…f4`). Everything below was measured against `…f4`,
> which is the tip of `origin/main` and the merge commit of PR #11.

**Labels used throughout:** `VERIFIED` · `PARTIALLY VERIFIED` · `NOT VERIFIED` · `BLOCKED` · `OWNER DECISION REQUIRED`

---

## 1. Executive verdict

### **READY FOR OWNER DECISION**

The repository's own stated precondition for *requesting* B1b/B2 approval has been met, and every technical
claim needed for the decision can now be checked against recorded CI evidence rather than assertions:

- The physical schema exists as code — 18 tables, 7 enums, 26 foreign keys (21 single + 5 composite), 47 CHECK
  constraints and 6 hand-written indexes — and matches the approved design in every element I could measure. `VERIFIED`
- Full-schema G-3 passes on the committed migration, with every control negative-tested. `VERIFIED`
- V-1…V-5 — the five tasks the proposal names as preconditions — are all recorded as passing on current `main`. `VERIFIED`
- G-1 remains FAILED, and its cause is reproducible on current `main`. `VERIFIED`

**This is not production authorisation, and the recommendation of this review is that B2 stay WITHHELD.**
That recommendation is not a verdict that the decision cannot be made — it is the conclusion the evidence points
to, for five concrete reasons:

1. **The decision the owner is being asked to make is not B2 alone.** Per the repository register, deploying
   0001 *with* C-1…C-5 is decision **B1b**, separately recorded as **NOT APPROVED**, and it is B1b that
   overrides G-1. B2 alone cannot authorise the deployment. `OWNER DECISION REQUIRED`
2. **The operational layer is rehearsed on fixtures, not specified for production.** A backup/restore drill
   exists and passes; there is no committed operator runbook, no measured restore time, no PITR policy and no
   monitoring plan. `PARTIALLY VERIFIED`
3. **One measurable evidence gap remains in the core safety argument.** G-1 measures a 10-model prototype, not
   the real 18-table pair. Nobody has measured what Prisma's no-change diff would do to the *real* schema.
   `NOT VERIFIED`
4. **There is no application in production to use these tables.** The repository has zero route handlers and
   zero server actions; nothing imports the publish or type-change services. `VERIFIED (absence)`
5. **The wire contract is still open (OD-17).** No HTTP surface is approved, so a production database would
   have no approved consumer contract. `OWNER DECISION REQUIRED`

V-1…V-5 passing does not by itself authorise B2, and G-3 passing does not undo G-1. Both statements are
preserved exactly as the session requires.

---

## 2. Verified repository baseline

| Item | Measured value | Label |
|---|---|---|
| Branch / HEAD | `arena/49496cf8-hsc-alim-ict-question-bank` @ `0ac7fd26c1aad4f631ff89e3ca86c7b374b6c2f4` | `VERIFIED` |
| `origin/main` | same commit — branch tree identical to `main` | `VERIFIED` |
| Working tree | 0 entries (`git status --porcelain`) — nothing modified or staged | `VERIFIED` |
| PR #11 | **MERGED** 2026-11-24T10:13:35Z; head `7cfc13d…`; merge commit `0ac7fd2…` | `VERIFIED` |
| Migrations present | `0001_phase04a_question_bank/migration.sql`, `migration_lock.toml` — **no 0002** | `VERIFIED` |
| Schema datamodel | 18 models, 7 enums in `prisma/schema.prisma` | `VERIFIED` |
| Exam tables | none (`grep -i 'exam_(paper|session|result)'` → 0 in schema and migration) | `VERIFIED` |
| Negative marking | no column; referenced only in comments and in removed-CHECK commentary | `VERIFIED` |

### 2.1 Latest CI on `main` (`0ac7fd2`)

| Run ID | Workflow | Result |
|---|---|---|
| `45372731313` | V-4 / V-5 application verification | success — integration **47 passed (47)**, 5 files |
| `45372731513` | production-readiness V-1 … V-5 | success (V-1, V-2+V-3, V-4+V-5 jobs) |
| `45372731345` | G-3 full-schema gate | success — all six criteria |
| `45372731447` | G-3 workflow gate | success |
| `45372731437` | Option C prototype | success |
| `45372731457` | G-1 Prisma drift spike | **failure — expected, recorded evidence** |
| `45372731355` | G-1 experiment 2 | **failure — expected, recorded evidence** |

The same seven workflows also ran on the tested head `7cfc13d` (push `45367983450`, `45367983399`,
`45367983406`, `45367983387`, `45367983736`; G-1 failures `45367983523`, `45367983869`) and on the PR merge
ref. G-1 fails in **every** execution; nothing reports it as passing.

---

## 3. G-1 / G-3 technical analysis

### 3.1 The G-1 limitation, stated exactly

Prisma cannot model a foreign key whose referenced key is not the target model's own `@@id`, cannot express
two relations over one column set, and does not understand `MATCH SIMPLE` skip semantics
(`prisma/migrations/0001_phase04a_question_bank/migration.sql`, PART D header comment, lines ~651–670). The
five constraints C-1…C-5 therefore exist only in SQL. Consequence: a Prisma-generated migration treats them as
drift and emits `DROP CONSTRAINT` for them. G-1 measured this and is recorded **FAILED**. `VERIFIED`

### 3.2 What the current failure actually contains — and a correction to the usual summary

The recorded annotation on `main` (`check-run 138370856175`, run `45372731457`) is broader than "the five
composite FKs". Its statement summary lists, among others:

- `DROP CONSTRAINT` for `fk_questions_level_subject`, `fk_questions_chapter_subject`,
  `fk_questions_topic_chapter`, `fk_questions_subtopic_topic`, `fk_answer_keys_options_of_version` (the five), **and**
- `DROP CONSTRAINT` for ordinary FKs such as `level_subjects_level_id_fkey`, `chapters_subject_id_fkey`,
  `questions_education_level_id_fkey`, **plus** `DROP INDEX "uq_chapters_id_subject"`,
  `DROP INDEX "uq_topics_id_chapter"`, `DROP INDEX "uq_subtopics_id_topic"`, **plus**
- re-`ADD CONSTRAINT` statements that change `level_subjects_*_fkey` to `ON DELETE CASCADE`.

That extra drift is an artefact of the **prototype**, not of the production pair:

- The spike datamodel declares `LevelSubject` relations as `onDelete: Cascade`
  (`docs/database/g1-spike/prisma/schema.prisma`), while the real model says `onDelete: Restrict`
  (`prisma/schema.prisma:157–158`) and the real DDL says `ON DELETE RESTRICT`
  (`migration.sql:399, 402`). They agree; the prototype does not.
- The three support unique keys are declared in the real datamodel
  (`prisma/schema.prisma:186,206,228` — `uq_chapters_id_subject`, `uq_topics_id_chapter`,
  `uq_subtopics_id_topic`) and created in PART A, so the real pair would not propose dropping them. The
  prototype omits them, which is why the harness does.

**Therefore:** the recorded G-1 *conclusion* is sound — Prisma would drop hand-written constraints that cannot
be modelled — but the sentence "Prisma wants to drop the five composite FKs", used in the PR description and
several documents, **understates** the harness output and **overstates** what has been measured about the real
schema. `PARTIALLY VERIFIED` (conclusion) / `NOT VERIFIED` (real-schema blast radius)

### 3.3 The unmeasured case

No harness diffs the **real** 18-table database state against `prisma/schema.prisma`. G-1's step 4 runs against
the 10-model prototype; G-3 and Option C use schema-to-schema diffs and `migrate deploy`, never a
database→datamodel no-change diff. `VERIFIED (absence)` / `NOT VERIFIED (the result)`

This matters because the safety story says "the guards prevent anyone from running the unsafe path". That is
true. But it also means nobody knows whether the unsafe path would drop *only* C-1…C-5 or more — and a future
addition to the guard's allowlist would inherit that unknown.

### 3.4 Option C fully avoids the unsafe path — mechanically

`docs/development/database-migrations.md` prohibits `migrate dev`, `migrate reset` and `db push`; the
repository guard scans executed surfaces and rejects them; `package.json` routes `db:migrate` to a disabled
stub; and new migrations are authored as schema-to-schema diffs (`migrate diff --from-schema <prev>
--to-schema <next>`), which cannot see a live database. Nothing in the approved workflow invokes the
database→datamodel diff that G-1 exposes. `VERIFIED`

### 3.5 Residual bypasses (all documented, none closed)

| Bypass | Status |
|---|---|
| A human typing `prisma migrate deploy` in a terminal | outside the deployment-path guard — stated in its output |
| Raw SQL applied by hand (`psql -f`) | outside the checksum guarantee — stated in `database-migrations.md` |
| Argv-array form (`["prisma","migrate","deploy"]` built dynamically) | undetectable textually; pinned as a known limit in the guard tests |
| Editing an applied migration and re-running deploy | Prisma itself does **not** detect it (criterion 5b: `prisma_detects=no`, `deploy=0`, `status=0`); the checksum gate is the only control |

### 3.6 G-3 evidence, and what it does and does not mean

Six criteria, all passing on the **committed** migration via `prisma migrate deploy` (run `45372731345`):

| Criterion | Recorded evidence | Label |
|---|---|---|
| 1 — enforcement | guard clean; rejects `migrate dev`; accepts approved commands; negative control fires | `VERIFIED` |
| 2 — history consistency | `migrate status` pending → clean; 1 applied; checksum verified | `VERIFIED` |
| 3 — live catalog | inventory **18 / 7 / 26 / 47 / 6** correct; catalog rejected weakening **and** dropping | `VERIFIED` |
| 4 — constrained-column safety | representative changes measured on the full schema | `VERIFIED` |
| 5 — tampering | 6/6 tampered migrations rejected **before** deployment; edit detected by the checksum control, **not** by Prisma | `VERIFIED` |
| 6 — reproducibility | independent empty database replays to 18 tables, 5/5 constraints, 33/33 enforcement cases | `VERIFIED` |

**Distinguishing the three kinds of evidence, as required:**

- **Prototype evidence.** G-1's spike (10 models) and the Option C prototype run. Establishes Prisma's
  behaviour on a model of the problem. Not evidence about production.
- **Full-schema verification.** G-3 full-schema, V-1…V-5, the v45 suites: real 18-table schema, real committed
  migration, disposable PostgreSQL 16 containers. This is strong *technical* evidence.
- **Production evidence.** **None exists.** No production database has been contacted at any point; the
  proposal states this explicitly and the CI containers are local.

**G-3 passing is therefore a statement about the migration's behaviour on a disposable cluster, not a
production-readiness statement.** `VERIFIED`

---

## 4. Migration 0001 integrity review

Measured directly from `prisma/migrations/0001_phase04a_question_bank/migration.sql` (708 lines):

| Element | Count | Evidence |
|---|---|---|
| Tables | **18** | `CREATE TABLE` — education_levels, subjects, level_subjects, chapters, topics, subtopics, questions, question_versions, question_options, answer_keys, question_assets, question_version_assets, tags, question_tags, boards, colleges, academic_years, question_sources |
| Enum types | **7** | BoardType, QuestionType, QuestionStatus, QuestionDifficulty, QuestionOrigin, VersionStatus, SourceType |
| Foreign keys | **26** | 21 `ALTER TABLE … FOREIGN KEY` (lines 399–459) + 5 composite (PART D) |
| CHECK constraints | **47** | `CHECK (` occurrences |
| Hand-written indexes (PART C) | **6** | 3 partial/NULLS-NOT-DISTINCT uniques, 2 expression uniques, 1 partial non-unique |
| Composite FKs (PART D) | **5** | C-1…C-5, lines 671–708 |
| Rollback / down section | **none** | forward-only, as designed |

### 4.1 The five composite FKs, verified by definition

| ID | Constraint | Guarantee |
|---|---|---|
| C-1 | `fk_questions_level_subject` | question's (level, subject) is an offered membership; both columns `NOT NULL`, so never skipped |
| C-2 | `fk_questions_chapter_subject` | chapter belongs to the question's subject |
| C-3 | `fk_questions_topic_chapter` | topic belongs to the question's chapter |
| C-4 | `fk_questions_subtopic_topic` | subtopic belongs to the question's topic |
| C-5 | `fk_answer_keys_options_of_version` | the authoritative MCQ key names an option of the same version |

### 4.2 Integrity holdings and their edges

- **Partial chains cannot be created.** `chapter_id`, `topic_id`, `subtopic_id` are nullable (`migration.sql`
  table `questions`), so C-2/C-3/C-4 are `MATCH SIMPLE` and skip when a column is NULL. The hole that would
  open — a subtopic without a topic, a topic without a chapter — is closed by
  `ck_questions_topic_requires_chapter` and `ck_questions_subtopic_requires_topic` (lines 514–517). `VERIFIED`
- **C-5 does not require a key to exist.** It guarantees that a *present* MCQ key names a real option of the
  same version; it cannot require presence. Presence is invariant I-13 at the publish gate
  (`migration.sql:705–708` comment). So the schema enforces the reference, the service enforces the presence. `VERIFIED`
- **At most one published version per question** is enforced by the partial unique index
  `uq_question_versions_one_published_per_question` (`migration.sql:623–625`). `VERIFIED`
- **Deletion rules.** Version children (`question_versions`, `question_options`, `answer_keys`,
  `question_version_assets`, `question_tags`, `question_sources`) cascade from their parent; taxonomy
  references restrict. C-1's `ON DELETE RESTRICT` closes the "delete the membership, orphan the pair" hole. `VERIFIED`
- **Expression/partial uniques** that Prisma cannot see: `uq_tags_name_lower`, `uq_colleges_name_lower`
  (expression), `uq_question_sources_identity` (`NULLS NOT DISTINCT`), `uq_topics_chapter_order` (active-only).
  Their violation surfaces as Prisma `P2002` — measured, not assumed (V-5, `ACCEPTANCE-AUDIT.md:50–59`). `VERIFIED`

### 4.3 Cross-document discrepancies (recorded, not resolved)

| # | Discrepancy | Location | Severity |
|---|---|---|---|
| D-A | Proposal line says "**5 hand-written indexes**"; the DDL, the proposal's own status block, and the CI catalog assertion all say **6** | `phase-04a-question-bank-physical-schema-proposal.md:1424` vs `:19`, `:64` and run `45372731345` criterion 3 | Low — documentation only |
| D-B | "Prisma drops **the five** composite FKs" vs the harness emitting 19 FK drops + 3 index drops (prototype artefact, §3.2) | PR #11 body; `APPROVED-DECISIONS-REPORT.md`; this is repeated in several summaries | Medium — a reader could infer the real-schema blast radius is measured and is exactly five |
| D-C | V-3 prints a heading "documented procedure **and timing**" but measures no timing | `prod-ready/v3/backup-restore-drill.sh:258` | Low — but it removes RTO from the evidence set |
| D-D | Documents cite G-3 run `45273840004` (pre-merge) as *the* G-3 evidence; newer runs exist on the current baseline | `database-migrations.md:9`; proposal `:19` | Low — evidence is stronger than cited, not weaker |

None of these changes a constraint, a migration or a decision. Each is a documentation correction to be made
in a separate, approved change. `OWNER DECISION REQUIRED (only for whether to correct now or later)`

---

## 5. Option C workflow safety assessment

| Control | What it does | Evidence | Label |
|---|---|---|---|
| Repository guard | scans 14 executed surfaces; rejects `migrate dev`/`reset`/`db push`; allows only the approved diff shape; fires on an injected unsafe script | run `45372731447` criterion 1; local `repo-guard.sh .` exit 0 | `VERIFIED` |
| Deployment-path guard | every repository-controlled deploy goes through the gate; **6 counted exceptions / 19 invocations**, allowance equals actual, zero headroom | run `45372731313`; `deploy-path-guard.py --print-exceptions` | `VERIFIED` |
| Checksum gate | verifies applied history against files on disk **before** deploying; every "cannot verify" branch refuses | integration job step "Checksum gate vs real PostgreSQL 16" success; 9/9 measured previously on PG 16.2 (disposable DBs) | `VERIFIED` |
| Prohibited-command prohibition | `db:migrate` is a disabled stub; `db:deploy` is the gate; `db:verify-history` is verification only | `package.json` | `VERIFIED` |
| Tamper detection | 6/6 tampered migrations rejected pre-deployment; Prisma's own history did **not** detect the edit | run `45372731445`… criterion 5a/5b on `45372731345` | `VERIFIED` |

**Assessment.** The workflow is the strongest part of this package: it is enforced in three independent layers
(prohibition, path guard, checksum gate), each negative-tested, and the one control with a known blind spot
(Prisma's history) is the one the gate replaces. Option C remains **APPROVED as the controlled workflow only**.

**Residual risk.** All three layers are *repository*-scoped. A human with credentials and a terminal is outside
them, and raw SQL is outside them. That is stated in the tooling output and must be an explicit operating
constraint, not an assumption about people's behaviour. `VERIFIED (limit)`

---

## 6. Production operational-readiness assessment

| # | Requirement | Demonstrated | Remaining requirement | Label |
|---|---|---|---|---|
| 1 | Production backup | Drill backs up a disposable DB with real `_prisma_migrations`, custom format, `--no-owner` | No production backup exists; no scheduling, retention, storage location or encryption policy | `PARTIALLY VERIFIED` |
| 2 | Backup integrity verification | Restore compared: inventory, every constraint, every index, ordered row checksums for all 18 tables, history + checksums, second identical restore (V-3b) | Same procedure never run on production-sized data | `PARTIALLY VERIFIED` |
| 3 | Restore drill / RTO | Restore into a separate empty DB, verified usable (C-5 and `uq_tags_name_lower` still reject bad rows) | **No restore duration measured** (D-C); no RTO/RPO target defined; no PITR/WAL policy; no restore-under-load test — limits stated in the drill itself | `PARTIALLY VERIFIED` |
| 4 | Production migration execution procedure | `deploy-gate.sh deploy` + documented Option C workflow | No operator runbook committed; no named operator, no change window, no go/no-go checklist | `NOT VERIFIED` |
| 5 | Migration history verification | `guard.py history` inside the gate; criterion 2 | None for the code; needs a production run | `VERIFIED (mechanism)` |
| 6 | Checksum verification | Gate refuses mismatch/missing/vanished/modified; 9/9 | Needs a production run | `VERIFIED (mechanism)` |
| 7 | Access and credential handling | `lib/db.ts` is `server-only`; `DATABASE_URL` via `lib/env`; no credential in the tree; CI uses disposable local roles | No production role model (least privilege, separate migration role, rotation, secret store) | `PARTIALLY VERIFIED` |
| 8 | Interruption / failure recovery | Gate refuses before touching the DB; forward-only; V-1 exercises a second migration; V-3 exercises restore | No documented decision procedure for "deploy failed halfway" in production; no compensating-migration rehearsal against production-like data | `PARTIALLY VERIFIED` |
| 9 | Post-migration catalog assertions | `guard.py catalog` asserts protected constraints in the live DB; used by G-3 and V-3 | No committed step to run it against production after deploy | `PARTIALLY VERIFIED` |
| 10 | Application compatibility / rollback | Application has no DB consumers (§7); rollback = restore or compensating migration | Rollback strategy not chosen or signed off for production | `OWNER DECISION REQUIRED` |
| 11 | Monitoring / post-deployment verification | Post-deployment enforcement suite exists (I-13…I-15 gate tests, v45) | No monitoring, alerting or post-deploy verification plan for the database | `NOT VERIFIED` |
| 12 | Operator responsibilities / approval checkpoints | B1a/B1b/B1c/B2 register; gate refuses unsafe states | No RACI/runbook; approval checkpoints not operationalised outside this register | `OWNER DECISION REQUIRED` |

**Summary.** What exists is a genuine, measured *technical* drill on disposable infrastructure. What does not
exist is a production operating procedure. A documented procedure is not an executed test, and a disposable
PostgreSQL run is not production evidence — both statements apply here.

---

## 7. Application compatibility assessment

| Question | Finding | Label |
|---|---|---|
| Do production routes invoke the publish / type-change services? | **No.** `app/` contains `layout.tsx`, `page.tsx`, `globals.css`, `icon.svg` and three `.gitkeep` directories; **0** `route.ts`, **0** server actions. No file outside `server/` and `tests/` imports `server/questions/publish/**` or `server/questions/change-type`. | `VERIFIED (absence)` |
| Does OD-17 remain open? | **Yes.** "API wire contract: paths/transport, versions, field names, pagination, limits, errors and HTTP mappings" — *Before API implementation*. | `VERIFIED` |
| Service-isolation gap affecting readiness? | The services exist, are unit- and integration-tested, and are `server-only`-guarded at the DB layer, but nothing exposes them. There is no end-to-end path to test against a deployment. | `PARTIALLY VERIFIED` |
| Do student DTOs exclude answer keys? | **Yes, by allowlist construction.** `server/questions/publish/dto.ts` builds DTOs field-by-field; `StudentQuestionDTO` carries no key, rubric or verification field; `stripAnswerRevealing` removes restricted names independently of the gate; a unit test asserts the negative. | `VERIFIED` |
| Is AMB-5 enforcement intact? | **Yes.** `changeQuestionType` takes exactly one parameter (`change-type.ts:121–123`), has no bypass flag, is fail-closed, and uses the same transaction client for lock/read/write; the legacy exception was removed from the rules helper. | `VERIFIED` |
| Is OD-18 validation authoritative? | **Yes.** `cqRubricSchema = z.strictObject(…)` (`lib/validation/content-blocks/profiles.ts:283`) is the single shape authority; the publish adapter only translates `.issues`; unknown keys rejected. | `VERIFIED` |
| Does functionality depend on undeployed structures? | Everything the code uses is inside migration 0001; but **nothing deployed has a consumer**, and `lib/db.ts` imports the generated client (`lib/generated/**`, git-ignored) which must be generated at build time. | `VERIFIED` |

**Consequence for B2.** Deploying migration 0001 today would create 18 tables that no running application
reads or writes, behind an open wire contract. That is a legitimate owner choice (schema-first), but it is a
choice, and the risk profile is different from a deployment that a live feature depends on.

---

## 8. Unresolved decisions and discrepancies register

| ID | Issue | Current decision | Evidence | Remaining action |
|---|---|---|---|---|
| **B2** | Production authorisation for migration 0001 | **WITHHELD** | `database-migrations.md:23–43`; proposal §11.12.3 | Owner decision after the actions in §10 |
| **B1a** | Option C as the migration workflow | **APPROVED** (workflow-scoped, 5 conditions) | `database-migrations.md:23–43` | None |
| **B1b** | Deploy 0001 **including** C-1…C-5 | **NOT APPROVED** — this is the decision that overrides G-1 | `phase-04a-audit-decision-package.md:725` | **Must be decided before any production deploy with Part D** |
| **B1c** | Deploy 0001 **without** Part D | **NOT APPROVED** | same file `:726`, `:733` | Not recommended; would convert integrity to service-only |
| **G-1** | Prisma-drift gate | **FAILED** — unchanged, not re-scored | runs `45372731457`, `45372731355` | None (accepted limitation); see §3.3 gap |
| **G-3** | Full-schema gate | **PASSED** for the full 18-table schema | run `45372731345` (six criteria) | None |
| **G-2** | Negative-marking precision/scale | **DEFERRED**; `negative_marks` removed in Revision 13 | proposal Revision 13/14 status blocks | Stays deferred; no column exists |
| **OD-17** | API wire contract | **OPEN** | `technology-decisions.md:58` | Decide before any production release exposing these tables |
| **OD-18** | Structured-content schema | **APPROVED** (Revision 4); implementation in progress | `technology-decisions.md:59`; `profiles.ts:283` | None for schema shape |
| **OD-21** | Scoring/analytics incl. negative-marking config | **OPEN** — broadened, not narrowed | `technology-decisions.md:62` | Before evaluation/analytics |
| **OD-NM-1** | Which entity owns the negative-marking switch and penalty rule | **OPEN** | `technology-decisions.md:62` | With the examination model (Phase 05) |
| **D-1, D-2, D-3** | Historical defect/audit labels | **Preserved, not reclassified** | `FINAL-CROSS-BOUNDARY-VERIFICATION.md:245`; `TASK-6-REPORT.md:282`; D-2 is the snapshot-read defect whose mutation proof runs in CI | Definitions are not restated in the current tree — **clarify in-repo if they are to be cited outside the v45 record** |
| **OD-26-1 … OD-26-6** | Required-check policy, isolation policy, performance thresholds, security-test ownership, CI provider/evidence access, §7.11.10 fixture scope | Recommendations recorded, **not ratified** | `OWNER-DECISION-DOCUMENT.md` §4.1–4.6 | Ratify at least OD-26-1 (required checks) and OD-26-5 (evidence access) alongside B1b/B2 |
| **OD-15 / OD-16** | Users and RLS | **OPEN** — no users/roles tables and no RLS in 0001 | migration inventory (0 matches) | Before any authenticated production use |
| **Phase 05** | Examination tables | **Deferred** | proposal Revision 14 scope | Not part of 0001 |
| **D-A … D-D** | Documentation discrepancies (§4.3) | Recorded, unresolved | this document | Separate documentation-only change |

No decision above has been changed, closed or reinterpreted by this review.

---

## 9. Risk register

| # | Risk | Severity | Evidence | Label |
|---|---|---|---|---|
| R1 | A future maintainer runs `migrate dev` against a database and silently drops C-1…C-5 | **High** | G-1 FAILED, runs `45372731457` / `45372731355`; guard blocks it *in the repository* | `VERIFIED (risk exists)` / mitigation `PARTIALLY VERIFIED` (human bypass outside guard) |
| R2 | A modified applied migration deploys undetected | **High** | Prisma did not detect it (criterion 5b: `prisma_detects=no`); only the checksum gate refuses | mitigation `VERIFIED` (gate), gap = raw SQL / manual deploy |
| R3 | Restore takes longer than the acceptable outage window | **Medium** | No timing measured (D-C); no RTO defined | `NOT VERIFIED` |
| R4 | No committed production runbook (backup, deploy, rollback, verification) | **Medium** | No runbook file exists in `docs/` | `NOT VERIFIED` |
| R5 | No production backup/PITR policy | **Medium** | V-3 excludes PITR/WAL, large DB and live-connection restore by design | `PARTIALLY VERIFIED` |
| R6 | Production deploy with no application consumer | **Medium** | 0 route handlers, 0 server actions | `VERIFIED (absence)` — `OWNER DECISION REQUIRED` |
| R7 | Real-schema drift blast radius unmeasured | **Medium** | G-1 is prototype-only; no DB→datamodel diff on the real pair | `NOT VERIFIED` |
| R8 | Wire contract (OD-17) open while tables exist in production | **Medium** | `technology-decisions.md:58` | `OWNER DECISION REQUIRED` |
| R9 | Production credential model undefined | **Medium** | Only principles (`lib/db.ts` server-only; no production role model) | `PARTIALLY VERIFIED` |
| R10 | Monitoring / post-deployment verification absent | **Medium** | No monitoring plan in `docs/`; enforcement suite is CI-local | `NOT VERIFIED` |
| R11 | Documentation overstates the G-1 blast radius (D-B) | **Low** | §3.2 | documentation fix |
| R12 | Handbook inventory inconsistency (5 vs 6 indexes, D-A) | **Low** | §4.3 | documentation fix |

No production observation, timing, approval or test result has been invented in this register; every row
points at a file, a commit or a run ID.

---

## 10. Required actions before B2 authorisation

Ordered. Items 1–2 are preconditions; 3–7 are operational evidence; 8–11 are decisions.

1. **Decide B1b explicitly.** B2 alone cannot authorise a deployment that includes C-1…C-5; the register
   records B1b as the decision that overrides G-1. `OWNER DECISION REQUIRED`
2. **Measure real-schema drift.** Add a CI check that applies the committed migration to a disposable
   PostgreSQL 16 database and runs `migrate diff --from-config-datasource --to-schema prisma/schema.prisma`,
   asserting the result contains **only** the five composite FKs (and asserting it *does* contain them). This
   closes R7 and makes D-B accurate. Implementation task, not this session.
3. **Commit an operator runbook** covering: pre-deploy backup, verification, deploy, post-deploy catalog
   assertion, rollback (restore vs compensating migration), and the decision rule for a failed deploy.
4. **Define and measure RTO/RPO**, including a timing measurement in the V-3 drill and a decision on PITR/WAL
   as a hosting-provider capability.
5. **Define the production credential model**: migration role vs runtime role, least privilege, secret storage,
   rotation, and who may hold them.
6. **Define monitoring and post-deployment verification** for schema state and migration status.
7. **Rehearse the compensating-migration path** (V-1 proves a second migration can be authored and deployed;
   it does not rehearse an emergency corrective migration against production-like data).
8. **Decide OD-17** before any production release that exposes these tables.
9. **Ratify OD-26-1 (required checks) and OD-26-5 (evidence access)** so CI evidence has an owner and a
   retention rule.
10. **Correct D-A…D-D** in a documentation-only change.
11. **Confirm the deployment timing intent**: deploy the schema ahead of its first consumer, or wait for the
    first feature that uses it. `OWNER DECISION REQUIRED`

---

## 11. Explicit owner decision section

Nothing below has been decided by this review.

**The question for the owner** is not only B2. Deploying migration 0001 to production requires **three**
decisions that the repository currently records as withheld:

| Decision | Question in front of the owner | Repository state |
|---|---|---|
| **B1b** | Do you authorise deployment of 0001 **including** the five composite FKs, accepting permanently that they live outside Prisma's model and that G-1 stays FAILED? | NOT APPROVED |
| **B2** | Do you authorise production creation of the Phase 04A schema at all, now that V-1…V-5 are recorded? | WITHHELD |
| **Timing / OD-17** | Deploy ahead of any consumer, or wait for the wire contract and the first feature that uses these tables? | OPEN |

Options, stated for the owner and not chosen here:

- **A — Keep withheld (recommended).** Complete actions 2–7 first; re-present this package. Lowest risk; no
  production object is created; nothing is lost, since no application consumes the schema.
- **B — Authorise B1b + B2 after actions 2–3 only.** Accepts the operational gaps of actions 4–7 with named
  owners and a documented emergency path.
- **C — Authorise deployment without Part D (B1c).** Previously assessed and **not recommended**: it moves the
  integrity guarantee from the database to service validation, which would need its own re-approval and would
  make C-1…C-5 a future migration rather than a baseline.

**If the owner authorises**, the execution constraints that already apply remain in force: Option C only, gate
before deploy, no `migrate dev`, no `db push`, checksum verification, catalog assertion after deploy — and a
production backup taken and verified immediately before the deploy.

---

## 12. Sources, commits, run IDs and file references

**Commits**
- Baseline / `main` tip: `0ac7fd26c1aad4f631ff89e3ca86c7b374b6c2f4` (merge commit of PR #11)
- Tested hardening head: `7cfc13ddc379e0aec58aa051c27af7fcd71f771a` (parent `649c714ae7fcef7b459e9208c8930711282229b2`)

**Workflow runs (all against the exact commits above)**

| Run | Workflow | Conclusion |
|---|---|---|
| `45372731313` | V-4 / V-5 application verification (integration 47/47) | success |
| `45372731513` | production-readiness V-1 … V-5 | success |
| `45372731345` | G-3 full-schema gate | success |
| `45372731447` | G-3 workflow gate | success |
| `45372731437` | Option C prototype | success |
| `45372731457` | G-1 Prisma drift spike | failure (expected evidence) |
| `45372731355` | G-1 experiment 2 | failure (expected evidence) |
| `45367983450`, `45367983399`, `45367983406`, `45367983387`, `45367983736` | same workflows on `7cfc13d` | success |
| `45367983523`, `45367983869` | G-1 workflows on `7cfc13d` | failure (expected evidence) |
| `45273840004` | G-3 as cited in `database-migrations.md` | success (historical citation) |

**Migration and schema**
- `prisma/migrations/0001_phase04a_question_bank/migration.sql` — 708 lines; PART C at 613–649; PART D at 651–708
- `prisma/migrations/migration_lock.toml`
- `prisma/schema.prisma` — 18 models, 7 enums; `onDelete: Restrict` at 157–158; support keys at 186, 206, 228

**Tooling and guards**
- `scripts/db/deploy-gate.sh`, `scripts/db/deploy-path-guard.py`, `scripts/db/migrate-disabled.sh`
- `scripts/ci/deploy-gate-pg-check.sh`
- `docs/database/g1-spike/option-c/repo-guard.sh`, `docs/database/g1-spike/option-c/guard.py`
- `docs/database/g1-spike/option-c/g3-full/run.sh` (criteria 1–6)
- `docs/database/g1-spike/run.sh` (G-1 steps 1–7), `docs/database/g1-spike/prisma/schema.prisma` (prototype),
  `docs/database/g1-spike/sql/0001-schema.sql`
- `docs/database/g1-spike/option-c/prod-ready/v3/backup-restore-drill.sh` (limits at 285–294; procedure at 255+)

**Application**
- `server/questions/change-type.ts:121–123` (single-parameter entry point)
- `server/questions/publish/dto.ts` (allowlist DTOs), `server/questions/publish/rules.ts:441` (delegation to `cqRubricSchema`)
- `lib/validation/content-blocks/profiles.ts:283` (`cqRubricSchema = z.strictObject`)
- `lib/db.ts` (`server-only`, `requireDatabaseUrl`)
- `app/` — `layout.tsx`, `page.tsx`, `globals.css`, `icon.svg`, three `.gitkeep`; **no route handlers, no server actions**

**Decision and procedure records**
- `docs/development/database-migrations.md` — authorisation status (23–43), gate (120–216), guard limits (247–266), open decisions (281+)
- `docs/database/phase-04a-question-bank-physical-schema-proposal.md` — §11.12.3 (B2 withheld, V-1…V-5), status blocks at `:19` and `:64`, inventory at `:1424`
- `docs/database/phase-04a-audit-decision-package.md` — B1b/B1c at 725–733
- `docs/architecture/technology-decisions.md` — OD-17 (`:58`), OD-18 (`:59`), OD-21 / OD-NM-1 (`:62`)
- `docs/database/g1-spike/option-c/prod-ready/v45/{OWNER-DECISION-DOCUMENT,ACCEPTANCE-AUDIT,APPROVED-DECISIONS-REPORT,OD-17-DEPENDENCY,AMB-5-LEGACY-ARCHIVE-DECISION,FINAL-CROSS-BOUNDARY-VERIFICATION,SESSION-6-FINAL-CI-AUDIT}.md`

---

**Historical decisions preserved exactly:** G-1 = FAILED · G-3 = PASSED · Option C = approved controlled
workflow only · B2 = WITHHELD · production creation/deployment of 0001 = NOT AUTHORIZED · candidate 0002 =
DO NOT COMMIT · G-2 = DEFERRED · OD-21 and OD-NM-1 = OPEN · C-1…C-5 = approved design decisions present in
migration 0001.

**This session changed nothing except this document.** No code, schema, migration, SQL, constraint, CI
configuration or decision was modified; no commit, push, PR or database command was issued.
