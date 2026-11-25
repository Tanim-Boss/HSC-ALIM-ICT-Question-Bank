# Phase 04A — Final Database Deployment Decision Review

**Date:** 2026-11-24
**Repository:** `Tanim-Boss/HSC-ALIM-ICT-Question-Bank`
**Branch:** `arena/49496cf8-hsc-alim-ict-question-bank`
**HEAD when written:** `4d04e4461338ea5931d26faf67d312fbed21de43`
**Nature:** final review of the decision-preparation phase. Nothing was implemented, migrated, measured or
deployed; no database was contacted; no owner decision was made or inferred.

---

## 1. Executive verdict

### **PHASE 04A DECISION-PREPARATION REVIEW COMPLETE — PRODUCTION DEPLOYMENT NOT READY — NO PRODUCTION AUTHORIZATION**

The decision-preparation phase is **complete**: every question is framed, every option is named, every
dependency is typed, and every missing fact has an owner and a location. Production readiness is **not**
achieved, and no part of this review creates authority to deploy.

The seven questions this review must answer, answered directly:

| Question | Answer |
|---|---|
| Is Phase 04A decision preparation complete? | **Yes** — six briefs, three worksheets, one consolidated register, one deployment package |
| Is the database migration workflow approved? | **Yes, narrowly** — Option C is `APPROVED — controlled migration workflow only`, with B1a `APPROVED (workflow-scoped)` and five mandatory conditions |
| Is migration 0001 authorised for production? | **No** — `NOT AUTHORIZED for production deployment`; B1b is `NOT APPROVED` and B2 is `WITHHELD` |
| Is migration 0002 permitted to be committed? | **No** — `DO NOT COMMIT`; no 0002 exists in `prisma/migrations/` |
| Is production collation selected? | **No** — `NOT DECIDED`; the production profile is `UNKNOWN`; only CI's profile is observed |
| Are all six owner decisions resolved? | **No** — OD-COLL-01…06 are all `OPEN`, with zero options selected |
| Is production deployment currently authorized? | **No** — see §10 (20 unsatisfied prerequisites) and §11 |

**Completion of the review phase is not completion of production readiness.** The first sentence of the
verdict records a finished documentation and decision-framing effort; the second records an unmet deployment
condition. They are different claims and neither implies the other.

---

## 2. Review scope and methodology

### 2.1 What this document is

A single closing assessment that reconciles: the deployment package (File C), the consolidated owner register,
the three owner worksheets, the six decision briefs, the technical investigations (guard design, R2, CI
measurement proposal, product/environment decision document), and the repository itself (migration 0001,
`schema.prisma`, the guards, the workflows).

It references those documents rather than reproducing them. Where a number appears here, it was re-derived from
the repository in this session (§3, §14.2).

### 2.2 Evidence hierarchy applied

| Level | Source | What it decides |
|---|---|---|
| 1 | current repository implementation | what runs today |
| 2 | committed migration and schema | what the database must contain |
| 3 | recorded CI execution | what was observed in CI |
| 4 | recorded disposable-database measurements | what was observed locally only |
| 5 | reconciliation documents (handoff, audit, consolidated register) | what the project has settled |
| 6 | briefs, worksheets, proposals | what is proposed and why |
| 7 | recommendations and unapproved candidates | **nothing** |

A brief never overrides the probe; a summary never overrides a source; CI evidence never becomes production
evidence by repetition.

### 2.3 What was not done, deliberately

No database was started, connected to or queried. No SQL was executed. No migration was generated, applied or
diffed. No workflow was dispatched or re-run. No production or staging system was read. No source document was
edited. No owner decision was recorded, and none was inferred from the existence of a brief, worksheet,
recommendation or register.

---

## 3. Repository and migration baseline

### 3.1 Verified schema inventory

| Item | Value | How verified in this session |
|---|---|---|
| Tables | **18** | `grep -c '^CREATE TABLE' migration.sql` |
| Enums | **7** | `grep -c 'CREATE TYPE .* AS ENUM'` |
| Foreign keys | **26** | `grep -c 'FOREIGN KEY'` |
| CHECK constraints | **47** | `grep -c 'CHECK ('` |
| Composite foreign keys | **5** | `grep -c 'FOREIGN KEY (.*,.*)'`; `C-1…C-5` named in `guard.py:55–60` |
| Hand-maintained indexes | **6** | PART C, `migration.sql:613–648` |
| Migration 0001 | **708 lines**, SHA-256 `bf2fc840ebae92ca…` | `grep -c ''`; `sha256sum` |
| Migrations present | `0001_phase04a_question_bank/` + `migration_lock.toml` | `ls prisma/migrations` |
| Migration 0002 | **does not exist** | same |

These match the package's documented baseline exactly (File C §15.4: 18 / 7 / 26 / 47 / 6 / 5).

### 3.2 The six hand-maintained indexes

| # | Index | Definition site | Unique | Collation dependence |
|---|---|---|---|---|
| 1 | `uq_question_versions_one_published_per_question` | `:623` | yes, partial | none (`uuid`/`enum`) |
| 2 | `uq_question_sources_identity` | `:629` | yes, `NULLS NOT DISTINCT` | none — NULL semantics |
| 3 | `uq_topics_chapter_order` | `:635` | yes, partial | none (`uuid`/`int4`) |
| 4 | `uq_tags_name_lower` | `:640` | yes, expression | **full** |
| 5 | `uq_colleges_name_lower` | `:641` | yes, expression | **full** |
| 6 | `ix_question_assets_checksum` | `:645` | **no**, partial | bears a collatable key, no uniqueness semantics |

### 3.3 Guards actually present

| Control | Path | What it decides | Scope limit |
|---|---|---|---|
| Repository command guard | `docs/database/g1-spike/option-c/repo-guard.sh` | no executed path invokes `migrate dev`/`reset`/`db push` | textual, repository-controlled paths only |
| Deployment-path guard | `scripts/db/deploy-path-guard.py` | repository-controlled `migrate deploy` routes through the gate | static analysis |
| Checksum gate | `scripts/db/deploy-gate.sh` | applied `_prisma_migrations` checksums match files on disk | **migration history, not the live catalog** |
| Migration disabled shim | `scripts/db/migrate-disabled.sh` | `npm run db:migrate` refuses | one script name |
| Protected-FK guard | `docs/database/g1-spike/option-c/guard.py` (279 lines) | three modes — `sql`, `catalog`, `history`; five composite FKs; checksums | **no collation or `pg_index` awareness** (0 occurrences) |
| Collation probe | `…/g3-full/collation-probe.sh` (468 lines) | nothing — measures and reports | its own header: "NOT a guard … does not compare" (`:15`, `:77`) |

**There is no structural index guard, no fingerprint comparator, no expectation file and no drift classifier.**
A 25-case prototype matrix was run on disposable PostgreSQL and never committed.

---

## 4. Six owner decision status

Verified against the consolidated register, the three worksheets and the six briefs — not inferred from any
summary.

| ID | Decision | Status | Review readiness | Decisive gap |
|---|---|---|---|---|
| **OD-COLL-01** | Tag uniqueness semantics | **`OPEN`** | **READY WITH EXPLICIT CAVEATS** | no real tag data; no product statement on `ICT`/`ict` |
| **OD-COLL-02** | College identity semantics | **`OPEN`** | **READY WITH EXPLICIT CAVEATS** (heavier) | whether two distinct colleges may share a name — a domain fact |
| **OD-COLL-03** | Production collation profile | **`OPEN`** | **READY WITH EXPLICIT CAVEATS** (prospective target only) | no production measurement of any field |
| **OD-COLL-04** | Collation fingerprint specification | **`OPEN`** | **READY WITH EXPLICIT CAVEATS** | ICU and other majors `NOT TESTED`; eight elements undecided |
| **OD-COLL-05** | Collation drift failure policy | **`OPEN`** | **PARTIALLY READY** — core yes, value-dependent rows **NOT READY** | needs 03's values and 04's artefact for its value-dependent rows |
| **OD-COLL-06** | Existing data compatibility | **`OPEN`** | **READY WITH EXPLICIT CAVEATS** (process core) | candidate key belongs to 01/02; no audit capability exists |

- **No decision is "ready for owner decision" without caveats.** Every one has at least one `UNKNOWN` input.
- **OD-COLL-05's incompleteness is preserved**: identity, malformed input, structural stances and the state
  model are decidable; Layer B field-by-field classification, any `EXACT_MATCH` verdict, the
  `EXPECTED_ENVIRONMENT_CHANGE` allow-list and the Layer E threshold are not.
- Zero options selected. Six blank records exist in the consolidated register §11; none has content.
- The existence of six briefs, three worksheets and a register is **not** evidence of owner approval.

---

## 5. Technical evidence assessment

### A. Schema and migration integrity

| Claim | Status | Evidence |
|---|---|---|
| 18 tables / 7 enums / 26 FKs / 47 CHECKs / 6 indexes / 5 composite FKs | **verified in this session** | §3.1 |
| `uq_question_sources_identity` is present and correct (`NULLS NOT DISTINCT`) | **verified** | `migration.sql:627–631` |
| The schema and migration contain no known defect | **as recorded** | File C §15.4 |
| G-1 remains **FAILED**: a no-change diff proposes six destructive statements (five `DROP CONSTRAINT` + `DROP INDEX uq_question_sources_identity`, with no replacement) | **unchanged** | run `45381634139`, commit `6376d2a`; File C §4 |
| G-3 remains **PASSED** on the full schema with negative tests | **unchanged** | run `45372731345`; File C §5 |
| V-1…V-5 completed and recorded | **unchanged** | run `45372731513`; File C §7 |

G-1 is **not** re-scored, waived or reinterpreted by anything in this review.

### B. Migration workflow

The authorisation boundary is analysed in §6.

### C. Collation and fingerprint

Assessed in §7.1–§7.2.

### D. Index integrity

Coverage assessed in §7.3.

### E. Existing-data compatibility

Assessed in §8.

### F. Application enforcement

| Claim | Status | Evidence |
|---|---|---|
| Route handlers | **0** | `find app -name 'route.ts*'` → 0 |
| Server actions | **0** | `grep -rl 'use server' app lib server` → 0 |
| Imports of publish/type-change services outside `server/` and tests | **0** | File C §9.1 |
| OD-17 (API wire contract) | **`OPEN`** | `technology-decisions.md:58`; `OD-17-DEPENDENCY.md` |
| Application-level enforcement of the integrity model | **not demonstrated** | no consumer exists to enforce anything |

Deployment today would create a schema **no running code reads or writes**, behind a contract that is not
approved.

---

## 6. Migration workflow authorization boundaries

What Option C + B1a actually cover, separated as the register requires:

| Activity | Authorised? | Source |
|---|---|---|
| **Schema snapshot comparison** (`migrate diff --from-migrations --to-schema-datamodel`, read-only, generating a diff artefact) | **yes**, within the controlled workflow | Option C, five conditions; `database-migrations.md:23–43` |
| **Migration generation** as a reviewed artefact (V-1 demonstrated a second migration can be authored) | **yes**, as an authoring activity | V-1; File C §7 |
| **Migration review** against the diff and the migration text | **yes**, as a process obligation | Option C conditions |
| **Migration validation** (G-3 full-schema gate, deploy gate checksums, catalog assertion, post-deployment enforcement suite) | **yes**, as CI/repository validation | G-3 `PASSED`; `deploy-gate.sh` |
| **Production migration authorisation** | **NO** | B1b `NOT APPROVED`; B2 `WITHHELD`; condition 3 of B1a |
| **Production creation of C-1…C-5** | **NO** | B2 `WITHHELD` |
| **Deploying without Part D (B1c)** | **NO** | `NOT APPROVED` |
| Dropping C-1…C-5 to unblock a deployment | **NO** | B1c; File C §12 |
| Relaxing any prohibition (`migrate dev`, `migrate reset`, `db push`, `diff --from-migrations`) | **NO** — these are approved conditions, not conventions | `database-migrations.md:23–43`, condition 4 |

**A workflow approval is not a permission to execute a production migration.** Option C governs *how* a
migration may be produced and checked; B1b and B2 govern *whether* it may exist in production, and neither is
approved.

---

## 7. Collation and index integrity assessment

### 7.1 Environment evidence

| Item | Value | Status |
|---|---|---|
| CI PostgreSQL | `16.16` (`16.16-1.pgdg13+1`, Debian 13/trixie) | **CI-observed** |
| CI encoding / provider | `UTF8` / `libc` | **CI-observed** |
| CI `datcollate` / `datctype` | `en_US.utf8` / `en_US.utf8` | **CI-observed** |
| CI `daticulocale` / `datcollversion` | NULL / `2.41` | **CI-observed** |
| Observed fingerprint | `collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=en_US.utf8;ctype=en_US.utf8;iculocale=-;collversion=2.41` | **CI-observed**, run `45546248909`, check run `138976563830` |
| Production profile (every field) | **`UNKNOWN`** | never measured |
| CI ↔ production equivalence | **`NOT ESTABLISHED`** | never paired |
| ICU; PostgreSQL 15/17/18; `en_US.utf8` vs `C.utf8` folding | **`NOT TESTED`** | no environment available |

### 7.2 Fingerprint v1 limitations, all still present

Eight `;`-separated segments = 1 discriminator + 7 values (six catalog fields + derived `pg`). Not resolved:
database identity is an assertion, never serialized; cluster identity is not captured at all; per-index metadata
is a separate document; the `d` provider is `database_default` in the profile and `unknown` in the string
(`collation-probe.sh:121–146` vs `:149–164`); `provider=unknown` is not rejected; `-` is ambiguous with a legal
value; there is no delimiter validation or escaping; empty (`key=`) and absent fields are indistinguishable to a
positional reader. **No comparator and no approved expectation exist**, so no run can pass or block anything.

### 7.3 Index integrity coverage

| Layer | Exists? | Coverage |
|---|---|---|
| Name inventory (six indexes counted by name) | **yes**, inside G-3 | catches a **drop** only; a same-named index recreated without `NULLS NOT DISTINCT` passes |
| Catalog assertion over C-1…C-5 + seven tables | **yes**, `guard.py catalog` | five composite FKs and their columns/actions; **no index definitions** |
| Structural definition comparison (expression, predicate, opclass, NND, key order, INCLUDE, validity, access method) | **no** | design only; 25-case prototype never committed |
| Per-index collation expectations (`none` × 8, `database_default` × 3) | **no** | R2 §12.1, `PARTIALLY RESOLVED` |
| Drift classification / response | **no** | 33 classifications, four states, all `PROPOSED` |

**A complete structural index guard does not exist**, and the measured blind spots are unchanged:
`guard.py catalog` exits 0 with a protected index dropped and with `NULLS NOT DISTINCT` removed.

---

## 8. Existing-data compatibility assessment

| Claim | Status |
|---|---|
| An existing-data collision audit has been executed | **No** — never, anywhere |
| Any production (or staging) data has been scanned, sampled or read | **No** |
| An audit script, query, artefact schema or CI data step exists | **No** — repository-wide search finds none |
| The audit scope is two collation-sensitive unique indexes, not six | **Yes** — `uq_tags_name_lower`, `uq_colleges_name_lower`; three indexes are non-collatable, one is non-unique |
| Candidate-key semantics depend on OD-COLL-01/02 | **Yes** — the decisive query has a missing operand until they are answered |
| Environment and fingerprint requirements depend on OD-COLL-03/04 | **Yes** — the report must record the environment; the profile decides what `default` means |
| An approved audit specification would authorise a run | **No** — six stages, separately authorised; stage 1 authorises reading only |
| Any collision count, volume or finding is known | **No** — none exists, and none may be stated |
| `colleges.code` is an identity key | **No** — nullable, non-unique, unread by any code |

The audit's own limitation is preserved: **zero observed collisions ≠ semantic compatibility**, and a *narrower*
candidate cannot be certified by a collision report at all — it needs the reverse counterfactual (pairs equal
today, unequal under the candidate).

---

## 9. Application enforcement and operational prerequisites

### 9.1 Application enforcement

| Item | State |
|---|---|
| HTTP surface | **none** (0 route handlers, 0 server actions) |
| Services | implemented and tested — `publishVersion`, `changeQuestionType`, DTO allowlists, `P2002` mapping, content catalogue |
| Consumers of those services | **none outside tests** |
| Wire contract (OD-17) | **`OPEN`** — transport, error envelope, field-path format undecided |
| Consequence | the schema would be deployed with no consumer and no approved boundary contract; the first real API becomes the first real test |

### 9.2 Operational prerequisites (File C §10, unchanged)

| # | Requirement | State |
|---|---|---|
| 1–2 | backup and backup-integrity drill | drill exists on disposable infrastructure; **no production backup, schedule, retention or storage location** |
| 3 | restore / RTO | restore verified into an empty database; **no duration measured, no RTO/RPO, no PITR policy** |
| 4 | operator runbook | **no committed runbook** for pre-deploy, deploy and post-deploy |
| 5 | migration execution procedure | gate exists; **no named operator, no change window, no go/no-go** |
| 6 | rollback | **none** — forward-only; restore or compensating migration |
| 7 | credentials and access | **no production credential model** |
| 8 | monitoring / alerting | **none** |
| 9 | responsibilities | **no RACI**; approval checkpoints exist only in the register |
| 10 | operational targets | **OD-22 `OPEN`** |
| 11 | post-deploy catalog assertion | guard exists; **no committed production step runs it** |
| 12 | evidence ownership / retention | **OD-26-1 / OD-26-5 are recommendations, not ratified** |
| — | privacy, retention, audit access | **OD-20 `OPEN`** |

---

## 10. Final deployment gate matrix

Statuses use only source-recorded vocabulary. "Resolvable in this phase?" is `no` throughout: this phase is
closing, not continuing.

| # | Gate ID | Requirement | Current evidence | Current status | Missing prerequisite | Resolvable in this phase? | Explicit authorisation required? |
|---|---|---|---|---|---|---|---|
| 1 | **OD-COLL-01** | tag uniqueness semantics decided | brief + worksheet + register | **`OPEN`** | owner answer + E-6 tag data | no | **yes** (owner) |
| 2 | **OD-COLL-02** | college identity semantics decided | same | **`OPEN`** | owner domain statement (can two distinct colleges share a name?) | no | **yes** (owner) |
| 3 | **OD-COLL-03** | production profile decided | brief + worksheet + CI observation | **`OPEN`** | target selection + measurement | no | **yes** (owner) |
| 4 | **OD-COLL-04** | fingerprint specification decided | brief + worksheet | **`OPEN`** (8 elements) | field/serialization/identity/delimiter answers | no | **yes** (owner) |
| 5 | **OD-COLL-05** | drift failure policy decided | brief + worksheet | **`OPEN`** (core decidable, value rows not) | 03 values + 04 artefact | no | **yes** (owner) |
| 6 | **OD-COLL-06** | audit requirements decided | brief + worksheet | **`OPEN`** (process core) | 01/02 candidate key | no | **yes** (owner) |
| 7 | **DB-1** | production database identity and profile evidence | none | **`UNKNOWN`** | one read-only measurement: major, encoding, provider, locale, `datcollversion`, target database | no | **yes** (access authorisation) |
| 8 | **DB-2** | production locale/provider selection | none | **`NOT DECIDED`** | OD-COLL-03 answer | no | **yes** |
| 9 | **FP-1** | fingerprint specification approval | v1 artefact measured, specification unapproved | **`NOT APPROVED`** | OD-COLL-04 answer | no | **yes** |
| 10 | **FP-2** | expected-profile / comparator implementation | nothing exists | **`NOT IMPLEMENTED`** | implementation authorisation + code | no | **yes** (implementation) |
| 11 | **DR-1** | drift failure policy approval | 33 classifications `PROPOSED` | **`NOT APPROVED`** | OD-COLL-05 answer | no | **yes** |
| 12 | **IX-1** | structural index guard implementation | design + uncommitted prototype | **`NOT IMPLEMENTED`** | implementation + CI wiring | no | **yes** (implementation) |
| 13 | **DA-1** | existing-data audit specification approval | 10 steps / 17 fields / 10 classifications `PROPOSED` | **`NOT APPROVED`** | OD-COLL-06 answer | no | **yes** |
| 14 | **DA-2** | audit capability + execution authorisation | no capability exists | **`NOT EXECUTED`** / **`NOT AUTHORIZED`** | implementation authorisation, then stage-1 read authorisation | no | **yes** (two separate) |
| 15 | **DA-3** | collision remediation approval, if collisions are found | no audit has run | **`NOT APPLICABLE — NO FINDINGS`** | an audit result first; then a named per-row plan | no | **yes** (owner) |
| 16 | **B1b** | deploy 0001 **including** C-1…C-5 | File C §12 | **`NOT APPROVED`** | explicit approval overriding G-1 + operational readiness + index control | no | **yes** (owner) |
| 17 | **B2** | production authorisation / creation of C-1…C-5 | File C §13 | **`WITHHELD`** | explicit approval; separate from B1b | no | **yes** (owner) |
| 18 | **MV-1** | migration validation | G-3 `PASSED`, V-1…V-5 recorded, deploy gate checksums | **`PASSED (CI/repository)`** | **production** validation does not exist; G-1 remains `FAILED` | no | no (evidence exists) |
| 19 | **APP-1** | application enforcement | 0 consumers; OD-17 `OPEN` | **`NOT DEMONSTRATED`** | OD-17 answer + a wired consumer | no | parity with Q-3 |
| 20 | **OPS-1** | production backup / recovery / RTO-RPO / monitoring / credentials | drill only | **`NOT READY`** | runbook, measured RTO, monitoring, credential model (OD-22) | no | **yes** (owner pairing) |
| 21 | **AUTH-1** | explicit production migration authorisation | none | **`NOT GRANTED`** | B1b + B2 + all prerequisites above | no | **yes** |

**No gate is `PASSED` because its documentation exists.** MV-1 passes on repository/CI evidence and on nothing
else; every other row is open, withheld, not approved, not implemented, not executed or unknown.

---

## 11. Final readiness verdict

### 11.1 Verdict

**PHASE 04A DECISION-PREPARATION REVIEW COMPLETE — PRODUCTION DEPLOYMENT NOT READY — NO PRODUCTION
AUTHORIZATION.**

### 11.2 What is proven

- The schema is complete and correct against its specification: 18 tables, 7 enums, 26 FKs, 47 CHECKs, six
  hand-maintained indexes (including `uq_question_sources_identity` with `NULLS NOT DISTINCT`), five composite
  FKs — all re-verified in this session.
- The controlled workflow (Option C) is operational and negative-tested: G-3 `PASSED` on the full schema;
  V-1…V-5 recorded; the deploy gate refuses unverifiable states.
- The G-1 hazard is measured, not hypothesised: six destructive statements from a no-change diff.
- The CI collation profile is observed exactly, with its fingerprint recorded.
- Every failure mode that matters has a name, a state and an owner in the record.

### 11.3 Why deployment is not authorised

1. **No owner decision exists.** Six questions are framed; zero are answered. A framed question authorises
   nothing.
2. **Production is unmeasured.** Every production collation fact is `UNKNOWN`; the locale is `NOT DECIDED`;
   CI equivalence is `NOT ESTABLISHED`.
3. **No control would notice the failure this schema is most exposed to.** No structural index guard, no
   comparator, no expectation file, no drift classifier — and the measured gap (`guard.py catalog` exit 0 on a
   dropped or weakened index) is unchanged.
4. **The destructive path remains live and ungated for the live catalog.** The deploy gate verifies history;
   the catalog assertion covers five FKs, not six index definitions.
5. **There is no consumer.** Zero route handlers, zero server actions, OD-17 `OPEN`.
6. **Operational readiness is a plan, not a procedure.** No runbook, no measured RTO, no monitoring, no
   production credential model; OD-20 and OD-22 are `OPEN`.
7. **B1b and B2 are separate and both unapproved.** B1b overrides G-1 only by explicit approval; B2 withholds
   production creation of C-1…C-5. Neither is implied by Option C, B1a, G-3 or V-1…V-5.

### 11.4 The distinction this verdict preserves

| Completed | Not completed |
|---|---|
| the decision-preparation phase (documents, options, dependencies, evidence register) | production readiness (measurement, decisions, controls, operations) |
| repository-level validation of schema and workflow | production-level validation of anything |
| framing of six decisions | resolution of any of them |

**A documentation review is not an implementation approval, and a passed CI test is not production readiness.**

---

## 12. Bounded remaining-work plan

Five groups, in order. Each item names a required outcome, its dependency, the evidence that would close it, and
whether owner approval is needed. Nothing here is a multi-session roadmap; it is the shortest honest path to
reopening deployment consideration.

### 12.1 Owner decisions

| # | Required outcome | Dependency | Evidence for closure | Owner approval |
|---|---|---|---|---|
| O-1 | OD-COLL-01 answered by option title | none | a recorded decision with rationale and trade-offs | **yes** |
| O-2 | OD-COLL-02 answered by option title | none | same, plus the domain statement on shared names | **yes** |
| O-3 | OD-COLL-04's layering, field set and identity binding answered | none (probe output already recorded) | a recorded decision per element | **yes** |
| O-4 | OD-COLL-03 answered as a target profile + confirmation standard | 04's field set for expressibility | a recorded target and the nine-fact measurement standard | **yes** |
| O-5 | OD-COLL-05's core answered; value-dependent rows marked pending | O-3, O-4 | a recorded policy + explicit "pending 03/04" statement | **yes** |
| O-6 | OD-COLL-06's process answered (scope, report, snapshot, gates) | O-1, O-2 for candidate-key content | a recorded process decision + 06-Q1…Q10 answers | **yes** |

### 12.2 Production evidence collection

| # | Required outcome | Dependency | Evidence for closure | Owner approval |
|---|---|---|---|---|
| E-1 | the nine mandatory production facts, read once, read-only | O-4 (the standard) + access authorisation | a recorded measurement: major, encoding, provider, locales, `datcollversion`, target database identity | **yes** (access) |
| E-2 | `en_US.utf8` vs `C.utf8` behaviour known | none — local, cheap | a re-run fold matrix on a disposable cluster with the locale installed | no |
| E-3 | production volumes and reference counts known | an authorised audit run (§12.4) | a report per the approved format | **yes** |

### 12.3 Implementation authorisation and implementation

| # | Required outcome | Dependency | Evidence for closure | Owner approval |
|---|---|---|---|---|
| I-1 | structural index guard over the six indexes, textual + catalog + negative test | O-6 (scope) | committed code, CI wiring, a negative test that fails closed | **yes** (implementation) |
| I-2 | expectation file + comparator | O-3 (field set, serialization) | committed comparator refusing cross-version and malformed input | **yes** |
| I-3 | audit capability (read-only script + report emitter) | O-6 | committed code, reviewed SQL, a dry run on a snapshot | **yes** |

### 12.4 Validation and audit

| # | Required outcome | Dependency | Evidence for closure | Owner approval |
|---|---|---|---|---|
| A-1 | audit executed against the target snapshot | I-3 + stage-1 read authorisation | a report with scope, snapshot, limitations and the ten classifications | **yes** (read) |
| A-2 | collisions resolved or accepted, with a named plan if any exist | A-1 | per-group decisions; a reviewed remediation plan if needed | **yes** |
| A-3 | post-remediation revalidation and final consistency check | A-2 | a fresh report immediately before any build | **yes** |
| A-4 | guard and comparator exercised against a real pass and a real block | I-1, I-2 | two recorded runs, one green and one red for the right reason | no |

### 12.5 Separate deployment approval

| # | Required outcome | Dependency | Evidence for closure | Owner approval |
|---|---|---|---|---|
| D-1 | B1b decided explicitly, accepting or refusing the G-1 override | all of the above, plus operational readiness | a recorded B1b decision | **yes** |
| D-2 | B2 decided explicitly | D-1 | a recorded B2 decision granting production creation of C-1…C-5 | **yes** |
| D-3 | operational readiness set closed (runbook, measured RTO/RPO, monitoring, credential model) | OD-22 | the artifacts themselves, not a plan | **yes** (OD-22) |
| D-4 | OD-17 answered (wire contract, or a deliberate schema-first choice) | none internal | a recorded OD-17 decision | **yes** |
| D-5 | the production migration itself authorised | D-1…D-4 | a scoped, dated authorisation naming the operator and the window | **yes** |

**No item in §12.5 can be reached without §12.1–§12.4, and no combination of approvals here authorises a
migration in advance of them.**

---

## 13. Explicit non-authorisations

This review authorises **none** of the following:

- any of the six owner decisions, or any option within them;
- selecting a production locale, provider or PostgreSQL major;
- pinning a production fingerprint, approving a fingerprint format, or approving auto re-pinning;
- implementing the structural index guard, a comparator, an expectation file, a drift classifier or an audit;
- executing any audit, query or scan; merging, renaming or deleting any data;
- creating, replacing or dropping any index;
- modifying `prisma/schema.prisma`, migration 0001, or creating migration 0002;
- modifying any probe, script, guard, workflow, test or `package.json`;
- authorising B1b, B1c or B2, or migration 0001 for production;
- starting, connecting to or querying any database, in production, staging or locally;
- applying the previously proposed S-1 pointer paragraph to File C §11;
- staging, committing, pushing, opening a PR, merging or deploying.

---

## 14. Source traceability

### 14.1 Documents reconciled

| Document | Lines | SHA-256 (first 16) |
|---|---|---|
| `docs/database/phase-04a-final-database-deployment-decision-package.md` | 957 | `dc03e1a44a768361` |
| `docs/database/phase-04a-owner-decisions-consolidated-register.md` | 815 | `a5f2a68ff2b60304` |
| `docs/database/phase-04a-owner-review-readiness-and-decision-handoff.md` | 661 | `38decec31a9d3193` |
| `docs/database/phase-04a-collation-decision-package-consolidation-audit.md` | 696 | `7d8af8f9962c2081` |
| `docs/database/phase-04a-od-coll-01-02-owner-decision-worksheet.md` | 504 | `35ed3d5e285b0f0e` |
| `docs/database/phase-04a-od-coll-03-04-owner-decision-worksheet.md` | 679 | `9b67a4e1e9d36f06` |
| `docs/database/phase-04a-od-coll-05-06-owner-decision-worksheet.md` | 803 | `8aee196c1bc6f8e3` |
| `phase-04a-od-coll-01-02-uniqueness-semantics-decision-brief.md` | 722 | `0e733903e5c9db7a` |
| `phase-04a-od-coll-03-production-collation-profile-decision-brief.md` | 630 | `eed8897c9fa8d0fc` |
| `phase-04a-od-coll-04-collation-fingerprint-specification-decision-brief.md` | 767 | `7c1707fd5d3b0f27` |
| `phase-04a-od-coll-05-collation-drift-failure-policy-decision-brief.md` | 801 | `61e3ddd0d9ff23a2` |
| `phase-04a-od-coll-06-existing-data-compatibility-decision-brief.md` | 707 | `ba89956d0cbe45d5` |
| `phase-04a-index-integrity-guard-design.md` | 795 | design only, no committed guard |
| `phase-04a-index-collation-r2-investigation.md` | 834 | `aab45341e1c05094` |
| `phase-04a-ci-collation-profile-measurement-proposal.md` | 1044 | `349607f894780032` |
| `phase-04a-database-collation-product-and-environment-decision.md` | 1105 | `50005a91cb883bad` |

### 14.2 Repository facts re-derived in this session

`prisma/migrations/0001_phase04a_question_bank/migration.sql` — 708 lines, `bf2fc840ebae92ca…`; counts via
`grep -c` (§3.1); `prisma/migrations/` contains 0001 + `migration_lock.toml` only; `find app -name 'route.ts*'`
→ 0; `grep -rl 'use server' app lib server` → 0; `guard.py` contains **0** occurrences of `collation`,
`pg_index`, `indcollation` or `collversion`; `collation-probe.sh:15` and `:77` state it is not a guard and does
not compare.

### 14.3 Discrepancies preserved (not resolved here)

| ID | Discrepancy | Handling |
|---|---|---|
| D-1 | G-3 run cited as `45372731345` in File C §1/§5, and as `45273840004` in the register the B1a approval rests on | recorded in handoff S-5; **not re-litigated**; `G-3 PASSED` unchanged |
| D-2 | `EXACT_MATCH` carries two meanings (fingerprint equality in 04; all-layer verdict in 05) | documented overlap; never quoted interchangeably |
| D-3 | `UNKNOWN_OR_UNCLASSIFIED_CHANGE` classified `REVIEW_REQUIRED` but described as "fail closed" | outcome identical (both halt); state name per the class table; left open |
| D-4 | `d` provider: `database_default` in the profile document, `unknown` in the fingerprint string | owned by OD-COLL-04 Q6; open |
| D-5 | register "six fields" vs seven values in eight segments | resolved by reference: six catalog fields + derived `pg` |
| D-6 | five audit stages (01-02 §9.2) vs six (06 §2.2) | compatible; 06 §2.2 governs audit stages |

### 14.4 Standing statuses reproduced unchanged

G-1 **FAILED** · G-3 **PASSED** · Option C **APPROVED — controlled migration workflow only** · B1a **APPROVED
(workflow-scoped)** · B1b **NOT APPROVED** · B1c **NOT APPROVED** · B2 **WITHHELD** · migration 0001 **NOT
AUTHORIZED for production deployment** · migration 0002 **DO NOT COMMIT** · G-2 **DEFERRED** · **T1 CLOSED** ·
**R2 PARTIALLY RESOLVED** · **OD-COLL-01…06 `OPEN`** · OD-17 `OPEN` · OD-20 `OPEN` · OD-21 `OPEN` · OD-22 `OPEN` ·
OD-NM-1 `OPEN`. CI profile **OBSERVED**; production profile **UNKNOWN**; production locale **NOT DECIDED**;
CI↔production equivalence **NOT ESTABLISHED**.

---

## 15. Revision history

| Revision | Date | Change |
|---|---|---|
| 1 | 2026-11-24 | Final database deployment decision review (Session 34), closing the Phase 04A decision-preparation phase. Re-derives the schema inventory from migration 0001 (18 / 7 / 26 / 47 / 6 / 5), reconciles all six `OPEN` owner decisions against register, worksheets and briefs, verifies every standing gate, separates workflow authorisation from production authorisation, assesses the six evidence categories, presents a 21-row deployment gate matrix, records the verdict and a bounded five-group remaining-work plan. **No owner decision was made, no option selected, no gate changed, no source document edited, no database contacted, and no production authority created.** |

**Closing statement.** The decision-preparation phase ends here: every question is framed, every option is
named, every missing fact has an owner, and every gate has a status. Production deployment is **not** ready,
**not** authorised, and **not** made closer by the existence of this document. The next step is an owner
decision, not another review.
