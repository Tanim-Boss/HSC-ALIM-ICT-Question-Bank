# Phase 04A — OD-COLL-04: Collation Fingerprint Fields and Specification — Owner Decision Brief

**Date:** 2026-11-24
**Repository:** `Tanim-Boss/HSC-ALIM-ICT-Question-Bank`
**Branch:** `arena/49496cf8-hsc-alim-ict-question-bank`
**HEAD when written:** `4d04e4461338ea5931d26faf67d312fbed21de43`
**Subject:** **OD-COLL-04** — *which fields constitute the database fingerprint, in what canonical form, and
with what comparison meaning?*
**Nature:** documentation only. No script, workflow, guard, schema, migration, application file or test was
modified; no production or staging system was contacted; no database was created or queried in this session.

Labels used throughout: `VERIFIED` (read from a committed artifact or re-read from CI evidence) ·
`OBSERVED` (measured earlier in a disposable environment, cited as recorded) · `DERIVED` · `PROPOSED` ·
`UNKNOWN` · `NOT TESTED` · `OPEN`.

**Standing statement:** the string `collation-fingerprint/v1;…` **exists in a committed measurement script and
has been observed in CI**. That makes it *implemented as a measurement*. It does **not** make it an approved
specification, and no field in it has been declared mandatory by the owner. OD-COLL-04 is `OPEN`.

---

## 1. Executive verdict

### **OD-COLL-04 DECISION BRIEF PREPARED — FINGERPRINT SPECIFICATION REMAINS OPEN**

Six findings structure the brief:

1. **A fingerprint exists, but as a report — not as a contract.** `collation-probe.sh` (468 lines, two
   commits: `e4fa80d`, `0aae136`) emits a canonical string, a profile JSON and a per-index JSON, and publishes
   two `notice` annotations. Nothing compares them to anything: there is **no approved fingerprint artifact,
   no expectation file and no comparison logic** anywhere in the repository (§3.6).
2. **The implemented field set is narrower than the decision.** The string carries seven values
   (`pg`, `enc`, `provider`, `collate`, `ctype`, `iculocale`, `collversion`) behind a version prefix. Database
   identity is *asserted separately* and never serialized; per-index collation metadata lives in a second
   document; cluster identity is not captured at all (§3.2, §6).
3. **The implementation already diverges from the proposal it came from: stricter in two places, looser in
   two, and silent on three.** Missing catalog fields and missing indexes fail the step (the proposal said
   they would not); an `unknown` provider and a delimiter inside a value do **not** fail (the proposal said
   both must); and C2, C3 and one message form were never applied (§3.5).
4. **The `-` NULL sentinel is unresolved, and its documented correction was never applied.** Session 16 §8.6
   C3 proposed rejecting or escaping a value that equals `-`; the script does neither. Likewise C2 (locale
   spelling normalisation) is unimplemented, so `en_US.utf8` and `en_US.UTF-8` — the same glibc locale —
   would produce **different** fingerprints (§3.5, §7.3).
5. **A fingerprint is an identity, and only that.** It cannot prove that two environments fold, order or
   compare strings identically: it records names and versions, not behaviour, and `datcollversion` may be NULL
   (it is `2.41` in CI, and NULL in the local build measured in Session 23) (§9).
6. **The layers the brief asks about map onto four different artifacts, and only two exist.** Environment
   identity and per-index collation identity are measured; structural index semantics are *described* by the
   probe but not fully (no expression text, no INCLUDE detection, no per-key ordering, no access method); and
   behavioural validation is absent by design (§5).

**Status of the decision: `OPEN — FINGERPRINT SPECIFICATION NOT APPROVED`** (§12).

---

## 2. Decision scope

### 2.1 What the register asks, exactly

`docs/database/phase-04a-database-collation-product-and-environment-decision.md` **§12**:

> **OD-COLL-04** | Which fields constitute the database fingerprint, and in what canonical form? | Session 14
> six fields · six + `pg` major (proposed) · six + `pg` + per-index collation objects inside one string ·
> something else | … | **Recommended for consideration:** the six fields **plus** `pg` major, as a separate
> block from per-index expectations, in the `collation-fingerprint/v1;…` form with `-` for NULL and a version
> prefix (§8.2, §8.3) … | **`OPEN`** | CI cannot compare environments; a restore into a different locale stays
> undetectable (§9.2 #7).

The recommendation column is explicitly *"for consideration"*. §12.1 adds: *"Recording an owner decision
requires an explicit owner statement plus a reviewed document change; it cannot be inferred from a
recommendation in this table."*

**Counting note (the "six" and the "seven").** The register's *"Session 14 six fields"* are the six catalog
fields evaluated in the decision document §8.1 — `encoding`, `datlocprovider`, `datcollate`, `datctype`,
`daticulocale`, `datcollversion`. The implemented `v1` string carries those six **plus `pg` major**, i.e.
**seven `key=value` values in eight `;`-separated segments** (§3.2), and the recommended option in the
register is that same seven-value form. Neither "six" nor "seven" includes database identity (asserted
separately, never serialized), cluster identity (not captured) or per-index metadata (a second document).
The decision document §8.3.2 now records the convention. `VERIFIED` by counting the measured CI value.

### 2.2 The four questions inside OD-COLL-04

| # | Question | Sub-questions this brief addresses |
|---|---|---|
| 1 | **Which fields** must the fingerprint carry? | mandatory vs diagnostic; provider applicability; NULL semantics; version sensitivity (§6) |
| 2 | **What canonical form**? | grammar, ordering, escaping, NULL and empty representation, JSON alternative, hashing (§7) |
| 3 | **What does a difference mean**? | classification of drift, and which classifications precede any policy (§8) |
| 4 | **What can it prove**? | identity vs semantic equivalence (§9) |

### 2.3 What OD-COLL-04 is not

- It is **not** the failure policy: *what to do* when values differ is **OD-COLL-05**.
- It is **not** the production profile: *which* values production should have is **OD-COLL-03**.
- It is **not** the uniqueness semantics: **OD-COLL-01/02**.
- It is **not** the existing-data validation plan: **OD-COLL-06**.
- It does **not** authorise changing `collation-probe.sh`, the G-3 workflow, the guard, or adding an
  expectation file. The probe is evidence that a format *can* be produced; it is not the format's approval.

---

## 3. Existing implementation audit

Source: `docs/database/g1-spike/option-c/g3-full/collation-probe.sh` (468 lines, tracked, added in `e4fa80d`,
annotations added in `0aae136`), invoked from
`.github/workflows/phase04a-g3-full-schema-gate.yml:242–250`, artifacts uploaded at `:252–259` into a
gitignored directory (`.gitignore:53–54`).

### 3.1 What the script does, step by step (per target database)

| Step | Lines | What it reads | On failure |
|---|---|---|---|
| 0 | `:100–115`, `:302–316` | arguments; refuses `postgres`, `template0`, `template1` | `REFUSED_DEFAULT_DATABASE`, exit 1 |
| 1 | `:119`, `:320–331` | `SELECT current_database()` and compares it **as an exact string** with the requested name | `MISSING_DATABASE` / `WRONG_DATABASE_IDENTITY` |
| 2 | `:333–341` | `count(*) FROM pg_database WHERE datname = current_database()` must be exactly 1 | `MALFORMED_RESULT` |
| 3 | `:121–147`, `:343–357` | the profile document (`collation-profile/v1`) | `MALFORMED_RESULT` |
| 4 | `:359–370` | `fields_present` for the three PostgreSQL-15 fields | `UNSUPPORTED_CATALOG_FIELD` |
| 5 | `:149–164`, `:372–384` | the canonical fingerprint string | `MALFORMED_RESULT` if empty or not prefixed |
| 6 | `:169–221`, `:386–428` | the six-index document (`collation-indexes/v1`), missing-index detection, row/key invariants | `MISSING_INDEX` / `MALFORMED_RESULT` |
| 7 | `:250–264`, `:430–439` | one `notice` annotation per successful database | `MALFORMED_RESULT` if the value is not the script's own |
| 8 | `:441–463` | human-readable echo of every field | — |
| — | `:280–294`, `:465–467` | `collation-summary/v1` with an `ok` boolean; exit 0/1/2 | — |

### 3.2 The environment fingerprint, exactly as built

`FINGERPRINT_SQL` (`:149–164`) emits **one row, one column, eight segments, fixed order**:

```text
collation-fingerprint/v1;pg=<major>;enc=<encoding>;provider=<word>;collate=<text>;ctype=<text>;iculocale=<text>;collversion=<text>
```

| Segment | SQL expression | NULL / edge behaviour |
|---|---|---|
| `collation-fingerprint/v1` | literal | fixed; a future change is proposed to be `/v2` (§10) |
| `pg` | `current_setting('server_version_num')::int / 10000` | integer major only; the full string is *not* here |
| `enc` | `pg_encoding_to_char(d.encoding)` | positive control: `UTF8` in CI |
| `provider` | `CASE to_jsonb(d)->>'datlocprovider' WHEN 'c' THEN 'libc' WHEN 'i' THEN 'icu' WHEN 'b' THEN 'builtin' ELSE 'unknown' END` | **no `'d'` arm** — see §3.4 |
| `collate` | `coalesce(d.datcollate, '-')` | `-` when NULL |
| `ctype` | `coalesce(d.datctype, '-')` | `-` when NULL |
| `iculocale` | `coalesce(to_jsonb(d)->>'daticulocale', '-')` | `-` in both measured environments (libc) |
| `collversion` | `coalesce(to_jsonb(d)->>'datcollversion', '-')` | `2.41` in CI; `-` on the local 16.2 build |

The string contains **no database name, no OID, no cluster identifier, no user, no timestamp**. It is stable
across runs on one environment and changes if the environment changes.

### 3.3 The two companion documents, and what they add

**`collation-profile/v1`** (`:121–147`) — 12 keys: `probe`, `current_database`, `server_version`,
`server_version_num`, `pg_major`, `encoding`, `datlocprovider` (raw `"char"`), `provider_name` (mapped),
`datcollate`, `datctype`, `daticulocale`, `datcollversion`, plus `fields_present` (three booleans). This is
where the **diagnostic** information lives: the full server version (including the Debian package string), the
raw provider character, and the database's own name.

**`collation-indexes/v1`** (`:169–221`) — `approved_count` (6), `present_count`, `missing[]`,
`declared_keys` (11), and one row per key with 21 attributes: `index_name`, `table_name`, `exists`,
`is_unique`, `is_valid`, `is_ready`, `is_live`, `nulls_not_distinct`, `has_predicate`, `predicate`,
`key_count`, `key_ord`, `key_kind` (`expression` when `indkey = 0`, else `column`), `collation_oid`,
`collation` (`namespace.name`), `collation_provider`, `deterministic`, `collate`, `ctype`, `collversion`,
`opclass`.

Three properties of this document that matter for the decision:

- It is emitted **separately** from the fingerprint and never merged into it (`PROPOSED`, Session 16 §9.5) —
  so a failure can be attributed to "the environment moved" or "the index changed", not both at once.
- Its NULL convention is **inconsistent with the fingerprint's**: six attributes are `coalesce(…, '-')`, but
  `collation_oid` and `deterministic` are left as SQL NULL when no collation is attached, so a non-collatable key reports
  `collation_oid = 0` with `deterministic` serialized as JSON `null`, while its neighbouring collation
  attributes use the string `-`.
- A **missing** index still produces a row (`generate_series(1, coalesce(indnkeyatts, 1))`), with
  `exists = false`; step 6a then fails. So absence is detected by inspection of the document, not by absence.

### 3.4 The `'d'` provider divergence, verified in the source

`PROFILE_SQL` maps `'c'→libc`, `'i'→icu`, `'b'→builtin`, **`'d'→database_default`**, else `unknown`.
`FINGERPRINT_SQL` maps only `'c'`, `'i'`, `'b'`, else `unknown` — **it has no `'d'` arm**.

| Consequence | Detail | Label |
|---|---|---|
| The two documents can disagree about one database | profile says `provider_name = database_default`; string says `provider=unknown` | `VERIFIED` (source) |
| A consumer that reads only the string cannot distinguish "the `d` provider" from "a provider this code does not know" | both render `unknown` | `DERIVED` |
| Whether any database reports `d` on the tested versions | not observed in this environment | `NOT TESTED` |
| Which behaviour is correct | a specification question — OD-COLL-04 | `OPEN` |

This is exactly what a decision brief must surface: a mapping ambiguity that no amount of code reading can
settle, because the *specification* does not define the domain.

### 3.5 Where the implementation and the proposal disagree

Session 16's proposal (`phase-04a-ci-collation-profile-measurement-proposal.md`) describes the same artefact.
The implementation diverges from it:

| # | Proposal says | Implementation does | Direction |
|---|---|---|---|
| D1 | §12.2: `fields_present = false` "**not** a step failure in phase 1 … exit 0" | fails with `UNSUPPORTED_CATALOG_FIELD`, exit 1 (`:359–370`) | **stricter** |
| D2 | §12.2: a missing index "**no step failure** (the gate already covers existence)" | fails with `MISSING_INDEX`, exit 1 (`:386–428`) | **stricter** |
| D3 | §12.2: connection failure message `::error::collation probe: cannot read pg_database in <db> on <port>` | `::error::state=MISSING_DATABASE db=<db> …` (`:224`, `:322–330`) | changed form |
| D4 | §8.6 C1: "anything else → `unknown` (**and `unknown` must fail, not pass**)" | `unknown` is serialized and the run continues; only the `collation-fingerprint/v1;` prefix is checked (`:250–264`, `:380–384`) | **looser** |
| D5 | §8.3: values are "rejected if they contain the delimiters (`;`, newline)" | **no delimiter validation exists**; the annotation path rejects control characters only (`:230–248`) | **looser** |
| D6 | §8.6 C2: additionally compare a **normalised locale key** (`utf-8`→`utf8`) | not implemented anywhere; the verbatim string is the only artefact | not implemented |
| D7 | §8.6 C3: reject or escape a raw value equal to `-` | not implemented; `coalesce(…, '-')` is the only NULL handling | not implemented |
| D8 | §12.3: evidence lands in artifacts and the step log | additionally lands in **check-run annotations** (`0aae136`), which is how it was read back in CI | extended |

Two additional failure states that the proposal does not list are implemented: `REFUSED_DEFAULT_DATABASE`
and `WRONG_DATABASE_IDENTITY`, plus the `MALFORMED_RESULT` umbrella (`:24–52` header, `:300–318`).

**Reading:** the "specification" being discussed in the documents is **not** the artefact that exists. Anyone
implementing the guard against the proposal's §12.2 would expect `exit 0` where the script exits 1.

### 3.6 What does not exist at all

`VERIFIED` by inspection:

| Missing piece | Evidence of absence |
|---|---|
| An approved fingerprint value / expectation file | no such file anywhere; no `expected*`/`approved*` artifact referencing a fingerprint |
| Any comparison logic | neither the script nor the workflow diffs `g3f_main` against `g3f_replay`; the "byte-identical" result was established by reading two annotations (§4) |
| Any consumer of the fingerprint | `guard.py` contains no fingerprint, `datcollate` or `collversion` reference |
| Cluster identity | no `pg_control_system()`, `inet_server_addr()`, `inet_server_port()`, `datoid` or `oid` capture |
| Behavioural validation | no fold/compare/sort test in the probe; G-3 cases 30–32 are ASCII-only |

---

## 4. Established CI evidence

Reproduced here **exactly**, and unchanged by this brief.

| Property | Value | Label |
|---|---|---|
| PostgreSQL | `16.16` | `VERIFIED` |
| Debian package | `16.16-1.pgdg13+1` (Debian 13 / trixie) | `VERIFIED` |
| Encoding | `UTF8` | `VERIFIED` |
| Provider | `libc` (raw `datlocprovider = c`) | `VERIFIED` |
| `datcollate` | `en_US.utf8` | `VERIFIED` |
| `datctype` | `en_US.utf8` | `VERIFIED` |
| `daticulocale` | NULL | `VERIFIED` |
| `datcollversion` | `2.41` | `VERIFIED` |
| `g3f_main` and `g3f_replay` fingerprints | matched byte-for-byte | `VERIFIED` |

**The observed fingerprint:**

```text
collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=en_US.utf8;ctype=en_US.utf8;iculocale=-;collversion=2.41
```

**Evidence references:** CI run `45546248909`; check run `138976563830`; measurement commit
`0aae1368a16cf6447cb7a01afc7554a9fdab4bc0`.

**Re-verified this session** (read-only `GET …/check-runs/138976563830/annotations`, no production access).
The two `notice` annotations carry, verbatim:

```text
title: collation profile g3f_main
message: observed CI measurement (read-only, not an approval) database=g3f_main server=16.16 (Debian 16.16-1.pgdg13+1) fingerprint=collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=en_US.utf8;ctype=en_US.utf8;iculocale=-;collversion=2.41
```

and the same message with `database=g3f_replay`. This confirms three things the documents assert and that a
reader of the script alone could only infer: the field **names**, the field **order**, and that the **full
server version with the package string is published as a diagnostic but not carried in the canonical string**.

**Boundaries preserved verbatim, none of which this brief relaxes:**

- This is **CI evidence, not production evidence**.
- The **production profile remains `UNKNOWN`**.
- The **production PostgreSQL major version remains `UNKNOWN`**.
- **Production provider, locale and collation version remain `UNKNOWN`**.
- **Matching fingerprints do not prove equivalent Unicode comparison behaviour across different
  environments.**
- A fingerprint is an **identity/change-detection mechanism**, not a complete semantic-equivalence proof.
- **`datcollversion` must not be assumed NULL for libc** (it is `2.41` in CI, NULL in the Session 23 local
  build — both facts stand).
- **CI's ASCII-only G-3 tests do not establish Unicode uniqueness behaviour** (`enforce.sql:632–645`).

---

## 5. Candidate layered architecture

Four layers, evaluated against what exists. "Implemented" means *measured by the committed probe*, which is
not the same as *approved*.

### 5.1 Layer summary

| Layer | Question it answers | Where it exists today | Status of the layer as a *specification* |
|---|---|---|---|
| **A — Environment identity** | which environment is this, and what does `default` mean here? | `collation-fingerprint/v1` string + `collation-profile/v1` JSON | partially defined, `OPEN` |
| **B — Per-index collation identity** | is each key still attached to the expected collation object? | `collation-indexes/v1` JSON (measured); symbolic expectations only in the R2 guard contract | measured, not specified; `OPEN` |
| **C — Index structural semantics** | is the index still the same object? | partially echoed by the probe; fully designed in guard design §6 | designed (`PROPOSED`), **not implemented** |
| **D — Behavioural validation** | do strings actually compare the way we think? | not in the probe; G-3 cases 30–32 (ASCII only) | absent; `NOT TESTED` for Unicode |

### 5.2 Layer A — environment identity

| Candidate field | In the string? | In the profile? | Assessment |
|---|---|---|---|
| fingerprint schema version | yes (prefix) | `probe` key | **mandatory** — without it, comparison rules are unversioned |
| PostgreSQL major | yes | yes | **mandatory** — cheap, stable, and a major can change `pg_collation`, provider support and the `lower()` implementation |
| encoding | yes | yes | **mandatory** — byte semantics of any fold |
| provider | yes (word) | yes (raw + word) | **mandatory**, but the domain and the `unknown` rule are **undefined** (§3.4) |
| `datcollate` | yes | yes | **mandatory for libc**; NULL is legitimate for ICU |
| `datctype` | yes | yes | **mandatory for libc** — not redundant with `datcollate`, because case conversion follows ctype |
| `daticulocale` | yes | yes | **mandatory for ICU**; `-` is the expected value for libc |
| `datcollversion` | yes | yes | **mandatory to record, never sufficient to compare** (§6.4) |
| database identity | **no** | `current_database` only | currently a **separate assertion** (§6.3) |
| cluster identity | no | no | `PROPOSED` candidate, privilege implications `UNKNOWN` |
| full `server_version` | **no** | yes | **diagnostic only** — changes on every patch/package rebuild |
| `server_version_num` | no | yes | redundant with `pg` for identity; fine as diagnostics |

**Recommendation for consideration (not approval):** keep Layer A to *semantic* fields (the seven) plus a
schema version, and keep *identity* as a separate, mandatory, non-serialized assertion. Evidence for this
split: every document that defines the fingerprint excludes `datname`/`oid` as "identity, not semantics"
(decision doc §8.2), and the implemented script already asserts identity before it measures anything
(`:320–331`).

### 5.3 Layer B — per-index collation identity

The R2 investigation defines four symbolic expectation kinds (`r2 §12.1`): `none` (8 keys),
`database_default` (3 keys), `named(schema, name)`, `column(table, column)` — 11 keys across 6 indexes.

| Candidate sub-field | Measured by the probe? | In the R2 contract? | Assessment |
|---|---|---|---|
| index name | yes | yes (inventory of six) | mandatory |
| key ordinal | yes | yes (per key) | mandatory |
| symbolic expectation kind | **no** | yes (`PROPOSED`) | mandatory **if** the fingerprint is to be compared, not just read |
| resolved collation identity (`schema.name`, OID) | yes | yes | mandatory — OID alone is not meaningful (§9) |
| provider / determinism of the resolved collation | yes | implied by verification | mandatory for `named`, informative for `database_default` |
| locale/version attributes of the resolved collation | yes | — | informative; a `named` collation's own `collversion` is the only place it appears |
| relationship to the underlying column (`column` kind) | **partially** — `key_kind = expression\|column` only, no source column | yes | needs an explicit rule for expression keys, which have no column |

**Do not merge Layer B into Layer A.** Merging would make one failure ambiguous between "the environment
moved" and "an index changed" — two different classes with different remedies (Session 16 §9.5, decision doc
§8.2). The current artefacts already respect this separation.

### 5.4 Layer C — index structural semantics

The probe reports *some* structural attributes, but it is not a structural verifier:

| Structural property | Reported by the probe? | Note |
|---|---|---|
| unique vs non-unique | yes (`is_unique`) | |
| partial predicate | yes (`has_predicate`, `predicate` text) | no normalisation, no expectation |
| expression | **only as a boolean kind** | the expression *text* is not captured; `pg_get_expr(indexprs)` is not selected |
| operator class | yes (`opclass`) | default-ness (`opcdefault`) not captured |
| NULL semantics | yes (`nulls_not_distinct`) | |
| key count / ordering | yes (`key_count`, `key_ord`) | per-key sort direction and NULLS FIRST (`indoption`) **not** captured |
| INCLUDE columns | **no** | `indnatts` vs `indnkeyatts` never compared |
| access method | **no** | `pg_am` never read |
| validity / readiness / liveness | yes | `is_valid`, `is_ready`, `is_live` |

An environment fingerprint verifies **none** of these. The guard design (§6) already specifies the full
comparison; **no guard code exists**.

### 5.5 Layer D — behavioural validation

Metadata cannot demonstrate that `lower('Ä')` collides with `lower('ä')` in a given environment. That requires
executing comparisons — which the probe deliberately does not do (read-only, `SELECT` only, no writes, and a
unique index is the only real proof of uniqueness). G-3's cases 30 and 32 use ASCII-only strings (case 31 is a NULL-attribution rule, not a fold), so `G-3 PASSED` does not
speak to Unicode behaviour.

Why behavioural tests cannot substitute for layers A–C, and vice versa:

| Test kind | Establishes | Cannot establish |
|---|---|---|
| metadata fingerprint (A) | which environment, and that it changed | that two environments compare identically |
| per-index metadata (B) | which collation object each key uses | that the object behaves as intended |
| structural assertion (C) | that the index definition is unchanged | that its semantics match the promise |
| behavioural test (D) | that *these particular* strings compare in a particular way | that all strings do, or which environment produced it |

**All four are needed; none is a substitute.** Layer D is `NOT TESTED` in CI beyond ASCII.

---

## 6. Field-by-field specification

### 6.1 Layer A fields

| Field | Source | Req/Opt | Applicability | Canonical form | NULL handling | Version sensitivity | If unavailable | Layer | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| schema version | literal in SQL | **required** | always | `collation-fingerprint/v1` | never NULL | the version *is* the compatibility marker | unparseable → malformed | A (prefix) | `VERIFIED` |
| `pg` major | `server_version_num / 10000` | **required** | always | integer, no padding | never NULL | API stable; catalog shape changes | cannot classify → malformed | A | `VERIFIED` |
| `enc` | `pg_encoding_to_char(encoding)` | **required** | always | upper-case name (`UTF8`) | never NULL | stable | malformed | A | `VERIFIED` |
| `provider` | `datlocprovider` mapped | **required** | always | word `libc`/`icu`/`builtin` | never NULL, but **`unknown` is a value** and its meaning is undefined | `builtin` is 17+; `d` unhandled | `unknown` must not pass — **not enforced** | A | `VERIFIED`; domain `OPEN` |
| `datcollate` | `pg_database.datcollate` | **required for libc**, not applicable for ICU | provider = libc | verbatim text | `-` (only if genuinely NULL) | locale names are OS strings | absent → cannot fingerprint | A | `VERIFIED` |
| `datctype` | `pg_database.datctype` | **required for libc** | provider = libc | verbatim text | `-` | same | same | A | `VERIFIED` |
| `daticulocale` | `to_jsonb(d)` | **required for ICU** | provider = icu | verbatim text (e.g. a BCP-47-ish tag) | `-` for libc is **expected** | ICU version-dependent syntax | `fields_present=false` on pre-15 | A | `VERIFIED` (field), `NOT TESTED` (ICU values) |
| `datcollversion` | `to_jsonb(d)` | **required to record** | libc and ICU | verbatim text | `-` is legitimate; **must not be read as safe** | glibc- and ICU-dependent; NULL on some builds | `fields_present=false` | A | `VERIFIED` (both NULL and `2.41` observed) |
| full `server_version` | `current_setting` | **optional (diagnostic)** | always | verbatim | n/a | changes per patch and per package rebuild | omit | A-diagnostic | `VERIFIED` (CI `16.16 (Debian …)`) |
| `server_version_num` | `current_setting` | optional | always | integer | n/a | stable | omit | A-diagnostic | `VERIFIED` |
| `fields_present` | `to_jsonb(d) ? 'col'` | **required** | always | object of booleans | booleans, never NULL | pre-15 → all `false` | fail closed | A-validity | `VERIFIED` |
| database identity | `current_database()` | **required** | always | exact string of the target | never NULL | stable | fail | separate assertion | `VERIFIED` |
| cluster identity | `pg_control_system()`, `inet_server_addr()`, `inet_server_port()` | **optional**, candidate | if privileges permit | text / inet | n/a | function availability and privileges vary | omit | A-identity | `UNKNOWN`, `NOT TESTED` |
| secret material | — | **prohibited** | — | — | — | — | — | — | rule `PROPOSED`; script already never prints credentials or `current_user` |

### 6.2 Layer B / C fields (per key)

| Field | Source | Req/Opt | Canonical form | NULL handling | Version sensitivity | If unavailable | Layer | Evidence |
|---|---|---|---|---|---|---|---|---|
| index name | `to_regclass('public.' \|\| name)` | **required** | identifier text | a missing index still yields a row with `exists=false` | stable | fail (`MISSING_INDEX`) | B | `VERIFIED` |
| key ordinal | `generate_series(1, indnkeyatts)` | **required** | integer 1..n | never NULL | `indnkeyatts` 11+ | fail | B | `VERIFIED` |
| expectation kind | not measured; R2 §12.1 | **required for comparison** | one of `none`/`database_default`/`named`/`column` | `none` is a kind, not a NULL | — | unknown kind → fail | B | `PROPOSED` |
| resolved collation | `pg_collation` join | **required** | `namespace.name` + OID | `-` and OID `0` mean **not collatable** | stable | fail | B | `VERIFIED` |
| collation provider / determinism | `pg_collation` | **required** | `c`/`i`/`d`, boolean | `null` for non-collatable keys (inconsistent with `-`) | stable | fail | B | `VERIFIED` |
| collation locale/version | `pg_collation` | informative | verbatim | `-` | per-collation | omit | B | `VERIFIED` |
| expression text | `pg_get_expr(indexprs)` | **required for C** | normalised text or per-key rendering | n/a | rendering is not contractual across majors | fail | C | `NOT TESTED` in probe (not selected) |
| predicate text | `pg_get_expr(indpred)` | **required for C** | whitespace-normalised text | none = no predicate | rendering varies | fail | C | `VERIFIED` (probe captures; guard normalisation `PROPOSED`) |
| opclass (and default-ness) | `pg_opclass` | **required for C** | `opcname`, `opcdefault` | `-` | stable | fail | C | `VERIFIED` |
| unique / NULL semantics / validity | `pg_index` | **required for C** | booleans | never NULL | `indnullsnotdistinct` 15+ | fail | C | `VERIFIED` |
| key count, INCLUDE, access method, per-key sort | `indnkeyatts`, `indnatts`, `pg_am`, `indoption` | **required for C** | integers / `btree` | n/a | `indnkeyatts` 11+ | fail | C | not captured by the probe |

### 6.3 Database identity

| Question | Answer | Label |
|---|---|---|
| How is the intended target identified? | the caller states `<db>:<port>`; the script asserts `current_database()` equals `<db>` exactly | `VERIFIED` |
| Does that distinguish *clusters*? | **No.** Two clusters can hold a database of the same name; a mis-pointed `PGHOST` would pass the name check | `DERIVED` |
| Does the fingerprint distinguish them? | **No** — identity is deliberately not in the string | `VERIFIED` |
| How are CI main and replay distinguished? | by target in the annotation title and the profile's `current_database`; both fingerprints are identical, which is the *expected* result | `VERIFIED` |
| How is production distinguished? | not at all — production has never been measured | `UNKNOWN` |
| Are credentials or user names ever emitted? | **no**; the script never prints the connection string and never collects `current_user` (`:28–32`) | `VERIFIED` |

**Consequence for the specification:** identity must be an **assertion bound to the expectation**, not a field
to compare for equality. A fingerprint without a bound identity can be "the same" in two unrelated places and
"different" in two identical ones.

### 6.4 Collation version

| Question | Answer | Label |
|---|---|---|
| Why is NULL legitimate? | some libc builds do not expose a locale version; PostgreSQL leaves the field NULL rather than inventing one (measured on the Session 23 local 16.2 build) | `VERIFIED` |
| Why must NULL not be read as safe? | NULL means *unknown*, not *unchanged*: a library upgrade in such an environment is invisible | `DERIVED` |
| Why is a change a review trigger, not proof of corruption? | the version names an implementation, and an implementation change *may* alter folding/ordering — it says nothing about the actual rows or index contents | `DERIVED` |
| Why can provider alone not decide availability? | CI is `libc` **with** `2.41`; the local build is `libc` **without** it — so `provider = libc` does not imply NULL, and the correction in decision doc §8.7.1 stands | `VERIFIED` |
| What about ICU? | ICU databases carry the ICU version here; not measured in this repository | `NOT TESTED` |

### 6.5 Provider-specific fields

| Provider | Applicable fields | Rule |
|---|---|---|
| `libc` | `datcollate`, `datctype`, `datcollversion` | `daticulocale` must be `-`; a non-NULL ICU locale with `libc` is anomalous and should be a review state (`PROPOSED`) |
| `icu` | `daticulocale`, `datcollversion`, plus whatever `datcollate`/`datctype` hold | **`datcollate`/`datctype` semantics for ICU are not measured here** (`NOT TESTED`); the script serializes them regardless, so a specification must say whether they are meaningful, `-`, or excluded for ICU |
| `builtin` (17+) | provider `b`; locale fields depend on the version | `NOT TESTED` |
| `d` | unhandled in the fingerprint, handled in the profile | see §3.4 |
| anything else | `provider=unknown` | must **fail closed** (`PROPOSED`, Session 16 C1) — **not implemented** |

---

## 7. Canonical serialization

### 7.1 The current grammar, stated exactly

```text
collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=en_US.utf8;ctype=en_US.utf8;iculocale=-;collversion=2.41
```

- one line, no whitespace, `;` between segments, `=` between key and value;
- **fixed order** (the SQL concatenates in a fixed sequence, so no map ordering is involved);
- **no escaping** of values and **no delimiter check** (`:149–164`, `:230–248`);
- `-` marks NULL, produced by `coalesce`;
- an empty string would render as `key=`; a missing segment is only detectable by position/count.

### 7.2 Rules the brief asks about, evaluated

| Rule | Current state | Assessment | Label |
|---|---|---|---|
| stable field ordering | implemented | required; keep | `VERIFIED` |
| explicit schema version | in-band prefix | required; keep | `VERIFIED` |
| UTF-8 serialization | the **database** encoding is `UTF8` in both measured environments, so values are UTF-8-compatible; the *artifact file* encoding is whatever `psql` writes | a specification must state the artifact encoding, not just the database's | `DERIVED`; artifact encoding `NOT TESTED` |
| escaping delimiters | **none** | required before any machine comparison; C3/C5 unresolved | `NOT TESTED` (unexercised) |
| NULL representation | `-` | **ambiguous**: a locale legitimately named `-` would collide | `VERIFIED` (collision possible), `OPEN` (rule) |
| empty-string representation | `key=` | distinguishable from `-`, but not from a missing segment | `DERIVED` |
| missing-field representation | silent omission | dangerous: a removed field shrinks the string and a byte comparison still "passes" if both sides omit it | `DERIVED` |
| numeric formatting | integer, no padding, no locale | correct | `VERIFIED` |
| locale-name normalization | **none** | `en_US.utf8` vs `en_US.UTF-8` (same glibc locale) produce different fingerprints → false drift | `VERIFIED` (rule absent), C2 `PROPOSED` |
| provider-name normalization | mapping `c`/`i`/`b` applied; `d` inconsistent | required; finalise the domain | `VERIFIED` |
| deterministic output | yes for one database at one instant | a *database* is not immutable: `ALTER DATABASE …` can change these values between runs — which is what drift detection wants | `VERIFIED` |
| hashing | `sha256:` prefix form proposed (decision doc §8.3), **not implemented** | hashing conceals the values and destroys field-level diagnosis; only useful as a stored token, never as the sole evidence (§7.5) | `PROPOSED` |

### 7.3 The `-` sentinel and the delimiter problem, stated as they are

Two distinct defects exist in the *current form* — neither is exercised by CI, both are specified away in
documents that were never applied:

1. **Sentinel collision.** `coalesce(x, '-')` cannot distinguish "NULL" from "the literal string `-`". Session
   16 C3 proposed rejecting or escaping it; the script does neither.
2. **Delimiter injection.** A `;` or `=` inside `datcollate` (or a locale name carrying one) would silently
   change the parse. No check exists; the annotation's control-character guard does not cover `;`.

Both are cheap to fix and both change the format, so they belong to OD-COLL-04, not to implementation.

### 7.4 Text versus JSON

| Criterion | Delimiter-separated text (current) | Canonical JSON |
|---|---|---|
| human readability in a log | high | medium |
| escaping | must be invented | defined by the format |
| NULL vs empty vs absent | three cases, one ambiguous | three distinct encodings |
| field-level diff | requires a parser | trivial |
| key ordering | positional, fragile if a field is inserted | explicit; must be canonicalised (sorted keys, no insignificant whitespace) |
| byte comparison | natural | requires canonicalisation rules |
| version marker | in-band prefix | top-level key |
| risk of silent ambiguity | **present today** | lower |

**Recommendation for consideration (not approval):** define the machine-compared artefact as **canonical
JSON** with explicit `null`, sorted keys, no insignificant whitespace, values as strings, and a top-level
`schema` key; **retain** the one-line `collation-fingerprint/v1` string as the human-readable summary in the
log and annotation, explicitly **not** the comparison source. Two artefacts, one authority.

Deterministic-JSON requirements if adopted (`PROPOSED`): UTF-8 output; keys sorted by Unicode code point;
no duplicate keys; `null` for absent/unknown; numbers only where semantics are numeric; no trailing newline
significance; the same serializer version recorded alongside (`schema`). No implementation exists.

### 7.5 Hashing

| Use | Verdict |
|---|---|
| short token in a badge or a chat message | acceptable, as a *pointer* |
| sole stored evidence | **rejected** — a hash answers "same or not", never "which field changed", and cannot be reviewed by a human |
| drift classification | **impossible** from a hash alone |
| privacy | the fingerprint contains no personal data, so hashing buys nothing here |

`PROPOSED`: if a digest is published, publish it **alongside** the full document, never instead of it.

---

## 8. Comparison and drift semantics

**Scope separation:** OD-COLL-04 defines the *classification* (which of these outcomes applies). OD-COLL-05
defines the *response* (fail, warn, allow, re-pin). The responses below are therefore **proposals for
consideration**, and adopting them is OD-COLL-05's decision — not this brief's.

**`EXACT_MATCH` in this section is a fingerprint-layer outcome, not a deployment verdict.** The 13 outcomes
below classify differences between two *environment documents* only. OD-COLL-05 uses the same word in a
larger vocabulary (33 classifications across layers A–E plus measurement validity), where it means that
*every applicable approved expectation* — identity, environment, per-index collation, structure and
behaviour — was verified. A fingerprint match therefore proves no more than "the recorded environment
properties agree": it says nothing about index validity, about whether an index definition still matches
`migration.sql`, or about whether `lower()` behaves the same on the target. Those are separate checks
(§5 layers, §9 identity versus equivalence), and none of them is implemented today.

| Outcome | Meaning | Candidate class | Evidence needed | May the system continue? | Owner approval? |
|---|---|---|---|---|---|
| `EXACT_MATCH` | every field equals the approved expectation, including the schema version | pass | both documents, same schema version | yes | no |
| `EXPECTED_ENVIRONMENT_CHANGE` | a difference matches an explicitly listed, approved transition (e.g. a reviewed image bump) | pass **only if** an allow-list entry exists | the allow-list entry, its expiry and its approver | yes, on that entry alone | **yes** (the entry) |
| `COLLATION_VERSION_CHANGE` | `datcollversion` differs (both populated) | review-required | both versions; confirmation that indexes are valid | no, until reviewed | yes (reviewed re-pin) |
| `COLLATION_VERSION_UNKNOWN` | `-` on one or both sides | review-required **and** a mandatory warning line | the measurement, plus whatever the OS can say | no silent pass; a warning must be read | yes, to proceed |
| `PROVIDER_CHANGE` | `provider` differs (e.g. `libc`→`icu` with the same locale text) | hard failure | both documents; a statement of intended provider | no | yes (OD-COLL-03/05) |
| `LOCALE_CHANGE` | `datcollate`, `datctype` or `daticulocale` differs | hard failure | both documents; the intended locale | no | yes |
| `ENCODING_CHANGE` | `enc` differs | hard failure | both documents | no | yes |
| `POSTGRES_MAJOR_CHANGE` | `pg` differs | hard failure + unsupported-version review | both documents; support statement for the target major | no | yes |
| `DATABASE_IDENTITY_MISMATCH` | the measured database is not the one the expectation is bound to | hard failure (measurement invalid) | the target assertion and the observed name | no — and the fingerprint is not evidence at all | no (it is a bug, not a policy) |
| `MISSING_FIELD` | a required field is absent or unreadable | hard failure ("cannot fingerprint") | the profile's `fields_present`, the server version | no | yes, to support the version |
| `UNSUPPORTED_PROVIDER` | `provider = unknown`, or a provider with no defined field set | hard failure | the raw `datlocprovider`, the provider domain | no | yes, to extend the domain |
| `MALFORMED_FINGERPRINT` | unparseable, empty, wrong prefix, wrong segment count | hard failure | the raw text | no | no |
| `UNKNOWN_OR_UNCLASSIFIED_CHANGE` | a difference in a field with no classification rule (e.g. a new v2 field) | review-required, never pass | both documents, field-level diff | no, until classified | yes |

**Two classifications appear here beyond the brief's list** — `ENCODING_CHANGE` and
`COLLATION_VERSION_UNKNOWN` — because the implemented fingerprint carries `enc`, and because a NULL
version is a distinct case from a changed one. Both are additions for consideration, not requirements.

Three rules that must survive any summary:

1. **Not every difference has the same severity** — a `datcollversion` bump is evidence for review; a provider
   change alters the meaning of the guarantee.
2. **No difference may be silently accepted.** The only non-review path is `EXPECTED_ENVIRONMENT_CHANGE`,
   which by construction *is* a review that already happened.
3. **Comparing across schema versions is meaningless.** `v1` and `v2` must be compared only after an explicit
   version-aware mapping (§10).

---

## 9. Environment identity versus semantic equivalence

Matching values do not prove matching behaviour. Each mechanism below explains why, with the evidence status
kept honest.

| Mechanism | What the fingerprint captures | Why equality is not equivalence | Evidence |
|---|---|---|---|
| libc implementation/version | `datcollversion` **when the build exposes it** | two builds can carry the same locale name and different Unicode/tailoring data; where the field is NULL the difference is invisible | `VERIFIED` (NULL locally, `2.41` in CI) |
| ICU implementation/version | `daticulocale`, `datcollversion` | ICU's data version can change independently of the locale tag | `NOT TESTED` |
| PostgreSQL major | `pg` | a major can change catalog shape, provider support and the fold implementation it calls | `VERIFIED` (design), `NOT TESTED` (behaviour across majors) |
| encoding | `enc` | identical encoding with different locales still differences semantics; identical encoding does not normalise bytes | `VERIFIED` |
| deterministic vs non-deterministic collations | **nothing** — a database-level field cannot describe a per-collation property | a non-deterministic collation compares differently and would change uniqueness; the database row cannot reveal it | `VERIFIED` (decision doc §7.5 prohibits them; no field records it) |
| Unicode normalization | **nothing** | `é` NFC ≠ `e`+U+0301 under `lower()`; two DBs with identical fingerprints behave the same only because neither normalises | `OBSERVED` (Session 23, local 16.2 `C.utf8`, E8/E19) |
| case conversion | `datctype` only | the mapping table is the OS's; the same ctype string on two libc builds can differ for rare code points | `VERIFIED` (mechanism), `NOT TESTED` (cross-build) |
| operator classes | **nothing** in the fingerprint | a changed opclass changes comparison/ordering and is invisible at database level | `VERIFIED` (guard design §6 needs it) |
| expression semantics | **nothing** | `lower(name)` is text; the same expression under different ctype means different things — the §11.3 proof in the decision doc | `VERIFIED` |

**The strongest statement the evidence supports:** an equal fingerprint means *the recorded properties were
equal*. It does not mean *strings compare identically*. The only artefact that would support the latter is
behavioural validation against the target database, which does not exist (Layer D, `NOT TESTED` beyond ASCII).

**Boundary that must travel with every use of this table:** CI is `en_US.utf8`/`libc`/`2.41`; production's
provider, locale, collation version and major are `UNKNOWN`; CI↔production equivalence is
`NOT ESTABLISHED`; `en_US.utf8` and `C.utf8` were never compared in this repository; the fn/case evidence
gathered locally is `C.utf8`-versus-`C` only.

---

## 10. Versioning and compatibility

| Change | Compatibility | Coexistence rule | Evidence |
|---|---|---|---|
| **Add a field** | breaks byte comparison unless both sides know it | bump the schema version (proposed `v2`), or add it only to the diagnostic document | `PROPOSED`; a silent add is the failure mode to avoid |
| **Remove a field** | breaks comparison and silently weakens the artefact | bump the version; never remove silently (a missing field is not a NULL) | `DERIVED` |
| **Change NULL semantics** (e.g. `-` → explicit `null`, or tagged values) | breaks every stored string | new version; old strings are *not* re-interpreted | `DERIVED` |
| **Change canonical serialization** (text → JSON) | makes old and new artefacts incomparable | both produced during a transition; the comparison layer must refuse to compare across kinds | `PROPOSED` |
| **Change supported PostgreSQL majors** | may change field availability and the `'b'` provider | version-aware expectations; the probe already fails closed via `fields_present` on pre-15 servers | `VERIFIED` (mechanism), `NOT TESTED` (17/18) |
| **Add an ICU provider** | new field applicability (`daticulocale` meaningful, `datcollate`/`datctype` semantics undefined) | the domain must be defined *before* ICU is supported, not inferred from the first ICU measurement | `NOT TESTED` |
| **Add an index to the protected inventory** | changes `approved_count` and `declared_keys`; the probe fails closed on a missing index | inventory change is a reviewed change with its own expectation, not a silent list edit | `VERIFIED` (the probe asserts 6/11 today) |

**How `v1` and `v2` could coexist:** a comparison layer keyed on the schema version, holding one approved
expectation per (identity, schema version) pair, and refusing to classify a diff across versions. A migration
window would produce both artefacts; the gate would read `v2` and retain `v1` as history. **No such layer
exists**, and none is proposed for implementation here.

**Do not assume backward compatibility.** Nothing in the repository defines what a consumer may do with an
unknown field or an unknown version; a consumer that ignores unknown segments would accept a `v2` string as a
`v1` one.

---

## 11. Relationship to other owner decisions

| Decision | What it decides | Boundary with OD-COLL-04 | State |
|---|---|---|---|
| **OD-COLL-01** — tags uniqueness semantics | which equality `uq_tags_name_lower` should enforce | 04 records *what the environment is*; 01 decides *what the guarantee should be*. A fingerprint cannot say whether `lower()` is the right semantics | `OPEN` |
| **OD-COLL-02** — colleges uniqueness semantics | the same, for the sole college rule | same boundary, decided separately | `OPEN` |
| **OD-COLL-03** — production profile | which provider/locale production will have | **mutually dependent**: 03 supplies the values; 04 supplies the field set that makes "the profile" expressible | `OPEN` |
| **OD-COLL-05** — drift failure policy | what to do when measurements differ | **04 classifies; 05 responds.** This brief proposes no response as approved | `OPEN` |
| **OD-COLL-06** — existing-data validation | how data is checked before a uniqueness change | independent of 04, but its report's candidate keys depend on 01/02 | `OPEN` |
| **T1** — measure CI | — | `CLOSED`; supplied §4 | `CLOSED` |
| **R2** — collation comparison rule | the symbolic expectation model | `PARTIALLY RESOLVED`; its four expectation kinds are the candidate basis for Layer B | `PARTIALLY RESOLVED` |

**Boundaries that must not be collapsed** (restated from the brief, unchanged):

- OD-COLL-04 defines **what is measured and represented**.
- OD-COLL-05 defines **what to do when measurements differ**.
- OD-COLL-03 selects **the production environment profile**.
- OD-COLL-01/02 define **business uniqueness requirements**.
- OD-COLL-06 defines **validation of existing data**.

And four separations carried from prior sessions: a policy is not a locale choice; a locale is not a business
identity policy; a fingerprint is not semantic equivalence; passing CI is not production data compatibility.

---

## 12. Owner decision table

### 12.1 OD-COLL-04

| Field | Record |
|---|---|
| **Decision question** | Which fields constitute the collation fingerprint, in what canonical form, and with what comparison meaning? |
| **Candidate architecture** | the four layers of §5 — environment identity, per-index collation identity, structural semantics, behavioural validation — kept as **separate artefacts**, with identity asserted rather than serialized |
| **Candidate fields** | Layer A: schema version, `pg` major, `enc`, `provider`, `datcollate`, `datctype`, `daticulocale`, `datcollversion` (mandatory); full `server_version`, package string, `server_version_num`, raw provider char, `fields_present` (diagnostic); cluster identity (candidate, privilege-dependent). Layer B: index name, key ordinal, expectation kind, resolved collation identity, provider/determinism. Layers C and D: separate assertions and tests (§6) |
| **Serialization approach** | keep the `collation-fingerprint/v1;…` line as the human/diagnostic summary; define the machine-compared artefact as canonical JSON with explicit `null`, sorted keys and a schema version; resolve the `-` sentinel and delimiter rules before any comparison is automated (§7) |
| **Comparison model** | the 13 classifications of §8, version-aware, identity-bound, with no silent acceptance and no cross-version comparison |
| **Evidence available** | the committed probe and both companion documents (`VERIFIED`, §3); the CI fingerprint and its annotations, re-verified this session (§4); Session 23's local `C.utf8` observations of `lower()` behaviour; the R2 symbolic expectation model; the guard design's structural comparison rules |
| **Evidence missing** | an ICU environment (`NOT TESTED`); PostgreSQL 15, 17, 18 (`NOT TESTED`); any production measurement (`UNKNOWN`); any second libc build to test `datcollversion` variance; a decision on whether identity must bind to a cluster; whether `datcollate`/`datctype` are meaningful for ICU; a defined provider domain including `d` |
| **Compatibility implications** | any field addition or representation change breaks byte comparison and requires a version bump and a coexistence rule (§10); an unversioned consumer would accept a future string as a `v1` one |
| **Recommendation, if justified** | **layering, identity-as-assertion, and explicit NULL/absent semantics are justified by the evidence.** A specific serialization (text vs JSON) is **recommended for consideration only** — the evidence shows the current text form is ambiguous, not that JSON is approved. No policy response is recommended here (that is OD-COLL-05) |
| **Owner approval status** | **`OPEN — FINGERPRINT SPECIFICATION NOT APPROVED`** |

A technical recommendation in this table is **not** owner approval, and no field above is approved by its
presence in the committed script.

---

## 13. Recommendations and unresolved questions

### 13.1 Recommendations for consideration (`PROPOSED`, approving nothing)

1. **Keep the layers separate** — one artefact for the environment, one for per-index collation identity, one
   for structure, and behavioural tests apart from all three (§5).
2. **Treat identity as an assertion bound to the expectation**, not as a field compared for equality (§6.3).
3. **Define the provider domain explicitly**, including `d`, and make `unknown` fail closed — the one rule
   Session 16 already wrote and the script does not enforce (§3.4, §3.5).
4. **Resolve `-` and the delimiters before automating a comparison** — otherwise the first automated diff
   will be ambiguous in exactly the case it matters (§7.3).
5. **Record `datcollversion` always, compare it never as a proof** — a change is a review trigger; a NULL is
   unknown, not safe (§6.4).
6. **Version the comparison rules with the string**, and refuse cross-version comparison (§10).
7. **Do not publish a hash as evidence** — a digest cannot be reviewed or classified (§7.5).

### 13.2 Unresolved questions

| # | Question | Who can answer |
|---|---|---|
| Q1 | Which fields are **mandatory** for the approved specification, beyond the seven the script emits? | owner |
| Q2 | Must an approved fingerprint be **bound to a database identity**, and to a cluster identity? | owner + ops |
| Q3 | Is the machine artefact **text or JSON**, and which is authoritative for comparison? | owner |
| Q4 | How are `-`, empty string, and absent field each represented? | owner (format) |
| Q5 | Is locale-name spelling normalisation (`en_US.utf8` = `en_US.UTF-8`) adopted, and where — producer or comparator? | owner |
| Q6 | What is the provider domain, and what happens on an unknown provider? | owner |
| Q7 | Is `pg` major sufficient, or is a full-version field mandatory for support gating? | owner |
| Q8 | Are `datcollate`/`datctype` meaningful for ICU databases, and must they be `-` there? | needs an ICU environment (`NOT TESTED`) |
| Q9 | Who owns the approved expectation, where does it live, and how is it re-pinned? | owner + ops (also OD-COLL-05) |
| Q10 | Which PostgreSQL majors must the specification support? | owner (17/18 `NOT TESTED` here) |

---

## 14. Explicit non-authorisations

This brief authorises **none** of the following:

- modifying `collation-probe.sh`, its SQL, its failure states, its annotation format or its output documents;
- modifying any workflow (including the G-3 gate), or adding a step, secret or artifact;
- implementing fingerprint serialization, a comparison layer, a drift classifier, an expectation file, or the
  index-integrity guard;
- changing PostgreSQL configuration, creating or measuring any database;
- connecting to production or staging, reading their catalogs, or running any query or write against them;
- selecting a production locale or provider (OD-COLL-03), or a drift policy (OD-COLL-05);
- modifying `prisma/schema.prisma`, migration 0001, or creating migration 0002;
- changing any index, application code, script or test;
- closing OD-COLL-01…06 or rewriting any related decision;
- changing **G-1** (FAILED), **G-3** (PASSED), Option C (approved, controlled workflow only), **B1a**
  (APPROVED, workflow-scoped), **B1b/B1c** (NOT APPROVED), **B2** (WITHHELD), migration 0001 (NOT AUTHORIZED for
  production), **G-2** (DEFERRED), **T1** (CLOSED), **R2** (PARTIALLY RESOLVED);
- creating a PR, merging, deploying, committing or pushing.

---

## 15. Evidence references

### 15.1 Committed artifacts read

| Artifact | What was taken from it |
|---|---|
| `docs/database/g1-spike/option-c/g3-full/collation-probe.sh` | the whole implementation: `IDENTITY_SQL` `:119`, `PROFILE_SQL` `:121–147`, `FINGERPRINT_SQL` `:149–164`, `INDEXES_SQL` `:169–221`, escaping `:230–248`, `emit_notice` `:250–264`, `write_summary` `:280–295`, steps 1–8 `:320–463`; the `'d'` divergence; the absence of delimiter validation and of comparison logic |
| `.github/workflows/phase04a-g3-full-schema-gate.yml` | probe step `:242–250` (targets `g3f_main:5432`, `g3f_replay:5434`; runs only if the gate succeeded), artifact upload `:252–259`, services `:73–112`, job env `:114–116` |
| `.gitignore` | `:52–53` — the probe's output directory is not tracked |
| `docs/database/phase-04a-database-collation-product-and-environment-decision.md` | §8.1 (per-field availability and NULLability), §8.2 (what to add/exclude), §8.3 (canonical form and the `sha256:` idea), §8.4 (change → failure table), §8.5 (what it does not cover), §8.7/§8.7.1 (measured CI profile; libc `datcollversion` correction), §9 (drift policy), §11.3 (structural-correct-but-environmentally-non-compliant proof), §12 (register rows OD-COLL-01…06), §12.1 ("OPEN" means no file may change) |
| `docs/database/phase-04a-ci-collation-profile-measurement-proposal.md` | §5.1–§5.3 (database identity, what must not be measured), §6.2–§6.4 (the query and `to_jsonb` technique), §8.1–§8.6 (field evaluation, comparison policy proposal, corrections C1–C3), §9.3–§9.5 (index metadata output and its separation), §12.1–§12.3 (expected output, failure behaviour, where evidence lands) |
| `docs/database/phase-04a-index-collation-r2-investigation.md` | §12.1 (the four expectation kinds; `none` × 8, `database_default` × 3, 11 keys), §12.2 (resolution pseudocode, no implementation) |
| `docs/database/phase-04a-index-integrity-guard-design.md` | §3.4 (per-key opclass/collation table), §6 (structural comparison decision rule), §10/§10.1 (version considerations; symbolic expectation vs literal `default`) |
| `docs/database/phase-04a-od-coll-03-production-collation-profile-decision-brief.md` | §3 (CI evidence), §6.3 (fingerprint is identity plus change detection, not equivalence), §11 (dependency states) |
| `docs/database/phase-04a-od-coll-01-02-uniqueness-semantics-decision-brief.md` | §4 (the six semantic concepts and the local `C.utf8` probe matrix), §7.2 (the disposable environment's label) |

### 15.2 Executed evidence

| Item | Value |
|---|---|
| CI run / check run / commit | `45546248909` / `138976563830` / `0aae1368a16cf6447cb7a01afc7554a9fdab4bc0` |
| Probe provenance | `e4fa80d` (probe added), `0aae136` (annotations added) |
| Annotation re-read | this session, read-only `GET` on the check-run annotations; both `notice` messages reproduced verbatim in §4 |
| Local `lower()` observations cited | Session 23, disposable PostgreSQL 16.2, `C.utf8`, destroyed after use — `OBSERVED`, **not** CI and **not** production |

### 15.3 Not consulted

No production or staging system, credential, catalog, backup or log was read. No database was created,
started or queried in this session. The CI artifact archive and job log remain unreachable from this
environment; the annotations were used instead, as in Session 18.

---

## 16. Revision history

| Revision | Date | Change |
|---|---|---|
| 1 | 2026-11-24 | Initial OD-COLL-04 decision brief. Audits the 468-line `collation-probe.sh` line by line: its eight per-target steps, the eight-segment fingerprint, the two companion documents, and the eight divergences from the Session 16 proposal (two stricter, one changed form, two looser, three unimplemented). Re-verifies the CI fingerprint and both `notice` annotations against the check-run API. Evaluates the four-layer architecture, specifies 14 Layer A fields and 11 Layer B/C fields with source, applicability, canonical form, NULL handling, version sensitivity and failure behaviour, and separates environment identity from structural semantics and behavioural validation. Evaluates the canonical form (ordering, escaping, NULL/empty/absent, numeric formatting, locale and provider normalisation, determinism, hashing) and proposes canonical JSON as the machine artefact with the text line retained as diagnostics. Defines 13 comparison classifications without adopting a response policy. Maps OD-COLL-01/02/03/05/06 boundaries and records OD-COLL-04 as `OPEN — FINGERPRINT SPECIFICATION NOT APPROVED`. **No script, workflow, guard, schema, migration, application file or test modified; no database operation; nothing committed or pushed.** |

**Standing decisions preserved exactly, unchanged by this document:** G-1 **FAILED** · G-3 **PASSED** ·
Option C **APPROVED — controlled migration workflow only** · B1a **APPROVED (workflow-scoped)** · B1b **NOT
APPROVED** · B1c **NOT APPROVED** · B2 **WITHHELD** · migration 0001 **NOT AUTHORIZED for production
deployment** · migration 0002 **DO NOT COMMIT** · G-2 **DEFERRED** · **T1 CLOSED** · **R2 PARTIALLY RESOLVED** ·
OD-COLL-01…06 **OPEN** · OD-17 **OPEN** · OD-21 **OPEN** · OD-NM-1 **OPEN**. CI profile **OBSERVED**;
production profile **UNKNOWN**; production locale **NOT DECIDED**; CI↔production equivalence **NOT
ESTABLISHED**.

**One open decision, framed and unowned. The fingerprint exists as a measurement, not as an approved
specification; nothing here is approved.**
