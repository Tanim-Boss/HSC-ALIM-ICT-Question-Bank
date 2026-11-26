# Phase 04A — OD-COLL-05: Collation Drift Failure Policy — Owner Decision Brief

**Date:** 2026-11-24
**Repository:** `Tanim-Boss/HSC-ALIM-ICT-Question-Bank`
**Branch:** `arena/49496cf8-hsc-alim-ict-question-bank`
**HEAD when written:** `4d04e4461338ea5931d26faf67d312fbed21de43`
**Subject:** **OD-COLL-05** — *when the observed database environment, collation metadata or protected
index properties differ from approved expectations, what must the guard do?*
**Nature:** documentation only. Nothing was implemented, configured, migrated, deployed, committed or pushed;
no production or staging system was contacted; no database was created, started or queried.

Labels used throughout: `VERIFIED` (read from a committed artifact or an already-recorded CI run) ·
`OBSERVED` (measured earlier, in a disposable environment, cited as recorded) · `DERIVED` · `PROPOSED` ·
`UNKNOWN` · `NOT TESTED` · `OPEN`.

**Standing statement:** OD-COLL-05 defines the *response* to a difference. It does not create an approved
profile, an approved fingerprint, an implemented guard, or a production authorisation. A policy — even an
approved one — is not a deployment approval, and this brief approves nothing.

---

## 1. Executive verdict

### **OD-COLL-05 DECISION BRIEF PREPARED — COLLATION DRIFT FAILURE POLICY REMAINS OPEN**

Six findings structure the brief:

1. **There is no drift gate to configure.** What exists is a set of *partial* controls (§3.1): a repository
   command guard, a deployment-path router, a checksum gate over applied migration history, a five-FK catalog
   assertion, and a **read-only collation measurement**. Nothing compares a measurement against an approved
   expectation, because no approved expectation exists and `guard.py` has no collation or index awareness.
2. **The measured false negatives are real and unchanged.** With an index dropped, `guard.py catalog` exits
   **0**; with `uq_question_sources_identity` recreated *without* `NULLS NOT DISTINCT`, it exits **0**; the
   G-3-style name count catches the **drop** (5 vs 6) and misses the **weakening**. Those are measurements,
   not opinions (§3.5), and they are **not fixed**.
3. **Most of the classification vocabulary is specifiable today; the comparison is not.** Identity, missing
   index, definition mismatch, invalid index, malformed input, unsupported provider and guard-execution
   failure can all be classified independently of OD-COLL-04. Field-by-field *environment* classification
   depends on OD-COLL-04's representation, and any `EXACT_MATCH` verdict depends on OD-COLL-03's values (§12).
4. **`EXACT_MATCH` is unreachable by construction today** — there is no approved expectation to match. Every
   current run is therefore at most `INFORMATIONAL`, and the policy's first job is to say so rather than
   invent a pass.
5. **`REVIEW_REQUIRED` must halt, not continue.** The severity model proposed here treats review as a stop
   with a route, not a warning with a shrug; only `INFORMATIONAL` permits continuation, and only because it
   establishes no integrity implication (§5).
6. **Recovery has no guarantees beyond what was measured.** Migration 0001 is forward-only with no rollback
   (`deploy-gate.sh`, decision package §12.2); restore is the documented recovery path; a failed
   *pre-deployment* check and a defect found *after* apply are different problems with different remedies, and
   neither is authorised here (§11).

**Status of the decision: `OPEN — COLLATION DRIFT FAILURE POLICY NOT APPROVED`** (§13).

---

## 2. Decision scope

### 2.1 What the register asks

`docs/database/phase-04a-database-collation-product-and-environment-decision.md` **§12**:

> **OD-COLL-05** | What is the failure policy when the environment drifts? | R-FAIL everything · R-FAIL
> unknown-field changes and R-WARN on NULL versions · R-WARN everything · R-ALLOW per listed profile · auto
> re-pin | §9.1–§9.4; measured E8 (restore changes uniqueness silently); Session 14 §10.7 (`datcollversion`
> NULL **locally**; `REFRESH VERSION` refused) · **Revision 2**: CI reports `2.41`, so the R-REPIN branch is
> reachable there | **Recommended for consideration:** fail closed (R-FAIL) for every *known* field change and
> for every unresolvable expectation; **R-WARN** only where the catalog genuinely cannot distinguish (NULL
> `collversion`); **R-REPIN** only via a reviewed expectation commit; **never** auto re-pin (§9.4) | **`OPEN`**
> | the guard has no defined behaviour on drift; a future restore could pass the gate; or, if over-strict,
> every libc deployment blocks on an uncomparable field.

The register's four response types (§9.1) are `R-FAIL`, `R-WARN`, `R-REPIN`, `R-ALLOW`, and §9.4 forbids
auto re-pin. This brief keeps that vocabulary addressable, maps it onto a four-state severity model (§5), and
adds the structural and behavioural classes the register's environment-only framing does not cover.

### 2.2 The three questions, kept apart

| Question | Decision | State |
|---|---|---|
| Which environment is production allowed to have? | **OD-COLL-03** | `OPEN` |
| What is measured, in what form? | **OD-COLL-04** | `OPEN` |
| What happens when measurement ≠ expectation? | **OD-COLL-05** | `OPEN` |

A rule in this document therefore always names the decision it depends on. Where a rule cannot be stated
without an unapproved field set or an unapproved profile, it is marked `BLOCKED ON OD-COLL-04` or
`BLOCKED ON OD-COLL-03` rather than written as if the gap did not exist.

### 2.3 What this document is not

- It does not implement, wire or configure any check; there is no gate to configure (§3.1).
- It does not select a production locale, provider or PostgreSQL major.
- It does not authorise migration 0001 for production, nor **B1b**, nor **B2**, nor any part of the drift
  policy's own implementation.
- It does not close OD-COLL-01…06, and it does not reinterpret G-1, G-3, R2 or T1.

---

## 3. Existing implementation and evidence baseline

### 3.1 What exists, exactly — implemented, demonstrated, proposed

`VERIFIED` by reading the committed files. "Implemented" means it runs today and its exit code decides
something; "demonstrated" means a disposable lab run produced the behaviour, with no committed code; "proposed"
means documents only.

| Control | Path | Lines | Status | What it actually decides |
|---|---|---|---|---|
| Repository command guard | `docs/database/g1-spike/option-c/repo-guard.sh` | 371 | **implemented**, run in CI | no executed surface invokes `prisma migrate dev`/`reset`/`db push` |
| Deployment-path guard | `scripts/db/deploy-path-guard.py` | 394 | **implemented** | every repository-controlled `migrate deploy` goes through `deploy-gate.sh` |
| Checksum gate | `scripts/db/deploy-gate.sh` | 249 | **implemented** | applied `_prisma_migrations.checksum` matches files on disk; fail-closed on every "cannot verify" |
| Migration disabled shim | `scripts/db/migrate-disabled.sh` | 65 | **implemented** | `npm run db:migrate` refuses |
| Protected-FK guard | `docs/database/g1-spike/option-c/guard.py` | 279 | **implemented**, run in CI | five composite FKs exist with approved columns and actions; migration text keeps them; history checksums |
| G-3 full-schema gate | `.github/workflows/phase04a-g3-full-schema-gate.yml` | — | **implemented**, `G-3 PASSED` | 33 enforcement cases, inventory `18/7/26/47`, catalog assertion, replay |
| Collation measurement | `docs/database/g1-spike/option-c/g3-full/collation-probe.sh` | 468 | **implemented** | nothing — it **measures and reports**; it fails only when it did not measure what it claims |
| Six-index structural guard | design only (`…-index-integrity-guard-design.md`) | — | **demonstrated, not implemented** | a disposable prototype ran a 25-case matrix; no committed code |
| Collation expectation / diverter | design only (R2 §12, decision doc §11) | — | **proposed** | nothing exists |
| Fingerprint comparison / drift classifier | — | — | **proposed** | nothing exists (OD-COLL-04 §3.6) |
| Production deployment path | — | — | **does not exist** | no workflow deploys to production |

**Two consequences that must not be blurred:**

- The deploy gate is real, but it verifies **migration history**, not the **live catalog**. A correctly
  checksummed *new* migration can weaken an index and the gate will pass it (`guard.py` header states the
  textual check is "necessary but NOT sufficient").
- The probe is real, but it is a **measurement**: `collation-probe.sh:6–26` says in its own header that it is
  not a guard, does not compare, and does not enforce a locale.

### 3.2 G-1 — the failed drift condition

| Item | Value | Label |
|---|---|---|
| Run | `45381634139`, commit `6376d2a6e7…` | `VERIFIED` |
| What was measured | a **no-change** database→datamodel `prisma migrate diff` on the real schema and PostgreSQL 16 | `VERIFIED` |
| Result | **six destructive statements**: five composite FK drops (C-1…C-5) and one index drop (`uq_question_sources_identity`) | `VERIFIED` |
| Output size | 513 bytes, 6 statements | `VERIFIED` |
| Executed? | **no** — no destructive SQL was run | `VERIFIED` |
| Status | **G-1 FAILED** | `VERIFIED` |

G-1 is the reason a drift *policy* exists at all: the ordinary migration path does not preserve the
constraints, so the guard must notice when they are absent or weakened.

### 3.3 CI collation profile — measured, CI-only

```text
collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=en_US.utf8;ctype=en_US.utf8;iculocale=-;collversion=2.41
```

PostgreSQL `16.16` (`16.16-1.pgdg13+1`, Debian 13/trixie), UTF8, `libc`, `en_US.utf8`/`en_US.utf8`,
`daticulocale` NULL, `datcollversion = 2.41`; `g3f_main` and `g3f_replay` matched byte-for-byte (run
`45546248909`, check run `138976563830`, commit `0aae1368a16cf6447cb7a01afc7554a9fdab4bc0`).

**This is CI evidence only.** The production profile is `UNKNOWN`; the production PostgreSQL major is
`UNKNOWN`; production provider, locale and collation version are `UNKNOWN`; matching fingerprints do not prove
equivalent comparison behaviour; `datcollversion` must not be assumed NULL for libc; CI's ASCII-only G-3 cases
do not establish Unicode uniqueness behaviour.

### 3.4 Probe limitations carried into this policy

`VERIFIED` in Session 24 (`…od-coll-04-collation-fingerprint-specification-decision-brief.md` §3):

| Limitation | Consequence for a drift policy |
|---|---|
| No approved fingerprint specification | there is no expectation to compare against |
| No automated comparison anywhere | every "match" recorded so far was read by a human |
| `guard.py` does not consume the fingerprint | the fingerprint cannot influence any exit code today |
| Identity is a **name** assertion, not a cluster identity | a same-named database on another cluster would pass |
| Probe metadata is not a structural verifier (no expression text, no INCLUDE, no `indoption`, no `pg_am`) | structural drift needs the unimplemented guard |
| Provider `d` is `database_default` in the profile document and `unknown` in the fingerprint | a `d` database cannot be classified from the string |
| Missing fields and missing **indexes** already fail in the probe; unsupported provider and serialization cases do not | fail-closed is partial, and unevenly so |
| `-` sentinel collision and no delimiter validation | a malformed-string classification cannot be precise until OD-COLL-04 resolves it |

### 3.5 Index integrity — the measured gap that has not been fixed

The six protected, hand-maintained indexes (unchanged inventory):

1. `uq_question_versions_one_published_per_question` (partial)
2. `uq_question_sources_identity` (`NULLS NOT DISTINCT`)
3. `uq_topics_chapter_order` (partial)
4. `uq_tags_name_lower` (expression)
5. `uq_colleges_name_lower` (expression)
6. `ix_question_assets_checksum` (partial)

Measured on a disposable PostgreSQL 16.2 cluster (`…-index-integrity-guard-design.md` §2.2) — **these are exit
codes, not readings**:

| Tampering | Existing control | Exit | Meaning |
|---|---|---|---|
| migration text drops `uq_question_sources_identity` alongside a legitimate C-1 drop/re-add | `guard.py sql` | **0** | accepted — invisible to it |
| migration text replaces the expression index with a plain column unique of the same name | `guard.py sql` | **0** | accepted — uniqueness silently weakened |
| live database, index **dropped** | `guard.py catalog` | **0** | "all five protected composite FKs present" — true and irrelevant |
| live database, index recreated **without** `NULLS NOT DISTINCT` | `guard.py catalog` | **0** | same |
| same weakened database | G-3-style name count | **6** | "all six present" |
| database with the index dropped | G-3-style name count | **5** | caught — the only existing control that notices, and only a **drop** |

**No part of this gap is fixed.** The design that would close it is `PROPOSED`; its 25-case matrix was run
against a throwaway prototype and never committed.

### 3.6 Deployment boundaries preserved

| Decision / artifact | Status | What it authorises |
|---|---|---|
| Option C | **APPROVED — controlled migration workflow only** | the `diff`/`deploy`/`status` workflow; five mandatory safeguards |
| B1a | **APPROVED, workflow-scoped** | using Option C; **not** production deployment |
| B1b | **NOT APPROVED** | deploying 0001 **with** C-1…C-5 to production — overrides G-1, therefore needs explicit approval |
| B1c | **NOT APPROVED** | dropping C-1…C-5 to unblock deployment |
| B2 | **WITHHELD** | production authorisation / production creation of C-1…C-5 |
| Migration 0001 | **NOT AUTHORIZED for production** | deploys in CI only |
| Migration 0002 | **DO NOT COMMIT** | — |
| G-1 / G-3 | **FAILED** / **PASSED** | — |
| T1 / R2 | **CLOSED** / **PARTIALLY RESOLVED** | — |

**OD-COLL-05 must not override B1b or B2**, and a drift policy — approved or not — does not authorise a
production migration (see §11.5, §15).

---

## 4. Drift classification model

Five layers, one classification vocabulary. Each classification lists its trigger, the evidence it requires,
the proposed severity, the required action, whether automatic continuation is allowed, whether owner approval
is required, and whether an implementation or deployment authorisation is separately required. Severity is
defined in §5.

**Naming overlap with OD-COLL-04 §8 — read this before quoting either table.** OD-COLL-04 classifies **13**
outcomes for the *environment artefact*; this section classifies **33** across five layers plus measurement
validity. `EXACT_MATCH` appears in both and does not mean the same thing: there it means "every field equals
the approved expectation" (fingerprint equality); here it means "every applicable approved expectation
verified, identity bound, no `BLOCK` condition present" (§4.1). A fingerprint match is one input to this
section's verdict and is never the verdict.

Five results that must not be substituted for one another:

| Result | What a match proves | What it does not prove | Where defined here |
|---|---|---|---|
| fingerprint / environment match | the recorded environment properties agree | that the target is the intended database; that any index is valid | OD-COLL-04 §8; Layer B, §6 |
| per-index collation metadata match | each protected key resolves to the approved collation | that the index definition, predicate, key order or operator class is intact | Layer C, §7 |
| structural index integrity match | the six definitions match `migration.sql`, predicates and `NULLS NOT DISTINCT` included | that the existing rows satisfy the rule | Layer D, §8 |
| behavioural compatibility | observed behaviour on the target matches the approved semantics on the inputs tested | anything about unmeasured inputs — ICU, PG 15/17/18 and `en_US.utf8` remain `NOT TESTED` | Layer E, §9 |
| overall deployment eligibility | nothing on its own: it is the conjunction of every applicable layer **plus** an authorisation | — | §5, §11 |

**None of the 33 classifications is implemented.** This is a proposed vocabulary: the repository contains
no drift classifier, no comparison layer and no expectation file, so nothing here can currently pass or
block a deployment by itself.

### 4.1 Layer A — target identity

| Classification | Trigger | Evidence required | Severity | Action | Auto-continue | Owner approval | Separate authorisation |
|---|---|---|---|---|---|---|---|
| `EXACT_MATCH` | every applicable approved expectation verified; identity bound; no `BLOCK` condition present | the expectation set, the observed artefacts, the identity assertion | **PASS** | record the verdict with the evidence references | yes (that is what a pass is) | no | no |
| `DATABASE_IDENTITY_MISMATCH` | observed database ≠ the identity the expectation is bound to | target assertion and observed `current_database()` | **BLOCK** (measurement invalid) | stop immediately; **the artefacts are not evidence** | no | no — it is a defect, not a policy choice | no |
| `WRONG_ENVIRONMENT` | the target is a staging/CI/local environment being used as production | environment marker + identity + the approved profile | **BLOCK** | stop; a staging profile is never a production profile | no | yes, to proceed at all | yes (deployment) |

**Can a staging profile be used for production?** **No.** CI and production equivalence is `NOT ESTABLISHED`
(§3.3 boundary), and the whole point of the policy is that an environment is approved on its own evidence.

### 4.2 Layer B — environment compatibility

| Classification | Trigger | Evidence required | Severity | Action | Auto-continue | Owner approval | Separate authorisation |
|---|---|---|---|---|---|---|---|
| `POSTGRES_MAJOR_CHANGE` | `pg` ≠ approved major | both artefacts, plus a support statement for the target major | **BLOCK until the major is approved** | stop; new compatibility review; re-pin is a reviewed commit | no | yes | yes (review; and OD-COLL-03 for the profile) |
| `ENCODING_CHANGE` | `enc` ≠ approved | both artefacts | **BLOCK** | stop; encoding changes can alter comparison byte semantics | no | yes | yes |
| `PROVIDER_CHANGE` | `provider` ≠ approved (e.g. `libc`→`icu`) | both artefacts, plus the provider's field applicability | **BLOCK** | stop; provider decides who implements `lower()` | no | yes | yes |
| `LOCALE_CHANGE` | `collate`, `ctype` or `iculocale` ≠ approved | both artefacts | **BLOCK** | stop; this is the E8 scenario — identical schema, different semantics | no | yes | yes |
| `COLLATION_VERSION_CHANGE` | `datcollversion` differs and both sides are populated | both versions; confirmation the indexes are valid | **REVIEW_REQUIRED** | stop; review the library change; re-pin only by reviewed commit | no | yes | yes (re-pin) |
| `COLLATION_VERSION_UNKNOWN` | `-` on one or both sides | the measurement; whatever the OS reports | **REVIEW_REQUIRED** + mandatory warning line | stop; a human records the acknowledgement | no | yes | yes |
| `MISSING_FIELD` | a required catalog field absent/unreadable | `fields_present`, server version | **BLOCK** ("cannot fingerprint") | stop | no | yes, to support that version | yes |
| `UNSUPPORTED_PROVIDER` | `provider = unknown`, or a provider with no defined field set | raw `datlocprovider`, the provider domain | **BLOCK** | stop; extend the domain by decision, never by inference | no | yes | yes |
| `NONDETERMINISTIC_COLLATION` | a collation used by a protected key is non-deterministic | `pg_collation.collisdeterministic` for the resolved object | **BLOCK** | stop; non-deterministic collations are prohibited by decision doc §7.5 | no | yes, to change the prohibition | yes |
| `MALFORMED_FINGERPRINT` | unparseable, empty, wrong prefix or wrong segment count | the raw text | **BLOCK** | stop; parse failure is never "no findings" | no | no | no |
| `EXPECTED_ENVIRONMENT_CHANGE` | a difference matches an **explicitly listed** approved transition | the allow-list entry, its scope, expiry and approver | **PASS, only on that entry** | continue within the entry's scope | yes, within scope | **yes** (the entry) | yes (the entry's authorisation) |

### 4.3 Layer C — per-index collation compatibility

| Classification | Trigger | Evidence required | Severity | Action | Auto-continue | Owner approval | Separate authorisation |
|---|---|---|---|---|---|---|---|
| `COLLATION_UNAVAILABLE` | the expected collation object cannot be resolved (dropped; locale not installed) | resolution result (`MISSING`/`AMBIGUOUS`), `pg_collation` | **BLOCK** | stop | no | yes | yes |
| `UNEXPECTED_EXPLICIT_COLLATION` | a key carries an explicit `COLLATE` where `database_default` is expected (`indcollation` 100 → 950 in the measured M10 case) | `pg_index.indcollation` vs the resolved default | **BLOCK** | stop; an explicit collation is a different object, not a different spelling of the same one | no | yes | yes |
| `PER_INDEX_COLLATION_MISMATCH` | a key's resolved collation ≠ the resolved expectation (`database_default`, `named`, `column`) | `pg_index.indcollation`, resolved OID + attributes | **BLOCK** | stop; the index no longer uses the approved object | no | yes (re-pin) | yes |
| `PER_INDEX_PROVIDER_OR_DETERMINISM_CHANGE` | the resolved collation's provider or determinism changed | `pg_collation` attributes | **BLOCK** | stop | no | yes | yes |
| `COLUMN_COLLATION_CHANGE` | a referenced column's `attcollation` changed (a coordinated change that rebuilds the index) | `pg_attribute.attcollation` vs the pinned expectation | **BLOCK** | stop; measured false negative otherwise (decision doc §9.2 #4) | no | yes | yes |
| `EXPECTATION_UNRESOLVABLE` | the symbolic expectation cannot be resolved (no row, two rows, unknown kind, failed cast) | the resolver's named reason | **BLOCK** | stop; "probably fine" is not a verdict (R2 §12.3) | no | yes | yes |
| `MISSING_INDEX_KEY_METADATA` | a key row is absent while the index exists | per-key rows vs `indnkeyatts` | **BLOCK** | stop; incomplete metadata is not a pass | no | no | no |

### 4.4 Layer D — structural integrity

| Classification | Trigger | Evidence required | Severity | Action | Auto-continue | Owner approval | Separate authorisation |
|---|---|---|---|---|---|---|---|
| `INDEX_MISSING` | a protected index is absent (including renamed away) | catalog inventory | **BLOCK** | stop; the guarantee is gone | no | no | no |
| `INDEX_DEFINITION_MISMATCH` | uniqueness, expression, predicate, opclass, NULL semantics, key count/order, INCLUDE or access method differ | structural payload vs approved definitions | **BLOCK** | stop; never a pass while weakened | no | yes, only for an approved re-pin | yes |
| `INVALID_INDEX` | `indisvalid`, `indisready` or `indislive` is false | `pg_index` flags | **BLOCK** | stop; an unbuilt or not-ready index enforces nothing | no | no | no |
| `INDEX_AMBIGUOUS` | the approved name exists more than once (two schemas) | catalog inventory per relation | **BLOCK** | stop; ambiguity must never resolve to pass | no | no | no |
| `INVENTORY_VIOLATION` | an unapproved hand-written-style index exists on a protected table | inventory payload (partial / expression / `NULLS NOT DISTINCT`) | **BLOCK** | stop; review and either remove it or add it to the inventory by reviewed change | no | yes | yes |
| `GUARD_EXECUTION_ERROR` | the guard crashed, produced no rows, or returned an unparseable payload | exit code + stderr + payload | **BLOCK** | stop; "no output" and "six missing" are the same fact | no | no | no |

**Can a weakened index ever pass?** **No** — for the classes tested. The prototype's matrix covered 25 cases
including unique→non-unique (M5), reduced key count (M4), changed expression (M20/M8/M22), changed opclass
(M11), dropped or altered predicate (M6/M7), changed NND (M9/M21), wrong order (M16), INCLUDE (M17), invalid
index (M18) and duplicate name (M15). It did not cover every
possible weakening (§8.4).

### 4.5 Layer E — behavioural compatibility

| Classification | Trigger | Evidence required | Severity | Action | Auto-continue | Owner approval | Separate authorisation |
|---|---|---|---|---|---|---|---|
| `BEHAVIORAL_COMPATIBILITY_UNKNOWN` | the change may alter comparison/folding/normalisation and no behavioural test exists for the target build | a behavioural test on the target, or a stated, reviewed residual risk | **REVIEW_REQUIRED** | stop; no metadata result substitutes for it | no | yes | yes |
| `EXISTING_DATA_COLLISION` | candidate-semantics validation finds colliding rows | the read-only validation report (OD-COLL-06) | **BLOCK** for the uniqueness change | stop; remediation is a separate approved plan | no | yes | yes |
| `BEHAVIOR_NOT_TESTED_ON_TARGET` | the target PostgreSQL build/libc/ICU has not been behaviourally exercised | the test record, per environment | **REVIEW_REQUIRED** | stop, unless the change provably cannot affect comparison | no | yes | yes |
| `BEHAVIORAL_TESTS_UNAVAILABLE` | the test cannot run (no ICU, no locale, no switch) | the failure, recorded | **REVIEW_REQUIRED** | stop; unavailability is not compatibility | no | yes | yes |

**Behavioural evidence never substitutes for structural or environment checks**, and vice versa (§9).

### 4.6 Layer M — measurement validity (cross-cutting)

These two are evaluated **before** any interpreted classification (precedence P3). They are not layer-specific:
a malformed artefact or an incomplete catalog invalidates every finding that would follow.

| Classification | Trigger | Evidence required | Severity | Action | Auto-continue | Owner approval | Separate authorisation |
|---|---|---|---|---|---|---|---|
| `UNKNOWN_OR_UNCLASSIFIED_CHANGE` | a difference is detected in a field or object for which no classification rule exists (e.g. a field added in a future version) | the field-level difference and the version of the expectation set | **REVIEW_REQUIRED** | stop; classify by decision, never by default | no | yes | yes |
| `CATALOG_INCOMPLETE` | the catalog payload is missing rows that the object implies (e.g. fewer key rows than `indnkeyatts`, or no inventory array) | payload shape vs declared counts | **BLOCK** | stop; "no rows" and "six missing" are the same fact | no | no | no |

---

## 5. Severity and precedence

### 5.1 The four states

| State | Meaning | Continuation | Who can change it |
|---|---|---|---|
| **BLOCK** | deployment must stop | **none** — no route to proceed within this policy | nobody at runtime; only a code/expectation change reviewed like any other change |
| **REVIEW_REQUIRED** | deployment must stop **until** evidence is reviewed and explicitly authorised | **none automatic**; a recorded review and authorisation are required first | owner (+ reviewer) |
| **INFORMATIONAL** | recorded and reported; **no integrity implication established** | yes | nobody — it is not a control |
| **PASS** | all applicable approved expectations verified | yes | — |

**Naming caution:** `REVIEW_REQUIRED` is **not** a softer `BLOCK`. Both halt; they differ in *how* the halt can
be lifted — a `BLOCK` needs a change to reality (fix the database, fix the expectation by reviewed re-pin), a
`REVIEW_REQUIRED` needs evidence that the change is acceptable, recorded before anyone proceeds.

### 5.2 Precedence rules

| # | Rule | Why |
|---|---|---|
| P1 | **Any BLOCK outranks any PASS.** A passing check never downgrades a failing one. | mixed results are exactly the case the control exists for |
| P2 | **UNKNOWN is never converted to PASS.** Missing evidence produces `REVIEW_REQUIRED` (or `BLOCK` where the policy says so), never silence. | "not measured" ≠ "equivalent" |
| P3 | **A measurement failure outranks every interpreted result.** `MALFORMED_FINGERPRINT`, `GUARD_EXECUTION_ERROR`, `MISSING_FIELD`, `CATALOG_INCOMPLETE` are evaluated first. | you cannot interpret what you did not measure |
| P4 | **Identity precedes everything.** `DATABASE_IDENTITY_MISMATCH` invalidates all other evidence. | measuring the wrong database is not a drift finding |
| P5 | **Structural before environmental**, in reporting order, so a schema defect is not mislabelled as an environment change. | different remedies (§11.2) |
| P6 | **`EXPECTED_ENVIRONMENT_CHANGE` cannot be inferred**, only read from an explicit approved entry. | otherwise every drift becomes self-justifying |
| P7 | **No auto re-pin, ever.** A changed environment never rewrites the expectation. | decision doc §9.4: a self-updating control ratchets to whatever it last saw |

---

## 6. Environment drift policy (Layers A and B)

### 6.1 The scenarios and their response

| # | Scenario | Detected by | Proposed state | Rationale |
|---|---|---|---|---|
| 1 | wrong default collation | fingerprint `collate`/`ctype` | **BLOCK** | E8: the same index enforces different uniqueness |
| 2 | correct locale name, different provider | `provider` (+ `iculocale`) | **BLOCK** | the provider decides who implements `lower()` |
| 3 | collation version changed | `datcollversion` both populated | **REVIEW_REQUIRED** | a library change is a review trigger, not proof of corruption |
| 3b | collation version unknown | `-` on either side | **REVIEW_REQUIRED** + warning | nothing to compare; failing forever is wrong, passing silently is worse |
| 4 | wrong PostgreSQL major | `pg` | **BLOCK** until the major is approved | 15/17/18 are `NOT TESTED`; an unverified catalog is not a pass |
| 5 | encoding changed | `enc` | **BLOCK** | byte semantics of any fold |
| 6 | restored into a different locale | fingerprint alone, indexes identical | **BLOCK** | measured (E8): dump emits no `COLLATE`, restore succeeds, uniqueness weakens |
| 7 | unsupported provider | `provider = unknown` | **BLOCK** | fail closed; extend the domain by decision |
| 8 | missing catalog field | `fields_present` | **BLOCK** | cannot fingerprint → cannot pass |
| 9 | non-deterministic collation in use | `collisdeterministic` | **BLOCK** | prohibited by decision doc §7.5 |
| 10 | staging profile presented as production | identity + environment marker | **BLOCK** | equivalence `NOT ESTABLISHED` |

### 6.2 What "approved" means here, and why it is missing

Every `BLOCK` above compares to an **approved expectation**. None exists:

- **OD-COLL-03** has not selected a production profile → there is no approved value set.
- **OD-COLL-04** has not selected a canonical form or a field set → there is no approved artefact to compare.

So today, rule-for-rule: the *states* are definable, the *comparison* is not executable. That is the honest
position, and it is why `EXACT_MATCH` is currently unreachable (§1 finding 4).

### 6.3 Identity rules

| Rule | Statement | Evidence |
|---|---|---|
| I1 | inspection must assert the target before reading anything else | probe step 1 (`:320–331`) is already ordered this way |
| I2 | the assertion must be bound to the expectation, not merely printed | no such binding exists (`UNKNOWN`) |
| I3 | a name match is **not** a cluster identity | probe matches `current_database()` only |
| I4 | an unverified identity is `DATABASE_IDENTITY_MISMATCH`, never "assume correct" | `DERIVED` from P4 |
| I5 | secrets and user names are never part of the artefact | probe never prints them (`VERIFIED`) |

### 6.4 Collation version rules

| Rule | Statement |
|---|---|
| V1 | a populated version change is `REVIEW_REQUIRED`, not proof of corruption |
| V2 | NULL is a legitimate value and must not be read as safe |
| V3 | `provider = libc` does not imply NULL (CI has `2.41`; the Session 23 local build has NULL) — both facts stand |
| V4 | re-pinning a version is a reviewed commit, never an automatic update |
| V5 | a version change never, by itself, authorises an index rebuild |

---

## 7. Per-index collation drift policy (Layer C)

### 7.1 The expectations this layer needs

R2 defines four symbolic kinds (`…-index-collation-r2-investigation.md` §12.1): `none` (8 keys),
`database_default` (3 keys: the two `lower(name)` keys and `ix_question_assets_checksum`), `named(schema,name)`,
`column(table,column)` — 11 keys, 6 indexes. **None of this is implemented.**

| Case | Proposed state | Evidence needed | Note |
|---|---|---|---|
| expected collation missing | **BLOCK** | resolution result | an index cannot outlive a dropped collation |
| unexpected explicit `COLLATE` | **BLOCK** | resolved OID vs `database_default` | measured M10: OID 100 → 950 |
| `database_default` resolves to a different object than the database's default | **BLOCK** | the `collprovider='d'` row + the fingerprint | resolution must happen **inside** the target database, never across databases |
| `named` collation mismatch (same name, other namespace) | **BLOCK** | resolved OID | identity, not equivalence (`C` 950 vs `alt."C"` 16416 behave alike and are still different objects) |
| column-derived mismatch | **BLOCK** | `pg_attribute.attcollation` **and** the pinned expectation | measured false negative: a coordinated column change rebuilds the index and the relationship rule alone passes |
| changed provider or determinism of the resolved collation | **BLOCK** | `pg_collation` attributes | non-deterministic is prohibited |
| unresolvable symbolic expectation | **BLOCK** | named reason `MISSING`/`AMBIGUOUS`/`UNKNOWN` | R2 §12.3 |
| missing key metadata | **BLOCK** | per-key rows vs `indnkeyatts` | incomplete ≠ pass |

### 7.2 The trap this layer exists to avoid

`pg_catalog."default"` with OID `100` means `en_US.utf8` in CI and would mean `C` in a `C`-initialised
database. **The name and the OID are identical; the meaning is not.** A literal string comparison of
`collname` passes in both. Therefore:

- the expectation must be symbolic, and
- the **environment fingerprint must also be asserted**, because the per-index layer cannot see what `default`
  means.

That is the coupling the register already records: `PARTIALLY RESOLVED (R2)`.

### 7.3 Dependency

Every rule in §7.1 is **BLOCKED ON OD-COLL-04** for its *artefact* (the expectation object and its
representation) and on the unimplemented guard for its *execution*. The rules themselves do not depend on
OD-COLL-03; only the values do.

---

## 8. Structural integrity policy (Layer D)

### 8.1 The structural cases, with their measured results

All results below are from the disposable PostgreSQL 16.2 prototype matrix
(`…-index-integrity-guard-design.md` §9.2), unless the row says otherwise.

| Case | Case ID / measured result | Proposed state |
|---|---|---|
| protected index missing | M1, M2 (dropped), M3 (renamed away) → `FAIL — MISSING`; **existing controls: `guard.py catalog` exit 0, name count 5** | **BLOCK** |
| unique → non-unique | M5 → `FAIL — UNIQUE False` | **BLOCK** |
| changed expression | M20 (`upper(name)`), M8 (expression → plain column `name`), M22 (index built on the wrong table) → `FAIL` | **BLOCK** |
| changed predicate | M6 (predicate dropped), M7 (`is_active = false`) → `FAIL`; **M19** (semantically equivalent rewrite `is_active = true`) → `FAIL` **as designed** | **BLOCK**; the only route is a reviewed re-pin |
| changed operator class | M11 (`text_pattern_ops`) → `FAIL` | **BLOCK** |
| changed NULL semantics | M9 (`NULLS NOT DISTINCT` dropped), M21 (added where not approved) → `FAIL` | **BLOCK** |
| changed key order | M16 (`DESC` + `NULLS FIRST`) → `FAIL` | **BLOCK** |
| changed key count | M4 (4 keys, approved 5) → `FAIL` | **BLOCK** |
| unexpected INCLUDE | M17 (`INCLUDE (order_index)`) → `FAIL` | **BLOCK** |
| invalid / not-ready / not-live | M18 (`indisvalid = false`) → `FAIL` | **BLOCK** |
| ambiguous name | M15 (same name in `public` and `shadow`) → `FAIL — exists 2 times` | **BLOCK** |
| unapproved hand-written index | M14 (unapproved partial index on `tags`) → `FAIL — inventory` | **BLOCK** |
| changed access method | not executed — the baseline is btree-only | **BLOCK**; `NOT TESTED` |

**Positive controls — the detector must also be able to pass** (`VERIFIED`):

| Case | Result |
|---|---|
| M13 — restore the exact original definition | `PASS` |
| M23 — identical definition, different whitespace/quoting in the DDL | `PASS` (no false positive on formatting) |
| M24 — add a plain Prisma-style index on `tags(slug)` | `PASS` (legitimate, not hand-written-style) |

**Two consequences for policy:**

- **M19 is a deliberate fail-closed trade-off.** A semantically equivalent predicate rewrite fails because
  the comparison is textual. The policy must therefore offer exactly one route for that case — a reviewed
  re-pin — and must not treat "the reviewer says it is equivalent" as an automatic pass.
- **M23 shows the trade-off is bounded:** formatting churn does not fail, so the re-pin burden is limited to
  real definition changes (and to PostgreSQL major-version rendering changes, R3 in the design's §15).

### 8.2 Fail-closed rules already measured for this layer

| Test | Result |
|---|---|
| empty payload | `REJECT … is empty — no catalog was returned, refusing to pass` (exit 1) |
| malformed JSON | `REJECT … is not valid JSON` (exit 1) |
| payload without `inventory` in strict mode | `REJECT … has no index inventory — refusing to pass` (exit 1) |
| `{"indexes": [], "inventory": []}` | `REJECT no protected-index rows were returned — indistinguishable from six missing indexes` (exit 1) |
| same mutation with `--no-strict-inventory` | `PASS` (exit 0) — the switch behaves as designed |

### 8.3 What this layer would require

| Requirement | Status |
|---|---|
| An approved definition set for six indexes | design exists (`…-index-integrity-guard-design.md` §3) — not committed as code |
| Catalog query covering structure | designed; `pg_indexes` rejected because it cannot see `indnullsnotdistinct` |
| Predicate normalisation (whitespace only) | designed; deliberately narrow |
| Inventory semantics (partial/expression/NND on six tables) | designed; needing one reviewed line per new hand-written index |
| CI integration | `NOT TESTED` |

### 8.4 What the matrix does not establish

The prototype proves detection of the **classes tested**, not of every weakening: no tablespace, ACL,
nulls-ordering-on-non-text or >32-key coverage; no PG 15/17/18; no CI wiring. A policy that says "BLOCK on
definition mismatch" is therefore accurate about the *rule* and less complete about the *detector* than the
matrix's 25/25 result suggests.

---

## 9. Behavioural compatibility policy (Layer E)

### 9.1 What is measured, and what is not

| Item | Status |
|---|---|
| ASCII case folding on CI | `VERIFIED` (G-3 cases 30–32) |
| Non-ASCII folding under `C.utf8` and `C` | `OBSERVED` (Session 23 disposable PG 16.2): `Ä/ä`, `ẞ/ß`, `İ/i`, `K`/`k` fold under `C.utf8`, not under `C` |
| Non-ASCII folding under `en_US.utf8` | **`NOT TESTED`** — never compared against `C.utf8` |
| ICU behaviour | **`NOT TESTED`** — no ICU available |
| PostgreSQL 15/17/18 behaviour | **`NOT TESTED`** |
| Production behaviour | **`UNKNOWN`** |
| Any behavioural test in CI | **does not exist** |

### 9.2 Policy

| Rule | Statement |
|---|---|
| B1 | behavioural evidence is **not** substitutable for structural or environment checks, and neither substitutes for it |
| B2 | a change that may alter comparison/folding/ordering with no behavioural test on the target is `BEHAVIORAL_COMPATIBILITY_UNKNOWN` → **REVIEW_REQUIRED** |
| B3 | a change that provably cannot affect comparison (e.g. rebuild of a uuid-only unique) may be `INFORMATIONAL` — and the claim must be stated and reviewable |
| B4 | unavailability of a test (no ICU, no locale) is **not** compatibility; it is `BEHAVIORAL_TESTS_UNAVAILABLE` |
| B5 | a uniqueness-semantics change (OD-COLL-01/02) makes Layer E the decisive layer, and OD-COLL-06 the evidence supplier |

### 9.3 Why the policy cannot be stronger today

The only behaviour the repository has measured for these indexes is ASCII. A policy demanding behavioural
proof for every deployment would block every deployment, including ones unrelated to collation. A policy
demanding none would pass a locale change silently. The honest middle is `REVIEW_REQUIRED` with a stated
residual risk — which is what §9.2 B2 says, and why it must be an owner decision, not a default.

---

## 10. Fail-open / fail-closed analysis

Fifteen cases. "Proposed stance" is a recommendation; "Evidence" says whether the stance is grounded or a
judgement.

| # | Case | Proposed stance | Evidence / label |
|---|---|---|---|
| 1 | missing fingerprint | **fail closed** — no artefact, no verdict | `DERIVED`; today the probe fails only if it cannot produce one |
| 2 | missing expected field | **fail closed** | `VERIFIED` — probe exits 1 (`UNSUPPORTED_CATALOG_FIELD`) |
| 3 | unexpected **additional** field (a future version) | **fail closed** | `PROPOSED`; requires a version-aware comparator (OD-COLL-04 §10) — today nothing would notice |
| 4 | NULL collation version | **review required** (+ warning line) | `VERIFIED` (NULL locally, `2.41` in CI) |
| 5 | unsupported provider | **fail closed** | `PROPOSED`; **not** currently enforced — the probe serializes `provider=unknown` and continues |
| 6 | changed PostgreSQL major | **fail closed** | `PROPOSED`; consistent with R2 §12.3's version floor |
| 7 | database-name match but uncertain cluster identity | **review required**, and `BLOCK` if the expectation is bound to a cluster | `OPEN` — depends on OD-COLL-04's identity decision; today a name match is all there is |
| 8 | fingerprint parser error | **fail closed** | `VERIFIED` for the probe's own prefix check; no comparator exists |
| 9 | missing protected index | **fail closed** | `OBSERVED` prototype 25/25; **existing controls exit 0** |
| 10 | index exists but definition differs | **fail closed** | `OBSERVED` matrix; existing controls miss it |
| 11 | guard execution error (crash, empty output) | **fail closed** | `VERIFIED` — `guard.py catalog` rejects empty and malformed input; deployment gate refuses on non-zero |
| 12 | database connection error | **fail closed** | `VERIFIED` — probe `MISSING_DATABASE`; gate `could not query the database` |
| 13 | incomplete catalog result (missing rows, partial payload) | **fail closed** | `VERIFIED` for the prototype's no-rows case; for the probe, `MALFORMED_RESULT` on row/key mismatch |
| 14 | behavioural compatibility not tested | **review required** | `DERIVED`; §9.2 B2 |
| 15 | expectation file absent entirely | **fail closed** *or* **informational**, and this is genuinely `OPEN` | honest position: with no approved expectation there is nothing to drift *from*; treating absence as a pass makes the control vacuous, treating it as a block makes every current run fail — the owner must choose (§14 Q1) |

**No case above recommends automatic acceptance of environment drift.** The only "continue" answers are
`PASS`, `INFORMATIONAL`, and an `EXPECTED_ENVIRONMENT_CHANGE` entry that a human wrote and approved in advance.

---

## 11. Failure handling and recovery boundaries

### 11.1 The required ten-step response

| # | Step | Who | Output |
|---|---|---|---|
| 1 | stop the relevant deployment path | the gate / operator | non-zero exit; nothing deployed |
| 2 | preserve diagnostic output | automated | artefacts retained (probe → uploaded, 90-day retention) |
| 3 | identify the exact failed assertion | automated | one line naming the object, the attribute and both values |
| 4 | record expected and observed values, **without secrets** | automated | no connection string, no user name, no credential |
| 5 | do not change the database to make the check pass | everyone | no `ALTER`, no index rebuild, no locale change |
| 6 | require evidence review | owner + reviewer | a reviewed record |
| 7 | obtain explicit owner authorisation where required | owner | recorded in the register |
| 8 | prepare a separate remediation or compatibility plan | owner + operator | its own reviewed document |
| 9 | repeat validation against the intended target | automated | a new measurement, new evidence |
| 10 | preserve an auditable record | everyone | the artefacts + the decision record |

### 11.2 Pre-deployment failure versus applied-migration defect

| | Failed **pre-deployment** check | Defect found **after** apply |
|---|---|---|
| What it means | the migration has not run; the database is unchanged | the database is in an unknown-to-expected state |
| Deploy gate behaviour | refuses; nothing deployed (`fail()` prints "Nothing was deployed.") | **no gate covers this** — the gate runs before deploy only |
| Recovery | fix the environment/expectation, or don't deploy | restore, or a forward-fix migration — both separately reviewed |
| Authority | owner (for the exception) | owner + operator (a production operation) |

### 11.3 Recovery options, and what is not guaranteed

| Option | When | What it requires | Guarantee |
|---|---|---|---|
| **restore** | post-apply defect, or a weakened index already serving reads | a backup that was measured to restore; V-3 drill evidence | **no RTO is measured**; the drill prints a "timing" heading but measures no duration (decision package C-DEF-5) |
| **forward-fix migration** | a correctable definition change | a reviewed migration, a checksum history that matches, and the gate | none beyond review; migration 0002 is `DO NOT COMMIT` |
| **index rebuild** | a single index invalid or weakened | `CREATE INDEX CONCURRENTLY` + verification; owner approval | not measured for these six indexes |
| **re-pin** | the environment change is accepted | a reviewed commit to the expectation | explicit; never automatic |
| **rollback** | — | **does not exist** — 0001 is forward-only | **no rollback guarantee is offered or implied** |

**No recovery operation is authorised by this document.** Each is a separate decision with its own approval.

### 11.4 What must be recorded for auditability

| Record | Content | Where |
|---|---|---|
| the verdict | classification + severity + the deciding rule | deployment log / review record |
| the evidence | artefacts with identifiers (run, check run, commit) | artefact archive |
| the exception, if any | the approved allow-list entry or re-pin commit | the register |
| the reviewer | who reviewed, when | the decision record |
| the outcome | deployed / refused / remediated | the register |

### 11.5 Authorisation boundaries — five separate things

| # | Thing | Authorised by | Status now |
|---|---|---|---|
| 1 | **technical measurement** | owner authorisation A1/A2/A3 (Session 17) | done in CI (T1 `CLOSED`) |
| 2 | **evidence review** | the reviewer | not an approval |
| 3 | **owner approval of policy** | the owner, in writing | **OD-COLL-05 `OPEN`** |
| 4 | **implementation authorisation** | the owner, separately | **not given** |
| 5 | **production deployment authorisation** | **B2**, with **B1b** | **WITHHELD / NOT APPROVED** |

Approving OD-COLL-05 would authorise **none** of 4 or 5. It would also not touch B1b, B2, migration 0001,
Option C or B1a.

---

## 12. Dependencies on OD-COLL-01/02/03/04/06

### 12.1 What can be specified now, and what must wait

| Rule group | Can be specified independently? | Why |
|---|---|---|
| identity (`DATABASE_IDENTITY_MISMATCH`, `WRONG_ENVIRONMENT`) | **yes** | it is about measurement validity, not about fields |
| malformed input (`MALFORMED_FINGERPRINT`, `GUARD_EXECUTION_ERROR`, connection error, incomplete payload) | **yes** | fail-closed is format-independent |
| structural Layer D (`INDEX_MISSING`, `INDEX_AMBIGUOUS`, `INVALID_INDEX`, `INVENTORY_VIOLATION`) | **yes** | the six definitions are committed in migration 0001 and verified in CI by G-3, so an expectation set can be written from them — noting that 0001 itself remains NOT AUTHORIZED for production |
| structural Layer D (`INDEX_DEFINITION_MISMATCH` specifics) | **mostly** | rules are definable; execution needs the unimplemented guard |
| per-index collation Layer C | **partly** | `BLOCK` stance is definable; the expectation **object** and its representation belong to OD-COLL-04 |
| environment Layer B field-by-field classification | **no — BLOCKED ON OD-COLL-04** | without an approved field set and canonical form there is nothing to compare |
| any `EXACT_MATCH` verdict | **no — BLOCKED ON OD-COLL-03 and OD-COLL-04** | no approved values, no approved artefact |
| `EXPECTED_ENVIRONMENT_CHANGE` | **no** | an allow-list of *what* requires approved field values (03) |
| behavioural Layer E threshold | **no — BLOCKED ON OD-COLL-01/02 and 06** | which differences matter depends on the chosen uniqueness semantics and the data |

### 12.2 The five neighbours

| Decision | Owns | Boundary with OD-COLL-05 |
|---|---|---|
| **OD-COLL-01** — tags semantics | which equality is intended | decides *what would count as* a behavioural incompatibility for `uq_tags_name_lower` |
| **OD-COLL-02** — colleges semantics | same, for the sole college rule | same, independently |
| **OD-COLL-03** — production profile | the approved values | supplies every value the policy compares; **05 never selects one** |
| **OD-COLL-04** — fingerprint representation | fields, canonical form, comparison model | supplies the artefact and its classification grammar; **04 classifies, 05 responds** |
| **OD-COLL-06** — existing-data validation | how data is checked | supplies `EXISTING_DATA_COLLISION` evidence; **05 decides the consequence** |

### 12.3 Four separations that must survive any summary

1. **A policy is not a profile.** Approving "fail closed on locale change" does not approve a locale.
2. **A profile is not a policy.** Choosing `C.utf8` does not say what happens when production is `C`.
3. **A fingerprint is not equivalence.** Equal artefacts mean equal recorded properties.
4. **A passing CI run is not production compatibility.** CI is `en_US.utf8`/`libc`/`2.41`; production is
   `UNKNOWN`.

---

## 13. Owner decision table

### 13.1 OD-COLL-05

| Field | Record |
|---|---|
| **Decision ID** | `OD-COLL-05` |
| **Decision question** | When the observed environment, collation metadata or protected index properties differ from approved expectations, what must happen — and who may lift the stop? |
| **Candidate severity model** | four states: **BLOCK**, **REVIEW_REQUIRED** (also a stop), **INFORMATIONAL**, **PASS**; precedence P1–P7 (§5), with BLOCK never downgraded by a PASS, UNKNOWN never converted to PASS, identity first, structural before environmental, no inference of an expected change, no auto re-pin |
| **Required fail-closed cases** | identity mismatch / wrong environment; malformed fingerprint or payload; guard execution error; connection error; incomplete catalog; missing required field; unsupported provider; missing protected index; invalid index; ambiguous index; inventory violation; any index definition mismatch; per-index collation mismatch; unresolvable expectation; non-deterministic collation; encoding change; locale change; provider change; unapproved PostgreSQL major |
| **Review-required cases** | collation version changed; collation version unknown; behavioural compatibility unknown; behaviour not tested on the target; behavioural tests unavailable; cluster identity uncertain but name matched |
| **Informational cases** | full `server_version` / package rebuild differences; diagnostic fields; a change that provably cannot affect comparison (stated and reviewed) |
| **Evidence available** | the implemented controls and their measured blind spots (§3.1, §3.5); G-1's six destructive statements; the CI fingerprint; the probe's failure behaviour; the 25-case structural matrix (prototype); R2's expectation model; Session 24's audit of the representation |
| **Evidence missing** | an approved profile (OD-COLL-03); an approved fingerprint representation (OD-COLL-04); any committed structural guard; any behavioural test beyond ASCII; any production measurement; a defined allow-list mechanism; a cluster-identity rule |
| **Dependencies** | OD-COLL-03 (values), OD-COLL-04 (artefact and classification grammar), OD-COLL-01/02 (what a behavioural difference means), OD-COLL-06 (data evidence); must not override B1b or B2 |
| **Technical recommendation, if justified** | **justified:** fail closed by default; distinguish measurement failure from interpreted difference; separate schema-integrity from environment-policy failures because their remedies differ; make `REVIEW_REQUIRED` a stop; never auto re-pin. **Not justified:** any specific response to an unsupported provider or to a missing expectation *today*, because both depend on decisions that are `OPEN` |
| **Owner approval status** | **`OPEN — COLLATION DRIFT FAILURE POLICY NOT APPROVED`** |

A technical recommendation in this table is **not** owner approval, and no status above changes by presence of
this document.

---

## 14. Recommendations and unresolved questions

### 14.1 Recommendations for consideration (`PROPOSED`)

1. **Adopt the four-state model with the seven precedence rules**, and publish that `REVIEW_REQUIRED` halts.
2. **Evaluate measurement validity first** (P3/P4) so that a malformed or mis-targeted measurement is never
   reported as a drift finding.
3. **Keep schema-integrity and environment-policy failures in separate report sections**, because one is fixed
   by a migration review and the other by operations or a re-pin.
4. **Make the missing-expectation case explicit** rather than silently passing (see Q1).
5. **Treat `datcollversion` changes as review triggers** and NULLs as unknowns, never as safety.
6. **Never auto re-pin**, and require the re-pin to be a commit.
7. **Do not claim the current controls are a drift gate.** They are a history gate, a command-path guard and a
   measurement.

### 14.2 Unresolved questions

| # | Question | Blocked on | Who |
|---|---|---|---|
| Q1 | With no approved expectation, is a run **informational** or **blocked**? | OD-COLL-04/03 | owner |
| Q2 | Is an unsupported provider a hard block, and what is the provider domain (including `d`)? | OD-COLL-04 | owner |
| Q3 | Must identity bind to a cluster, and with what evidence? | OD-COLL-04 | owner |
| Q4 | Is a collation-version change a block or a review, given CI can detect it (`2.41`) and other builds cannot? | this decision | owner |
| Q5 | What is the allow-list mechanism for `EXPECTED_ENVIRONMENT_CHANGE`, and who signs an entry? | OD-COLL-03 + this | owner + ops |
| Q6 | Is `BEHAVIORAL_COMPATIBILITY_UNKNOWN` a standing review item or a per-deployment one? | OD-COLL-01/02 | owner |
| Q7 | Which structural classes must be covered before the guard may gate a deployment? | this decision | owner + reviewer |
| Q8 | After an applied-migration defect, is the default response restore or forward-fix? | operations | owner + ops |
| Q9 | Who is the reviewer-of-record, and where is the acknowledgement stored? | operations | owner |

---

## 15. Explicit non-authorisations

This brief authorises **none** of the following:

- implementing any guard, classifier, comparator, expectation file or deployment check;
- modifying `guard.py`, `collation-probe.sh`, `deploy-gate.sh`, `deploy-path-guard.py`, `repo-guard.sh`,
  `migrate-disabled.sh`, any workflow, or `package.json`;
- adding a CI step, a secret, an artifact or a gate;
- changing PostgreSQL configuration, creating or measuring any database;
- connecting to production or staging, or running any query or write against them;
- selecting a production locale, provider or major (OD-COLL-03);
- approving a fingerprint representation or its JSON form (OD-COLL-04);
- approving **B1b** (production deployment with C-1…C-5), **B1c** (dropping them) or **B2** (production
  authorisation);
- authorising migration 0001 for production, or migration 0002 (`DO NOT COMMIT`);
- changing any index, application code or test;
- closing OD-COLL-01…06, or reinterpreting G-1 (`FAILED`), G-3 (`PASSED`), Option C, B1a, T1 (`CLOSED`) or R2
  (`PARTIALLY RESOLVED`);
- creating a PR, merging, deploying, committing or pushing.

**A drift policy does not authorise a production migration, and approval of one would not change B1b or B2.**

---

## 16. Evidence references

### 16.1 Committed artifacts read

| Artifact | What was taken from it |
|---|---|
| `scripts/db/deploy-gate.sh` (249 lines) | checksum gate: modes `verify`/`deploy`, fail-closed preconditions (`:166–181`), first-deployment determination (`:200–213`), `deploy`-mode refusal of a caller-supplied history (`:157`), "Nothing was deployed." on refusal |
| `scripts/db/deploy-path-guard.py` (394 lines) | repository-controlled deploy paths must route through the gate; textual, static |
| `scripts/db/migrate-disabled.sh` (65 lines) | `npm run db:migrate` refuses |
| `docs/database/g1-spike/option-c/guard.py` (279 lines) | three modes: `sql` (textual FK check), `catalog` (five composite FKs), `history` (checksums); **no index or collation check** |
| `docs/database/g1-spike/option-c/g3-full/collation-probe.sh` (468 lines) | measurement only; failure states; identity assertion `:320–331`; no comparison |
| `.github/workflows/phase04a-g3-full-schema-gate.yml` | research/services `:73–112`; probe step `:242–250`; artifact upload `:252–259`; repo-guard job |
| `docs/development/database-migrations.md` | B1a's five conditions (`:20–45`); B2 withheld; the direct-CLI bypass statement |
| `docs/database/phase-04a-database-collation-product-and-environment-decision.md` | §8.4 (change → failure), §8.5, §8.7.1, §9.1–§9.4 (the four response types, ten scenarios, schema-vs-environment, no auto re-pin), §11.3, §12 (register), §12.1 |
| `docs/database/phase-04a-index-integrity-guard-design.md` | §2.2 (the measured gap table), §2.3 (why no neighbour covers it), §7.3 (fail-closed rules), §7.4 (inventory semantics), §9.1–§9.5 (25-case matrix, policy tests, the one unexecutable case, what it does not establish), §12 (real diagnostics) |
| `docs/database/phase-04a-index-collation-r2-investigation.md` | §12.1 (four expectation kinds; 8×`none`, 3×`database_default`), §12.2 (resolution pseudocode), §12.3 (the rules), §12.4 |
| `docs/database/phase-04a-final-database-deployment-decision-package.md` | §1 (G-1 six statements), §12.1–§12.3 (B1b), C-DEF-3, C-DEF-5, the status register |
| `docs/database/phase-04a-od-coll-03-production-collation-profile-decision-brief.md` | §3 (CI evidence), §6.3 (fingerprint limits), §11 (dependency states) |
| `docs/database/phase-04a-od-coll-04-collation-fingerprint-specification-decision-brief.md` | §3 (implementation audit), §5 (layers), §8 (OD-COLL-04's 13 classifications), §10 (versioning) |

### 16.2 Executed evidence

| Item | Value |
|---|---|
| G-1 drift run | `45381634139`, commit `6376d2a6e7…` — six destructive statements, none executed |
| CI collation measurement | run `45546248909`, check run `138976563830`, commit `0aae1368a16cf6447cb7a01afc7554a9fdab4bc0` |
| G-3 gate | `G-3 PASSED` (run `45273840004` recorded as the basis of B1a) |
| Index-guard matrix | disposable PG 16.2, 25 cases + 6 policy tests, prototype only (`…-index-integrity-guard-design.md` §9) |
| Behavioural observations | Session 23, disposable PG 16.2, `C.utf8` vs `C`, ASCII/non-ASCII folding |

### 16.3 Not consulted

No production or staging system, credential, catalog, backup, log or metric was read. No database was
created, started or queried in this session. The CI artifact archive and job log remain unreachable from this
environment.

---

## 17. Revision history

| Revision | Date | Change |
|---|---|---|
| 2 | 2026-11-24 | **Documentation reconciliation (Session 28), no policy changed.** §4 now states the naming overlap with OD-COLL-04 §8 explicitly (13 fingerprint-layer outcomes versus 33 classifications here), distinguishes five results that must not be substituted for one another, and records that none of the 33 is implemented. Triggered by finding `C-05` of the Session 27 consolidation audit. The fail-closed core, the four states and every dependency are unchanged; OD-COLL-05 remains `OPEN`. |
| 1 | 2026-11-24 | Initial OD-COLL-05 decision brief. Audits every existing control and separates implemented from experimentally demonstrated from proposed (§3.1), and reproduces the measured blind spots for index drops and definition weakening (§3.5). Defines five layers (identity, environment, per-index collation, structural, behavioural) and 33 classifications across six layers with trigger, evidence, severity, action, continuation and approval requirements; a four-state severity model with seven precedence rules, in which `REVIEW_REQUIRED` also halts; a fifteen-case fail-open/fail-closed analysis; a ten-step failure response that distinguishes pre-deployment refusal from post-apply defect; and recovery options with no rollback guarantee. Maps the rules that can be specified now against those blocked on OD-COLL-03/04 and OD-COLL-01/02/06. Records OD-COLL-05 as `OPEN — COLLATION DRIFT FAILURE POLICY NOT APPROVED`, and preserves B1b/B2 as separate, unapproved decisions. **No guard, script, workflow, schema, migration, application file or test modified; no database operation; nothing committed or pushed.** |

**Standing decisions preserved exactly, unchanged by this document:** G-1 **FAILED** · G-3 **PASSED** ·
Option C **APPROVED — controlled migration workflow only** · B1a **APPROVED (workflow-scoped)** · B1b **NOT
APPROVED** · B1c **NOT APPROVED** · B2 **WITHHELD** · migration 0001 **NOT AUTHORIZED for production
deployment** · migration 0002 **DO NOT COMMIT** · G-2 **DEFERRED** · **T1 CLOSED** · **R2 PARTIALLY RESOLVED** ·
OD-COLL-01…06 **OPEN** · OD-17 **OPEN** · OD-21 **OPEN** · OD-NM-1 **OPEN**. CI profile **OBSERVED**;
production profile **UNKNOWN**; production locale **NOT DECIDED**; CI↔production equivalence **NOT
ESTABLISHED**.

**One open decision, framed and unowned. No drift gate exists to configure; no policy is approved; no
deployment is authorised.**
