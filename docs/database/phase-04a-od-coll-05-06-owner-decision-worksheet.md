# Phase 04A — OD-COLL-05 / OD-COLL-06 Owner Decision Worksheet

**Date:** 2026-11-24
**Repository:** `Tanim-Boss/HSC-ALIM-ICT-Question-Bank`
**Branch:** `arena/49496cf8-hsc-alim-ict-question-bank`
**HEAD when written:** `4d04e4461338ea5931d26faf67d312fbed21de43`
**Purpose:** to make two owner questions answerable — **OD-COLL-05 (collation drift failure policy)** and
**OD-COLL-06 (existing data compatibility)** — without inventing severity levels, record counts, collision
results or an audit capability, and without treating any proposal as implemented.
**Nature:** decision preparation only. No option is selected, no default is pre-selected, no status changes, and
both decision records in §13 are intentionally blank.

Primary sources: `phase-04a-od-coll-05-collation-drift-failure-policy-decision-brief.md` (801 lines) and
`phase-04a-od-coll-06-existing-data-compatibility-decision-brief.md` (707 lines). Supporting sources: the
OD-COLL-03/04 worksheet, the OD-COLL-01/02 worksheet, the Session 29 owner-review handoff, the Session 27
consolidation audit, the deployment decision package (File C), the authoritative register, and the R2
investigation. Implementation evidence was read, never executed: `guard.py`, `collation-probe.sh`,
`deploy-gate.sh`, `deploy-path-guard.py`, `repo-guard.sh`, the G-3 workflow and migration 0001.

Labels for individual claims: `VERIFIED` · `OBSERVED` · `DERIVED` · `PROPOSED` · `UNKNOWN` · `NOT TESTED` ·
`OPEN`. The six evidence **categories** of §2.2 are applied to every item that could otherwise be over-read.

---

## 1. Executive summary

### **WORKSHEET PREPARED — TWO DECISIONS FRAMED — NO OPTION SELECTED — OD-COLL-05/06 `OPEN`**

Eight findings:

1. **There is no drift gate to configure, and no audit capability to run.** What exists is a set of partial
   controls — repository command guard, deployment-path router, checksum gate, five-FK catalog guard, and a
   *measurement-only* probe. `guard.py` has three modes (`sql`, `catalog`, `history`) and **zero** collation or
   `pg_index` awareness (`VERIFIED`: no occurrence of `collation`, `pg_index`, `indcollation` or
   `indisvalid` in it). The probe's own header says it is **NOT a guard** and **does not compare** (`:15`,
   `:77`).
2. **OD-COLL-05's vocabulary is specifiable; its comparison is not.** The brief defines **33
   classifications** across five layers plus measurement validity — Layer A 3, Layer B 11, Layer C 7, Layer D
   6, Layer E 4, Layer M 2 — with four states and seven precedence rules. None of the 33 is implemented, and
   several cannot be completed without approved values (OD-COLL-03) and an approved artefact (OD-COLL-04).
3. **`EXACT_MATCH` is unreachable by construction today.** There is no approved expectation to match, so every
   current run is at most `INFORMATIONAL`. Whether the no-expectation case is `INFORMATIONAL` or blocked is
   itself **open** (05-Q1).
4. **`REVIEW_REQUIRED` halts.** It is not a softer `BLOCK`: both stop, and they differ only in how the stop is
   lifted. Only `INFORMATIONAL` and `PASS` permit continuation.
5. **OD-COLL-06's scope is two indexes, not six.** `uq_tags_name_lower` and `uq_colleges_name_lower` are the
   only rules whose uniqueness *is* the collation. Three are keyed on `uuid`/`enum`/`int4` and cannot be
   affected by any profile; the sixth (`ix_question_assets_checksum`) bears a text key but is **not unique**.
6. **The direction of risk is asymmetric.** A broader fold creates collisions that block index creation —
   visible and fail-closed. A narrower fold creates none and **silently weakens** the guarantee, so validating
   it means proving an *absence*, and a collision report cannot certify it.
7. **A successful audit is one of eleven gates.** It authorises no index, no migration and no deployment, and it
   is valid only for the snapshot it read — a final consistency check is required immediately before any build.
8. **Nothing here is implementable from an answer.** Migration 0002 is `DO NOT COMMIT`; 0001 is not authorised
   for production; B1b/B2 remain `NOT APPROVED`/`WITHHELD`; no guard, comparator, expectation file or audit
   script exists. An answer records policy and authorises nothing (§14).

---

## 2. Scope and evidence boundary

### 2.1 Documents used

| Document | Lines | SHA-256 (first 16) | Role |
|---|---|---|---|
| `phase-04a-od-coll-05-collation-drift-failure-policy-decision-brief.md` | 801 | `61e3ddd0d9ff23a2` | OD-COLL-05 primary source |
| `phase-04a-od-coll-06-existing-data-compatibility-decision-brief.md` | 707 | `ba89956d0cbe45d5` | OD-COLL-06 primary source |
| `phase-04a-od-coll-03-04-owner-decision-worksheet.md` | 679 | `9b67a4e1e9d36f06` | sibling worksheet (format, method) |
| `phase-04a-od-coll-01-02-owner-decision-worksheet.md` | 504 | `35ed3d5e285b0f0e` | sibling worksheet; W-1…W-5 findings |
| `phase-04a-owner-review-readiness-and-decision-handoff.md` | 661 | `38decec31a9d3193` | readiness, evidence register E-1…E-11 |
| `phase-04a-collation-decision-package-consolidation-audit.md` | 696 | `7d8af8f9962c2081` | consistency findings, Session 28 record |
| `phase-04a-final-database-deployment-decision-package.md` | 957 | `dc03e1a44a768361` | deployment boundaries, §11 matrix, §12 readiness |
| `phase-04a-database-collation-product-and-environment-decision.md` | 1105 | `50005a91cb883bad` | authoritative register; §9.1–§9.4, §10.1–§10.7, §12 |
| `phase-04a-index-collation-r2-investigation.md` | 834 | `aab45341e1c05094` | R2; expectation kinds (`none`×8, `database_default`×3) |

### 2.2 The six evidence categories, applied

| Category | Meaning here | Contents |
|---|---|---|
| **Demonstrated** | verified in the repository or in recorded CI evidence | the six index definitions; the four implemented controls; `guard.py`'s three modes and its absence of collation/index awareness; the probe's measurement-only header; the CI profile (`16.16`, UTF8, libc, `en_US.utf8`, `2.41`); G-1's six destructive statements; G-3 `PASSED` (ASCII-only enforcement) |
| **Locally observed** | measured only in disposable PostgreSQL | the 25-case structural matrix and its fail-closed payload tests; the `C.utf8` folding matrix; merge hazards E11, E11b, E11c, E12b; local `datcollversion` NULL |
| **Specified but not implemented** | documented, no code | the 33 drift classifications and four severity states; the 13 OD-COLL-04 outcomes; the expectation file; the structural guard; the separator/delimiter rules; the ten audit steps; the 17 report fields; the ten collision classifications; the eleven gates |
| **Not tested** | no measurement exists | ICU; PostgreSQL 15/17/18; `en_US.utf8` folding; behavioural tests on any target; access-method drift; tablespace/ACL/null-ordering weakening; audit on any real data |
| **Unknown** | requires production or external evidence | production profile, locale, major, encoding, collation version; which database the app will use; row volumes; whether a replica or read-only role exists; `colleges.code` population; retention policy (OD-20) |
| **Requires owner decision** | cannot be answered by measurement at all | the severity of each unclassified row; the no-expectation case; the provider domain; identity binding to a cluster; the write-pause question; who signs a re-pin; who reviews an audit; the acceptance criterion itself |

### 2.3 Boundary restrictions preserved exactly

- **No production data scan has occurred.** No audit run has happened anywhere; the repository contains no real
  tag or college data, so no volume, distribution or Unicode content is known.
- **No collision audit has been executed** — not in CI, not locally, not against any snapshot.
- **No complete structural index guard exists**; a 25-case matrix was run against a throwaway prototype and
  never committed.
- **No fingerprint comparison implementation exists**; the probe measures and reports only.
- **The measurement probe is not a production guard**, and its own header says so (`collation-probe.sh:15`,
  `:77`).
- **OD-COLL-05's value-dependent classifications remain incomplete** (§6).
- **OD-COLL-06's audit requirements are not an implemented audit capability** — they are a specification of
  what such a capability would have to satisfy.

### 2.4 What this worksheet is not

Not a drift policy, not a severity decision, not an audit specification approval, not an audit, not a
remediation plan, and not evidence that either decision's dependencies are resolved. A worksheet records the
shape of a decision; it does not make one.

---

## 3. OD-COLL-05 — the question

### 3.1 The exact question

> **When the observed database environment, collation metadata or protected index properties differ from
> approved expectations, what must happen — and who may lift the stop?**

The register records five response policies: **R-FAIL everything** · **R-FAIL unknown-field changes and
R-WARN on NULL versions** · **R-WARN everything** · **R-ALLOW per listed profile** · **auto re-pin**
(decision document §12). The brief keeps that vocabulary addressable and maps it onto a four-state severity
model, adding the structural and behavioural classes the register's environment-only framing does not cover.

### 3.2 Three questions that must stay apart

| Question | Decision | State |
|---|---|---|
| Which environment is production allowed to have? | **OD-COLL-03** | `OPEN` |
| What is measured, and in what form? | **OD-COLL-04** | `OPEN` |
| What happens when measurement ≠ expectation? | **OD-COLL-05** | `OPEN` |

A drift rule that names none of these is not implementable, because every `BLOCK` compares observed values to
an *approved* value and an *approved* artefact. Neither exists.

### 3.3 What the policy is not

It is not a profile, not a fingerprint, not an audit, not an implementation authorisation, and not a deployment
authorisation. Approving it would change neither B1b (`NOT APPROVED`) nor B2 (`WITHHELD`), and would not
authorise migration 0001 for production.

---

## 4. OD-COLL-05 — failure states and severity analysis

### 4.1 The four states, reproduced exactly

| State | Meaning | Continuation | Who can change it |
|---|---|---|---|
| **BLOCK** | deployment must stop | **none** within this policy | nobody at runtime; only a code/expectation change, reviewed like any other change |
| **REVIEW_REQUIRED** | deployment must stop **until** evidence is reviewed and explicitly authorised | **none automatic** | owner (+ reviewer), by recorded review |
| **INFORMATIONAL** | recorded and reported; no integrity implication established | yes | nobody — it is not a control |
| **PASS** | all applicable approved expectations verified | yes | — |

**`REVIEW_REQUIRED` is not a softer `BLOCK`.** Both halt. A `BLOCK` is lifted only by changing reality (fix the
database, or re-pin the expectation through review); a `REVIEW_REQUIRED` is lifted by recording evidence that
the difference is acceptable. **No fifth state is introduced here, and none may be inferred.**

### 4.2 Precedence, reproduced exactly

| # | Rule | Consequence |
|---|---|---|
| P1 | any **BLOCK** outranks any **PASS** | a passing check never downgrades a failing one |
| P2 | **UNKNOWN** is never converted to **PASS** | missing evidence yields `REVIEW_REQUIRED` (or `BLOCK`), never silence |
| P3 | a **measurement failure** outranks every interpreted result | `MALFORMED_FINGERPRINT`, `GUARD_EXECUTION_ERROR`, `MISSING_FIELD`, `CATALOG_INCOMPLETE` are evaluated first |
| P4 | **identity precedes everything** | `DATABASE_IDENTITY_MISMATCH` invalidates all other evidence |
| P5 | **structural before environmental** in reporting order | a schema defect is not mislabelled as an environment change |
| P6 | `EXPECTED_ENVIRONMENT_CHANGE` cannot be inferred | only read from an explicit approved entry |
| P7 | **no auto re-pin, ever** | a changed environment never rewrites the expectation |

### 4.3 The 33 classifications, by layer

Names are the brief's own; none is renamed, merged or given a new severity here.

| Layer | Classes | Count | Severities as recorded |
|---|---|---|---|
| **A — target identity** | `EXACT_MATCH` · `DATABASE_IDENTITY_MISMATCH` · `WRONG_ENVIRONMENT` | 3 | PASS · BLOCK · BLOCK |
| **B — environment compatibility** | `POSTGRES_MAJOR_CHANGE` · `ENCODING_CHANGE` · `PROVIDER_CHANGE` · `LOCALE_CHANGE` · `COLLATION_VERSION_CHANGE` · `COLLATION_VERSION_UNKNOWN` · `MISSING_FIELD` · `UNSUPPORTED_PROVIDER` · `NONDETERMINISTIC_COLLATION` · `MALFORMED_FINGERPRINT` · `EXPECTED_ENVIRONMENT_CHANGE` | 11 | BLOCK ×8 · REVIEW_REQUIRED ×2 · PASS-on-entry ×1 |
| **C — per-index collation** | `COLLATION_UNAVAILABLE` · `UNEXPECTED_EXPLICIT_COLLATION` · `PER_INDEX_COLLATION_MISMATCH` · `PER_INDEX_PROVIDER_OR_DETERMINISM_CHANGE` · `COLUMN_COLLATION_CHANGE` · `EXPECTATION_UNRESOLVABLE` · `MISSING_INDEX_KEY_METADATA` | 7 | BLOCK ×7 |
| **D — structural integrity** | `INDEX_MISSING` · `INDEX_DEFINITION_MISMATCH` · `INVALID_INDEX` · `INDEX_AMBIGUOUS` · `INVENTORY_VIOLATION` · `GUARD_EXECUTION_ERROR` | 6 | BLOCK ×6 |
| **E — behavioural compatibility** | `BEHAVIORAL_COMPATIBILITY_UNKNOWN` · `EXISTING_DATA_COLLISION` · `BEHAVIOR_NOT_TESTED_ON_TARGET` · `BEHAVIORAL_TESTS_UNAVAILABLE` | 4 | BLOCK ×1 · REVIEW_REQUIRED ×3 |
| **M — measurement validity** | `UNKNOWN_OR_UNCLASSIFIED_CHANGE` · `CATALOG_INCOMPLETE` | 2 | REVIEW_REQUIRED ×1 · BLOCK ×1 |
| **Total** | | **33** | — |

**None of the 33 is implemented.** There is no classifier, no comparator and no expectation file, so no row
here can currently pass or block anything by itself.

### 4.4 The six separations that must survive any summary

| Layer | Question it answers | What it does **not** establish |
|---|---|---|
| **measurement failure** | did the measurement itself produce trustworthy input? | nothing about the database — an unreadable catalog is not a drift finding |
| **fingerprint / environment mismatch** | do the recorded environment properties differ from the approved values? | that any index is valid, or that the target is the intended database |
| **per-index metadata mismatch** | is each protected key attached to the expected collation object? | that the index definition, predicate, key order, opclass or validity is intact |
| **structural-integrity failure** | is each protected index still the object `migration.sql` defines? | that existing rows satisfy the rule |
| **behavioural incompatibility** | do strings compare as required on this build, for the inputs tested? | anything about unmeasured inputs — ICU, PG 15/17/18, `en_US.utf8` are `NOT TESTED` |
| **overall deployment ineligibility** | may this deploy? | nothing on its own: it is the conjunction of every applicable layer **plus** an authorisation |

**A fingerprint match is one input to the sixth, never the sixth itself.**

### 4.5 Malformed input, unknown fields, unknown providers

| Situation | Documented response | Implemented? |
|---|---|---|
| fingerprint unparseable, empty, wrong prefix, wrong segment count | `MALFORMED_FINGERPRINT` → **BLOCK** | **partly** — the probe fails on an empty/non-prefixed string (`:380–384`); there is no parser and no comparator |
| required catalog field absent | `MISSING_FIELD` → **BLOCK** | **yes**, in the probe (`UNSUPPORTED_CATALOG_FIELD` via `fields_present`) |
| additional field from a future version | `UNKNOWN_OR_UNCLASSIFIED_CHANGE` → **REVIEW_REQUIRED** (§4.6; §10 case 3 describes the same stance as "fail closed", which halts — both readings stop the deployment, and the class table governs the state) | **no** — nothing would notice it today |
| provider value unknown | `UNSUPPORTED_PROVIDER` → **BLOCK** | **no** — the probe serializes `provider=unknown` and continues |
| catalog payload incomplete | `CATALOG_INCOMPLETE` → **BLOCK** | **partly** — the probe rejects row/key mismatches; the structural prototype rejects empty payloads, but no structural guard is committed |

### 4.6 The fifteen fail-open / fail-closed cases

Reproduced from the brief (§10) without adding cases: missing fingerprint · missing expected field · unexpected
additional field · NULL collation version · unsupported provider · changed major · name match with uncertain
cluster identity · parser error · missing protected index · definition differs · guard execution error ·
connection error · incomplete catalog · behavioural compatibility untested · **expectation file absent
entirely**. The last is the only genuinely `OPEN` stance: with no approved expectation there is nothing to
drift *from*.

**No case recommends automatic acceptance of environment drift.** The only "continue" answers are `PASS`,
`INFORMATIONAL`, and an `EXPECTED_ENVIRONMENT_CHANGE` entry a human approved in advance.

### 4.7 Behavioural incompatibility and the honest middle

| Rule | Statement |
|---|---|
| B1 | behavioural evidence is not substitutable for structural or environment checks, and vice versa |
| B2 | a change that may alter comparison with no behavioural test on the target → `BEHAVIORAL_COMPATIBILITY_UNKNOWN` → **REVIEW_REQUIRED** |
| B3 | a change that provably cannot affect comparison may be **INFORMATIONAL**, and the claim must be stated and reviewable |
| B4 | unavailability of a test is **not** compatibility → `BEHAVIORAL_TESTS_UNAVAILABLE` |
| B5 | a uniqueness-semantics change makes Layer E decisive and OD-COLL-06 the evidence supplier |

A policy demanding behavioural proof for every deployment would block every deployment; one demanding none
would pass a locale change silently. The middle is `REVIEW_REQUIRED` with a stated residual risk — and it is an
owner decision, not a default.

---

## 5. OD-COLL-05 — option and trade-off analysis

The register defines five response policies. They are reproduced by **title** with the decision ID attached;
no letters are invented and no bare letter appears, because "Option C" already means the approved controlled
migration workflow everywhere else in this package.

### 5.1 OD-COLL-05 response policy — R-FAIL everything

| Aspect | Record |
|---|---|
| Meaning | any difference from the approved expectation blocks deployment |
| Benefits | strongest guarantee; simple to state and to audit; no judgement at the gate |
| Risks | a build that cannot read `datcollversion` blocks forever with no route; every legitimate upgrade requires a policy change; if applied before an expectation exists, nothing can deploy at all |
| Reversible | yes, as a policy; but the operational cost appears immediately |
| Upgrade implications | PG major, OS/glibc and provider changes all become deployment-stoppers requiring an approved re-pin first |
| Evidence status | `PROPOSED`; not implementable today (no comparison) |

### 5.2 OD-COLL-05 response policy — R-FAIL unknown-field changes and R-WARN on NULL versions

| Aspect | Record |
|---|---|
| Meaning | unknown or changed fields fail; a NULL collation version warns because the catalog cannot distinguish "unchanged" from "unavailable" |
| Benefits | matches what the catalog can actually distinguish; avoids the forever-block of a NULL version while failing everything decidable |
| Risks | a warning is only useful if someone reads it; WARN is not one of the four states, so this policy must state which state it corresponds to (`INFORMATIONAL`?) — **a definitional gap, not a technical one** |
| Reversible | yes |
| Evidence status | `PROPOSED`; depends on the state model's WARN mapping, which no source fixes |

### 5.3 OD-COLL-05 response policy — R-WARN everything

| Aspect | Record |
|---|---|
| Meaning | every difference is reported, none blocks |
| Benefits | nothing ever blocks; zero operational friction |
| Risks | the policy becomes a log nobody must read; a locale change or a dropped index would pass the gate; contradicts the measured E8 failure mode and the brief's whole rationale |
| Reversible | yes |
| Evidence status | `PROPOSED`; the brief records it as the option its recommendations argue against |

### 5.4 OD-COLL-05 response policy — R-ALLOW per listed profile

| Aspect | Record |
|---|---|
| Meaning | an explicit allow-list names accepted environment transitions; a difference inside an entry passes |
| Benefits | accommodates planned transitions (a reviewed upgrade) without weakening the default |
| Risks | the list becomes the policy; an entry with no scope or expiry is a permanent exception; "cannot be inferred, only read" (P6) requires an owner to sign each entry — and no mechanism exists |
| Reversible | yes, entry by entry |
| Evidence status | `PROPOSED`; the allow-list mechanism is **05-Q5**, `OPEN` |

### 5.5 OD-COLL-05 response policy — auto re-pin

| Aspect | Record |
|---|---|
| Meaning | a changed environment rewrites the expectation automatically |
| Benefits | none that survive review: it removes the human step |
| Risks | the control ratchets to whatever it last saw; drift becomes invisible by design; **forbidden by decision document §9.4 and by P7** |
| Reversible | not meaningfully — the evidence of the previous state is destroyed by the update |
| Evidence status | **excluded by an existing rule**, not an available option; recorded here only because the register lists it |

### 5.6 The brief's recommendation — attributed, not adopted

The brief records a recommendation for consideration: *fail closed for every known field change and for every
unresolvable expectation; `REVIEW_REQUIRED` only where the catalog genuinely cannot distinguish (NULL
`collversion`); re-pin only via a reviewed expectation commit; never auto re-pin* (05 brief §13.1, `PROPOSED`).
It is a **technical** recommendation, it approves nothing, and this worksheet neither adopts nor upgrades it.

### 5.7 Elements with no documented options — open policy questions, not invented choices

| Element | Why no option set exists |
|---|---|
| the no-expectation case (`INFORMATIONAL` vs blocked) | `OPEN` — 05-Q1; nothing in the sources defines it |
| the WARN vocabulary (which state a WARN maps to) | the register uses R-WARN, the brief uses four states; the mapping is undefined |
| allow-list mechanics (who signs, scope, expiry) | 05-Q5 — mechanism does not exist |
| cluster-identity binding | 05-Q3 — depends on OD-COLL-04 |
| reviewer-of-record and where acknowledgements live | 05-Q9 — undefined |
| standing vs per-deployment behavioural review | 05-Q6 |

**These are described as open questions, not as options.** Inventing a recommended answer for any of them would
be a decision, which this session does not make.

### 5.8 Reversibility and downstream effects

| Choice | Reversible? | Downstream |
|---|---|---|
| stricter default (fail closed) | yes, as policy | more blocks; each block needs the ten-step response and a named reviewer |
| looser default (warn) | yes, as policy | weakens the only mechanism that would notice E8 |
| allow-list entries | per entry | each needs an approver and an expiry |
| no-expectation stance | yes | decides whether the current state deploys or halts — the single most consequential row |

---

## 6. Value-dependent classification gaps

Which parts of OD-COLL-05 are answerable now, and which rows cannot be completed.

### 6.1 Answerable without OD-COLL-03 or OD-COLL-04

| Rule group | Status |
|---|---|
| identity (`DATABASE_IDENTITY_MISMATCH`, `WRONG_ENVIRONMENT`) | definable — about measurement validity, not fields |
| malformed input (`MALFORMED_FINGERPRINT`, `GUARD_EXECUTION_ERROR`, connection error, incomplete payload) | definable — fail-closed is format-independent |
| Layer D structural (`INDEX_MISSING`, `INDEX_AMBIGUOUS`, `INVALID_INDEX`, `INVENTORY_VIOLATION`) | definable — the six definitions are committed and G-3-verified |
| Layer D specifics (`INDEX_DEFINITION_MISMATCH`) | mostly definable; **execution** needs the unimplemented guard |
| the four states and P1–P7 | definable |

### 6.2 Blocked on OD-COLL-04

| Row | Why |
|---|---|
| Layer B field-by-field classification | there is no approved field set or canonical form, so "differs" has no operand |
| Layer C expectation object | the symbolic expectation's representation is OD-COLL-04's |
| provider domain incl. `d` and `unknown` | 05-Q2 depends on 04's domain decision |
| cluster-identity binding | 05-Q3 depends on 04's identity decision |
| `UNKNOWN_OR_UNCLASSIFIED_CHANGE` detection | needs a version-aware comparator that 04 would define |

### 6.3 Blocked on OD-COLL-03

| Row | Why |
|---|---|
| any `EXACT_MATCH` verdict | no approved values exist |
| `POSTGRES_MAJOR_CHANGE`, `ENCODING_CHANGE`, `PROVIDER_CHANGE`, `LOCALE_CHANGE` as *evaluations* | the classes are definable; the comparisons need approved values |
| `EXPECTED_ENVIRONMENT_CHANGE` allow-list | a list of *what* requires approved field values |

### 6.4 Blocked on OD-COLL-01/02 (and 06)

| Row | Why |
|---|---|
| Layer E threshold — when a behavioural difference is material | which differences matter depends on the chosen uniqueness semantics |
| `EXISTING_DATA_COLLISION` as a verdict | the candidate key is undefined until 01/02 decide, and the evidence comes from 06 |

### 6.5 Incomplete rows, stated as incomplete

| Classification | Known | Missing | Cannot be finalised because |
|---|---|---|---|
| `EXACT_MATCH` | definition (every applicable expectation verified, identity bound) | the expectations themselves | 03 + 04 |
| `EXPECTED_ENVIRONMENT_CHANGE` | that it must be read, never inferred (P6) | the allow-list mechanism and its signatory | 05-Q5 |
| `BEHAVIORAL_COMPATIBILITY_UNKNOWN` | that it is `REVIEW_REQUIRED` | what counts as sufficient evidence for a given change | 05-Q6 + 01/02 |
| `UNKNOWN_OR_UNCLASSIFIED_CHANGE` | that it must fail closed | which fields are "known" for each supported version | 04 + 05-Q2 |
| `COLLATION_VERSION_CHANGE` vs `…_UNKNOWN` | the split exists | whether a version change is BLOCK or REVIEW for each environment | 05-Q4 |

**None of these rows is forced into a final classification here.** A row that says "`OPEN`, blocked on X" is
more accurate than a guess, and the policy's own P2 forbids converting an unknown into a pass.

---

## 7. OD-COLL-06 — the question

### 7.1 The exact question

> **What evidence and validation must exist before a production collation profile is approved, or
> collation-sensitive uniqueness semantics are changed?**

The register records four policies: **none (rely on the new index to fail on duplicates)** · **read-only report
first** · **report + owner-reviewed remediation plan** · **report + remediation + concurrent index build**
(decision document §12). The brief's own recommendation is *report first, always read-only; remediation only as
a separate approved step; never automatic merge* (`PROPOSED`).

### 7.2 The governing rule

> No uniqueness semantics may change until a validation report has been produced from a read-only snapshot of
> the target database and reviewed by the owner. (decision document §10.1)

### 7.3 What the decision is not

Not a locale choice (03), not a fingerprint (04), not a drift policy (05), not tag or college identity
(01/02), not an audit, not a remediation plan, and not an authorisation for 0001, 0002, B1b, B1c or B2.

---

## 8. OD-COLL-06 — audit scope and stages

### 8.1 Scope: two indexes, not six

| # | Index | Collation dependence | Audit requirement |
|---|---|---|---|
| 1 | `uq_question_versions_one_published_per_question` | **none** (`uuid` + `enum`) | structural only |
| 2 | `uq_question_sources_identity` | **none** (`uuid`/`enum`; NULL semantics) | structural only — a 5-tuple duplicate check |
| 3 | `uq_topics_chapter_order` | **none** (`uuid` + `int4`) | structural only |
| 4 | `uq_tags_name_lower` | **full** — the guarantee *is* the collation | collision analysis: primary case |
| 5 | `uq_colleges_name_lower` | **full** | collision analysis: primary case, higher stakes (no second key) |
| 6 | `ix_question_assets_checksum` | bears a collatable key, **not unique** | not applicable — duplicates are permitted by design |

A case-insensitive scan over rows whose keys cannot be collated returns zero rows and a false sense of
coverage. **Scope by semantic dependence, not by inventory size.**

### 8.2 The six stages that must never collapse

| Stage | Produces | Authorised by | State today |
|---|---|---|---|
| 1 read-only measurement and collision reporting | the audit report | explicit, scoped read authorisation | **does not exist** |
| 2 owner review of findings | a decision per collision group | owner | not started |
| 3 approval of a remediation plan | a named, reviewed plan | owner | not started |
| 4 actual data remediation | changed rows, with evidence | owner + operator, separately | **not authorised** |
| 5 creation or replacement of indexes | the durable rule | owner + reviewer, separately | **not authorised** |
| 6 production deployment authorisation | production | **B2**, with **B1b** | **WITHHELD / NOT APPROVED** |

### 8.3 The ten audit steps

Target verification (refuse `postgres`/`template*`, refuse an unverified identity) · snapshot or consistency
requirement · table and row-count inventory · **existing** duplicate detection under the current key ·
candidate-semantics grouping (the pair-wise "distinct now, equal later" set, plus the reverse set for a
narrowing) · collision identification with row identifiers · evidence capture · reconciliation report stating
what was *not* checked · independent review (author ≠ reviewer) · final approval record, scoped and expiring.
**`PROPOSED`; never executed.**

### 8.4 Report fields and sensitivity

Seventeen fields are specified, including `audit_id`, `database_identity`, `environment`, `pg_version`,
`collation_profile`, `candidate_expression`, `collision_group_id`, `affected_row_count`, `row_identifiers`,
`original_values`, `candidate_comparison`, `validated_at`, `audit_implementation`, `limitations`,
`untested_cases`, `snapshot_reference`, and `table`/`index`. **Never** a connection string, user name, password,
host, token or credential.

`PROPOSED` handling: full values in a **restricted** artefact, identifiers shareable, nothing in CI logs;
retention and access are **OD-20's** decision (`OPEN`), not OD-COLL-06's.

### 8.5 Snapshot consistency and the TOCTOU window

| Question | Answer | Basis |
|---|---|---|
| can rows change during an audit? | yes, unless writes are blocked or a snapshot is taken | `DERIVED` |
| which isolation? | a single transaction at `REPEATABLE READ` (or `SERIALIZABLE`) | `DERIVED`, `NOT TESTED` here |
| can data change between audit and index creation? | **yes — this is the TOCTOU window** | `DERIVED` |
| must writes be paused? | **not prescribable** — a service-impacting owner decision (06-Q4) | `OPEN` |
| is a final revalidation required? | **yes**, immediately before any build, in the same transaction window | `PROPOSED` |
| does `CREATE UNIQUE INDEX CONCURRENTLY` remove the need? | **no** — it avoids blocking writers, not the duplicate condition | `DERIVED` |

### 8.6 The eleven gates before an index may be built

Semantics approved (01/02) · environment approved (03) · fingerprint and drift policy approved (04/05) ·
current-state audit complete · candidate-semantics report complete · zero unresolved collisions or a separately
approved remediation outcome · remediation evidence · post-remediation audit · final consistency check ·
structural verification · **explicit owner authorisation for this specific build**.

### 8.7 Direction of risk

| Direction | New collisions? | Validation required | Failure mode |
|---|---|---|---|
| broader fold (`C` → `C.utf8`; `lower()` → full fold; add NFC) | **yes** | detect and resolve them | visible, fail-closed |
| unchanged | none | none | none |
| **narrower fold** (`C.utf8` → `C`; drop normalisation) | **none** | prove the **absence** of a weakening | **silent** — the E8 mode |

A collision report cannot certify a narrower policy: there will be no colliding rows to review, and the evidence
that matters is that some pairs *stop* colliding. The audit therefore needs a reverse counterfactual (pairs
equal today, unequal under the candidate), or the narrowing must be accepted on the record rather than on
evidence.

---

## 9. OD-COLL-06 — option and trade-off analysis

### 9.1 OD-COLL-06 validation policy — none (rely on the new index to fail on duplicates)

| Aspect | Record |
|---|---|
| Meaning | adopt the new semantics and let PostgreSQL refuse duplicates at build time |
| Benefits | zero process; a broader fold does fail closed on existing data |
| Risks | a **narrower** fold fails nothing and weakens silently; the index build is not a validation of anything the build cannot see; no evidence exists for review; a failed build in production is the worst place to learn |
| Reversible | the index attempt is; the weakened rule afterwards is not detectable |
| Evidence status | `PROPOSED`; contradicted by §8.7 for narrowing |

### 9.2 OD-COLL-06 validation policy — read-only report first

| Aspect | Record |
|---|---|
| Meaning | produce the §8.3 report from a snapshot before any semantics change |
| Benefits | visible evidence; scoped and repeatable; states its own limitations; makes collisions questions rather than surprises |
| Risks | a report is not a proof of future compatibility; it delays the change by one cycle; a narrow candidate needs the reverse counterfactual to be meaningful |
| Reversible | yes — nothing is changed |
| Evidence status | **the brief's recommendation** (06 §15.1 item 2, `PROPOSED`); the capability does not exist |

### 9.3 OD-COLL-06 validation policy — report plus owner-reviewed remediation plan

| Aspect | Record |
|---|---|
| Meaning | the report, then a per-group owner decision, then a named plan |
| Benefits | merges become deliberate; the measured hazards (E11, E11c, E12b) are addressed in the plan rather than at runtime |
| Risks | requires an owner decision per group; a plan can be executed partially; provenance changes (`question_sources`) are not simply "deduplication" |
| Reversible | partly — a rename is reversible; a merge is reconstructable only from a backup; a cascade deletion is not reversible at all |
| Evidence status | `PROPOSED`; the hazards are `OBSERVED`, the plan process is not implemented |

### 9.4 OD-COLL-06 validation policy — report plus remediation plus concurrent index build

| Aspect | Record |
|---|---|
| Meaning | the full sequence, ending in `CREATE UNIQUE INDEX CONCURRENTLY` |
| Benefits | the durable rule actually lands with evidence behind it |
| Risks | three authorised stages chained, each of which must remain separately authorised; a stale audit (TOCTOU) undermines the build; a concurrent build can still fail on duplicates and that is the correct behaviour |
| Reversible | index creation is reversible by dropping it — which the drift policy would then flag; data remediation is not |
| Evidence status | `PROPOSED`; gate 11 (explicit authorisation for this build) does not exist as a mechanism |

### 9.5 The brief's recommendations — attributed, not adopted

Seven recommendations are recorded in 06 §15.1 (`PROPOSED`), including: scope by semantic dependence; make the
report self-limiting; require the reverse counterfactual when narrowing; never let audit and remediation be the
same artefact; require final revalidation before any build and treat a build refusal as the system working;
keep values out of CI logs and let OD-20 own retention; do not treat `colleges.code` as an identity key. They
are technical recommendations that approve nothing, and this worksheet does not upgrade any of them.

### 9.6 The ten owner questions (06-Q1…Q10)

Mandatory audit scope · candidate comparison semantics · Unicode test coverage · snapshot strategy and whether
writes may pause · report contents and location · sensitive-value handling · the acceptance criterion for
"zero collisions" · who authorises remediation and in what form · when revalidation must occur · what
authorises index creation and whether OD-COLL-06 approves it (it does not).

### 9.7 Elements with no documented options

Unicode coverage thresholds (which pairs must be tested); the write-pause decision; the restricted-artefact
audience; reviewer independence; whether a staging pre-flight audit is required and how it stays honest
(06-U4); whether any tag or college name carries personal data (06-U6); the audit implementation and who
reviews its SQL (06-U7). **These are open questions, not fabricated options.**

---

## 10. Existing-data acceptance criteria

### 10.1 The ten documented collision classifications

`NO_COLLISIONS_FOUND` (informational, scope must be accepted) · `EXISTING_DUPLICATES_UNDER_CURRENT_RULE`
(block — integrity finding, cause is a defect not a policy) · `NEW_COLLISIONS_UNDER_CANDIDATE_RULE` (block) ·
`NULL_SEMANTICS_CHANGE` (block) · `NORMALIZATION_DIFFERENCE` (review) · `BEHAVIORAL_RESULT_UNKNOWN` (review) ·
`AUDIT_INCOMPLETE` (block) · `TARGET_IDENTITY_UNVERIFIED` (block — invalidates everything) ·
`INDEX_DEFINITION_MISMATCH` (block) · `DATA_CHANGED_AFTER_AUDIT` (block).

### 10.2 The two rules that fix the meaning of acceptance

1. **Zero observed collisions is not complete semantic compatibility.** It is the absence of a finding in one
   snapshot, under one candidate key, in one environment, with stated limits.
2. **Every classification can block.** Only `NO_COLLISIONS_FOUND` and `NORMALIZATION_DIFFERENCE` (under a
   non-normalising candidate) can lead anywhere without another audit.

### 10.3 What "acceptable compatibility result" can and cannot mean

| Can be established | Cannot be established |
|---|---|
| this snapshot has no collisions under the candidate key | that no collision will appear later |
| a remediation plan was executed to completion at that time | that no later write reintroduces one |
| the index definition at audit time matched the expectation | that the index was created exactly as audited |
| the environment was the one measured | that the environment stayed the same |

### 10.4 What a successful audit is not

It is **not** permission to create an index. It is one of eleven gates, and it is valid only for the snapshot it
read. The same discipline that separates stages 1–6 separates "the data can satisfy the rule" from "the rule
may now be built".

### 10.5 The measured remediation hazards (preserved, not acted on)

| Hazard | Evidence | Consequence for an acceptance criterion |
|---|---|---|
| naive tag merge → `question_tags_pkey` violation | E11 | a merge plan must insert-if-absent before deleting |
| deleting a used tag → links cascade away silently | E11c | "just delete the duplicate" destroys data without an error |
| safe merge shape (insert `ON CONFLICT DO NOTHING`, then delete) | E11b | feasible, but only deliberately |
| repointing a source → `uq_question_sources_identity` violation | E12b | attributions must be adjudicated before repointing |
| board vs college source exclusivity | `migration.sql:608–609` | repointing a board-side source is a different attribution, not a merge |

**No merge, delete, rename or repoint is authorised by this worksheet**, and `colleges.code` is not an identity
key.

---

## 11. Cross-decision dependency analysis

### 11.1 The dependencies, verified against the sources

| Dependency | Source record | What it means |
|---|---|---|
| **OD-COLL-01 → OD-COLL-06** | 06 §13.1 ("which candidate key to test — **no — OD-COLL-01/02**"); 06 §13.2 | the comparison is undefined without the candidate expression |
| **OD-COLL-02 → OD-COLL-06** | same, independently for colleges; colleges have no second key | same, with higher stakes |
| **OD-COLL-03 → OD-COLL-05** | 05 §12.1 (environment Layer B "**BLOCKED ON OD-COLL-04**"; any `EXACT_MATCH` "**BLOCKED ON OD-COLL-03 and OD-COLL-04**"); 05 §6.2 | every `BLOCK` compares to approved values, and none exist |
| **OD-COLL-04 → OD-COLL-05** | 05 §12.1; 05 §7.3 ("every rule in §7.1 is **BLOCKED ON OD-COLL-04** for its artefact") | there is no approved field set or canonical form to compare against |
| **OD-COLL-03/04 → OD-COLL-06** | 06 §13.1 (which environment to audit — 03; the report's environment fields — 04) | the report must record the environment, and the profile decides what `default` means |

### 11.2 Why OD-COLL-05 has policy questions that can be decided now

Identity, malformed input, structural integrity and the state model are properties of *measurement* and
*definitions*, not of values. `INDEX_MISSING`, `INVALID_INDEX`, `GUARD_EXECUTION_ERROR` and
`DATABASE_IDENTITY_MISMATCH` mean the same thing under any profile. The brief records this explicitly
(05 §12.1: identity and malformed input are "**yes**"; Layer D is "**yes**").

### 11.3 Why some value-dependent rows cannot be completed yet

A comparison needs two operands. Where the approved value is missing (03) or the artefact is undefined (04),
the only honest content is "`OPEN`, blocked on X". P2 forbids treating that as a pass, and inventing a value
would be inventing a production configuration — prohibited.

### 11.4 Why OD-COLL-06 cannot finalise candidate-key compatibility rules

The decisive query compares `<current_key>` with `<candidate_key>`. Until 01/02 choose the candidate, the
comparison has one unknown operand. This is **not a technical detail**: it is the dependency the brief names
(06 §5.2, §13.1).

### 11.5 What OD-COLL-06 can approve independently

| Element | Independent |
|---|---|
| the audit is read-only and separate from remediation | **yes** |
| identity verification, scope declaration, limitations recorded | **yes** |
| the report field set and the credential prohibition | **yes** |
| snapshot/isolation requirements and the TOCTOU rule | **yes** |
| the ten collision classifications | **yes** |
| remediation prohibition and the hazard list | **yes** |
| gates 4, 9, 10, 11 | **yes** |

So OD-COLL-06 can approve a **process and a format** while its candidate-key content stays open — the same
scoping discipline §9.5 of the OD-COLL-03/04 worksheet applied to that pair.

### 11.6 Later activities that each need their own authorisation

| Activity | Needs |
|---|---|
| an audit run | stage 1 read authorisation (and a database, a role, and a snapshot source) |
| retention of an audit artefact | OD-20 (`OPEN`) |
| any remediation | stage 3 plan + stage 4 execution |
| any index creation | stage 5 + gate 11 |
| any production deployment | B1b + B2 |
| any drift policy implementation | separate implementation authorisation |

**A worksheet does not resolve a dependency.** OD-COLL-01…06 remain `OPEN`, and the existence of this document
changes no status, no gate and no boundary.

---

## 12. Unresolved questions and evidence register

### 12.1 OD-COLL-05 (brief §14.2, verbatim in substance)

| ID | Question | Blocked on | Who |
|---|---|---|---|
| Q1 | With no approved expectation, is a run **informational** or **blocked**? | 04/03 | owner |
| Q2 | Is an unsupported provider a hard block, and what is the provider domain (incl. `d`)? | 04 | owner |
| Q3 | Must identity bind to a cluster, and with what evidence? | 04 | owner |
| Q4 | Is a collation-version change a block or a review, given CI can detect it and other builds cannot? | this decision | owner |
| Q5 | What is the allow-list mechanism, and who signs an entry? | 03 + this | owner + ops |
| Q6 | Is `BEHAVIORAL_COMPATIBILITY_UNKNOWN` a standing or per-deployment review item? | 01/02 | owner |
| Q7 | Which structural classes must be covered before the guard may gate a deployment? | this decision | owner + reviewer |
| Q8 | After an applied-migration defect, is the default response restore or forward-fix? | operations | owner + ops |
| Q9 | Who is the reviewer-of-record, and where is the acknowledgement stored? | operations | owner |

### 12.2 OD-COLL-06 (brief §14 and §15.2)

| ID | Question | Who |
|---|---|---|
| 06-Q1 | What audit scope is mandatory before a profile or uniqueness change? | owner |
| 06-Q2 | Which candidate comparison semantics must the audit implement? | owner (after 01/02) |
| 06-Q3 | What Unicode test coverage is required? | owner |
| 06-Q4 | What snapshot strategy, and may writes be paused? | owner + ops |
| 06-Q5 | What must the report contain, and where does it live? | owner |
| 06-Q6 | How are sensitive values handled? | owner (+ OD-20) |
| 06-Q7 | What is the acceptance criterion for "zero collisions"? | owner |
| 06-Q8 | Who authorises remediation, and in what form? | owner |
| 06-Q9 | When must revalidation occur relative to index creation? | owner |
| 06-Q10 | What authorises index creation, and does OD-COLL-06 approve it? | owner (answer: it does not) |
| U1 | Does a read replica exist for the snapshot? | operations (`UNKNOWN`) |
| U2 | Is there a read-only role, and who grants it? | operations (`UNKNOWN`) |
| U3 | What volumes must the audit tolerate, and what duration is acceptable? | operations (`UNKNOWN`) |
| U4 | Must staging mirror production for a pre-flight audit, and how is that kept honest? | owner |
| U5 | Who is the independent reviewer, and how is independence recorded? | owner |
| U6 | Do any names carry personal data? | owner + OD-20 |
| U7 | What is the exact audit implementation, and who reviews its SQL before it runs? | owner |

### 12.3 Evidence register for this worksheet

| ID | Item | Category today | Needed | Blocks |
|---|---|---|---|---|
| W-01 | approved production profile values | **Unknown** | 03 decision + one read-only measurement | every Layer B evaluation |
| W-02 | approved fingerprint field set and canonical form | **Specified, not implemented** | 04 decision | Layer B/C artefact comparison |
| W-03 | expectation file and comparator | **Specified, not implemented** | implementation authorisation (not given) | `EXACT_MATCH`, all 33 rows' execution |
| W-04 | committed structural index guard | **Locally observed** (25-case prototype) | implementation authorisation + CI wiring | Layer D execution |
| W-05 | behavioural test on any target build | **Not tested** | a target build; ICU and 15/17/18 unavailable | Layer E threshold |
| W-06 | existing-data validation capability | **Specified, not implemented** | 06 approval + implementation authorisation | any audit run |
| W-07 | read-only role / replica / snapshot source | **Unknown** | operations | stage 1 authorisation |
| W-08 | row volumes and Unicode content of the corpus | **Unknown** | production access (never granted) | audit duration, coverage sampling |
| W-09 | retention and access policy for audit artefacts | **Unknown** — OD-20 `OPEN` | owner decision | storing any report |
| W-10 | write-pause feasibility | **Requires owner decision** | owner + ops | snapshot strategy (06-Q4) |
| W-11 | reviewer-of-record and independence | **Requires owner decision** | owner | stage 2/9 acceptance |
| W-12 | allow-list signatory and mechanism | **Requires owner decision** | owner + ops | `EXPECTED_ENVIRONMENT_CHANGE` |
| W-13 | provider domain incl. `d`/`unknown` | **Requires owner decision** | 04 | `UNSUPPORTED_PROVIDER` |
| W-14 | whether `en_US.utf8` folds like `C.utf8` | **Not tested** | install the locale, re-run the matrix | any claim about CI-like production |

**No item in this register can be produced by writing more documentation.** Four require owner decisions
(W-10…W-13); four require operational facts (W-07…W-09, and W-01's measurement); three require implementation
authorisation (W-03, W-04, W-06).

---

## 13. Owner decision records — blank

**Both records are intentionally blank.** Nothing below has been filled in, and nothing may be inferred from the
order or wording of the options. A decision is recorded only when the owner writes it into a reviewed document.

### 13.1 OD-COLL-05 — collation drift failure policy

| Field | Record |
|---|---|
| **Decision ID** | `OD-COLL-05` |
| **Selected option or policy** | `NOT DECIDED` — record the **full title** (e.g. "R-FAIL unknown-field changes and R-WARN on NULL versions") plus the state mapping for any WARN, never a bare letter |
| **Owner rationale** | `NOT RECORDED` |
| **Accepted trade-offs** | `NOT RECORDED` |
| **Required follow-up evidence** | `NOT RECORDED` — e.g. an approved profile (W-01), an approved field set (W-02), or an explicit scope limitation |
| **Decision date** | `NOT RECORDED` |
| **Approval status** | **`OPEN`** |
| **Authorised by this record** | **nothing** — no guard, no classifier, no comparator, no expectation file, no CI step, no deployment |

### 13.2 OD-COLL-06 — existing data compatibility

| Field | Record |
|---|---|
| **Decision ID** | `OD-COLL-06` |
| **Selected option or policy** | `NOT DECIDED` — record the **full title** (e.g. "report + owner-reviewed remediation plan") and the answers to 06-Q1…Q10 separately |
| **Owner rationale** | `NOT RECORDED` |
| **Accepted trade-offs** | `NOT RECORDED` |
| **Required follow-up evidence** | `NOT RECORDED` — e.g. the audit report format, the candidate key from OD-COLL-01/02, or the acceptance criterion |
| **Decision date** | `NOT RECORDED` |
| **Approval status** | **`OPEN`** |
| **Authorised by this record** | **nothing** — no audit run, no SQL, no remediation, no index, no deployment |

### 13.3 What a completed record would look like (structure only, still blank)

```text
Decision: OD-COLL-05 | OD-COLL-06
Option or policy chosen: <full title from §5 or §9>
Answers to the numbered questions: <Q1…Q9 | 06-Q1…Q10>
Rationale: <the owner's own words>
Trade-offs accepted: <one line per accepted consequence>
Follow-up evidence required: <none | W-01 | W-05 | W-06 | other>
Recorded in (document, date): <…>
Approval status: OPEN until recorded in a reviewed document
```

---

## 14. Explicit non-authorisations

This worksheet authorises **none** of the following:

- deciding OD-COLL-05 or OD-COLL-06, or preselecting, recommending or implying an answer to either;
- inventing a fifth severity state, renaming a classification, or re-ranking any row of the 33;
- implementing a drift classifier, comparator, expectation file, allow-list or structural guard;
- writing or running an audit script, a collision query, or any `SELECT` against any database;
- creating, dropping or restoring any database, snapshot or dump;
- merging, renaming, deleting or repointing any row of `tags`, `colleges`, `question_tags`,
  `question_sources`, `colleges.code` or any other table;
- creating, replacing or dropping any index;
- modifying `guard.py`, `collation-probe.sh`, `deploy-gate.sh`, `deploy-path-guard.py`, `repo-guard.sh`,
  `migrate-disabled.sh`, any workflow, any test, `package.json`, `prisma/schema.prisma`, migration 0001, or
  creating migration 0002;
- changing any decision status: OD-COLL-01…06, G-1, G-3, Option C, B1a, B1b, B1c, B2, 0001, 0002, G-2, T1, R2,
  OD-17, OD-20, OD-21, OD-22, OD-NM-1;
- connecting to production or staging, or reading their catalogs, backups, logs or data;
- staging, committing, pushing, opening a PR, merging or deploying.

**A drift policy is not a guard, an audit requirement is not an audit, a worksheet is not a decision, and an
approval of either question would authorise none of the items above.**

---

## 15. Revision history

| Revision | Date | Change |
|---|---|---|
| 1 | 2026-11-24 | Initial owner decision worksheet for OD-COLL-05 and OD-COLL-06 (Session 32). States both questions; reproduces the four severity states, P1–P7, the 33 classifications by layer (3/11/7/6/4/2), the 15 fail-closed cases, the six stage separations, the two-index audit scope, the ten audit steps, the 17 report fields, the ten collision classifications and the eleven gates; records five drift-policy options and four validation-policy options **by title** with the decision ID; marks the value-dependent rows as incomplete with their blocking decision; verifies the five cross-decision dependencies against the source tables; and leaves both owner decision records blank. **No document was edited, no database was contacted, no audit was run, no option was selected, and both decisions remain `OPEN`.** |

**Standing decisions reproduced exactly, unchanged by this document:** G-1 **FAILED** · G-3 **PASSED** ·
Option C **APPROVED — controlled migration workflow only** · B1a **APPROVED (workflow-scoped)** · B1b **NOT
APPROVED** · B1c **NOT APPROVED** · B2 **WITHHELD** · migration 0001 **NOT AUTHORIZED for production
deployment** · migration 0002 **DO NOT COMMIT** · G-2 **DEFERRED** · **T1 CLOSED** · **R2 PARTIALLY RESOLVED** ·
**OD-COLL-05 `OPEN`** · **OD-COLL-06 `OPEN`** · OD-COLL-01/02/03/04 **`OPEN`** · OD-17 / OD-20 / OD-21 / OD-22 /
OD-NM-1 **`OPEN`**. CI profile **OBSERVED**; production profile **UNKNOWN**; production locale **NOT DECIDED**;
CI↔production equivalence **NOT ESTABLISHED**.
