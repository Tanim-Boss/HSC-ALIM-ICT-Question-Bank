# Phase 04A — Owner-Review Readiness Audit and Decision Handoff

**Date:** 2026-11-24
**Repository:** `Tanim-Boss/HSC-ALIM-ICT-Question-Bank`
**Branch:** `arena/49496cf8-hsc-alim-ict-question-bank`
**HEAD when written:** `4d04e4461338ea5931d26faf67d312fbed21de43`
**Subject:** whether the six collation owner decisions **OD-COLL-01 … OD-COLL-06** are documented,
consistent, dependency-aware and ready for explicit owner review.
**Nature:** documentation and audit only. Nothing here approves, selects, implements, migrates or deploys,
and no owner answer is inferred, fabricated or implied.

Labels used throughout: `VERIFIED` · `OBSERVED` · `DERIVED` · `PROPOSED` · `UNKNOWN` · `NOT TESTED` ·
`SUPERSEDED` · `OPEN`.

---

## 1. Executive verdict

### **OWNER REVIEW PACKAGE READY — SIX DECISIONS REMAIN OPEN — NO IMPLEMENTATION OR DEPLOYMENT AUTHORIZED**

**Required qualifier, stated before any summary:** five decisions are reviewable **in full**; **OD-COLL-05 is
reviewable only in part** — its severity model and fail-closed rules can be answered now, but its
value-dependent classification rows cannot (`NOT READY — EVIDENCE REQUIRED` for that part, §3.5). No decision
is approved, and no answer is pre-filled anywhere in this package.

Nine findings:

1. **The six decisions are documented to a reviewable standard.** Each has an exact question, a set of
   options, recorded evidence, an explicit statement of what is missing, and an explicit status of `OPEN`. Five
   briefs (722 + 630 + 767 + 801 + 707 lines, one of them covering two decisions) and a 696-line consolidation
   audit support the package; §2 lists them with content hashes.
2. **The status register is consistent.** All five briefs and the consolidation audit reproduce the same
   standing-decisions block; the sixteen required statuses agree in every document that states them. **No
   document in the package contradicts another on any status** (§4.2).
3. **One material completeness gap exists and is not a contradiction:** the deployment decision package
   (`phase-04a-final-database-deployment-decision-package.md`, §11 decision matrix) contains **no reference at
   all** to OD-COLL-01…06, T1 or R2 — a grep for `OD-COLL` returns zero hits in that file. An owner reading
   only the deployment package would not learn that six collation decisions are open (§4.3, finding **S-1**).
   This is reported, not silently corrected.
4. **The Session 28 corrections are accurate and in place**: C-02 (delimiter/sentinel not implemented, now
   labelled), C-04 (six catalog fields / seven values / eight segments), C-05 (13 environment outcomes versus
   33 cross-layer classifications, neither implemented), C-06 (two collation-sensitive unique rules versus
   three indexes with collated keys). Re-verified against the committed probe and the documents (§4.4).
5. **The evidence boundary is intact.** No document claims CI is production, no document claims a production
   scan, no document calls the probe a guard, and no document claims a fingerprint match proves structural or
   behavioural compatibility (§4.5, §7).
6. **The dependency graph is a graph, not a chain.** 01 and 02 are mutually independent; 03 and 04 are mutually
   dependent; 05 consumes 03 and 04; 06 consumes 01/02 for candidate comparison and 03 for environment. Three
   parallel review tracks are supported by the evidence; a single linear order is not (§6, §7).
7. **Implementation is gated four times over.** Approving the six decisions authorises **no** guard, **no**
   index change, **no** migration, **no** deployment. Those remain behind separate authorisations (B1b, B2, and
   a new implementation authorisation that does not yet exist) — §9.
8. **Eleven evidence items are still missing, and five of them require production access or an explicit owner
   authorisation** to obtain. Nine of the eleven cannot be produced by writing more documents (§8).
9. **Deferral remains the state of record.** Every decision is deferred today; §5.1–§5.6 states, for each one,
   what remains unresolved while it is deferred. Deferral is not an error state: it is the current, recorded
   position, and this package does not recommend changing it by default.

**What this document is not:** it is not a decision record, not a recommendation to approve, not a substitute
for the six briefs, and not a production-readiness claim. It is a review package and a handoff.

---

## 2. Scope and evidence boundary

### 2.1 Documents covered

| # | Path (all under `docs/database/`) | Lines | Content hash (SHA-256, first 16) | Role |
|---|---|---|---|---|
| 1 | `phase-04a-final-database-deployment-decision-package.md` | 957 | `dc03e1a44a768361` | deployment decision package; B1b/B2 analysis |
| 2 | `phase-04a-od-coll-01-02-uniqueness-semantics-decision-brief.md` | 722 | `0e733903e5c9db7a` | **two** decisions, OD-COLL-01 and OD-COLL-02 |
| 3 | `phase-04a-od-coll-03-production-collation-profile-decision-brief.md` | 630 | `eed8897c9fa8d0fc` | OD-COLL-03 |
| 4 | `phase-04a-od-coll-04-collation-fingerprint-specification-decision-brief.md` | 767 | `7c1707fd5d3b0f27` | OD-COLL-04 (Session 28 revision) |
| 5 | `phase-04a-od-coll-05-collation-drift-failure-policy-decision-brief.md` | 801 | `61e3ddd0d9ff23a2` | OD-COLL-05 (Session 28 revision) |
| 6 | `phase-04a-od-coll-06-existing-data-compatibility-decision-brief.md` | 707 | `ba89956d0cbe45d5` | OD-COLL-06 |
| 7 | `phase-04a-collation-decision-package-consolidation-audit.md` | 696 | `7d8af8f9962c2081` | Session 27 consolidation audit + Session 28 resolution record |

Supporting committed documents read or re-verified for this audit: the authoritative register in
`phase-04a-database-collation-product-and-environment-decision.md` (§8.1, §8.3.1–§8.3.2, §8.4–§8.7.1, §9,
§10.1–§10.7, §12, §14.1, §16); `phase-04a-index-integrity-guard-design.md` (§3, §7, §9, §11);
`phase-04a-index-collation-r2-investigation.md` (§12.1); `phase-04a-ci-collation-profile-measurement-proposal.md`
(§5.3, §8.6, §12.2, §9.2 E10, §17.3); `docs/development/database-migrations.md` (`:20–45`); and the committed
implementation: `prisma/migrations/0001_phase04a_question_bank/migration.sql` (PART C `:613–648`),
`prisma/schema.prisma`, `docs/database/g1-spike/option-c/g3-full/collation-probe.sh` (468 lines),
`docs/database/g1-spike/option-c/guard.py` (279 lines), `scripts/db/*`, `.github/workflows/*`.

### 2.2 Evidence hierarchy applied

| Level | Source | Decides |
|---|---|---|
| 1 | current repository implementation | what happens today |
| 2 | committed migration and schema | what the database must contain |
| 3 | recorded CI execution | what was observed in CI |
| 4 | recorded disposable-database measurements | what was observed locally only |
| 5 | reconciled historical evidence | what the project has settled |
| 6 | briefs and proposals | what is proposed and why |
| 7 | recommendations and unapproved candidates | **nothing** |

A brief never overrides the probe; a historical statement never overrides a later measurement — it is marked
`SUPERSEDED` with the replacement named.

### 2.3 What has actually been demonstrated

| Class | Content | Where |
|---|---|---|
| **Demonstrated in CI** | PostgreSQL **16.16**, UTF8, provider `libc`, `en_US.utf8`/`en_US.utf8`, `daticulocale` NULL, `datcollversion` **`2.41`**; the fingerprint string; the six-index catalog (11 keys = 8 `none` + 3 `database_default`); G-3 PASSED (run `45372731345`); G-1 FAILED (run `45381634139`: 5 FK drops + 1 index drop); V-1…V-5 (run `45372731513`, three jobs success; application side `45381634112`, 47 tests) | §2.1 documents 4, 7; File C §5, §7 |
| **Demonstrated only in disposable local PostgreSQL** | `C.utf8` folding behaviour (20 probes + 3 diagnostics: `Logic Gate`/`logic gate`, `Ärger`/`ärger`, `ẞ`/`ß`, `İstanbul`/`istanbul`, U+212A rejected; `ẞ`/`ss`, `ς`/`σ`, NFC/NFD, trailing space accepted); `real_c` versus `real_u` (C accepts `Ärger`+`ärger`, C.utf8 rejects the second); merge mechanics E11/E11b/E11c/E12b; the 25-case guard matrix; PostgreSQL **16.2** only | §2.1 document 2 §7.2–§7.3; guard design §9 |
| **Specified but not implemented** | the structural index guard; any fingerprint comparison; any drift classifier; any collision audit; delimiter and `-` sentinel validation; `unknown`-provider refusal; expectation files; the runbook and monitoring plan | §4.4, §8 |
| **Unknown about production** | provider, locale, `datcollversion`, major version, encoding, database identity, cluster identity, data volumes, replica availability, retention policy | U-items in §8 |
| **Requires production evidence or an explicit owner decision** | every statement about a live environment; every uniqueness-policy change; every implementation authorisation; every deployment authorisation | §8, §9 |

### 2.4 What this document deliberately does not claim

- It does not claim any environment is approved, selected or equivalent to another.
- It does not claim a measurement probe is a control, a guard or a pass condition.
- It does not claim production data has ever been read, sampled or scanned.
- It does not claim that answering the six questions authorises any change.
- It does not claim that any of the six decisions is easy, urgent or already decided in substance.

---

## 3. Six-decision readiness matrix

Classification vocabulary for this section: **READY WITH EXPLICIT CAVEATS** (the owner can answer the question
from the evidence in the brief, knowing the stated gaps) · **PARTIALLY READY** (part of the question is
answerable now; part is not) · **NOT READY — EVIDENCE REQUIRED** (no responsible answer is possible yet).
No decision is classified as ready without caveats, because every one has at least one `UNKNOWN` input.

### 3.1 Summary matrix

| ID | Exact decision | Status | Available evidence | Material gap | Depends on | Review readiness |
|---|---|---|---|---|---|---|
| **OD-COLL-01** | which equality `uq_tags_name_lower` must enforce | `OPEN` | index DDL + catalog; 20 local probes; `slug` unique; merge mechanics measured | **no real tag data**; product intent unstated | feeds 06 | **READY WITH EXPLICIT CAVEATS** |
| **OD-COLL-02** | which equality `uq_colleges_name_lower` must enforce | `OPEN` | same + sole-rule status; `code` nullable/non-unique; attribution rule measured | **no real college data**; whether two institutions may share a name | feeds 06 | **READY WITH EXPLICIT CAVEATS** (heavier) |
| **OD-COLL-03** | which provider/locale profile governs production | `OPEN` | CI profile measured; local `C` vs `C.utf8` contrast; R2 comparison rule | **no production measurement**; ICU `NOT TESTED`; `en_US.utf8` vs `C.utf8` never compared | mutual with 04; feeds 05, 06 | **READY WITH EXPLICIT CAVEATS** (prospective target only) |
| **OD-COLL-04** | which fields the fingerprint carries, in what form | `OPEN` | probe source + CI annotations; three artefact shapes; 8 recorded divergences from the proposal | ICU field semantics; `d` provider domain; cluster identity | mutual with 03; feeds 05, 06 | **READY WITH EXPLICIT CAVEATS** |
| **OD-COLL-05** | what happens when observation ≠ expectation | `OPEN` | all of the above; measured control gaps; 25-case structural matrix | approved values (03); approved artefact (04); no committed guard | 03, 04; 01/02 for Layer E | **PARTIALLY READY** — core yes, value-dependent rows **NOT READY** |
| **OD-COLL-06** | what must be validated before either changes | `OPEN` | six-index classification; absent tooling; measured merge hazards | candidate keys (01/02); environment (03); no audit capability; volumes | 01/02, 03, 04 | **READY WITH EXPLICIT CAVEATS** (process core) |

### 3.2 OD-COLL-01 — tags uniqueness semantics

- **Owner decision required:** what makes two tags "the same tag" for uniqueness.
- **Evidence:** `uq_tags_name_lower` is `UNIQUE (lower(name))` (`migration.sql:640`); 20 local probes show
  case-only differences rejected and normalisation-only differences accepted; `slug` is unique and
  format-checked; no application code reads or writes tags (no route handlers exist).
- **Limitations:** no real data at all — no counts, no colliding pairs, no evidence about how tags will be
  entered; the product intent is unstated; `lower()` behaviour is environment-dependent (that is 03's problem).
- **Options and consequences:** A keep `lower()` (status quo; environment-dependent guarantee, no data work) ·
  B exact string (`"Logic Gate"` and `"logic gate"` coexist; duplicates become the user's problem) · C explicit
  fold + uniqueness (largest equivalence classes, therefore a data-remediation project of unknown size; needs
  0002) · D identity moves to `slug` (name becomes display; requires OD-18 and a code path that does not exist)
  · E defer.
- **Operational implication:** A, B and D need no data migration; C does, and its size is unknown. Every option
  requires the audit in OD-COLL-06 before any index change.
- **Dependencies:** none to review; feeds OD-COLL-06 (candidate key) and OD-COLL-05 Layer E (what a behavioural
  difference means). OD-18 governs `slug` representation if D is chosen.
- **Unresolved questions:** volume and collision count; free-text versus controlled vocabulary; whether `slug`
  is intended as permanent identity (S23 §13.2).
- **What would be needed for a responsible decision:** nothing further for the *policy*; the audit report is
  needed before *implementation*, not before the choice.

### 3.3 OD-COLL-02 — colleges uniqueness semantics

- **Owner decision required:** whether `colleges.name` is the institution's identity or its display label.
- **Evidence:** `uq_colleges_name_lower` is `UNIQUE (lower(name))` (`migration.sql:641`) and is the entity's
  **only** uniqueness rule; `code` is nullable, non-unique and read by nothing; `question_sources.college_id`
  is `ON DELETE RESTRICT` and `uq_question_sources_identity` blocks repointing two sources onto one college
  (probe E12b); `is_active` exists, so retirement is possible.
- **Limitations:** no real data; the decisive fact — whether two distinct institutions can share a name — is a
  domain fact nobody has recorded; there is no location or disambiguating field in the schema.
- **Options and consequences:** A keep `lower()` · B exact string (visibly different spellings of one
  institution become distinct rows) · C fold (accent/punctuation-insensitive: `Notre-Dame` = `Notre Dame`;
  larger merge risk, and `unaccent` is unavailable in the measured build) · D identity moves to `code` or a
  generated key (requires `code` to be populated and unique — it is neither) · E defer.
- **Operational implication:** any narrowing option creates collisions that must be merged under the
  attribution rule; the merge is blocked by referential constraints unless handled exactly as E11b.
- **Dependencies:** as for 01, plus the schema change that D would require. **No document treats `code` as an
  approved identity alternative** — it is a candidate at most (S26 §15.1 item 7).
- **Unresolved questions:** same-name institutions; what distinguishes them if they exist; whether a code list
  exists; who maintains it.
- **Caveat that makes this heavier than 01:** the name is the *only* rule, so the choice is a visibility and
  correctness decision for the institution registry, not a tagging convenience.

### 3.4 OD-COLL-03 — production collation profile

- **Owner decision required:** which provider and locale production **will have** (or is allowed to have).
- **Evidence:** CI is measured (`16.16`, UTF8, `libc`, `en_US.utf8`, `datcollversion 2.41`); local contrast
  shows `C` versus `C.utf8` changes which strings collide (`real_c` accepts `Ärger`+`ärger`; `real_u` rejects);
  four stages and seven read-only checks are specified (S22 §2.4, §7.3).
- **Limitations:** **no production fact has ever been measured**; ICU is `NOT TESTED` (unavailable build);
  PostgreSQL 15/17/18 `NOT TESTED`; `en_US.utf8` versus `C.utf8` never directly compared; CI↔production
  equivalence not established.
- **Options and consequences:** A retain the platform default after measurement (no pin: semantics follow the
  host silently) · B explicit libc profile (`C.utf8` or a named locale: reproducible, and it decides the
  folding behaviour of 01/02) · C ICU profile (deterministic, but unmeasurable here and a different feature
  set) · D defer (status quo: environment-dependent guarantee).
- **Operational implication:** the profile cannot be expressed in the migration; it is attached at database
  creation. Choosing B or C is a *creation-time* decision and therefore affects every future environment,
  including restores.
- **Dependencies:** **mutual** with OD-COLL-04 (values ↔ representation); supplies 05's comparison values and
  06's target environment. S22 §12.1 recommends Option D until stages 1–3 are complete — a recommendation, not
  a decision.
- **Unresolved questions:** does a production database exist; what is its profile; is ICU available; which
  locale text is acceptable; who owns the creation-time setting.
- **What the owner can decide now:** a **target** profile and the evidence standard required to confirm it —
  not a statement about any existing database.

### 3.5 OD-COLL-04 — fingerprint specification

- **Owner decision required:** which fields the fingerprint carries, in what canonical form, and what a
  difference means.
- **Evidence:** the probe emits a fixed-order string (`collation-fingerprint/v1;pg;enc;provider;collate;ctype;
  iculocale;collversion`), a profile JSON and a six-index JSON; CI annotations recorded; 13 candidate
  difference outcomes; identity is asserted separately, never serialized.
- **Limitations:** ICU field semantics `NOT TESTED`; the `d` provider is handled inconsistently; cluster
  identity is not captured; no comparison layer, no expectation file; delimiter and `-` handling unresolved
  (now accurately labelled as **not implemented** — §4.4).
- **Options and consequences:** six catalog fields · six + `pg` major (the implemented seven values) · six +
  `pg` + per-index collation objects in one string · something else. The choice fixes what a future guard can
  detect and what it must ignore.
- **Operational implication:** any field addition or representation change breaks byte comparison and requires
  a version bump (`/v2`) and a coexistence rule; a hash-only artefact cannot be reviewed.
- **Dependencies:** **mutual** with 03; supplies 05's artefact and classification grammar; supplies 06's
  report environment fields.
- **What is justified by evidence versus judgment:** layering, identity-as-assertion and explicit NULL/absent
  semantics are justified (S24 §12); the choice between text and canonical JSON is **judgment**, and no
  serialization is approved.
- **Unresolved questions:** S24 Q1–Q6 (mandatory fields; identity binding; text versus JSON; `-`/empty/absent;
  locale-name spelling normalisation; provider domain).

### 3.6 OD-COLL-05 — collation drift failure policy

- **Owner decision required:** when observation differs from expectation, what must happen, and who may lift a
  stop.
- **Evidence:** measured control gaps (no structural guard; no comparison; `unknown` provider not refused;
  delimiter ambiguity); G-1's six destructive statements; the probe's failure states; the four-state model with
  seven precedence rules; 25 executed structural cases.
- **Limitations:** **the value-dependent rows cannot be finalised** — nothing to compare against until 03
  supplies approved values and 04 approves the artefact; no guard exists to enforce any state; Layer E
  thresholds depend on 01/02 and 06.
- **What is answerable now:** the four states, the precedence rules (`REVIEW_REQUIRED` halts, `BLOCK` is never
  downgraded, no automatic re-pin, measurement validity first), and the fail-closed cases that do not depend on
  values (identity mismatch, malformed artefact, missing field, structural mismatch, guard execution error).
- **What is not answerable now:** the classification of a locale, provider or version difference *as severe or
  acceptable* — that presupposes an approved locale (03) and an approved artefact (04). S25 §12.1 marks those
  rows `BLOCKED ON OD-COLL-03 and OD-COLL-04`.
- **Consequences of each stance:** fail-everything (blocks every libc deployment while `datcollversion` is
  uncomparable) · warn-on-unknown (risk of a silent pass) · allow-listed transitions (needs an approver and an
  expiry) · auto re-pin (**rejected** by the brief: it removes the human from the only decision that matters).
- **Dependencies:** 03, 04 (hard); 01/02 (Layer E); 06 (data evidence). Downstream: the guard implementation.
- **Deferral consequence:** the guard has no defined behaviour on drift; a future restore could pass the gate
  unnoticed.

### 3.7 OD-COLL-06 — existing-data compatibility validation

- **Owner decision required:** what validation must exist before a uniqueness change, and what such validation
  may and may not authorise.
- **Evidence:** exactly two of the six indexes are collation-sensitive unique rules; four need structural or
  otherwise applicable checks; **no executable audit capability exists** (no duplicate-detection SQL anywhere
  in the repository); merge hazards are measured (PK collision E11, cascade E11c, attribution E12b).
- **Limitations:** candidate keys undefined until 01/02 are answered; target environment undefined until 03;
  volumes, replica availability and retention (`OD-20`) `UNKNOWN`; the ten-step process and 17 report fields
  are `PROPOSED` and untested.
- **What the owner can decide now:** the scope rule (audit by semantic dependence), the report contents, the
  snapshot rule, the gates, and the prohibition on treating an audit as permission to remediate.
- **What needs another decision first:** the candidate comparison semantics (01/02), the environment recorded
  in the report (03/04), and Q7's acceptance criterion.
- **Consequences of deferral:** a policy change could be attempted against data that cannot satisfy it — the
  build fails safely, or a naive merge cascades and destroys question–tag links.

---

## 4. Cross-document consistency results

### 4.1 Method

Every status was located in each of the seven documents by direct text search, not by inference. The five
briefs and the audit each carry a standing-decisions block at the end; those blocks were compared verbatim. The
deployment package's decision matrix (File C §11) was compared row by row.

### 4.2 The sixteen required statuses

| Status | Stated in | Consistent? |
|---|---|---|
| OD-COLL-01 … 06 `OPEN` | all five briefs (status lines + decision tables), audit §1/§15, register rows in the decision document §12 | **yes** — no document records an answer, an approval or a partial approval |
| G-1 **FAILED** | File C §11 row 1; every brief's standing block; audit §15 | **yes** |
| G-3 **PASSED** | File C §5, §11 row 2; briefs' blocks; audit §15 | **yes** |
| Option C **APPROVED — workflow only** | File C §11 row 3 ("workflow only, 5 conditions"), §6; briefs' blocks ("controlled migration workflow only") | **yes**, same scope in both phrasings |
| B1a **APPROVED (workflow-scoped)** | File C §11 row 4; briefs' blocks | **yes** |
| B1b **NOT APPROVED** | File C §12.3/§11; briefs' blocks | **yes** |
| B1c **NOT APPROVED** | File C §11; briefs' blocks | **yes** |
| B2 **WITHHELD** | File C §13/§11; briefs' blocks | **yes** |
| Migration 0001 **NOT AUTHORIZED for production** | File C §11; briefs' blocks | **yes** |
| Migration 0002 **DO NOT COMMIT** | File C §11; briefs' blocks | **yes** |
| G-2 **DEFERRED** | File C §11; briefs' blocks | **yes** |
| T1 **CLOSED** | briefs' blocks; audit §1 | **yes where stated** — absent from File C (S-1) |
| R2 **PARTIALLY RESOLVED** | briefs' blocks; audit §1; R2 §1/§12; decision doc §16 | **yes where stated** — absent from File C (S-1) |
| CI profile **OBSERVED** | OD-COLL-04 §4, OD-COLL-05 §3.3, OD-COLL-06 §3.3, audit §7 | **yes** — never presented as production |
| Production profile **UNKNOWN**, locale **NOT DECIDED**, equivalence **NOT ESTABLISHED** | 04, 05, 06, audit; 01/02 and 03 state "production locale UNKNOWN and NOT DECIDED" | **yes**, with a wording variance (S-3) |

### 4.3 Finding S-1 — the deployment package is silent on the six collation decisions

`phase-04a-final-database-deployment-decision-package.md` §11 states: *"Every status below was checked against
the authoritative register in this session."* Its matrix has rows for G-1, G-3, Option C, B1a, B1b, B1c, B2,
migration 0001, migration 0002, G-2, OD-17, OD-21, OD-NM-1, the preserved index, production readiness, OD-22
and OD-26-1/OD-26-5. It has **no row** for OD-COLL-01…06, **no mention of T1**, and **no mention of R2** — a
text search for `OD-COLL` in that file returns **zero** hits.

**Nature:** completeness gap, not a contradiction. Nothing in File C asserts that these items do not exist, and
nothing contradicts the six briefs. **Consequence:** an owner who reviews only the deployment package cannot
see that six collation decisions gate the same deployment the package is about. **Disposition:** reported here;
**not** edited, because File C is the historical record of Session 21 and the correction is additive rather than
a fix of a false statement. **Recommended remedy (owner's call):** a single pointer paragraph in File C §11
naming the six decisions and referring to this package. Not done in this session.

### 4.4 Finding S-2 — status wording varies between documents (cosmetic)

| Decision | Brief status line | Decision-table status |
|---|---|---|
| 01 / 02 | `OPEN — NO OWNER DECISION RECORDED` | same |
| 03 | `OPEN — NO PRODUCTION LOCALE SELECTED` | `OPEN` |
| 04 | `OPEN — FINGERPRINT SPECIFICATION NOT APPROVED` | same |
| 05 | `OPEN — COLLATION DRIFT FAILURE POLICY NOT APPROVED` | same |
| 06 | `OD-COLL-06 OPEN — EXISTING DATA COMPATIBILITY VALIDATION REQUIREMENTS NOT APPROVED` | same, with the ID inside the quoted string |

No contradiction: all six are `OPEN`. The variants differ only in how much context the string carries, and 06
alone repeats its own ID inside the status. No action recommended.

### 4.5 Finding S-3 — standing-block omissions (cosmetic, but worth knowing)

| Omission | Where | Effect |
|---|---|---|
| 01/02 end with "Production locale UNKNOWN and NOT DECIDED" but do not add "CI profile OBSERVED; equivalence NOT ESTABLISHED" | 01/02 final block | a reader of that brief alone is not told CI is measured; the brief's §7.1 does say so |
| OD-22 is named only in the audit's block and in File C §10 row 10 | audit; File C | the five briefs do not carry OD-22 in their standing blocks, though 06 §12 relies on OD-20 |
| OD-20 is named in 06's block and the audit's; not in 01/02/03/04/05 | 06 §17, audit | correct for 06, which owns retention questions; asymmetric elsewhere |

### 4.6 Finding S-4 — the register's "six fields" wording (resolved by reference)

The decision document §12 records the OD-COLL-04 options as *"Session 14 six fields · six + `pg` major
(proposed) · six + `pg` + per-index collation objects inside one string · something else"*. Read alone, "six
fields" can be mistaken for the current field count. It is now explained by **§8.3.2** of the same document
(added in Session 28): six catalog fields, seven `key=value` values, eight segments. The register row was
deliberately **not** rewritten — it is the historical statement of the question. Reported as a residual
readability risk, no edit required.

### 4.7 Finding S-5 — G-3 run citation staleness (already recorded)

The register (decision doc §12) and `docs/development/database-migrations.md:29` cite run `45273840004`; the
authoritative G-3 evidence is run `45372731345` (File C §5.1, §11), which the package treats as equivalent and
stronger. This is **C-DEF-6 / C-07** in the Session 27 audit, already recorded as `SUPERSEDED` for the citation
only. `G-3 PASSED` is unaffected. No edit.

### 4.8 Finding S-6 — citation precision in one OD-COLL-04 row

S24 §3.5 (`:453`) writes *"**no escaping** of values and **no delimiter check** (`:149–164`, `:230–248`)"*. The
claim is true, but the ranges point at the serialization and the annotation helper, and the only value check
that exists is the control-character test at `:256–258`. The Session 28 §8.3.1 table now states exactly that,
so the two documents agree in substance. Precision note only; no edit.

### 4.9 Session 28 resolutions, re-verified

| Finding | Requirement | Verified in | Result |
|---|---|---|---|
| **C-02** | delimiter and sentinel validation are not implemented; the requirement remains a proposal | decision doc §8.3 (`:561`), §8.3.1 (`:578–595`); probe `:149–164`, `:256–258`, `:380–384`, `:434–444` | **accurate.** The clause is labelled `PROPOSED` / **NOT IMPLEMENTED**; the implemented prefix check and the annotation-path control-character failure are stated separately; `-` collision and `;` insertion are recorded as undetected |
| **C-04** | six catalog fields, seven `key=value` fields, eight segments | decision doc §8.3.2 (`:609–632`); S24 §2.1 counting note, §3.2 | **accurate.** Recounted independently from `collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=en_US.utf8;ctype=en_US.utf8;iculocale=-;collversion=2.41` → 8 segments, 7 fields, 1 discriminator |
| **C-05** | 13 environment outcomes and 33 cross-layer classifications are different scopes; neither is implemented | S24 §8 (`:527–534`); S25 §4 (`:222–240`) | **accurate.** Both documents state the overlap, the two definitions of `EXACT_MATCH`, and the five results that must not be substituted for one another; S25 states none of the 33 is implemented |
| **C-06** | two collation-sensitive unique rules versus three indexes with collated keys, including the non-unique checksum index | R2 §12.1; measurement proposal §5.3 (`:257–262`); S26 §3.1/§4 | **accurate, and the one conflation found in Session 27 is fixed**: the proposal no longer attributes uniqueness semantics to `ix_question_assets_checksum` |

### 4.10 Consistency conclusion

**No contradiction was found on any of the sixteen required statuses, and none of the four Session 28
resolutions has regressed.** Six findings were registered: one completeness gap (**S-1**, material), two
wording asymmetries (**S-2**, **S-3**, cosmetic), three precision notes (**S-4** to **S-6**, no action). No
document was edited for this audit. No substantive conflict was silently resolved: S-1 is left open and stated
plainly.

---

## 5. Detailed decision register

Standalone, owner-facing. Each decision is `OPEN`. No option is chosen, no date is invented, no signature is
implied.

### 5.1 OD-COLL-01 — tags uniqueness semantics

| Field | Content |
|---|---|
| **Decision ID** | `OD-COLL-01` |
| **Question** | What makes two tags the same tag for uniqueness purposes: exact spelling, case-insensitive equality (and which one), a normalised/folded form, or an identity key other than the name? |
| **Options** | A keep `lower()` (status quo) · B exact string · C explicit normalisation/fold then uniqueness · D move identity to `slug` · E defer |
| **Material trade-offs** | environment-dependence versus determinism (A vs B/C); data remediation cost (C) versus duplicate tolerance (B); a schema and code dependency (D) versus a pure policy change (A/B) |
| **Recommendation in the record** | **none on policy.** The brief recommends a *process* only: answer the business question first; do not choose C to future-proof; treat `slug` as a candidate; never merge automatically; keep 01 and 02 separate (S23 §13.1, `PROPOSED`) |
| **Evidence still missing** | any real tag data (volume, colliding pairs); how tags will be entered; whether `slug` is intended as identity |
| **Dependencies** | feeds OD-COLL-06 (candidate comparison); Layer E of 05; OD-18 if D |
| **If deferred** | `uq_tags_name_lower`'s meaning stays an accident of the database; the environment contract cannot be finalised; the guard cannot pin a per-key expectation with confidence; the user-facing duplicate message may be false for non-ASCII names |
| **Status** | **`OPEN`** |

### 5.2 OD-COLL-02 — colleges uniqueness semantics

| Field | Content |
|---|---|
| **Decision ID** | `OD-COLL-02` |
| **Question** | Is `colleges.name` the institution's identity or its display label — and if the latter, what carries identity given that `code` is nullable, non-unique and read by nothing? |
| **Options** | A keep `lower()` · B exact string · C explicit normalisation/fold (possibly accent/punctuation-insensitive) · D identity moved to `code` or a generated key · E defer |
| **Material trade-offs** | one visible row per institution (A) versus silently distinct rows (B) versus a larger merge surface (C); D needs data that does not exist (`code` populated and unique); the name is the **only** uniqueness rule, so errors are not caught by a second key |
| **Recommendation in the record** | **none on policy** (S23 §12.2, §13.1). The only related recommendation is negative: do not treat `code` as an identity key unless 02 says so and a uniqueness rule exists (S26 §15.1 item 7) |
| **Evidence still missing** | whether two genuinely distinct institutions can share a name; what distinguishes them if they can; whether a code list exists; any real college data |
| **Dependencies** | feeds 06; Layer E of 05; D would need a schema change and an OD-18-class representation decision |
| **If deferred** | duplicate institutions remain possible or become impossible depending on the environment; provenance queries can under-count; a future merge cannot be planned |
| **Status** | **`OPEN`** |

### 5.3 OD-COLL-03 — production collation profile

| Field | Content |
|---|---|
| **Decision ID** | `OD-COLL-03` |
| **Question** | What is the approved production database locale/provider profile — libc `C`, libc `C.utf8` (or another named locale), ICU with an explicit locale, or no pin at all? |
| **Options** | A retain the environment's existing default after measurement · B explicit libc profile · C explicit ICU profile · D defer until the deployment decision fixes the database |
| **Material trade-offs** | A is honest but leaves semantics to the host; B is reproducible and decides the folding behaviour of 01/02; C is deterministic but unmeasurable here and changes the feature set; D preserves the status quo at the cost of an unpinned guarantee |
| **Recommendation in the record** | **process only:** treat Option D as the operative position until the §9 stages are complete; **no locale recommendation is technically justified** (S22 §12.1, `PROPOSED`) |
| **Evidence still missing** | any production measurement; ICU availability and behaviour; PG 15/17/18; a direct `en_US.utf8` vs `C.utf8` comparison |
| **Dependencies** | **mutual** with 04; supplies 05's values and 06's environment |
| **If deferred** | R2 stays PARTIALLY RESOLVED; the fingerprint has no approved value; environment drift cannot be detected; the deployment gate cannot include the collation group |
| **Status** | **`OPEN`** |

### 5.4 OD-COLL-04 — fingerprint specification

| Field | Content |
|---|---|
| **Decision ID** | `OD-COLL-04` |
| **Question** | Which fields constitute the fingerprint, in what canonical form, and with what comparison meaning? |
| **Options** | six catalog fields · six + `pg` major (the implemented seven values) · six + `pg` + per-index collation objects in one string · something else (including a JSON-first artefact with the text line as a human summary) |
| **Material trade-offs** | more fields detect more drift and cost more measurement and compatibility surface; text is reviewable in a diff while JSON is parseable; identity-as-assertion is stronger than identity-as-field but needs an expectation to bind to; a hash-only artefact cannot be reviewed |
| **Recommendation in the record** | layering, identity-as-assertion and explicit NULL/absent semantics **are justified**; a specific serialization (text versus JSON) is **not** (S24 §12, §13.1, `PROPOSED`) |
| **Evidence still missing** | ICU field semantics; the `d` provider domain; cluster identity availability; a decision on delimiters and the `-` sentinel |
| **Dependencies** | **mutual** with 03; supplies 05's grammar and 06's report fields |
| **If deferred** | CI cannot compare environments; a restore into a different locale stays undetectable |
| **Status** | **`OPEN`** |

### 5.5 OD-COLL-05 — collation drift failure policy

| Field | Content |
|---|---|
| **Decision ID** | `OD-COLL-05` |
| **Question** | When observation differs from expectation, what must happen — and who may lift a stop? |
| **Options** | fail on everything · fail on known-field changes and warn on uncomparable NULL versions · warn on everything · allow listed transitions only · automatic re-pin (rejected by the brief) — implemented as a four-state model (BLOCK / REVIEW_REQUIRED / INFORMATIONAL / PASS) with seven precedence rules |
| **Material trade-offs** | strictness versus deployability while `datcollversion` is uncomparable on libc; a warning that nobody reads is a silent pass; an allow-list is a second approval surface that needs an owner and an expiry; auto re-pin removes the human from the decisive step |
| **Recommendation in the record** | **justified:** fail closed by default; distinguish measurement failure from interpreted difference; separate schema-integrity from environment-policy failures; `REVIEW_REQUIRED` halts; no auto re-pin (S25 §13.1, §14.1, `PROPOSED`) |
| **Evidence still missing** | approved values (03); approved artefact (04); a committed structural guard; behavioural tests beyond ASCII; any production observation |
| **Dependencies** | 03 and 04 (hard, for the value-dependent rows); 01/02 (Layer E); 06 (data evidence); downstream of the guard implementation |
| **If deferred** | the guard has no defined behaviour on drift; a future restore could pass the gate; or, if over-strict, every libc deployment blocks on an uncomparable field |
| **Status** | **`OPEN`** |

### 5.6 OD-COLL-06 — existing-data compatibility validation

| Field | Content |
|---|---|
| **Decision ID** | `OD-COLL-06` |
| **Question** | What validation of existing data is mandatory before a uniqueness change, what must it report, and what may it authorise? |
| **Options** | none (rely on the index to fail) · read-only report first · report + owner-reviewed remediation plan · report + remediation + concurrent index build — with ten sub-questions (06-Q1…Q10) and eleven gates |
| **Material trade-offs** | an audit costs access and a write-pause consideration, and its absence converts a data problem into a failed build or a destructive merge; a report that also remediates destroys the evidence it exists to produce; hashing permits dedupe proofs but destroys the ability to judge "same institution?" |
| **Recommendation in the record** | scope by semantic dependence; make the report self-limiting; require the reverse counterfactual; never let audit and remediation be the same artefact; revalidate immediately before a build; keep values out of CI logs; do not treat `code` as an identity key (S26 §15.1, `PROPOSED`) |
| **Evidence still missing** | candidate keys (01/02); target environment (03); snapshot source and volumes; retention and access (OD-20); any executable audit capability |
| **Dependencies** | 01/02 and 03/04 for Q1–Q3 and Q7; gates any index replacement; supplies 05's `EXISTING_DATA_COLLISION` evidence |
| **If deferred** | a policy change could be attempted against data that cannot satisfy it — the index build fails safely, or a naive merge cascades and destroys question–tag links |
| **Status** | **`OPEN`** |

---

## 6. Dependency matrix

### 6.1 The matrix

Rows depend on columns (R = row depends on column).

| | 01 | 02 | 03 | 04 | 05 | 06 |
|---|---|---|---|---|---|---|
| **01** | — | — | — | — | ○ | **●** |
| **02** | — | — | — | — | ○ | **●** |
| **03** | — | — | — | **◐** | **●** | **◆** |
| **04** | — | — | **◐** | — | **●** | **◆** |
| **05** | ○ | ○ | **●** | **●** | — | ○ |
| **06** | **●** | **●** | **◆** | **◆** | ○ | — |

**● genuine prerequisite** (the dependent question cannot be answered without it) · **◐ mutual dependency**
(each supplies something the other needs; neither is upstream) · **◆ evidence prerequisite** (the dependent
question can be specified, but cannot be *executed* without it) · **○ related but independently decidable**.

### 6.2 Edges, typed

| Edge | Type | Reason | Downstream implementation gate |
|---|---|---|---|
| 01 → 06 | genuine prerequisite (Q2, Q7) | the audit cannot be written without a candidate key | any change to `uq_tags_name_lower` |
| 02 → 06 | genuine prerequisite (Q2, Q7) | same | any change to `uq_colleges_name_lower` |
| 03 ↔ 04 | mutual | 03 supplies values; 04 supplies the representation that makes a profile expressible | the comparison layer and the guard |
| 03 → 05 | genuine prerequisite (value-dependent rows) | severity of "locale changed" presupposes an approved locale | the environment assertions of any future guard |
| 04 → 05 | genuine prerequisite (artefact and grammar) | 05 classifies 04's artefact | same |
| 03 → 06 | evidence prerequisite | the report must target an approved environment | the audit run, not its specification |
| 04 → 06 | evidence prerequisite | the report must record the environment fields 04 defines | the audit run |
| 01/02 → 05 | related, independently decidable | Layer E thresholds depend on the chosen semantics, but the severity model does not | behavioural compatibility tests |
| 05 → guard | downstream implementation gate | a policy with no implementation is a note, not a control | structural index guard |
| 06 → index change | hard prerequisite | data must satisfy the candidate rule before the index exists | any uniqueness-index replacement |

### 6.3 Decisions that cannot authorise implementation until their dependencies are resolved

| Decision | May the owner answer it now? | May the answer authorise implementation immediately? | Blocking dependency |
|---|---|---|---|
| **01** | **yes** (policy) | **no** — the audit gates any index change | 06 |
| **02** | **yes** (policy) | **no** | 06 (and a schema decision if D) |
| **03** | **yes** as a target | **no** — a profile is attached at creation time and needs its own measurement | 04, plus the environment measurement |
| **04** | **yes** (fields, layering) | **no** — nothing compares anything today | 03, plus implementation authorisation |
| **05** | **partly** (core) | **no** — no guard exists to enforce any state | 03, 04, plus implementation authorisation |
| **06** | **yes** (process) | **no** — an approved process is not an authorised audit run | 01/02, 03, plus an explicit audit authorisation |

**No decision, alone or in combination, authorises a code change, an index change, a migration or a
deployment.** Those require the separate authorisations listed in §9.

---

## 7. Recommended owner-review sequence

### 7.1 What the dependency graph supports

Three independent tracks, with two join points:

| Track | Decisions | Why it is independent | What it needs |
|---|---|---|---|
| **A — business identity** | 01, 02 | the questions are about product intent; no environment fact is required to answer them | the owner's own domain knowledge; nothing else |
| **B — representation** | 04 (layering, fields, canonical form, identity binding) | these are design choices, not environment values | the probe's measured output, already recorded |
| **C — environment** | 03 (target profile and evidence standard) | a prospective choice; it does not require a live measurement to be *made*, only to be *confirmed* | 04's field set to be expressible |
| **Join 1** | 05 | needs 03's values and 04's artefact for its value-dependent rows | A is not required for the core |
| **Join 2** | 06's Q1–Q3, Q7 | needs 01/02's candidate keys and 03's environment | B is required for the report fields |

### 7.2 Recommended sequence

1. **Answer 01 and 02 first (Track A).** They are the only two questions that require no further evidence and
   no environment. They are also the two that change what a future audit must look for.
2. **In parallel, answer 04's layering and field-set questions (Track B).** Record the choice of text versus
   JSON, the identity-binding rule, and the delimiter/sentinel rule as *decisions*, since all three are
   prerequisites for any comparison.
3. **Then answer 03 (Track C)** as a target profile plus the evidence standard that would confirm it on the
   actual database. Deferral (Option D) is a legitimate answer here and is the recorded recommendation.
4. **Then answer 05's core** (states, precedence, fail-closed cases, no auto re-pin), leaving the
   value-dependent rows explicitly marked as pending 03/04 outcomes.
5. **Finally answer 06's process** (scope, report, snapshot, gates), of which Q1–Q3 and Q7 follow from steps 1
   and 3.
6. **Only after 06 and an explicit audit authorisation**, run an audit; only after that, consider an index
   change; only after that, consider implementation authorisation; only after that, consider B1b/B2.

### 7.3 Alternatives, with trade-offs

| Alternative | Order | Advantage | Cost |
|---|---|---|---|
| **Environment first** | 03 → 04 → 05 → 01/02 → 06 | one environment contract before anything else | delays the two decisions that need no environment; 03 cannot be confirmed against a live database anyway |
| **Data first** | 01/02 → 06 scope → audit → 03 → 04 → 05 | the audit informs the fold choice | the audit's target environment may change afterwards (03 undecided), invalidating the report |
| **Recommended (parallel)** | A and B in parallel → C → joins | matches the real edges; unblocks four decisions without production access | requires two review slots and one re-review of 05 after 03/04 |

**No strict linear order is supported by the evidence.** The three tracks are genuinely parallel; only the
joins are ordered. A sequence that forces 01 → 02 → 03 → 04 → 05 → 06 imposes dependencies the graph does not
contain.

---

## 8. Evidence still required

| ID | Item | Needed by | Who can obtain it | How | Cost | Blocks |
|---|---|---|---|---|---|---|
| E-1 | production provider, locale, `datcollversion`, major, encoding | 03, 04, 05, 06 | owner + operations | read `pg_database` on the intended database | **requires production access** | every environment claim |
| E-2 | CI ↔ production behavioural equivalence | 03, 05 | engineering | paired folding tests on both environments | access to both | equivalence claims only |
| E-3 | `en_US.utf8` versus `C.utf8` direct comparison | 03, 06 | engineering | install the locale in a disposable cluster and re-run the probe matrix | local, cheap | confidence in CI-to-production transfer |
| E-4 | ICU behaviour (fields, folding, determinism) | 03, 04, 05 | engineering | ICU-enabled build | local, medium | any ICU option |
| E-5 | PostgreSQL 15 / 17 / 18 behaviour | 03, 04 | engineering | obtain other builds | local, medium | version-support claims |
| E-6 | real tag data profile (volume, case-only and normalisation-only pairs) | 01, 06 | owner + operations | read-only report | **requires production access + authorisation** | C/D sizing for tags |
| E-7 | whether two distinct colleges may share a name; what a code list is | 02 | owner | one domain statement | none | the decisive 02 question |
| E-8 | snapshot strategy: replica availability, volumes, duration | 06 | operations | infrastructure answer | none | audit feasibility (06-Q4) |
| E-9 | retention, access and classification for audit artefacts | 06 | owner | **OD-20 decision** | none | report handling (06-Q5/Q6) |
| E-10 | operational targets: RTO/RPO, monitoring, runbook | deployment, not the six | owner + operations | **OD-22 decision** | none | B1b/B2 |
| E-11 | a structural index guard and a comparison layer | 05, 04 | engineering | implementation (not authorised) | high | any enforcement |

**Five of the eleven (E-1, E-2, E-6, E-9, E-10) require production access or an owner authorisation; the rest
can be produced locally.** No amount of further documentation produces E-1, E-6, E-7, E-8 or E-9.

---

## 9. Explicit non-authorizations

This document and the six briefs authorise **none** of the following:

- approving, closing, or partially approving any of OD-COLL-01 … OD-COLL-06;
- selecting a production locale, provider or PostgreSQL major;
- approving a fingerprint format, an expectation file, a comparison layer or a drift classifier;
- implementing the structural index guard, the collision audit, or any deployment check;
- modifying `guard.py`, `collation-probe.sh`, `deploy-gate.sh`, `deploy-path-guard.py`, `repo-guard.sh`,
  `migrate-disabled.sh`, any workflow, `package.json`, `prisma/schema.prisma`, migration 0001, or creating
  migration 0002;
- creating, replacing or dropping any index, or modifying any data;
- running an audit, a scan or any query against production or staging;
- authorising **B1b**, **B1c** or **B2**, or deploying migration 0001 to production;
- changing any status in the register reproduced in §11;
- creating a commit, a PR, a merge or a deployment from this package.

**The five authorisation stages remain separate:** measurement · evidence review · owner policy approval ·
implementation authorisation · production deployment authorisation. This package addresses stage 3 only, and
completes none of it.

---

## 10. Final owner handoff checklist

### 10.1 What the owner is being asked to do

- [ ] Read §3 for the six questions, and §5 for each decision's options, trade-offs and missing evidence.
- [ ] Note that every decision is `OPEN` and that no option is pre-selected (§5, §11).
- [ ] Note that five decisions can be answered now with stated caveats, and that **OD-COLL-05 can only be
      partly answered** (§1, §3.6).
- [ ] Note the one completeness gap: the deployment package does not list these six decisions (§4.3).
- [ ] If an answer is given, record it in the register with its evidence reference — a new or revised document,
      not an inference from any brief (§9).

### 10.2 What the owner is not being asked to do

- [ ] Not to authorise implementation, an index change, a migration or a deployment.
- [ ] Not to accept a locale, a profile, a format or a policy as already decided.
- [ ] Not to approve anything by silence, by reliance on a recommendation, or by the fact that a document
      exists.

### 10.3 What remains blocked after the six are answered

| Blocked item | Blocked by |
|---|---|
| Structural index guard | 04, 05, plus implementation authorisation |
| Fingerprint comparison | 03, 04, plus implementation authorisation |
| Any uniqueness-index change | 01 or 02, 06, plus an authorised audit and a migration decision |
| Migration 0001 to production | B1b, B2, OD-22 readiness, plus owner decision |
| Any collision audit run | 06 approval, 01/02 candidates, 03 target, explicit audit authorisation |
| Production environment selection | 03 answer plus E-1 measurement |

### 10.4 How to verify this package's claims

Every factual claim above is traceable: CI values to runs `45546248909`, `45372731345`, `45381634139`,
`45372731513`, `45381634112`; local measurements to a disposable PostgreSQL 16.2/16.x cluster destroyed after
use; implementation to the committed files named in §2.1; statuses to §4.2. Where a claim depends on an
unmeasured environment it is labelled `UNKNOWN`.

---

## 11. Revision history

| Revision | Date | Change |
|---|---|---|
| 1 | 2026-11-24 | Initial owner-review readiness audit and decision handoff (Session 29). Establishes the readiness classification for the six decisions (five READY WITH EXPLICIT CAVEATS, OD-COLL-05 PARTIALLY READY), the sixteen-status consistency verification across seven documents, six consistency findings (S-1…S-6, one material completeness gap), the standalone decision register, the typed dependency matrix, a three-track review sequence with alternatives, an eleven-item evidence register, and an explicit non-authorisation list. **No document was edited; nothing was approved, selected, implemented, migrated, deployed, committed or pushed; no database was started or queried.** |

**Standing decisions reproduced exactly, unchanged by this document:** G-1 **FAILED** · G-3 **PASSED** ·
Option C **APPROVED — controlled migration workflow only** · B1a **APPROVED (workflow-scoped)** · B1b **NOT
APPROVED** · B1c **NOT APPROVED** · B2 **WITHHELD** · migration 0001 **NOT AUTHORIZED for production
deployment** · migration 0002 **DO NOT COMMIT** · G-2 **DEFERRED** · **T1 CLOSED** · **R2 PARTIALLY RESOLVED** ·
OD-COLL-01…06 **OPEN** · OD-17 / OD-20 / OD-21 / OD-22 / OD-NM-1 **OPEN**. CI profile **OBSERVED**; production
profile **UNKNOWN**; production locale **NOT DECIDED**; CI↔production equivalence **NOT ESTABLISHED**.

**A review package is not a review outcome. Six framed questions, no answers, and no authority transfers by
reading this document.**
