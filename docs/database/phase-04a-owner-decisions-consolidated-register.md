# Phase 04A — Consolidated Owner Decision Register: OD-COLL-01 … OD-COLL-06

**Date:** 2026-11-24
**Repository:** `Tanim-Boss/HSC-ALIM-ICT-Question-Bank`
**Branch:** `arena/49496cf8-hsc-alim-ict-question-bank`
**HEAD when written:** `4d04e4461338ea5931d26faf67d312fbed21de43`
**Nature:** consolidation only. Six owner decisions are registered, none is taken. No option is selected, no
status changes, no code, schema, data or database is touched, and no deployment authority is created.

---

## 1. Executive status

### **SIX OWNER DECISIONS CONSOLIDATED — ZERO DECISIONS SELECTED — ALL SIX REMAIN OPEN**

This document is a **decision register**. It records, for each of the six collation decisions, the question the
owner must answer, the evidence that exists, the evidence that does not, what each decision depends on, and what
an answer would and would not authorise. It is **not** an approval record, **not** an implementation
authorisation, and **not** a readiness certificate for deployment.

Six statements hold for every section below:

1. **All six decisions are `OPEN`.** No option has been selected, no rationale recorded, no trade-off accepted,
   no owner signature exists. The decision records in §11 are blank by design.
2. **Consolidation is not resolution.** A single document listing six open questions is still six open
   questions; the cross-references make dependencies visible, they do not discharge them.
3. **No evidence is promoted.** CI-observed facts remain CI facts; disposable-database observations remain
   local; production remains `UNKNOWN` in every field that has never been measured.
4. **A policy is not an implementation.** Nothing in the repository compares a measurement to an expectation,
   enforces a drift state, runs an audit, or carries a structural index guard.
5. **An answer would authorise nothing by itself.** Each decision's exit criteria (§13) list what would still be
   required: evidence, a separate implementation authorisation, validation, and — for production — B1b and B2.
6. **Standing blocks are unchanged.** G-1 `FAILED` · G-3 `PASSED` · Option C `APPROVED — controlled migration
   workflow only` · B1a `APPROVED (workflow-scoped)` · B1b `NOT APPROVED` · B1c `NOT APPROVED` · B2 `WITHHELD` ·
   migration 0001 `NOT AUTHORIZED for production` · migration 0002 `DO NOT COMMIT` · G-2 `DEFERRED` · T1
   `CLOSED` · R2 `PARTIALLY RESOLVED`.

---

## 2. Global decision status

Review-readiness wording is the Session 29 handoff's own classification (handoff §3.1), used here with its
definition: it describes whether the **owner can answer the question from the recorded evidence**, never whether
anything may be implemented or deployed.

| ID | Decision title | Status | What the owner must decide | Review readiness (handoff §3.1) | Blocking dependencies | Downstream consequence |
|---|---|---|---|---|---|---|
| **OD-COLL-01** | Tag uniqueness semantics | **`OPEN`** | which equality relation `uq_tags_name_lower` should enforce — `lower()`, exact string, an explicit normalisation/fold, a key other than the name, or defer | **READY WITH EXPLICIT CAVEATS** — no real tag data, no product statement | none to *answer*; OD-COLL-06 to *implement* | any change to `uq_tags_name_lower`; tag merge mechanics; the user-facing duplicate message |
| **OD-COLL-02** | College identity semantics | **`OPEN`** | whether `colleges.name` is the institution's identity or its display label, and if the latter what carries identity | **READY WITH EXPLICIT CAVEATS (heavier)** — the decisive domain question is unanswerable from the repository | none to *answer*; OD-COLL-06 (and a schema decision if option D) to *implement* | `uq_colleges_name_lower`; `question_sources` attribution semantics; provenance |
| **OD-COLL-03** | Production collation profile | **`OPEN`** | which provider/locale profile production must have, and what evidence confirms it | **READY WITH EXPLICIT CAVEATS (prospective target only)** — no production measurement exists | none to *select a target*; measurement to *confirm* | every value-based comparison in 04 and 05; what `database_default` means in production |
| **OD-COLL-04** | Collation fingerprint specification | **`OPEN`** | which fields the fingerprint carries, in what canonical form, with what identity binding and comparison meaning | **READY WITH EXPLICIT CAVEATS** — the measured artefact exists; ICU and other majors are `NOT TESTED` | none for layering/fields; OD-COLL-03 for provider-conditional applicability | whether any comparison, expectation file or drift classifier can be built at all |
| **OD-COLL-05** | Collation drift failure policy | **`OPEN`** | what happens when observation ≠ expectation, and who may lift a stop | **PARTIALLY READY** — core yes, value-dependent rows **NOT READY** | OD-COLL-03 (values), OD-COLL-04 (artefact and grammar) | any future drift gate; how E8-class silent weakening is handled |
| **OD-COLL-06** | Existing data compatibility | **`OPEN`** | what validation must exist before a profile change or a collation-sensitive uniqueness change | **READY WITH EXPLICIT CAVEATS (process core)** — the candidate key belongs to 01/02 | OD-COLL-01/02 (candidate key), OD-COLL-03/04 (environment and fields) | any audit run, any merge, any index replacement, any uniqueness change |

**None of the six is approved, resolved, accepted or ready to implement.** The readiness column describes
reviewability, not authority; the register contains no row where an answer exists.

---

## 3. OD-COLL-01 — Tag uniqueness semantics

### 3.1 The rule that exists today

| Property | Value | Source |
|---|---|---|
| Index | `uq_tags_name_lower` — `CREATE UNIQUE INDEX … ON tags (lower(name))` | `migration.sql:640` |
| Secondary rule | `uq_tags_slug` (plain unique on `slug`) | `migration.sql:366` |
| Checks | `ck_tags_name_not_blank`, `ck_tags_slug_format` | catalog, `VERIFIED` |
| References | `question_tags(question_id, tag_id)`, PK on the pair, both FKs `ON DELETE CASCADE` | `migration.sql:224–230`, `:447` |
| Write path | **none** — no `prisma.tag.*` call outside tests, no slug generator, no tag editor | `VERIFIED` (absence) |
| User-facing promise | duplicate-name error text says names are compared *"ignoring case"* | `server/questions/publish/db-errors.ts:68–72` |

### 3.2 What the current rule actually enforces

`lower(name)` under the **database's ctype** — nothing more. The four concepts must not be collapsed:

| Concept | What it does | How it behaves today | Evidence |
|---|---|---|---|
| `lower()` | per-code-point case conversion using the OS tables | `ICT`/`ict` collide everywhere; `Ärger`/`ärger` collide only on a UTF-8 locale; `Ärger`/`ärger` do **not** collide under `C` | `OBSERVED` (local, `C` vs `C.utf8`) |
| Unicode case folding | case-insensitive comparison form (`ẞ→ss`, `ς→σ`) | **not performed anywhere** — `ẞ`/`ss` and `ς`/`σ` remain distinct | `OBSERVED` (local) |
| Normalisation | composes/decomposes (`NFC`/`NFD`) | **not applied** — `é` and `e`+U+0301 are two rows | `OBSERVED` (local) |
| Collation equality | decides `=`/ordering under a locale | is the environment's; `database_default` (OID 100) means different things in different databases | R2 §12.1; `OBSERVED` |

### 3.3 The five documented alternatives, by their own names

| Source name | Meaning | Benefits | Risks |
|---|---|---|---|
| **OD-COLL-01 option A — preserve `UNIQUE(lower(name))` (status quo)** | the present rule, unchanged | zero work; already deployed and negative-tested; strongest available behaviour on a UTF-8 locale | silently weaker on a `C` database (E8 class); no normalisation; no full folding; the message overstates it |
| **OD-COLL-01 option B — exact-string uniqueness** | `UNIQUE(name)`; spelling and case are meaningful | portable, locale-independent, trivially predictable | **weakens** today's guarantee everywhere; contradicts the error mapping and the user message |
| **OD-COLL-01 option C — explicit normalisation then uniqueness** | a written fold (+ NFC) enforced by a generated column or pinned expression index | environment-independent by construction; reviewable; can make the message true | larger equivalence classes ⇒ collisions become duplicates; needs a fold spec and pinned Unicode version; a schema change (0002) |
| **OD-COLL-01 option D — a stable canonical identity key separate from the display name** | `name` becomes display-only; identity moves to `slug` (already unique and format-checked) | separates "what it is called" from "which one it is"; no Unicode policy needed for identity | slugs are authoring-supplied (no generator); renaming becomes free; duplicate names become visible in listings |
| **OD-COLL-01 option E — defer** | no policy change; the environment keeps deciding | no data risk; reversible; waits for 03/06 evidence | the promise stays environment-dependent; a `C` production weakens the rule silently |

### 3.4 Consequences for existing records and relationships

| Consequence | Evidence | Status |
|---|---|---|
| a naive merge (`UPDATE question_tags SET tag_id = survivor`) is **rejected** by `question_tags_pkey` | E11 | `OBSERVED` (local) |
| the safe shape (insert missing pairs `ON CONFLICT DO NOTHING`, then delete) works | E11b | `OBSERVED` (local) |
| deleting a used tag **cascades its question links away with no error** | E11c | `OBSERVED` (local) |
| a question carrying **both** tags collapses to one link — information loss, not de-duplication | `DERIVED` from the PK | `DERIVED` |
| no data exists in the repository, so no count, distribution or collision total is known | — | **`UNKNOWN`** |

### 3.5 Missing domain facts and the required decision

Missing: whether tags are a curated taxonomy or free-form labels (T4); whether `ICT`/`ict` should be one tag and
whether the current ASCII/UTF-8 split is acceptable (T1); whether normalisation variants should merge (T2);
whether `slug` is the permanent identity and renaming is allowed (T3); how many tags exist and how many pairs
each option would collide (X1, blocked on 06).

Required decision: **which equality relation is the intended contract** — the option titles of §3.3, quoted in
full. **No policy recommendation is justified by the evidence** (01-02 §12.1: the evidence does not distinguish
A/B/C/D on merit; only the merge mechanics are established).

Dependencies: option A's *meaning* is the environment (03); options B/C/D do not depend on 03; any
implementation depends on 06's validation; adjacent is **OD-18** (structured-content representation of tags).

---

## 4. OD-COLL-02 — College identity semantics

### 4.1 The rule that exists today

| Property | Value | Source |
|---|---|---|
| Index | `uq_colleges_name_lower` — unique `lower(name)` on `colleges(name)` | `migration.sql:641` |
| Sole-rule status | the **only** unique rule on `colleges` besides the primary key | `OBSERVED` (E13) |
| `code` | `TEXT NULL`, **non-unique**, read by no code, populated only in seed data | migration `:247–256`; `VERIFIED` |
| Location fields | **none** — no city, district, region or address column exists | `schema.prisma:430–441` |
| References | `question_sources.college_id` (nullable), `ON DELETE RESTRICT` | `migration.sql:456` |
| Write path | none — no `prisma.college.*` outside tests, no college editor | `VERIFIED` (absence) |

### 4.2 Why `colleges.code` cannot be treated as an identity key

1. It is **nullable** — two rows share `DUPCODE2` and one row has `code` NULL, all accepted (E10).
2. It is **non-unique** — no constraint of any kind exists on it.
3. It is **unread** — no application code reads it, so nothing enforces or relies on it.
4. Its **population is unknown** outside seed data.
5. Seed data showing `NDC`, `DC` is evidence someone intended an abbreviation, **not** evidence of an identity
   key.

The repository's own counter-pattern is `boards`: required `code` with `uq_boards_code` plus display-name
columns — identity key ≠ display label. `colleges` half-adopts that pattern and stops before the decision.

### 4.3 Available identity alternatives

The same five strategy names as §3.3, evaluated **independently** for colleges (01-02 §8):

| Source name | Specific consequence for colleges |
|---|---|
| **OD-COLL-02 option A — preserve `UNIQUE(lower(name))` (status quo)** | it is the entity's **only** identity rule, so the stakes are higher than for tags; a `C`-locale database weakens the sole rule silently |
| **OD-COLL-02 option B — exact-string uniqueness** | case-differing institutions become distinct; no remediation needed, but an inventory of today's case-variant pairs is required |
| **OD-COLL-02 option C — explicit normalisation then uniqueness** | likely to produce genuine collisions (E18: `École Normale`/`école normale` collide today; a fold may merge more), each needing a merge decision, and `unaccent` is unavailable in the measured build |
| **OD-COLL-02 option D — a stable canonical identity key separate from the display name** | `code` is the candidate but needs `NOT NULL` + backfill + uniqueness — a schema change plus data work; `id uuid` is stable but opaque |
| **OD-COLL-02 option E — defer** | nothing changes; the sole rule stays environment-dependent |

### 4.4 Consequences for existing records

| Consequence | Evidence |
|---|---|
| two sources differing only by `college_id` are **accepted** (distinct colleges = distinct attributions) | E12 |
| repointing one onto the survivor is **rejected** by `uq_question_sources_identity` (`NULLS NOT DISTINCT`) | E12b |
| `ON DELETE RESTRICT` blocks deleting a referenced college, so "delete the duplicate" fails | `VERIFIED` (DDL) |
| merging can create duplicate *attributions* — a provenance judgement, not a cleanup | `DERIVED` from E12b |

### 4.5 Missing domain facts and the required decision

Missing: **whether two genuinely distinct colleges may share a name** (C1 — the decisive question, not
answerable from the repository); what would distinguish them given no location field exists (C2); whether `code`
is meant to be a stable identifier and whether a canonical code list exists (C3); whether `École`/`Ecole` or
`Notre-Dame`/`Notre Dame` are the same institution (C4); any real college data (X1).

Required decision: **is `name` the identity or the display label, and if the label, what carries identity** —
quoted by option title. **No policy recommendation is justified**; the decisive question is a domain statement
only the owner can supply.

Dependencies: 03 for option A's meaning; 06 for validation and merges; a schema decision if option D;
**OD-08** (conditional association of college in `question_sources`) is adjacent. Do not invent a composite key;
no location field exists to compose with.

---

## 5. OD-COLL-03 — Production collation profile

### 5.1 What CI observed, exactly

```text
collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=en_US.utf8;ctype=en_US.utf8;iculocale=-;collversion=2.41
```

PostgreSQL `16.16` (`16.16-1.pgdg13+1`, Debian 13/trixie), encoding `UTF8`, provider `libc` (raw
`datlocprovider = c`), `datcollate`/`datctype` `en_US.utf8`, `daticulocale` NULL, `datcollversion` `2.41`;
`g3f_main` and `g3f_replay` fingerprints byte-identical. Run `45546248909`, check run `138976563830`, commit
`0aae1368a16cf6447cb7a01afc7554a9fdab4bc0`. **`OBSERVED` — one image, one run, one commit.**

### 5.2 Why that is not production evidence

- The production major, provider, locale, collation version, encoding and target database are **all `UNKNOWN`**;
  no production measurement has ever occurred.
- CI↔production behavioural equivalence is **`NOT ESTABLISHED`**; `en_US.utf8` was never compared against
  `C.utf8` anywhere in this repository.
- G-3's enforcement cases are **ASCII-only** (`enforce.sql:632–645`), so `PASSED` says nothing about `Ä/ä`,
  `ẞ/ß`, `İ/i`, NFC/NFD or whitespace.
- `datcollversion` must not be assumed NULL for libc — CI shows `2.41`, the local 16.2 build shows NULL; both
  facts stand.

### 5.3 The documented alternatives

| Source name | Candidate | Consequence |
|---|---|---|
| **OD-COLL-03 option 1 — retain the environment's existing default, after measuring and validating it** | whatever `initdb` produced | no rebuild; may be `C`, in which case both `lower()` guarantees are ASCII-only |
| **OD-COLL-03 option 2 — explicitly select a named libc collation profile** | `C`, `C.utf8` or another named locale | deterministic and reviewable; `C.utf8` is **not proven equivalent to `en_US.utf8`**; collisions may require remediation |
| **OD-COLL-03 option 3 — explicitly select an ICU collation profile** | provider `icu` + explicit `daticulocale` | only OS-independent route; largest change; ICU unavailable in the experimentation environment; not evaluable without target-image access |
| **OD-COLL-03 option 4 — defer profile selection until the deployment environment and compatibility requirements are known** | no value selected | matches the evidence; reversible; the recorded process recommendation is to treat this as operative until measurement, validation and review complete |

The register also lists "no pin" as a fourth entry; the brief reframes it as deferral, because "no pin" is the
absence of a profile rather than one.

### 5.4 Unknowns and the evidence required

Unknown: major version, provider, `datcollate`/`datctype`, `daticulocale`, `datcollversion`, encoding, which
database the application will use, whether ICU exists in the image at which data version, and whether the
protected indexes exist in production at all (0001 is not authorised there).

Required from the target environment: the nine mandatory facts of 03 §4.1 read from `pg_database` /
`pg_index` / `pg_collation`, plus locale availability and the seven read-only validation checks of 03 §7.3.
**All seven checks are `PROPOSED`; none has been executed.**

### 5.5 The required decision and its dependencies

Required decision: **a target profile plus the evidence standard that would confirm it** — by full option
title. Selecting a target is a policy about the future; it proves nothing about the present database, and the
current profile remains `UNKNOWN` either way.

Dependencies: **OD-COLL-04** supplies the representation in which a profile can be expressed and compared
(mutual: 03 supplies the values 04 is compared against); **OD-COLL-05** cannot evaluate `LOCALE_CHANGE` or
`PROVIDER_CHANGE` without approved values; **OD-COLL-06** must audit the environment 03 selects; OD-COLL-01/02
supply the business semantics that make a locale choice *matter* — but neither pair answers the other.

---

## 6. OD-COLL-04 — Fingerprint specification

### 6.1 The artefact that exists

`collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=en_US.utf8;ctype=en_US.utf8;iculocale=-;collversion=2.41`

**Counted from the string:** 8 `;`-separated segments = 1 discriminator + **7 `key=value` values** (`pg`,
`enc`, `provider`, `collate`, `ctype`, `iculocale`, `collversion`). **Six catalog fields** underlie them
(`encoding`, `datlocprovider`, `datcollate`, `datctype`, `daticulocale`, `datcollversion`); `pg` is derived from
`server_version_num`, not a seventh column. Fixed order, `;` between segments, `=` between key and value, no
escaping, `-` for NULL.

### 6.2 Identity: database versus cluster, and the separate per-index layer

| Dimension | Reality | Status |
|---|---|---|
| database identity | the caller states `<db>:<port>`; the script asserts `current_database()` equals it; identity is **never serialized** | `VERIFIED` (`IDENTITY_SQL`, `:119`) |
| cluster identity | **not captured at all**; two clusters can hold a database of the same name and a mis-pointed host passes the name check | `DERIVED` |
| per-index collation metadata | a **separate** document (`collation-indexes/v1`), 6 indexes / 11 keys, expectations `none` × 8 and `database_default` × 3 | `VERIFIED` (measured) / `PROPOSED` (expectation file) |

The brief's conclusion: identity must be an **assertion bound to the expectation**, not a field compared for
equality.

### 6.3 The `d` provider inconsistency, and unknown providers

`PROFILE_SQL` maps `'c'→libc`, `'i'→icu`, `'b'→builtin`, **`'d'→database_default`**, else `unknown`.
`FINGERPRINT_SQL` maps `'c'`, `'i'`, `'b'`, else `unknown` — **it has no `'d'` arm**. The same database
therefore yields profile `provider_name = database_default` and string `provider=unknown`. Whether any database
reports `d` on the tested versions is `NOT TESTED`; which behaviour is correct is **OD-COLL-04 Q6**.

`provider=unknown` is **serialized and the run continues** — the "must fail closed" rule is `PROPOSED` and
**not implemented**. A *missing catalog field* does fail closed, via `fields_present` →
`UNSUPPORTED_CATALOG_FIELD`.

### 6.4 NULL, empty, missing, delimiter and sentinel

| Case | Current behaviour |
|---|---|
| NULL | `-`, ambiguous — `-` is also a legal string |
| empty string | renders `key=`; distinguishable from `-`, not from a missing segment |
| missing segment | string silently shorter; positional parsing misreads |
| value containing `;` | **undetected** — the string gains a segment |
| delimiter validation / escaping | **not implemented anywhere** |
| malformed output | the probe fails closed on empty or non-prefixed fingerprints (`:380–384`) |

### 6.5 Versioning and comparison

Any field addition, removal or NULL-semantics change bumps the schema version (proposed `/v2`); old and new
artefacts must not be compared across versions; a comparison layer must refuse rather than guess. **`PROPOSED`;
no version approved.** The 13 candidate outcomes for the environment artefact are `PROPOSED`; OD-COLL-05 owns
the response to each.

### 6.6 The required decisions and their dependencies

OD-COLL-04 is **eight separable elements**, not one choice: field set · serialization (text vs canonical JSON) ·
identity binding · provider domain incl. `d` and `unknown` · NULL/empty/missing representation · versioning and
coexistence · comparison model · mandatory-versus-diagnostic split. Six are answerable without an environment;
the provider domain and locale-field applicability wait on 03.

**The measurement probe is not a comparator and not a guard.** Its own header says so (`:15`, `:77`); it has no
expectation file, no comparison and no drift verdict.

Dependencies: **OD-COLL-03** (provider-conditional field applicability; mutual); **OD-COLL-05** (which
classifies 04's artefact; 04 classifies, 05 responds).

---

## 7. OD-COLL-05 — Drift failure policy

### 7.1 The four states

| State | Meaning | Continuation | Lifted by |
|---|---|---|---|
| **BLOCK** | deployment must stop | none within the policy | changing reality (fix the database or re-pin by review) |
| **REVIEW_REQUIRED** | deployment must stop until evidence is reviewed and authorised | none automatic | a recorded review and authorisation |
| **INFORMATIONAL** | recorded; no integrity implication established | yes | — |
| **PASS** | all applicable approved expectations verified | yes | — |

**Both `BLOCK` and `REVIEW_REQUIRED` halt deployment, and they are not interchangeable state names.** The
difference is what lifts them, not whether they stop.

### 7.2 The documented policies, by their own names

**OD-COLL-05 response policy — R-FAIL everything** · **OD-COLL-05 response policy — R-FAIL unknown-field
changes and R-WARN on NULL versions** · **OD-COLL-05 response policy — R-WARN everything** ·
**OD-COLL-05 response policy — R-ALLOW per listed profile** · **OD-COLL-05 response policy — auto re-pin**
(excluded by decision document §9.4 and by P7, recorded only because the register lists it).

The recorded recommendation is a technical one (`PROPOSED`, approving nothing): fail closed for every known
field change and every unresolvable expectation; `REVIEW_REQUIRED` only where the catalog cannot distinguish
(NULL `collversion`); re-pin only via a reviewed expectation commit; never auto re-pin.

### 7.3 Precedence P1–P7

| # | Rule |
|---|---|
| P1 | any **BLOCK** outranks any **PASS** |
| P2 | **UNKNOWN** is never converted to **PASS** |
| P3 | a **measurement failure** outranks every interpreted result |
| P4 | **identity precedes everything** (`DATABASE_IDENTITY_MISMATCH` invalidates the rest) |
| P5 | **structural before environmental** in reporting order |
| P6 | `EXPECTED_ENVIRONMENT_CHANGE` cannot be inferred — only read from an approved entry |
| P7 | **no auto re-pin, ever** |

### 7.4 All 33 classification rows, with source-recorded severities

| Layer | Classification | Recorded severity |
|---|---|---|
| A | `EXACT_MATCH` | **PASS** |
| A | `DATABASE_IDENTITY_MISMATCH` | **BLOCK** |
| A | `WRONG_ENVIRONMENT` | **BLOCK** |
| B | `POSTGRES_MAJOR_CHANGE` | **BLOCK** until the major is approved |
| B | `ENCODING_CHANGE` | **BLOCK** |
| B | `PROVIDER_CHANGE` | **BLOCK** |
| B | `LOCALE_CHANGE` | **BLOCK** |
| B | `COLLATION_VERSION_CHANGE` | **REVIEW_REQUIRED** |
| B | `COLLATION_VERSION_UNKNOWN` | **REVIEW_REQUIRED** + mandatory warning |
| B | `MISSING_FIELD` | **BLOCK** |
| B | `UNSUPPORTED_PROVIDER` | **BLOCK** |
| B | `NONDETERMINISTIC_COLLATION` | **BLOCK** |
| B | `MALFORMED_FINGERPRINT` | **BLOCK** |
| B | `EXPECTED_ENVIRONMENT_CHANGE` | **PASS**, only on that entry |
| C | `COLLATION_UNAVAILABLE` | **BLOCK** |
| C | `UNEXPECTED_EXPLICIT_COLLATION` | **BLOCK** |
| C | `PER_INDEX_COLLATION_MISMATCH` | **BLOCK** |
| C | `PER_INDEX_PROVIDER_OR_DETERMINISM_CHANGE` | **BLOCK** |
| C | `COLUMN_COLLATION_CHANGE` | **BLOCK** |
| C | `EXPECTATION_UNRESOLVABLE` | **BLOCK** |
| C | `MISSING_INDEX_KEY_METADATA` | **BLOCK** |
| D | `INDEX_MISSING` | **BLOCK** |
| D | `INDEX_DEFINITION_MISMATCH` | **BLOCK** |
| D | `INVALID_INDEX` | **BLOCK** |
| D | `INDEX_AMBIGUOUS` | **BLOCK** |
| D | `INVENTORY_VIOLATION` | **BLOCK** |
| D | `GUARD_EXECUTION_ERROR` | **BLOCK** |
| E | `BEHAVIORAL_COMPATIBILITY_UNKNOWN` | **REVIEW_REQUIRED** |
| E | `EXISTING_DATA_COLLISION` | **BLOCK** for the uniqueness change |
| E | `BEHAVIOR_NOT_TESTED_ON_TARGET` | **REVIEW_REQUIRED** |
| E | `BEHAVIORAL_TESTS_UNAVAILABLE` | **REVIEW_REQUIRED** |
| M | `UNKNOWN_OR_UNCLASSIFIED_CHANGE` | **REVIEW_REQUIRED** |
| M | `CATALOG_INCOMPLETE` | **BLOCK** |

Counts: A 3 · B 11 · C 7 · D 6 · E 4 · M 2 = **33**. Severity totals: BLOCK 25, REVIEW_REQUIRED 6, PASS 2
(one of the two PASS rows conditional on an approved entry). **None is implemented**; there is no classifier, comparator or expectation file.

### 7.5 What can be decided now, and what cannot

| Group | Decidable now? |
|---|---|
| identity, malformed input, connection errors, incomplete payloads | **yes** — measurement validity, format-independent |
| Layer D structural stances (`INDEX_MISSING`, `INDEX_AMBIGUOUS`, `INVALID_INDEX`, `INVENTORY_VIOLATION`) | **yes** — definitions are committed and G-3-verified |
| state model and P1–P7 | **yes** |
| Layer C expectations | **partly** — the `BLOCK` stance is definable; the expectation object belongs to 04 |
| Layer B field-by-field classification | **no** — blocked on 04's field set and 03's values |
| any `EXACT_MATCH` verdict | **no** — blocked on 03 and 04 |
| `EXPECTED_ENVIRONMENT_CHANGE` allow-list | **no** — needs approved values (03) and a mechanism (05-Q5) |
| Layer E threshold | **no** — blocked on 01/02 (what a difference means) and 06 (the evidence) |

### 7.6 Policy versus enforcement

A fail-closed **policy** states what must happen; **enforcement** requires a comparator, an expectation, a guard
and a CI/deployment wiring — none of which exists. Today: `guard.py` checks five composite FKs and migration
checksums and has **no collation or `pg_index` awareness**; the probe measures and never compares; the deploy
gate verifies *migration history*, not the live catalog. Approving a drift policy would authorise no
implementation.

### 7.7 The recorded Layer M discrepancy — left open

- 05 §4.6 classifies `UNKNOWN_OR_UNCLASSIFIED_CHANGE` as **`REVIEW_REQUIRED`**.
- 05 §10 case 3 describes the same case ("unexpected additional field, a future version") as **"fail closed"**.

Both readings halt the deployment, so the *outcome* is identical and the class table governs the state name.
The **wording** remains inconsistent and is recorded here as an unresolved discrepancy (§14, D-4). It is not
silently resolved, and no new state is invented.

---

## 8. OD-COLL-06 — Existing data compatibility

### 8.1 Two indexes are in scope; six are in the inventory

| # | Index | Collation dependence | Audit applicability |
|---|---|---|---|
| 1 | `uq_question_versions_one_published_per_question` | none (`uuid` + `enum`) | structural only |
| 2 | `uq_question_sources_identity` | none — its rule is NULL semantics | structural only |
| 3 | `uq_topics_chapter_order` | none (`uuid` + `int4`) | structural only |
| 4 | `uq_tags_name_lower` | **full** | collision analysis — primary case |
| 5 | `uq_colleges_name_lower` | **full** | collision analysis — primary case, higher stakes |
| 6 | `ix_question_assets_checksum` | bears a collatable key, **not unique** | not applicable |

**Inventory size is not audit scope.** A Unicode collision scan over non-collatable keys returns zero rows and
implies a risk that does not exist.

### 8.2 The six stages — kept apart

read-only measurement and reporting · owner review of findings · approval of a remediation plan · actual data
remediation · creation or replacement of indexes · production deployment authorisation (B2 with B1b). Each is
separately authorised; stage 1 authorises reading only, stage 3 authorises no execution, stage 5 authorises no
deployment.

### 8.3 The ten audit steps and the 17 report fields

Steps: target verification (refuse `postgres`/`template*`, refuse unverified identity) · snapshot/consistency
requirement · table and row-count inventory · existing duplicate detection under the current key ·
candidate-semantics grouping (distinct now, equal later — **plus the reverse** for a narrowing) · collision
identification with row identifiers · evidence capture · reconciliation report stating what was **not** checked ·
independent review (author ≠ reviewer) · final approval record, scoped and expiring.

Report fields: `audit_id` · `database_identity` · `environment` · `pg_version` · `collation_profile` ·
`table`/`index` · `candidate_expression` · `collision_group_id` · `affected_row_count` · `row_identifiers` ·
`original_values` · `candidate_comparison` · `validated_at` · `audit_implementation` · `limitations` ·
`untested_cases` · `snapshot_reference`. **Never** credentials, user names, hosts or tokens. Full values belong
in a restricted artefact; retention and access belong to **OD-20** (`OPEN`).

### 8.4 The ten collision classifications

`NO_COLLISIONS_FOUND` · `EXISTING_DUPLICATES_UNDER_CURRENT_RULE` · `NEW_COLLISIONS_UNDER_CANDIDATE_RULE` ·
`NULL_SEMANTICS_CHANGE` · `NORMALIZATION_DIFFERENCE` · `BEHAVIORAL_RESULT_UNKNOWN` · `AUDIT_INCOMPLETE` ·
`TARGET_IDENTITY_UNVERIFIED` · `INDEX_DEFINITION_MISMATCH` · `DATA_CHANGED_AFTER_AUDIT`.

### 8.5 The eleven pre-build gates

semantics approved (01/02) · environment approved (03) · fingerprint and drift policy approved where applicable
(04/05) · current-state audit complete · candidate-semantics report complete · zero unresolved collisions or an
approved remediation outcome · remediation evidence · post-remediation audit · final consistency check ·
structural verification · **explicit owner authorisation for this specific build**.

### 8.6 What a zero-collision result means, and the narrowing case

- **Zero observed collisions is not semantic compatibility.** It is the absence of a finding in one snapshot,
  under one candidate key, in one environment, with stated limits.
- A **broader** fold produces collisions that block the build — visible and fail-closed. A **narrower** fold
  produces none and weakens silently (the E8 failure mode), so validating it means proving an *absence*, which
  requires the **reverse counterfactual** (pairs equal today, unequal under the candidate). A collision report
  cannot certify a narrowing on its own.
- TOCTOU is structural: audit → build is a window, and only a final revalidation, a fail-closed build and a
  drift policy (05) address it. `CREATE UNIQUE INDEX CONCURRENTLY` avoids blocking writers, not duplicates.

### 8.7 Specification, capability, authorisation, execution, acceptance

| Thing | State |
|---|---|
| audit **scope** (two indexes, per-table detections) | specified (`PROPOSED`) |
| audit **specification** (steps, fields, classifications, gates) | specified (`PROPOSED`) |
| audit **implementation capability** | **does not exist** — repository-wide search finds no duplicate detection, no collision grouping, no audit artefact |
| audit **execution authorisation** | **not granted** |
| audit **execution** | **has not occurred** — no production data has ever been read |
| owner **acceptance of results** | **not applicable** — there are no results |

An approved specification does not authorise a run; a run would not authorise a merge; a merge would not
authorise an index; an index would not authorise a deployment.

---

## 9. Cross-decision dependency graph

### 9.1 Verified edges

| Edge | Type | Source | Why |
|---|---|---|---|
| **01 → 06** | **genuine prerequisite** | 06 §13.1; 01-02 §11; handoff §6.2 | the audit's decisive query compares the current key to a candidate key; without 01 there is one operand missing |
| **02 → 06** | **genuine prerequisite** | same | same, independently for colleges |
| **03 ↔ 04** | **mutual** | handoff §6.1/§6.2; 03 §12.1; 04 §6 | 03 supplies the values; 04 supplies the representation that makes a profile expressible and comparable. Neither is upstream |
| **03 → 05** | **genuine prerequisite** (value-dependent rows) | 05 §12.1 | `LOCALE_CHANGE`, `PROVIDER_CHANGE`, `ENCODING_CHANGE`, any `EXACT_MATCH` presuppose approved values |
| **04 → 05** | **genuine prerequisite** (artefact and grammar) | 05 §7.3, §12.1 | 05 classifies 04's artefact; without a field set there is nothing to classify |
| **03/04 → 06** | **evidence prerequisite** | 06 §13.1 | 06's *specification* can be fixed now; its *execution* needs an approved environment and the environment fields a report must record |
| **05 → future drift guard** | **downstream implementation relationship** | 05 §11.5 | a policy with no implementation is a note, not a control |
| **06 → future index or data change** | **hard prerequisite, downstream** | 06 §11.1 gates 4–9 | data must be validated before a uniqueness rule exists |
| **01/02 → 05 (Layer E)** | related, independently decidable | handoff §6.2; 05 §12.1 | the severity model does not depend on the semantics; only the *threshold* of a behavioural difference does |

### 9.2 The matrix (reproduced from handoff §6.1, with words instead of symbols)

Rows depend on columns.

| | 01 | 02 | 03 | 04 | 05 | 06 |
|---|---|---|---|---|---|---|
| **01** | — | — | — | — | related | **prerequisite** |
| **02** | — | — | — | — | related | **prerequisite** |
| **03** | — | — | — | **mutual** | **prerequisite** | **evidence** |
| **04** | — | — | **mutual** | — | **prerequisite** | **evidence** |
| **05** | related | related | **prerequisite** | **prerequisite** | — | related |
| **06** | **prerequisite** | **prerequisite** | **evidence** | **evidence** | related | — |

### 9.3 Graph

```text
        ┌──────────────┐        ┌──────────────┐
        │ OD-COLL-01   │        │ OD-COLL-02   │        (Track A — business identity)
        └──────┬───────┘        └──────┬───────┘
               │ prerequisite          │ prerequisite
               └───────────┬───────────┘
                           ▼
   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │ OD-COLL-03   │◄─►│ OD-COLL-04   │   │              │   (Track C / Track B)
   └──────┬───────┘   └──────┬───────┘   │              │
          │ prerequisite     │ prereq.   │              │
          └────────┬─────────┘           │              │
                   ▼                     │              │
            ┌──────────────┐             │              │
            │ OD-COLL-05   │             │              │
            └──────┬───────┘             │              │
                   │ downstream          │              │
                   ▼                     ▼              │
            ┌──────────────────────────────────┐        │
            │  future drift guard (not built)  │        │
            └──────────────────────────────────┘        │
                                                        │
            ┌──────────────┐  evidence (03/04)          │
            │ OD-COLL-06   │◄───────────────────────────┘
            └──────┬───────┘
                   │ hard prerequisite, downstream
                   ▼
            ┌──────────────────────────────────┐
            │ index / data change (not allowed)│
            └──────────────────────────────────┘
```

### 9.4 What is *not* a dependency

- **01 does not depend on 02** (or vice versa) — separate records, separate evidence gaps, no inference between
  them (01-02 §12).
- **03 does not depend on 01/02** to be *selected*: a profile can be chosen as a target; the business semantics
  determine what that choice *means*, not whether it can be made.
- **05's core does not depend on 01/02**: the states, precedence and fail-closed cases stand independently.
- **06's process does not depend on 03/04**: only its execution does.
- **No edge was added to complete the graph.** Where no source records a dependency, none is drawn.

---

## 10. Consolidated evidence register

Each row keeps the environment and the limitation; nothing is promoted to production evidence.

| ID | Source reference | Claim supported | Classification | Environment | Session / date | Limitation | Affects | Further evidence |
|---|---|---|---|---|---|---|---|---|
| C-01 | CI run `45546248909`, check run `138976563830`, commit `0aae1368…` | profile `16.16`, UTF8, libc, `en_US.utf8`, `daticulocale` NULL, `datcollversion` `2.41`; both fingerprints identical | **CI-observed** | CI (Debian 13 image) | S17–S18 | one image, one run; ASCII-only enforcement | 03, 04, 05, 06 | E-1, E-2 |
| C-02 | `migration.sql:613–648` | the six protected index definitions, incl. `:640–641` expression uniques and `NULLS NOT DISTINCT` at `:629–631` | **Repository** | source | S22–S31 | definitions, not behaviour | 01, 02, 05, 06 | — |
| C-03 | `collation-probe.sh:119,121–146,149–164` | `IDENTITY_SQL` assertion; 6 catalog fields + `pg`; 8 segments; no comparison | **Repository** | source | S24, reverified S31–S32 | measurement only; not a guard (`:15`, `:77`) | 04, 05 | — |
| C-04 | `guard.py` (279 lines) | three modes `sql`/`catalog`/`history`; **no** collation or `pg_index` awareness | **Repository** | source | S32 | five composite FKs + checksums only | 05 | E-11 |
| C-05 | prototype matrix (25 cases + 6 payload tests) | structural detection of the classes tested; fail-closed on empty/malformed payloads | **Local (disposable)** | PG 16.2 | S23–S24 | never committed; no CI wiring; not every weakening | 05, 06 | E-11 |
| C-06 | E1–E9, E17–E20 fold matrix | `C.utf8` folds `Ä/ä`, `ẞ/ß`, `İ/i`, U+212A; `ẞ`/`ss`, `ς`/`σ`, NFC/NFD, trailing space remain distinct | **Local (disposable)** | PG 16.2, `C.utf8` vs `C` | S23 | **not** `en_US.utf8`, **not** production, **not** CI | 01, 02, 03, 06 | E-3 |
| C-07 | E11, E11b, E11c, E12, E12b | merge mechanics: PK rejection, safe shape, silent cascade, attribution rejection | **Local (disposable)** | PG 16.2 | S23 | specific shapes tested; other merges unmeasured | 01, 02, 06 | E-6 |
| C-08 | `server/questions/publish/db-errors.ts:68–72` | the user-facing duplicate message ("ignoring case") | **Repository** | source | S22, S30 | a promise, not a behaviour | 01, 02 | — |
| C-09 | `schema.prisma` `Tag`, `College`, `Board`, `QuestionSource` | `code` nullable/non-unique; no location field; `boards` pattern | **Repository** | source | S28–S30 | schema, not intent | 02 | C1–C3 (domain) |
| C-10 | repository-wide search | no audit capability, no comparator, no expectation file, no write path for tags/colleges | **Repository (absence)** | source | S28, S32 | absence today, not impossibility | 01, 02, 04, 05, 06 | E-11 |
| C-11 | 03 §4.1, §7.3 | the nine mandatory facts and the seven read-only checks | **Specified, not implemented** | documents | S22 | no execution | 03, 06 | E-1, E-6 |
| C-12 | 04 §5–§10 | layers, 13 outcomes, versioning rules | **Specified, not implemented** | documents | S24 | no code | 04, 05 | E-11 |
| C-13 | 05 §4–§5 | 4 states, 33 classifications, P1–P7 | **Specified, not implemented** | documents | S26 | 7 rows blocked on 03/04; 1 on 01/02+06 | 05 | E-11 |
| C-14 | 06 §7–§11 | 10 steps, 17 fields, 10 classifications, 11 gates | **Specified, not implemented** | documents | S26 | no audit capability | 06 | E-6, E-8 |
| C-15 | R2 §12.1 | expectation kinds: `none` × 8, `database_default` × 3; 11 keys, 6 indexes | **Repository analysis** (`PARTIALLY RESOLVED`) | source | S21+ | resolution pseudocode only | 04, 05 | E-11 |
| C-16 | 05 §3.5 | `guard.py catalog` exit 0 with an index dropped or NND removed; name count catches only a drop | **Local (disposable)** | PG 16.2 | S23–S24 | the measured blind spot, unfixed | 05 | E-11 |
| C-17 | G-1 run `45381634139` | six destructive `migrate diff` statements on a no-change schema; none executed | **CI-observed** | CI | S17 | a diff, not a deployment | all | — |
| C-18 | 03 §3.3 / 04 §4 | CI↔production equivalence | **Not tested** | — | — | never paired | 03, 05 | E-2 |
| C-19 | — | ICU behaviour, fields, determinism, folding | **Not tested** | — | — | no ICU build available | 03, 04, 05 | E-4 |
| C-20 | — | PostgreSQL 15/17/18 behaviour (incl. `builtin`) | **Not tested** | — | — | unavailable here | 03, 04, 05 | E-5 |
| C-21 | — | production provider, locale, version, encoding, database identity, cluster identity | **Unknown** | production | — | never measured | 03, 04, 05, 06 | E-1 |
| C-22 | — | tag/college volumes, case-only and normalisation-only pair counts, collision totals | **Unknown** | production | — | no data exists in the repo | 01, 02, 06 | E-6 |
| C-23 | — | replica availability, read-only role, audit duration, retention/access | **Unknown** (OD-20 `OPEN`) | operations | — | not documented | 06 | E-8, E-9 |
| C-24 | — | whether two distinct colleges may share a name; whether `code` is an identifier | **Requires owner decision** | domain | — | not answerable from the repository | 02 (decisive) | E-7 |

---

## 11. Owner decision records — blank

**All six are blank.** No field below is filled in, and no field may be inferred from the order, wording or
detail of the options above. A decision exists only when the owner records it in a reviewed document.

### 11.1 OD-COLL-01 — Tag uniqueness semantics

| Field | Record |
|---|---|
| Decision ID and title | `OD-COLL-01` — Tag uniqueness semantics |
| Exact question | What makes two tags "the same tag" for uniqueness purposes: exact spelling, case-insensitive equality (and which one), a normalised/folded form, or a key other than the name? |
| Available options | **OD-COLL-01 option A — preserve `UNIQUE(lower(name))` (status quo)** · **option B — exact-string uniqueness** · **option C — explicit normalisation then uniqueness** · **option D — a stable canonical identity key separate from the display name** · **option E — defer** |
| Selected option | `NOT DECIDED` |
| Owner rationale | `NOT RECORDED` |
| Accepted trade-offs | `NOT RECORDED` |
| Required follow-up evidence | `NOT RECORDED` — candidate: E-6 (real tag data), T1–T4 answers |
| Dependencies | OD-COLL-03 (meaning of option A), OD-COLL-06 (any change), OD-18 (representation) |
| Decision owner | `NOT RECORDED` |
| Decision date | `NOT RECORDED` |
| Approval status | **`OPEN`** |

### 11.2 OD-COLL-02 — College identity semantics

| Field | Record |
|---|---|
| Decision ID and title | `OD-COLL-02` — College identity semantics |
| Exact question | Is `colleges.name` the institution's identity or its display label — and if the latter, what carries identity, given that `code` is nullable, non-unique and read by no code? |
| Available options | **option A — preserve `UNIQUE(lower(name))`** · **option B — exact-string uniqueness** · **option C — explicit normalisation then uniqueness** · **option D — a stable canonical identity key separate from the display name** · **option E — defer** |
| Selected option | `NOT DECIDED` |
| Owner rationale | `NOT RECORDED` |
| Accepted trade-offs | `NOT RECORDED` |
| Required follow-up evidence | `NOT RECORDED` — candidate: E-7 (can two distinct colleges share a name?), C3 (code list) |
| Dependencies | OD-COLL-06; a schema decision if option D; OD-08 (attribution) |
| Decision owner | `NOT RECORDED` |
| Decision date | `NOT RECORDED` |
| Approval status | **`OPEN`** |

### 11.3 OD-COLL-03 — Production collation profile

| Field | Record |
|---|---|
| Decision ID and title | `OD-COLL-03` — Production collation profile |
| Exact question | Which provider/locale profile must production have, and what evidence confirms it on the actual database? |
| Available options | **option 1 — retain the environment's existing default, after measuring and validating it** · **option 2 — explicitly select a named libc collation profile** · **option 3 — explicitly select an ICU collation profile** · **option 4 — defer profile selection until the deployment environment and compatibility requirements are known** |
| Selected option | `NOT DECIDED` |
| Owner rationale | `NOT RECORDED` |
| Accepted trade-offs | `NOT RECORDED` |
| Required follow-up evidence | `NOT RECORDED` — candidate: E-1, E-3, E-4, E-5 |
| Dependencies | OD-COLL-04 (representation, mutual); OD-COLL-05/06 downstream |
| Decision owner | `NOT RECORDED` |
| Decision date | `NOT RECORDED` |
| Approval status | **`OPEN`** |

### 11.4 OD-COLL-04 — Collation fingerprint specification

| Field | Record |
|---|---|
| Decision ID and title | `OD-COLL-04` — Collation fingerprint specification |
| Exact question | Which fields constitute the fingerprint, in what canonical form, with what identity binding, and with what comparison meaning? |
| Available options (eight elements, preserved separately) | **1** field set (six · six + `pg` · six + `pg` + per-index objects in one string · something else) · **2** serialization (text line · canonical JSON with text summary · hash-only, rejected) · **3** identity binding (separate assertion · serialized field) · **4** provider domain (`c`/`i`/`b` + fail-closed · explicit `d` · current permissive) · **5** NULL/empty/missing (`-` kept · escape · reject · tag) · **6** versioning and coexistence · **7** comparison model (13 outcomes) · **8** mandatory versus diagnostic |
| Selected option | `NOT DECIDED` — **per element**, not as one choice |
| Owner rationale | `NOT RECORDED` |
| Accepted trade-offs | `NOT RECORDED` |
| Required follow-up evidence | `NOT RECORDED` — candidate: E-4 (ICU field semantics), E-5 (other majors) |
| Dependencies | OD-COLL-03 (mutual), OD-COLL-05 |
| Decision owner | `NOT RECORDED` |
| Decision date | `NOT RECORDED` |
| Approval status | **`OPEN`** |

### 11.5 OD-COLL-05 — Collation drift failure policy

| Field | Record |
|---|---|
| Decision ID and title | `OD-COLL-05` — Collation drift failure policy |
| Exact question | When observed environment, metadata or index properties differ from approved expectations, what must happen — and who may lift the stop? |
| Available options | **R-FAIL everything** · **R-FAIL unknown-field changes and R-WARN on NULL versions** · **R-WARN everything** · **R-ALLOW per listed profile** · **auto re-pin** (excluded by decision doc §9.4 / P7). Plus the open elements: the no-expectation case, the WARN→state mapping, the allow-list mechanism, cluster binding, reviewer-of-record |
| Selected option | `NOT DECIDED` — the core policy and its Q1–Q9 answers are separate answers |
| Owner rationale | `NOT RECORDED` |
| Accepted trade-offs | `NOT RECORDED` |
| Required follow-up evidence | `NOT RECORDED` — candidate: granted values (03), artefact (04), E-11 for enforcement |
| Dependencies | OD-COLL-03, OD-COLL-04 (prerequisites); OD-COLL-01/02 (Layer E threshold); OD-COLL-06 (data evidence) |
| Decision owner | `NOT RECORDED` |
| Decision date | `NOT RECORDED` |
| Approval status | **`OPEN`** |

### 11.6 OD-COLL-06 — Existing data compatibility

| Field | Record |
|---|---|
| Decision ID and title | `OD-COLL-06` — Existing data compatibility |
| Exact question | What evidence and validation must exist before a production collation profile is approved or collation-sensitive uniqueness semantics are changed? |
| Available options | **none (rely on the new index to fail on duplicates)** · **read-only report first** · **report + owner-reviewed remediation plan** · **report + remediation + concurrent index build**. Plus 06-Q1…Q10 as separate answers |
| Selected option | `NOT DECIDED` — the policy and the ten question answers are separate |
| Owner rationale | `NOT RECORDED` |
| Accepted trade-offs | `NOT RECORDED` |
| Required follow-up evidence | `NOT RECORDED` — candidate: E-6, E-8, E-9 |
| Dependencies | OD-COLL-01/02 (candidate key), OD-COLL-03/04 (environment and fields) |
| Decision owner | `NOT RECORDED` |
| Decision date | `NOT RECORDED` |
| Approval status | **`OPEN`** |

---

## 12. Global non-authorisations

Consolidation authorises **none** of the following:

- selecting a production locale, provider or PostgreSQL major;
- pinning a production fingerprint, or approving any fingerprint format;
- automatic re-pinning, in any form;
- executing an existing-data audit, a collision query or any `SELECT`;
- merging, renaming, deleting or repointing any row;
- creating, replacing or dropping any index;
- modifying the schema, any migration (0002 included) or application code;
- implementing the structural index guard, a comparator, a drift classifier or an expectation file;
- authorising migration 0001 for production;
- deploying to production (B1b `NOT APPROVED`, B2 `WITHHELD`);
- modifying any script, probe, guard, workflow or test;
- changing any status in this register or in any source document;
- applying the previously proposed S-1 pointer paragraph to File C §11 (not applied, not authorised);
- staging, committing, pushing, opening a PR, merging or deploying.

---

## 13. Downstream work and exit criteria

For each decision: what an approval resolves, what evidence is still required, what implementation would need
its own authorisation, what validation remains, and what cannot proceed.

| ID | An approval would resolve | Still required evidence | Still needs separate implementation authorisation | Still needs validation | Cannot proceed until |
|---|---|---|---|---|---|
| **01** | the intended equality contract for tags; whether the user message may stay as written | E-6 (real tag data), T1–T4 domain answers | any index or schema change (0002) | the 06 report under the chosen key | 06's audit and its owner acceptance |
| **02** | whether `name` is identity or label; whether `code` becomes a key | E-7 (the decisive domain statement), C3 | index change and, for option D, a schema change + backfill | 06 report incl. attribution analysis | 06 + (option D) a schema decision |
| **03** | the target profile and its confirmation standard | E-1 (environment measurement), E-3, and E-4/E-5 if ICU or another major is contemplated | attaching a profile at creation, or a rebuild | confirmation on the actual target, then the 03 §7.3 checks | an authorised read of the target database |
| **04** | the field set, layering, identity binding and representation rules | E-4 for ICU field semantics; E-5 for other majors (or an explicit exclusion) | the comparator, expectation file and guard | a paired comparison on two environments | 03's values for provider-conditional rows |
| **05** | the states, precedence and fail-closed cases; the no-expectation stance | granted values (03), artefact (04), E-11 for enforcement | the classifier and its wiring | the classifier exercised against both a pass and a block | 03 and 04 for the value-dependent rows |
| **06** | the validation process, report format, classifications and gates | E-6, E-8, E-9 (retention/access under OD-20) | the audit implementation, then any remediation | a dry run on a snapshot, independently reviewed | 01/02 for the candidate key; stage-1 authorisation |

### 13.1 Conditions before a final deployment-readiness assessment

A meaningful final assessment requires, at minimum:

1. **All six decisions recorded** as answers — not as recommendations — with rationale, trade-offs and dates.
2. **The environment measured once, read-only**, with the nine mandatory facts (E-1), and the CI↔production
   equivalence question either answered (E-2) or explicitly excluded from the readiness claim.
3. **Optionally-but-preferably E-3** (`en_US.utf8` vs `C.utf8`) so the CI profile's portability is known rather
   than assumed.
4. **The 06 audit specification approved**, and — if the assessment is to claim data compatibility — an audit
   actually executed and accepted, which needs stage-1 authorisation plus E-6 and E-9.
5. **An explicit statement that the guard and comparator do not exist**, and a decision on whether readiness is
   being assessed with drift detection absent (which is the current position) or deferred until it exists.
6. **B1b and B2 addressed on their own terms** — neither is implied by any of the six, and B1b overrides G-1
   only by explicit approval.

**Approving all six decisions does not authorise deployment.** It converts six open questions into recorded
policy; migration 0001 still needs B1b, production still needs B2, and the deployment package's operational
gaps (OD-22, and the unmeasured RTO) remain.

---

## 14. Revision history and source traceability

### 14.1 Revision history

| Revision | Date | Change |
|---|---|---|
| 1 | 2026-11-24 | Consolidated register for OD-COLL-01…06 (Session 33). Six decisions registered with question, options by source title, evidence state, dependencies and downstream consequences; 33-row drift classification reproduced with source severities; 24-row consolidated evidence register; typed dependency graph and matrix verified against the six briefs and the handoff; six blank owner decision records; nine discrepancies recorded (§14.3). **No decision made, no option selected, no source document edited, no database contacted, no test or command executed against any environment.** |

### 14.2 Sources consolidated

| Document | Lines | SHA-256 (first 16) |
|---|---|---|
| `docs/database/phase-04a-od-coll-01-02-uniqueness-semantics-decision-brief.md` | 722 | `0e733903e5c9db7a` |
| `docs/database/phase-04a-od-coll-01-02-owner-decision-worksheet.md` | 504 | `35ed3d5e285b0f0e` |
| `docs/database/phase-04a-od-coll-03-production-collation-profile-decision-brief.md` | 630 | `eed8897c9fa8d0fc` |
| `docs/database/phase-04a-od-coll-04-collation-fingerprint-specification-decision-brief.md` | 767 | `7c1707fd5d3b0f27` |
| `docs/database/phase-04a-od-coll-03-04-owner-decision-worksheet.md` | 679 | `9b67a4e1e9d36f06` |
| `docs/database/phase-04a-od-coll-05-collation-drift-failure-policy-decision-brief.md` | 801 | `61e3ddd0d9ff23a2` |
| `docs/database/phase-04a-od-coll-06-existing-data-compatibility-decision-brief.md` | 707 | `ba89956d0cbe45d5` |
| `docs/database/phase-04a-od-coll-05-06-owner-decision-worksheet.md` | 803 | `8aee196c1bc6f8e3` |
| `docs/database/phase-04a-owner-review-readiness-and-decision-handoff.md` | 661 | `38decec31a9d3193` |
| `docs/database/phase-04a-collation-decision-package-consolidation-audit.md` | 696 | `7d8af8f9962c2081` |
| `docs/database/phase-04a-final-database-deployment-decision-package.md` | 957 | `dc03e1a44a768361` |
| `docs/database/phase-04a-database-collation-product-and-environment-decision.md` | 1105 | `50005a91cb883bad` |
| `docs/database/phase-04a-index-collation-r2-investigation.md` | 834 | `aab45341e1c05094` |
| `docs/database/phase-04a-ci-collation-profile-measurement-proposal.md` | 1044 | `349607f894780032` |
| `docs/database/phase-04a-index-integrity-guard-design.md` | 795 | design only — no committed guard |

### 14.3 Discrepancies discovered or re-confirmed

None was silently resolved. Where a governing source is explicitly stated, it is named; otherwise the matter
stays open.

| ID | Discrepancy | References | Status |
|---|---|---|---|
| **D-1** | audit stages: **five** in the 01/02 brief, **six** in the 06 brief (06 adds production deployment authorisation) | 01-02 §9.2 vs 06 §2.2 | **compatible, not contradictory** — 06 §2.2 governs audit stages (it is the audit brief) and is the form used in §8.2 |
| **D-2** | two different "seven-check" lists for candidate validation | 01-02 §9.1 (seven detections) vs 03 §7.3 (seven read-only checks) | **overlapping but not identical**; both `PROPOSED`; neither executed. No governing source is stated → **left open** |
| **D-3** | `EXACT_MATCH` used with two meanings: fingerprint equality (04 §8) vs an all-layer verdict (05 §4.1) | 04 §8; 05 §4 preamble | **documented overlap**, explained in 05 §4's preamble — not an inconsistency, but the two must never be quoted interchangeably |
| **D-4** | `UNKNOWN_OR_UNCLASSIFIED_CHANGE` is `REVIEW_REQUIRED` in the class table but described as "fail closed" in the fail-open/closed list | 05 §4.6 vs 05 §10 case 3 | **wording inconsistency, outcome identical (both halt)**; the class table governs the state name. **Left open**, recorded in §7.7 |
| **D-5** | provider `d`: profile document says `database_default`, fingerprint string says `unknown` | `collation-probe.sh:121–146` vs `:149–164`; 04 §3.4 | **source-level inconsistency**; owned by OD-COLL-04 Q6; **open** |
| **D-6** | register says "six fields"; the implemented artefact carries seven values in eight segments | decision doc §8.1 vs probe `:149–164` | **resolved by reference** (handoff S-4) — six catalog fields + derived `pg`; the counting is stated in §6.1 |
| **D-7** | option letters: 01/02 use A–E per entity, 03 uses 1–4, 05/06 use untitled policies; "Option C" also names the approved controlled migration workflow | 01-02 §8; 03 §8; 05 §14.1; 06 §15.1 | **label hazard** (S30 W-1/W-2); this register prefixes every option with its decision ID and uses titles; no letter is used bare |
| **D-8** | 05 brief line count: earlier session notes recorded 779, the file is 801 | `…od-coll-05…brief.md` | **cosmetic** — the pre-fix length was recorded before the final edit; the hash `61e3ddd0d9ff23a2…` is authoritative |
| **D-9** | G-3 run citation: the run id quoted as B1a's basis differs from the run named in some summaries | handoff §4.7 (S-5) | **already recorded** as citation staleness; not re-litigated here; `G-3 PASSED` unchanged |

**The register reproduces every standing status unchanged.** G-1 **FAILED** · G-3 **PASSED** · Option C
**APPROVED — controlled migration workflow only** · B1a **APPROVED (workflow-scoped)** · B1b **NOT APPROVED** ·
B1c **NOT APPROVED** · B2 **WITHHELD** · migration 0001 **NOT AUTHORIZED for production deployment** ·
migration 0002 **DO NOT COMMIT** · G-2 **DEFERRED** · **T1 CLOSED** · **R2 PARTIALLY RESOLVED** ·
**OD-COLL-01…06 all `OPEN`** · OD-17 / OD-20 / OD-21 / OD-22 / OD-NM-1 **`OPEN`**. CI profile **OBSERVED**;
production profile **UNKNOWN**; production locale **NOT DECIDED**; CI↔production equivalence **NOT
ESTABLISHED**.
