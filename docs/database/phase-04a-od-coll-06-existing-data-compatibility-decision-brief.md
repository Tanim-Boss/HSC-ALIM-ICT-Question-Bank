# Phase 04A — OD-COLL-06: Existing Data Compatibility and Collision Validation — Owner Decision Brief

**Date:** 2026-11-24
**Repository:** `Tanim-Boss/HSC-ALIM-ICT-Question-Bank`
**Branch:** `arena/49496cf8-hsc-alim-ict-question-bank`
**HEAD when written:** `4d04e4461338ea5931d26faf67d312fbed21de43`
**Subject:** **OD-COLL-06** — what evidence and validation must exist before a production collation profile is
approved or collation-sensitive uniqueness semantics are changed?
**Nature:** documentation only. No audit script, no collision query, no SQL was written, executed or committed;
no database was created, started, queried or modified; no record was merged, renamed, deleted or repointed.

Labels used throughout: `VERIFIED` (read from a committed artifact or an already-recorded run) · `OBSERVED`
(measured earlier in a disposable environment, cited as recorded — **local, not CI, not production**) ·
`DERIVED` · `PROPOSED` · `UNKNOWN` · `NOT TESTED` · `OPEN`.

**Standing statement:** OD-COLL-06 defines *what must be known before anything changes*. It selects no
semantics, no locale, no index, and authorises no remediation, index creation, migration or deployment.

---

## 1. Executive verdict

### **OD-COLL-06 DECISION BRIEF PREPARED — EXISTING DATA COMPATIBILITY VALIDATION REQUIREMENTS REMAIN OPEN**

Six findings structure the brief:

1. **No existing-data validation capability exists.** A repository-wide search for duplicate detection,
   collision grouping or candidate-key comparison returns **nothing executable**: no script, no query, no test
   fixture, no CI step. The only occurrences of the word "collision" are prose in design documents and one
   test assertion about the error registry (`…/v45/publish-gate-verify.sh:233`). `VERIFIED` (§3.5)
2. **The audit scope is two indexes, not six.** Only `uq_tags_name_lower` and `uq_colleges_name_lower` have
   uniqueness semantics that depend on collation. Three of the remaining four are keyed on `uuid`/`enum`/
   `int4` and cannot be affected by a collation profile at all; the sixth (`ix_question_assets_checksum`) bears
   a text key but is **not unique**, so it has no uniqueness semantics to validate. (§4)
3. **The direction of risk is asymmetric.** A *broader* fold creates new collisions that block index creation —
   fail-closed and visible. A *narrower* fold creates no collisions and **silently weakens** the guarantee;
   validating it means proving an absence, not finding rows. (§5.3)
4. **The local `C.utf8` probe matrix is a warning, not evidence about production.** It shows that `ẞ`/`ss`,
   `ς`/`σ`, NFC/NFD variants and trailing-space variants are *distinct today* — meaning a candidate fold that
   equates them would merge rows that currently coexist. It says nothing about `en_US.utf8` (never compared)
   or production (`UNKNOWN`). (§6)
5. **Remediation is where data can be destroyed, and the hazards are measured.** A naive tag merge hits
   `question_tags_pkey`; deleting a used tag **cascades away its question links**; repointing a source onto a
   survivor violates `uq_question_sources_identity`. No remediation is authorised, and none may be automatic.
   (§10)
6. **A successful audit is not permission to build anything.** Index creation has eleven separate gates, of
   which the audit is one; and an audit is only valid for the exact snapshot it read, so a final consistency
   check is required immediately before any index build. (§11)

**Status of the decision: `OD-COLL-06 OPEN — EXISTING DATA COMPATIBILITY VALIDATION REQUIREMENTS NOT
APPROVED.`** (§14)

---

## 2. Decision scope

### 2.1 What the register asks

`docs/database/phase-04a-database-collation-product-and-environment-decision.md` **§12**:

> **OD-COLL-06** | What existing-data validation is mandatory before any uniqueness change? | none (rely on
> the new index to fail on duplicates) · read-only report first · report + owner-reviewed remediation plan ·
> report + remediation + concurrent index build | §10; measured that `normalize()`/`length()` exist so the
> report is implementable; merge hazards in `question_tags` (PK collision, cascade) and `question_sources`
> (`NULLS NOT DISTINCT` duplicates) | **Recommended for consideration:** report first, always read-only;
> remediation only as a separate approved step; never automatic merge (§10.6) | **OPEN** | …

§10.1 states the rule the register is built on: *no uniqueness semantics may change until a validation report
has been produced from a read-only snapshot of the target database and reviewed by the owner.*

### 2.2 The six stages that must never collapse into one

| Stage | Produces | Authorised by | State today |
|---|---|---|---|
| 1 · **read-only measurement and collision reporting** | the audit report | an explicit, scoped read authorisation | **does not exist** |
| 2 · **owner review of findings** | a decision per collision group | the owner | not started |
| 3 · **approval of a remediation plan** | a named, reviewed plan | the owner | not started |
| 4 · **actual data remediation** | changed rows, with evidence | owner + operator, separately | **not authorised** |
| 5 · **creation or replacement of indexes** | the durable rule | owner + reviewer, separately | **not authorised** |
| 6 · **production deployment authorisation** | production | **B2**, with **B1b** | **WITHHELD / NOT APPROVED** |

Each stage is separately authorised. Stage 1 authorises nothing beyond reading; stage 3 authorises no
execution; stage 5 authorises no deployment.

### 2.3 What this document is not

- Not a locale choice (OD-COLL-03), not a fingerprint (OD-COLL-04), not a drift policy (OD-COLL-05).
- Not a decision on tag or college identity (OD-COLL-01/02) — those remain independent.
- Not an audit, an audit script, or a remediation plan.
- Not an authorisation for migration 0001, 0002, B1b, B1c or B2.

---

## 3. Existing evidence baseline

### 3.1 The two collation-sensitive uniqueness rules

| Property | `uq_tags_name_lower` | `uq_colleges_name_lower` | Source |
|---|---|---|---|
| Table / column | `tags.name TEXT NOT NULL` | `colleges.name TEXT NOT NULL` | migration `:214–221`, `:247–256` |
| Expression | `lower(name)` | `lower(name)` | migration `:640–641` |
| Collation | database default (OID 100), inherited | same | `OBSERVED` (catalog) |
| Other unique rules | `uq_tags_slug` (plain, format-checked) | **none** — this is the entity's only rule | migration `:366`; catalog |
| Secondary identity candidate | `slug` exists and is unique | `code TEXT NULL` — **nullable, non-unique, unread by any code** | `OBSERVED` (E10/E13, Session 23) |
| Prisma declaration | **none** — the hand-written indexes appear in `schema.prisma` only as comments (`:26–30`, and per-model notes); `ix_question_assets_checksum` is not mentioned at all | **none** | `VERIFIED` |
| References | `question_tags(question_id, tag_id)`, PK `(question_id, tag_id)`, both FKs `ON DELETE CASCADE` | `question_sources.college_id`, `ON DELETE RESTRICT` | migration `:229`, `:447`, `:456` |

**No application write path exists for either table** (`VERIFIED`: re-checked this session — no
`prisma.tag.*`, `prisma.college.*`, `prisma.questionTag.*` or `prisma.questionSource.*` call exists in
`app/`, `server/`, `lib/`, `components/` or `scripts/`; `app/` holds only `layout.tsx`, `page.tsx`, styles,
an icon and `.gitkeep` placeholders in `(admin)`, `(student)` and `api` — no route handlers; no slug
generator exists). No business intent for tag or
college identity is recorded anywhere; this brief invents none.

### 3.2 The local `C.utf8` probe matrix — and what it may not be used to claim

Disposable PostgreSQL **16.2**, UTF8, `C.utf8`/`C.utf8`, `libc`, `datcollversion` NULL, real migration applied,
destroyed after use (`OBSERVED`, Session 23):

| Probe | Result | Consequence for a candidate policy |
|---|---|---|
| `Logic Gate` / `logic gate` | rejected | ASCII case is already folded |
| `Ärger` / `ärger` | rejected | accented Latin case folds **on a UTF-8 locale** |
| `ẞ` / `ß` | rejected | `lower('ẞ') = 'ß'` |
| `ẞ` / `ss` | **accepted** | a full-folding candidate would merge rows that coexist today |
| `İstanbul` / `istanbul` | rejected | `lower('İ') = 'i'` on this build |
| `K` (U+212A) / `k` | rejected | Kelvin sign folds here |
| `ς` / `σ` | **accepted** | final sigma is not folded |
| NFC `é` / NFD `e`+U+0301 | **accepted** | a normalisation candidate would merge them |
| `Dhaka College`, then the same name with one trailing space | **accepted** | a trimming candidate would merge them |
| duplicate / NULL `colleges.code` | **accepted** | `code` is not an identity key |

**Boundaries that must travel with every use of this table:** it is a **local `C.utf8`** observation set; it is
**not** CI behaviour (`en_US.utf8` was never compared against `C.utf8` in this repository) and **not**
production behaviour (`UNKNOWN`); the folding of `ς/σ` and `ẞ/ss` was not measured anywhere else; ICU is
`NOT TESTED`.

### 3.3 CI environment

PostgreSQL `16.16` (`16.16-1.pgdg13+1`, Debian 13/trixie), UTF8, `libc`, `en_US.utf8`/`en_US.utf8`,
`daticulocale` NULL, `datcollversion = 2.41`; `g3f_main` and `g3f_replay` fingerprints byte-identical (run
`45546248909`, check run `138976563830`, commit `0aae1368a16cf6447cb7a01afc7554a9fdab4bc0`).

**CI for the relevant uniqueness rules:** the enforcement cases are ASCII-only (`enforce.sql:632–645`), so
`G-3 PASSED` establishes nothing about `Ä/ä`, `ẞ/ß`, `İ/i`, NFC/NFD or whitespace. Production's major,
provider, locale and collation version remain `UNKNOWN`.

### 3.4 The six-index inventory, classified by collation dependence

| # | Index | Keys | Unique | Collation dependence |
|---|---|---|---|---|
| 1 | `uq_question_versions_one_published_per_question` | `(question_id)` WHERE `status='PUBLISHED'` | yes | **none** — `uuid` + `enum` keys, not collatable (`indcollation = 0`) |
| 2 | `uq_question_sources_identity` | `(question_id, source_type, board_id, college_id, academic_year_id)` `NULLS NOT DISTINCT` | yes | **none** — `uuid`/`enum` only; its semantics are **NULL** semantics, not collation |
| 3 | `uq_topics_chapter_order` | `(chapter_id, order_index)` WHERE `is_active` | yes | **none** — `uuid` + `int4` |
| 4 | `uq_tags_name_lower` | `lower(name)` | yes | **full** — the guarantee *is* the collation |
| 5 | `uq_colleges_name_lower` | `lower(name)` | yes | **full** |
| 6 | `ix_question_assets_checksum` | `(checksum)` WHERE `checksum IS NOT NULL` | **no** | **bears a collatable key, but has no uniqueness semantics** |

`VERIFIED` from migration PART C (`:613–648`) and the catalog. **A collation-profile change cannot alter the
uniqueness behaviour of indices 1–3, and index 6 enforces no uniqueness at all** — so a Unicode collision scan
is required for exactly two indexes, and requiring it for all six would be busywork that implies a risk which
does not exist (§4.3).

### 3.5 What validation capability exists today: none

`VERIFIED` by repository-wide search:

| Searched for | Found |
|---|---|
| a script performing duplicate detection (`GROUP BY … HAVING count(*) > 1`, `DISTINCT lower(...)`) | **nothing** |
| a candidate-key comparison query | **nothing** |
| an audit-report schema, a collision artefact, an audit ID | **nothing** |
| a CI step that reads data rather than schema | **nothing** — every CI check is catalog- or fixture-based |
| an existing snapshot facility | only the **V-3 backup/restore drill** (`pg_dump --format=custom` + `pg_restore`, `prod-ready/v3/backup-restore-drill.sh`, 316 lines) — a *drill on disposable databases*, never run against a real corpus |
| a read-only database role for auditing | **not documented** (`UNKNOWN`) |
| a masking/redaction convention for data artefacts | **not documented** (`UNKNOWN`) |
| a retention policy for audit artefacts | governed by **OD-20** (privacy, data classification, retention, audit access) — `OPEN`, not this decision |

The `PROPOSED` queries in decision doc §10.2–§10.4 have never been executed against real data, and no
implementation of them exists.

### 3.6 Decision boundaries preserved

| Decision | Status |
|---|---|
| G-1 | **FAILED** |
| G-3 | **PASSED** (ASCII-only enforcement) |
| Option C | **APPROVED — controlled migration workflow only** |
| B1a | **APPROVED, workflow-scoped** |
| B1b | **NOT APPROVED** |
| B1c | **NOT APPROVED** |
| B2 | **WITHHELD** |
| Migration 0001 | **NOT AUTHORIZED for production** |
| Migration 0002 | **DO NOT COMMIT** |
| T1 | **CLOSED** |
| R2 | **PARTIALLY RESOLVED** |
| OD-COLL-01…06 | **OPEN** |

**Approve OD-COLL-06 and none of these change** — in particular it implies no production locale, no index
change, no migration approval, no deployment.

---

## 4. Six-index validation matrix

### 4.1 Structure and validation requirement

| Index | Table | Key(s) / expression | Unique | Predicate | NULL semantics | Collation dependency | Collision analysis applicable? | Required evidence | Status |
|---|---|---|---|---|---|---|---|---|---|
| `uq_question_versions_one_published_per_question` | `question_versions` | `question_id` | yes | `status = 'PUBLISHED'` | default | **none** | **structurally relevant, not collation-relevant**: a hit would mean the index is absent/invalid | index present & valid; zero questions with two PUBLISHED rows | no audit exists |
| `uq_question_sources_identity` | `question_sources` | `question_id`, `source_type`, `board_id`, `college_id`, `academic_year_id` | yes | none | **`NULLS NOT DISTINCT`** | **none** | **structurally relevant**: NND duplicates would block any rebuild | index present with NND; zero duplicate 5-tuples under NND | no audit exists |
| `uq_topics_chapter_order` | `topics` | `chapter_id`, `order_index` | yes | `is_active` | default | **none** | **structurally relevant**: two active topics sharing a position | index present; zero duplicate active pairs | no audit exists |
| `uq_tags_name_lower` | `tags` | `lower(name)` | yes | none | `name NOT NULL` | **full** | **applicable — the primary case** | duplicates under current key; collisions under each candidate key; per-group review | no audit exists |
| `uq_colleges_name_lower` | `colleges` | `lower(name)` | yes | none | `name NOT NULL` | **full** | **applicable — the primary case, higher stakes** | as above, plus source-reference counts per group | no audit exists |
| `ix_question_assets_checksum` | `question_assets` | `checksum` | **no** | `checksum IS NOT NULL` | n/a | bears a collatable key | **not applicable** — a non-unique index permits duplicates by design; it enforces no uniqueness to violate | index present; **no collision analysis** | no audit exists |

### 4.2 The two candidate-sensitive indexes, in detail

| Question | `uq_tags_name_lower` | `uq_colleges_name_lower` |
|---|---|---|
| Current indexed expression | `lower(name)` under the database default | same |
| Plausible candidate expressions (from OD-COLL-01/02 options) | `name`; `lower(name) COLLATE "C"`; `normalize(lower(name), NFC)`; an explicit full fold | same |
| Current collation | database default (OID 100) — meaning is the environment's | same |
| Operator class | `text_ops` | `text_ops` |
| NULL semantics | `name NOT NULL`, so no NULL key possible | same |
| Predicate | none | none |
| Could a candidate merge values distinct today? | **yes** — every broader fold | **yes**, and each merge repoints provenance |
| Would existing values violate the candidate? | determinable only by running the audit — **`NOT TESTED`** | same |
| Second key that could absorb identity | `slug` exists and is unique | **none**; `code` is nullable and non-unique |

### 4.3 Why the other four are not "audited the same way"

| Index | Why a Unicode scan is wrong here | What *is* worth checking |
|---|---|---|
| 1 | keys are `uuid`/`enum`; not collatable | that no question has two PUBLISHED versions (would mean a missing/invalid index) |
| 2 | keys are `uuid`/`enum`; the rule is about NULL equality | that no 5-tuple duplicates under `NULLS NOT DISTINCT` |
| 3 | keys are `uuid`/`int4` | that no two active topics share `(chapter_id, order_index)` |
| 6 | **non-unique**; duplicates are allowed | nothing about uniqueness; at most a diagnostic on duplicate checksums, which is explicitly not a rule violation |

Running a case-insensitive collision scan over rows whose keys cannot be collated produces zero rows and a
false sense of coverage. **The audit must be scoped by semantic dependence, not by inventory size.**

---

## 5. Candidate-semantics collision model

### 5.1 Current state versus candidate state, per table

| Aspect | Current (both text tables) | Candidate (chosen by OD-COLL-01/02) |
|---|---|---|
| Key expression | `lower(name)` | `name`, or a different fold, or a normalised pair `(normalize(...), fold(...))`, or a different key entirely |
| Equality source | the database's ctype | explicit (pinned fold) or another, credential-free specification |
| Collation | database default | pinned, possibly an explicit collation object |
| Row universe | every existing row | **the same rows must satisfy the candidate** |

### 5.2 The pair-wise detection shape

The decisive query is not "are there duplicates today" (the current index makes that impossible) but "which
rows are **distinct under the key in force** yet **equal under the candidate key**":

```text
rows a, b  where a.id < b.id
           and <current_key>(a.name) <> <current_key>(b.name)     -- distinct today
           and <candidate_key>(a.name)  = <candidate_key>(b.name)  -- would collide
```

`PROPOSED` (decision doc §10.4); never executed against real data (`NOT TESTED`). The `<candidate_key>` is
undefined until OD-COLL-01/02 choose it — **that is the dependency, not a technical detail**.

### 5.3 Direction of risk

| Direction | Example | New collisions? | Validation required | Failure mode |
|---|---|---|---|---|
| **broader fold** | `C` → `C.utf8`; `lower()` → full fold; add NFC | **yes** | detect them; block index creation until resolved | visible and fail-closed |
| **same** | keep `lower()` and the same locale | none | none | none |
| **narrower fold** | `C.utf8` → `C`; drop normalisation | none | **prove the absence of a weakening** | **silent** — the E8 failure mode |

**A collision report cannot certify a narrower policy.** There will be no colliding rows to review; the
evidence that matters is that some pairs *stop* colliding. The audit specification therefore must include a
"newly distinct" counterfactual (pairs equal today, unequal under the candidate), or the narrowing is accepted
on the record rather than on evidence.

### 5.4 What a collision is, and is not

- A collision is **a question for a human**: are these two rows one entity or two? (§9)
- It is **not** an instruction to merge, and no merge is authorised anywhere in this document.
- Zero collisions under a candidate is **not** proof that the candidate is correct — it is proof that this
  snapshot can satisfy it.

---

## 6. Unicode and normalization coverage

### 6.1 The distinctions that must not be collapsed

| Concept | What it does | Who implements it | Distinct because |
|---|---|---|---|
| **case conversion** | maps a code point to upper/lower/title | `lower()`, using the OS ctype tables | it is per-code-point and version-dependent |
| **case folding** | maps strings to a case-insensitive comparison form | not performed by this system anywhere | it is *not* `lower()` — `ẞ→ss`, `ς→σ` |
| **Unicode normalization** | composes or decomposes sequences | `normalize()` (present, unused by any index) | NFC/NFD are equal as sequences, not as bytes |
| **collation equality** | decides `=`/ordering under a locale | the collation implementation (libc/ICU) | two equal strings can compare unequal across locales |
| **application canonicalization** | the app rewrites a value before storing | not implemented — no tag/college write path exists | it would be the only place a *store-time* rule could live |

**None of these is a substitute for another.** A policy that says "case-insensitive" without saying *which*
of the five it means is not implementable.

### 6.2 Required coverage for the audit, and what is known about each

| Item | Meaning for this data | Known behaviour | Label |
|---|---|---|---|
| ASCII case variants | `Logic Gate`/`logic gate` | folded by the current rule under every measured locale | `OBSERVED` (local), `VERIFIED` (CI ASCII case) |
| Non-ASCII case variants | `Ärger`/`ärger` | folded under `C.utf8`; **not** under `C` | `OBSERVED` (local) |
| German sharp S | `ẞ`/`ß` folded; `ẞ`/`ss` **not** folded | locale-dependent for the first, absent for the second | `OBSERVED` (local) |
| Greek sigma | `ς`/`σ` **not** folded | no full folding exists | `OBSERVED` (local) |
| Turkish dotted/dotless I | `İ`/`i` folded on this build; `I`/`ı` not probed | partially known | `OBSERVED` / `NOT TESTED` |
| Compatibility characters | `ﬁ`/`fi`, full-width forms | not folded (no normalisation in force) | `VERIFIED` (no normalisation) / `NOT TESTED` for specific pairs |
| NFC/NFD | `é` vs `e`+U+0301 | **distinct rows** today | `OBSERVED` (local) |
| Leading/trailing whitespace | a name with one trailing space vs the same name without | **distinct rows** today | `OBSERVED` (local) |
| Combining marks | decomposed accents | distinct unless NFC applied | `DERIVED` |
| Locale-sensitive lowercasing | where `lower()` differs by ctype | proven for `Ä`, `ẞ`, `İ`, `K` (`C` vs `C.utf8`) | `OBSERVED` (local); `en_US.utf8` **`NOT TESTED`** |
| Case folding vs `lower()` | the two are different operations | demonstrated (`ẞ/ss`, `ς/σ`) | `OBSERVED` (local) |
| Collation-specific equality | equality under the index's collation | only `C` vs `C.utf8` measured; never `en_US.utf8` | `NOT TESTED` (CI), `UNKNOWN` (production) |

### 6.3 Limitations that must be printed on any report

| Limitation | Consequence |
|---|---|
| No `en_US.utf8` measurement in this repository | a report produced on `C.utf8` says nothing about CI or a `en_US.utf8` production |
| No ICU | an ICU-based candidate cannot be validated here at all |
| No PostgreSQL 15/17/18 | catalog and folding behaviour on those majors is `NOT TESTED` |
| No production data | every count in any future report is about *that* database, not about the product |
| Full folding never implemented | any "case-insensitive" claim beyond `lower()` is an aspiration, not a behaviour |

---

## 7. Read-only audit specification

### 7.1 The ten steps

| # | Step | Output | Prohibitions |
|---|---|---|---|
| 1 | **target verification** | database name, cluster identifier if available, environment marker | refuse `postgres`/`template0`/`template1`; refuse an unverified identity |
| 2 | **snapshot or consistency requirement** | the isolation level and the snapshot's validity window | no long transaction left open; no writes |
| 3 | **table and row-count inventory** | per-table `count(*)`, NULL counts for key columns | `SELECT` only |
| 4 | **existing duplicate detection** | duplicates under the **current** key | a hit here is an integrity finding, not a policy finding |
| 5 | **candidate-semantics grouping** | the pair-wise "distinct now, equal later" set (§5.2), plus the reverse set for a narrowing | the candidate key must be supplied by an approved decision |
| 6 | **collision identification** | groups with row identifiers | identifiers are references, not contents |
| 7 | **collision evidence capture** | the report artefact (§7.2) | no credentials; no unrestricted value dump |
| 8 | **reconciliation report** | counts, groups, unresolved items, limitations | must state what it did **not** check |
| 9 | **independent review** | a reviewer's sign-off or rejection | the author of the audit is not the reviewer |
| 10 | **final approval record** | the decision, its scope, its expiry | approval is per-snapshot, never perpetual |

### 7.2 Report fields

| Field | Content | Sensitivity |
|---|---|---|
| `audit_id` | unique identifier of this run | none |
| `database_identity` | name, and cluster identity if available | low |
| `environment` | CI / staging / production marker | low |
| `pg_version` | full server version string | none |
| `collation_profile` | provider, `datcollate`, `datctype`, `daticulocale`, `datcollversion` | none |
| `table` / `index` | the object audited | none |
| `candidate_expression` | the key expression under test (verbatim) | none |
| `collision_group_id` | stable group identifier | none |
| `affected_row_count` | number of rows in the group | low |
| `row_identifiers` | `id` values (uuids) | low — opaque and non-content |
| `original_values` | the names in the group | **content** — see §12 |
| `candidate_comparison` | the result of the candidate comparison per pair | none |
| `validated_at` | timestamp (UTC) | none |
| `audit_implementation` | script name + version/commit that produced it | none |
| `limitations` | what was **not** tested (locale, encoding, ICU, volumes) | none |
| `untested_cases` | explicitly enumerated | none |
| `snapshot_reference` | isolation level, transaction start, row-count-at-start | none |

**Never** in a report: connection strings, usernames, passwords, host names, tokens, or any credential.

### 7.3 Where the values live

| Option | Fits | Cost |
|---|---|---|
| **Full values in a restricted artefact** | the reviewer must see the actual names to judge "same entity?" | access control required; retention policy required (OD-20) |
| **Masked values** (`D***a College`) | sharing beyond the reviewer | judgement becomes harder; false merges are likelier |
| **Hashed values** (`sha256(name)`) | deduplication proof without content | **cannot be reviewed for meaning** — a hash cannot answer "is this the same college?" |
| **Identifiers only** | minimal disclosure | the reviewer must query the database again, which needs a second authorisation |
| **Values in a CI log** | **never** — CI logs are widely readable and persist | not acceptable |

`PROPOSED`: full values in a **restricted** artefact, identifiers in the general report, nothing in CI logs —
and the retention/access policy is **OD-20's** decision, not this one's.

---

## 8. Snapshot consistency and concurrency

### 8.1 The ten questions

| # | Question | Answer | Basis |
|---|---|---|---|
| 1 | Can rows change during the audit? | **yes**, unless writes are blocked or a snapshot is taken | `DERIVED` |
| 2 | Which isolation level? | a single transaction at `REPEATABLE READ` (or `SERIALIZABLE`) gives one consistent snapshot | `DERIVED` — standard behaviour, `NOT TESTED` here |
| 3 | Is a long-running read transaction safe? | it holds back vacuum; on a large corpus it is a real operational cost | `DERIVED`; volume unknown |
| 4 | Can the table change between audit and index creation? | **yes — this is the TOCTOU window** | `DERIVED` |
| 5 | Must writes be paused? | **not prescribable here** — a production write pause is an operational decision requiring owner authorisation and a service impact assessment | `OPEN`, owner decision |
| 6 | Is a final revalidation required immediately before index creation? | **yes** — a cheap re-run of steps 4–6 in the same transaction that precedes the build | `PROPOSED` |
| 7 | Must the audit run against the exact intended target? | **yes** — a report from another database is evidence about that database | `DERIVED` from OD-COLL-05's identity rule |
| 8 | Can the audit prove future compatibility? | **no** — only about the snapshot | `DERIVED` |
| 9 | What happens if the snapshot is older than the index build? | the build may fail (fail-closed) or, for a narrowing, silently weaken | §5.3 |
| 10 | Does `CREATE UNIQUE INDEX CONCURRENTLY` avoid the need for consistency? | **no** — it avoids blocking writers, not the duplicate condition | `DERIVED` |

### 8.2 What the audit can and cannot guarantee

| Can | Cannot |
|---|---|
| that *this snapshot* has no collisions under the candidate key | that no collision will appear later |
| that a remediation plan was executed to completion *at that time* | that no later write reintroduces a collision |
| that the index definition at audit time matched the expectation | that the index was created exactly as audited |
| that the environment was the one measured | that the environment stayed the same |

**Time-of-check / time-of-use is structural, not a bug in the tool.** The only defences are a final
revalidation, a fail-closed index build (which PostgreSQL provides by refusing duplicates), and the drift
policy (OD-COLL-05) noticing environment changes afterwards.

### 8.3 Write-pause: explicitly not prescribed

A production write pause is a service-impacting operation. This document does **not** prescribe one; it lists
it as an option with the owner decision attached (§14 Q4). The alternatives are: a snapshot from a replica
(`UNKNOWN` whether one exists), a brief pause, or accepting the TOCTOU window with a final revalidation.

---

## 9. Collision classification and acceptance criteria

| Classification | Meaning | Evidence | Severity | Owner review? | Index creation allowed? | Remediation required? | Another audit? |
|---|---|---|---|---|---|---|---|
| `NO_COLLISIONS_FOUND` | no group under the candidate key, within the audited scope | the report, with limitations stated | informational | yes (to accept the scope) | only after the other gates (§11) | no | no, until data changes |
| `EXISTING_DUPLICATES_UNDER_CURRENT_RULE` | the current index's invariant is already violated | duplicate groups under the current key | **block** — integrity finding | yes | **no** | yes, and the cause is a defect | yes, after remediation |
| `NEW_COLLISIONS_UNDER_CANDIDATE_RULE` | rows distinct today would collide | the pair-wise set (§5.2) | **block** | yes | **no** | yes — per group, human-decided | yes |
| `NULL_SEMANTICS_CHANGE` | the candidate changes how NULLs participate | NND/NULL counts and pair analysis | **block** | yes | no | depends | yes |
| `NORMALIZATION_DIFFERENCE` | NFC/NFD variants exist as separate rows | `name <> normalize(name, NFC)` | review | yes | only if the candidate does not normalise | not necessarily | yes if the candidate normalises |
| `BEHAVIORAL_RESULT_UNKNOWN` | the folding/equality of some pairs could not be established | the list of unmeasured pairs | review | yes | no | no | yes, on an environment where it can be measured |
| `AUDIT_INCOMPLETE` | the audit did not cover the agreed scope | scope vs coverage table | **block** | yes | no | no | yes |
| `TARGET_IDENTITY_UNVERIFIED` | the audited database is not provably the target | identity evidence | **block** — invalidates everything | yes | no | no | yes |
| `INDEX_DEFINITION_MISMATCH` | the live index is not the committed definition | catalog vs migration | **block** | yes | no | depends | yes |
| `DATA_CHANGED_AFTER_AUDIT` | row counts/hashes differ from the audited snapshot | the final consistency check | **block** | yes | no | no | **yes** |

Two rules:

1. **Zero observed collisions is not complete semantic compatibility.** It is the absence of a finding **in one
   snapshot, under one candidate key, in one environment, with stated limits.**
2. **Every classification above can block; only `NO_COLLISIONS_FOUND` and `NORMALIZATION_DIFFERENCE` (under a
   non-normalising candidate) can lead anywhere without another audit.**

---

## 10. Remediation boundaries

### 10.1 The operations, and what each can break

| Operation | Referential integrity | PK / unique conflicts | Cascades | Attribution / history | Reversible? | User-visible | Approvals |
|---|---|---|---|---|---|---|---|
| **rename a conflicting tag** | none (name is not a key) | none, unless `slug` derived from it collides with `uq_tags_slug` | none | the tag keeps its identity and links | yes (rename back) | yes — labels change everywhere | owner plan + reviewer |
| **merge duplicate tags** | `question_tags` rows move | **`question_tags_pkey` can collide** — measured E11 | **deleting the loser cascades its links away** — measured E11c | links survive only if inserted first (`ON CONFLICT DO NOTHING`, E11b); a question carrying both tags loses one association | **not trivially** — the deleted row's id and links are gone | yes | owner plan + reviewer + evidence |
| **reassign `question_tags` relationships** | FK to `tags` and `questions` | PK on `(question_id, tag_id)` | — | changes which questions are tagged | reconstructable only from a backup | yes | owner plan |
| **repoint `question_sources.college_id`** | FK `ON DELETE RESTRICT` | **`uq_question_sources_identity` can reject** — measured E12b | none | **changes provenance** — a question's source becomes another institution | yes, if the previous value was recorded | yes | owner plan + evidence |
| **rename a conflicting college** | none | none (name is the rule) | none | sources unchanged | yes | yes | owner plan |
| **change a candidate canonical value** | none directly | may create a *new* collision | none | changes display text | yes | yes | owner plan |
| **retain distinct values under a different policy** | none | none | none | none | n/a | none | **an OD-COLL-01/02 decision**, not remediation |
| **introduce a different identity key** | new column + backfill | new unique rule; `code` is **nullable and non-unique** today | — | identity becomes stable across renames | a schema change, not data cleanup | yes | OD-COLL-01/02 + a migration decision |

### 10.2 The measured hazards

| Hazard | Evidence | What it means for a plan |
|---|---|---|
| naive tag merge → `question_tags_pkey` violation | E11 | the plan must insert-if-absent before deleting |
| deleting a used tag → cascade removes links silently | E11c | "just delete the duplicate" **destroys data without error** |
| safe merge shape (insert `ON CONFLICT DO NOTHING`, then delete) | E11b | feasible, but only deliberately |
| repointing a source onto a survivor → `uq_question_sources_identity` violation | E12b | the plan must first decide which attributions are duplicates |
| a source cannot carry both board and college | `ck_question_sources_board_or_college_not_both` (`migration.sql:608–609`) | repointing a board-side source onto a college is not a merge; it is a different attribution |

### 10.3 Prohibitions

- **No automatic merge, ever** (decision doc §10.5, §10.7).
- **No deletion** of a tag or college as a cleanup step.
- **No destructive SQL** is generated, proposed as runnable, or executed here.
- **`colleges.code` is not assumed to be a replacement identity key** — it is nullable, non-unique, unread by
  any code, and its population is `UNKNOWN`.
- Every operation above requires a **named plan**, per-row identifiers, expected end state, and a reviewer.

---

## 11. Revalidation and index creation gates

### 11.1 The eleven gates

| # | Gate | Evidence |
|---|---|---|
| 1 | uniqueness semantics **approved** | OD-COLL-01 / OD-COLL-02 decision |
| 2 | production environment profile **approved** | OD-COLL-03 |
| 3 | fingerprint and drift policy **approved** where applicable | OD-COLL-04, OD-COLL-05 |
| 4 | current-state audit complete (§7.1 steps 1–3) | report §7.2 fields |
| 5 | candidate-semantics collision report complete | the pair-wise set, per table |
| 6 | **zero unresolved collisions**, or a separately approved remediation outcome | the review record |
| 7 | remediation evidence, if any was performed | execution log + post-state |
| 8 | post-remediation audit | a fresh report, not the pre-remediation one |
| 9 | **final consistency check** immediately before the build | row counts + snapshot reference |
| 10 | structural index verification | catalog: definition, keys, opclass, collation, validity |
| 11 | **explicit owner authorisation** for this specific index build | a recorded approval, scoped and dated |

### 11.2 If data changes after the audit

| Change | Consequence |
|---|---|
| new rows only | gate 9 may pass, but gate 5's conclusion is about a stale universe → **re-run the audit** |
| an update to an audited row | the group's decision may no longer apply → **re-run** |
| a delete | a merge decision may now be moot → **re-run** |
| anything after the build starts | PostgreSQL fails closed on duplicates; for a **narrowing** there is no failure at all — the weakening is silent |

### 11.3 What a successful audit is not

> A read-only audit is **not** permission to create an index. It is one input to a decision that also requires
> approved semantics, an approved environment, an approved remediation outcome, a final consistency check, and
> an explicit authorisation. `PROPOSED`

---

## 12. Sensitive-data and audit evidence handling

| Question | Position |
|---|---|
| Do the audited values contain personal data? | tag names are curriculum topics; college names are institutions — **low sensitivity by content**, but the *general rule* applies because the corpus is not inspected yet |
| May values appear in CI logs? | **no** — logs are broadly readable and long-lived |
| Where does the report live? | a **restricted** artefact, access-controlled; identifiers may be shared more widely than values |
| Masking vs hashing | masking preserves judgement but distorts it; hashing destroys judgement (a hash cannot answer "same institution?") — prefer **full values in the restricted artefact** |
| Retention | **owner decision** — OD-20 covers retention, data classification and audit access; this document invents no period |
| Credentials | never recorded, never printed, never included (§7.2) |
| Who may read the restricted artefact | `OPEN` — a named reviewer plus the owner is the minimum |

---

## 13. Dependencies on OD-COLL-01 through OD-COLL-05

### 13.1 What can be specified independently, and what cannot

| Requirement | Independent? | Why |
|---|---|---|
| audit exists, is read-only, is separate from remediation | **yes** | a process property |
| identity verification, scope declaration, limitations recorded | **yes** | measurement hygiene |
| report field set (§7.2) and credential prohibition | **yes** | format |
| snapshot/isolation requirements and the TOCTOU rule | **yes** | consistency |
| the ten collision classifications (§9) | **yes** | vocabulary |
| remediation prohibition and hazard list | **yes** | the hazards are structural and already measured |
| gates 4, 9, 10, 11 (§11.1) | **yes** | process |
| **which candidate key to test** | **no — OD-COLL-01/02** | the comparison is undefined without the candidate |
| **which environment to audit** | **no — OD-COLL-03** | the profile decides what `default` means |
| **the audit's environment fields** | **no — OD-COLL-04** | field set and representation |
| **what a profile change after the audit means** | **no — OD-COLL-05** | the drift response |

### 13.2 The five neighbours

| Decision | Owns | Boundary |
|---|---|---|
| **OD-COLL-01** | tag identity | decides the candidate key; this brief decides what must be *proved* about existing rows before it is adopted |
| **OD-COLL-02** | college identity | same, and noisier: colleges have no second key |
| **OD-COLL-03** | production profile | selects the environment the audit must target; **06 audits, 03 selects** |
| **OD-COLL-04** | fingerprint | supplies the environment fields the audit report must record |
| **OD-COLL-05** | drift response | decides what happens if the environment changes between audit and build |

**OD-COLL-06 does not decide any of them**, and OD-COLL-01/02 do not decide the audit's stringency.

---

## 14. Owner decision table

Ten questions; each is a separate owner answer. The overall decision status is the last row.

| ID | Decision question | Evidence | Recommendation, if justified | Unresolved risk | Dependencies | Status |
|---|---|---|---|---|---|---|
| **06-Q1** | What audit scope is mandatory before a profile change or a uniqueness change? | §3.5 (no capability exists); §4 (two of six indexes are collation-sensitive) | scope by **semantic dependence**: the two `lower(name)` indexes for a profile/semantics change; indices 1–3 only as structural re-checks; index 6 not applicable | scope creep in either direction (auditing everything implies risk that does not exist; auditing nothing misses the real one) | OD-COLL-01/02 for the candidates | **`OPEN`** |
| **06-Q2** | Which candidate comparison semantics must the audit implement? | §5; the candidate is undefined | the audit must implement **exactly** the approved expression, verbatim, plus the reverse (newly-distinct) set for narrowing | an audit implementing a *near* candidate produces misleading confidence | OD-COLL-01/02 | **`OPEN`** |
| **06-Q3** | What Unicode test coverage is required? | §6.2 — twelve items, several `NOT TESTED`; local `C.utf8` only | require coverage of the rows present *and* the pairs the candidate would newly equate; record what could not be measured rather than assuming it | an `en_US.utf8` or ICU target cannot be validated from this repository's evidence | OD-COLL-03/04 | **`OPEN`** |
| **06-Q4** | What snapshot-consistency strategy is required, and may writes be paused? | §8 — TOCTOU is structural; no replica is documented | a single-transaction snapshot + final revalidation; a **write pause is not prescribed** and needs its own owner decision | a report that is stale by the time the index is built | ops; OD-20 for artefact handling | **`OPEN`** |
| **06-Q5** | What must the audit report contain, and where does it live? | §7.2, §12 | the 17 fields; restricted artefact; identifiers shareable, values not; nothing in CI logs | an over-broad artefact becomes a data leak; an over-narrow one cannot be reviewed | OD-20 | **`OPEN`** |
| **06-Q6** | How are sensitive values handled (masked, hashed, restricted)? | §7.3, §12 | full values in a restricted artefact; hashing only for dedupe proofs | hashed-only reports make "same institution?" unanswerable | OD-20 | **`OPEN`** |
| **06-Q7** | What is the acceptance criterion for "zero collisions"? | §9.1 rule 1 | zero **unresolved** groups, in a report whose scope, limitations and snapshot are stated; zero observed ≠ compatible | treating absence-of-finding as proof | OD-COLL-01/02/03 | **`OPEN`** |
| **06-Q8** | Who authorises remediation, and in what form? | §10 — measured hazards (E11, E11c, E12b) | a named per-row plan, reviewer + owner, executed and verified separately, never automatic | a merge that cascades or a repoint that violates the attribution rule | OD-COLL-01/02 | **`OPEN`** |
| **06-Q9** | When must revalidation occur relative to index creation? | §11.2 | immediately before the build, in the same transaction window; any post-audit write invalidates the audit | a stale audit passing a narrowing silently | OD-COLL-05 | **`OPEN`** |
| **06-Q10** | What authorises index creation, and does OD-COLL-06 approve it? | §11.1 (eleven gates) | creation needs its own explicit authorisation; **06 approves none of it** | conflating "the data can satisfy it" with "build it now" | B1b/B2 for production | **`OPEN`** |

**Required status of the decision as a whole:**

> **OD-COLL-06 OPEN — EXISTING DATA COMPATIBILITY VALIDATION REQUIREMENTS NOT APPROVED.**

A recommendation in this table is **not** owner approval, and no row above authorises an audit, a query, a
merge, an index or a deployment.

---

## 15. Recommendations and unresolved questions

### 15.1 Recommendations for consideration (`PROPOSED`)

1. **Scope the audit by semantic dependence**, not by inventory size: two indexes matter for collation, three
   for structure, one not at all.
2. **Make the audit report self-limiting** — every report states the environment, the snapshot, and what it did
   not test.
3. **Require the reverse counterfactual** (newly-distinct pairs) whenever a candidate narrows the rule.
4. **Never let the audit and the remediation be the same artefact.**
5. **Require a final revalidation immediately before any build**, and treat a build refusal (duplicates) as the
   system working.
6. **Keep values out of CI logs**, and let OD-20 own retention and access.
7. **Do not treat `colleges.code` as an identity key** unless OD-COLL-02 says so and a uniqueness rule exists.

### 15.2 Unresolved questions beyond the ten above

| # | Question | Who |
|---|---|---|
| U1 | Does a read replica exist that could serve as the snapshot source? | operations (`UNKNOWN`) |
| U2 | Is there a read-only database role, and who grants it? | operations (`UNKNOWN`) |
| U3 | What row volumes must the audit tolerate, and what is an acceptable audit duration? | operations (`UNKNOWN` — no data has ever been measured) |
| U4 | Is a staging environment expected to mirror production for a pre-flight audit, and how is that kept honest? | owner |
| U5 | Who is the independent reviewer of an audit, and how is independence recorded? | owner |
| U6 | Do any tag or college names carry personal data (e.g. an individual's name as a college)? | owner + OD-20 |
| U7 | What is the exact audit implementation, and who reviews its SQL before it runs? | owner (implementation is not authorised here) |

---

## 16. Explicit non-authorizations

This brief authorises **none** of the following:

- writing or running an audit script, or any collision-detection query;
- executing any `SELECT` against a real, staging or production database;
- creating, dropping, restoring or modifying any database, snapshot or dump;
- modifying `guard.py`, `collation-probe.sh`, `deploy-gate.sh`, `deploy-path-guard.py`, `repo-guard.sh`, any
  workflow, `package.json` or any test;
- modifying `prisma/schema.prisma`, migration 0001, or creating migration 0002;
- creating, replacing or dropping any index;
- modifying, merging, deleting, renaming or repointing any row of `tags`, `colleges`, `question_tags`,
  `question_sources` or any other table;
- generating destructive SQL;
- treating `colleges.code` as an identity key;
- selecting a production locale or provider (OD-COLL-03), a fingerprint representation (OD-COLL-04), or a drift
  policy (OD-COLL-05);
- closing OD-COLL-01…06, or changing G-1 (`FAILED`), G-3 (`PASSED`), Option C, B1a, B1b (`NOT APPROVED`), B1c
  (`NOT APPROVED`), B2 (`WITHHELD`), migration 0001 (`NOT AUTHORIZED`), migration 0002 (`DO NOT COMMIT`), T1
  (`CLOSED`) or R2 (`PARTIALLY RESOLVED`);
- authorising **B1b** or **B2**;
- creating a PR, merging, deploying, committing or pushing.

**A validation requirement does not authorise a validation run; a validation run would not authorise a
remediation; a remediation would not authorise an index; an index would not authorise a deployment.**

---

## 17. Evidence references

### 17.1 Committed artifacts read

| Artifact | What was taken from it |
|---|---|
| `prisma/migrations/0001_phase04a_question_bank/migration.sql` | PART C `:613–648` (the six indexes verbatim); `tags` `:214–221`; `colleges` `:247–256`; `question_tags` PK `:229`; FKs `:447`, `:456`; `ck_question_sources_board_or_college_not_both` `:608–609`; `question_sources` identity index `:629–631` |
| `prisma/schema.prisma` | `Tag` (380–390), `QuestionTag` (393–404), `College` (430–441), `QuestionSource` (461–485), `QuestionVersion`, `Topic`, `QuestionAsset`, `QuestionVersionAsset`; the hand-written-index comment block `:26–30`; confirmation that **none** of the six is a Prisma declaration |
| `docs/database/phase-04a-database-collation-product-and-environment-decision.md` | §4 (index behaviour), §5–§6 (semantics for tags/colleges), §8.7 (CI profile), §9 (drift), **§10.1–§10.7** (the validation strategy this brief specifies), §11 (guard), §12 (register) |
| `docs/database/phase-04a-od-coll-01-02-uniqueness-semantics-decision-brief.md` | §3 (index definitions), §5.4/§6.4 (merge mechanics, measured E11–E12b), **§9** (the seven detections and five stages this brief extends) |
| `docs/database/phase-04a-od-coll-03-production-collation-profile-decision-brief.md` | §3 (CI evidence), §6.3 (fingerprint limits), §11 (dependencies) |
| `docs/database/phase-04a-od-coll-04-collation-fingerprint-specification-decision-brief.md` | §3 (probe audit), §6 (field set the report must record), §8 (classifications) |
| `docs/database/phase-04a-od-coll-05-collation-drift-failure-policy-decision-brief.md` | §4/§5 (classification and severity vocabulary), §10 (fail-closed), §11 (recovery boundaries this brief's gates must respect) |
| `docs/database/phase-04a-index-integrity-guard-design.md` | §2.2 (measured control gaps), §3.4 (per-key metadata), §6 (structural comparison), §7.4 (inventory semantics), §9 (matrix) |
| `docs/database/phase-04a-index-collation-r2-investigation.md` | §12.1 (expectation kinds), §12.3 (resolution rules) |
| `docs/database/phase-04a-final-database-deployment-decision-package.md` | §12.1–§12.3 (B1b), C-DEF-5 (unmeasured RTO), the status register |
| `docs/database/g1-spike/option-c/prod-ready/v3/backup-restore-drill.sh` | the only snapshot mechanism (`pg_dump --format=custom` + `pg_restore`), 316 lines, drill-only |
| `docs/architecture/technology-decisions.md` | `:61` — **OD-20** (privacy, data classification, retention, audit access) remains the owner of retention |
| `docs/database/g1-spike/option-c/prod-ready/v45/publish-gate-verify.sh` | `:233` — the only "collision" mention in executable content (an error-registry assertion) |

### 17.2 Executed evidence cited

| Item | Value |
|---|---|
| Local probe matrix | Session 23, disposable PostgreSQL 16.2, UTF8, `C.utf8`, `libc`, destroyed after use — **local only** |
| Merge hazards | E11 (`question_tags_pkey`), E11b (safe shape), E11c (cascade), E12b (`uq_question_sources_identity`) — same environment |
| CI collation profile | run `45546248909`, check run `138976563830`, commit `0aae1368a16cf6447cb7a01afc7554a9fdab4bc0` |
| G-1 drift | run `45381634139` — six destructive statements, none executed |
| This session | **no measurement of any kind** — no database created, started, queried or modified |

### 17.3 Not consulted

No production or staging system, credential, catalog, dump, backup or data set was read. No audit was run. The
repository contains **no** real tag or college data, so no volume, distribution or Unicode content of the
production corpus is known to anyone reading this brief.

---

## 18. Revision history

| Revision | Date | Change |
|---|---|---|
| 1 | 2026-11-24 | Initial OD-COLL-06 decision brief. Establishes that no existing-data validation capability exists in the repository (§3.5); classifies the six indexes by collation dependence and shows that only two require a Unicode collision audit (§4); models candidate semantics including the asymmetric risk of narrowing (§5); tabulates twelve Unicode concepts and their measured/unmeasured status (§6); specifies a ten-step read-only audit with a 17-field report (§7); analyses snapshot consistency and TOCTOU without prescribing a write pause (§8); defines ten collision classifications and the rule that zero collisions is not compatibility (§9); enumerates eight remediation operations with measured hazards and no authorisation (§10); sets eleven gates before index creation (§11); separates sensitive-value handling from OD-20's retention decision (§12); maps dependencies and separates what is independently specifiable (§13); records ten owner questions as `OPEN` and the decision as **OD-COLL-06 OPEN — EXISTING DATA COMPATIBILITY VALIDATION REQUIREMENTS NOT APPROVED** (§14). **No audit, query, script, schema, migration, index, row, workflow or test was created or changed; no database operation; nothing committed or pushed.** |

**Standing decisions preserved exactly, unchanged by this document:** G-1 **FAILED** · G-3 **PASSED** ·
Option C **APPROVED — controlled migration workflow only** · B1a **APPROVED (workflow-scoped)** · B1b **NOT
APPROVED** · B1c **NOT APPROVED** · B2 **WITHHELD** · migration 0001 **NOT AUTHORIZED for production
deployment** · migration 0002 **DO NOT COMMIT** · G-2 **DEFERRED** · **T1 CLOSED** · **R2 PARTIALLY RESOLVED** ·
OD-COLL-01…06 **OPEN** · OD-17 **OPEN** · OD-20 **OPEN** · OD-21 **OPEN** · OD-NM-1 **OPEN**. CI profile
**OBSERVED**; production profile **UNKNOWN**; production locale **NOT DECIDED**; CI↔production equivalence
**NOT ESTABLISHED**.

**One open decision, framed and unowned. Nothing was audited, merged, indexed or deployed, and no validation
run is authorised by this document.**
