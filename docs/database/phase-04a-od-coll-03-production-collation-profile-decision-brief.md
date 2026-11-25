# Phase 04A — OD-COLL-03: Production Collation Profile — Owner Decision Brief

**Date:** 2026-11-24
**Repository:** `Tanim-Boss/HSC-ALIM-ICT-Question-Bank`
**Branch:** `arena/49496cf8-hsc-alim-ict-question-bank`
**HEAD when written:** `4d04e4461338ea5931d26faf67d312fbed21de43` (parent `b8873c1729e21036f1139ea56822881a4e267e09`)
**Subject:** **OD-COLL-03** — *what is the approved production database locale/provider profile?*
**Nature:** investigation and decision input. **Documentation only.** No production or staging resource was
contacted, no database was written to, no index, migration, schema, workflow, script or test was modified, and
**no locale was selected**. This document is untracked, pending owner review.

**Labels used throughout**

| Label | Meaning |
|---|---|
| `VERIFIED` | measured or read directly from a committed file, a CI run, or a GitHub API response |
| `DERIVED` | follows from `VERIFIED` facts by stated reasoning; not itself measured |
| `PROPOSED` | design or process, not applied, not approved |
| `NOT TESTED` | could not or has not been executed in any available environment |
| `UNKNOWN` | a fact about an environment nobody has measured |
| `OPEN` | an owner decision with no answer |

**Standing statement, repeated wherever it could be misread:** a brief that frames a decision is not a
decision. Every authorisation in the register stays exactly as it is, and a technical recommendation below is
**not** owner approval.

---

## 1. Executive verdict

### **DECISION BRIEF COMPLETE — NO PRODUCTION LOCALE SELECTED — OD-COLL-03 REMAINS OPEN**

Seven facts shape this brief, and all seven point the same way:

1. **CI is measured; production is not.** The CI database profile is known exactly (§3). Nothing whatsoever is
   known about the production PostgreSQL instance — not its major version, provider, locale or collation
   version (§4). OD-COLL-03 asks a question about production and the evidence available is about CI.
2. **Two of the six indexes are the collation-sensitive surface.** `uq_tags_name_lower` and
   `uq_colleges_name_lower` derive their *meaning* from the database default collation. The other four are
   collation-free by type or non-unique (§5). A locale decision is therefore mainly a decision about two
   uniqueness guarantees — one of which is a product promise already made to end users (§5.3).
3. **Matching names and matching OIDs prove nothing.** Two databases can report the same `collname =
   'default'`, the same OID `100`, and enforce different equality (§6). The CI fingerprint is an
   identity/change-detection device, not a proof of equivalent comparison behaviour.
4. **Any change of uniqueness semantics can invalidate existing rows.** That is why validation is a
   prerequisite, not a follow-up (§7), and why the six OD-COLL decisions are interlocked (§10).
5. **Four technically credible options exist** — retain-and-measure, named libc profile, ICU profile, defer —
   and each is analysed with its own costs (§8). None is selected here.
6. **No locale recommendation is technically justified today**, because the decisive production facts do not
   exist yet. What *is* justified is a recommendation about **sequencing** (§12.1).
7. **Nothing is authorised.** Not measurement of production, not a locale, not a guard, not a migration, not
   a deployment (§13).

**OD-COLL-03 status: `OPEN — NO PRODUCTION LOCALE SELECTED`.**

---

## 2. Decision scope

### 2.1 The question, exactly as the register records it

From `docs/database/phase-04a-database-collation-product-and-environment-decision.md` **§12** (row
`OD-COLL-03`):

> **OD-COLL-03** — What is the approved production database locale/provider profile?
> Options: libc `C` · libc `C.utf8` (or another specific locale) · ICU with an explicit locale · no pin
> (explicitly accept environment-dependent semantics).

The register's own note is important and is reproduced rather than paraphrased: *"This document refuses to
name a locale (§7.6). The *requirement* that a profile be pinned is recommended; the value is not."*

### 2.2 What this decision is

A choice of the **environment contract** under which the six hand-written indexes operate in production: the
provider, the locale, the encoding, the determinism requirement and the recorded version — expressed as a
profile that a later control could assert. It is *not* a schema change: migration 0001 contains **no
`COLLATE` clause at all** (`grep -c COLLATE` → `0`), so every text key inherits the database default and no
repository file records which default is correct (`VERIFIED`, decision doc §4.2).

### 2.3 What this decision is **not**

| Not this | Where it belongs |
|---|---|
| The semantics of `tags.name` case-insensitivity | **OD-COLL-01** (decision doc §5) |
| The semantics of `colleges.name` case-insensitivity | **OD-COLL-02** (decision doc §6) |
| Which fields form the fingerprint, and its canonical form | **OD-COLL-04** (decision doc §8) |
| The failure policy when the environment drifts | **OD-COLL-05** (decision doc §9) |
| Which existing-data validation is mandatory | **OD-COLL-06** (decision doc §10) |
| Implementing the index guard, or wiring an environment check | guard design §11, §16 — **not authorised** |
| Deploying migration 0001 to production | **B1b / B2** — unchanged (§13) |

### 2.4 Four stages that must not be collapsed

| Stage | What it produces | Who may authorise it | Status |
|---|---|---|---|
| 1. **Measurement** | the production profile, read-only | an explicit, separate authorisation | **not authorised** (`NOT TESTED`) |
| 2. **Approval** | a recorded owner decision on OD-COLL-03 | the owner only | **OPEN** |
| 3. **Implementation** | guard code, expectation data, validation report remediation | owner + reviewer | **not authorised** |
| 4. **Deployment** | anything touching a production database | B1b/B2 path | **unchanged, withheld** |

The single most common failure mode this brief is written to prevent is stage 2 being inferred from stage 1,
or stage 1 being skipped because stage 2 "seems obvious". Neither is available.

---

## 3. Established CI evidence

### 3.1 What was measured, and from where

| Item | Value | Label |
|---|---|---|
| CI run | `45546248909` — `completed / success` | `VERIFIED` |
| Check run | `138976563830` — `G-3 full-schema gate (node 22, postgres 16)` | `VERIFIED` |
| Commit measured | `0aae1368a16cf6447cb7a01afc7554a9fdab4bc0` | `VERIFIED` |
| PostgreSQL server | `16.16 (Debian 16.16-1.pgdg13+1)` — Debian 13 (trixie) packaging | `VERIFIED` |
| Databases | `g3f_main` (5432) and `g3f_replay` (5434) — *not* the image's default `postgres` database | `VERIFIED` |
| Encoding | `UTF8` | `VERIFIED` |
| Provider | `libc` (`datlocprovider = 'c'`) | `VERIFIED` |
| `datcollate` / `datctype` | `en_US.utf8` / `en_US.utf8` | `VERIFIED` |
| `daticulocale` | NULL (`-`) | `VERIFIED` |
| `datcollversion` | **`2.41`** — not NULL | `VERIFIED` |
| Retrieval method | Check Runs annotations API (two `notice` annotations); job logs and the artifact archive were unreachable (`EOF`) | `VERIFIED` |

Both databases produced **byte-identical** fingerprints:

```text
collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=en_US.utf8;ctype=en_US.utf8;iculocale=-;collversion=2.41
```

Source: `docs/database/phase-04a-database-collation-product-and-environment-decision.md` **§8.7 (Revision 2)**
and `docs/database/phase-04a-ci-collation-profile-measurement-proposal.md` **§17.4**. Task **T1** was closed on
this evidence.

### 3.2 What that evidence establishes

- The CI service container that runs G-3 uses a **libc, UTF-8, `en_US.utf8`** database, on PostgreSQL 16.16
  with a Debian 13 build, and reports collation version `2.41`. `VERIFIED`
- `datcollversion` **is not always NULL for libc** — the earlier generalisation was falsified by this
  measurement and corrected in both Revision 2 documents. `VERIFIED`

  The corollary binds any future production profile: a NULL must **never** be assumed merely because the
  provider is `libc`. The handling is conditional on the value the environment actually reports — a reported
  version is recorded, a NULL is recorded as unknown, and in neither case is the field a pass condition
  (decision doc §8.4, §8.7.1). `DERIVED`
- Both CI databases agree byte-for-byte, so the CI measurement is internally reproducible across the two
  databases the gate asserts. `VERIFIED`

### 3.3 What that evidence does **not** establish — seven boundaries

Every one of these is load-bearing for OD-COLL-03, and each is easy to lose when the brief is summarised:

| # | Boundary | Why it matters here |
|---|---|---|
| 1 | **It is CI evidence, not production evidence** | nothing about the production instance follows |
| 2 | **Production PostgreSQL major version is unknown** | the catalog columns, provider support and collation semantics all depend on it |
| 3 | **Production provider is unknown** | libc and ICU resolve `lower()` differently and are not interchangeable |
| 4 | **Production locale is unknown** | this *is* the question OD-COLL-03 asks |
| 5 | **Production collation version is unknown** | a glibc/ICU upgrade changes folding without changing any name |
| 6 | **CI and production semantic equivalence has not been established** | no measurement compares the two environments |
| 7 | **CI's folding behaviour was never directly measured** | Session 18 read the `pg_database` row; it did not compare folded strings |

Two further qualifications are recorded in the source documents and must travel with any summary:

- The measurement did **not** directly compare `en_US.utf8` against `C.utf8` — `en_US.utf8` is not installed
  in the working environment (`NOT TESTED`).
- The pairs `Ä/ä`, `ẞ/ß`, `İ/i`, `K`(U+212A)`/k` are **local `C.utf8`-versus-`C` measurements** (decision doc
  §5.3, §7.7). They must **not** be presented as measured CI behaviour.

### 3.4 Why CI's passing tests say even less than they appear to

G-3's case 30 exercises `'Logic Gate'` versus `'logic gate'` — **ASCII only**
(`enforce.sql:632–645`, `VERIFIED`, decision doc §4.4). A passing enforcement suite therefore demonstrates
ASCII case folding and says nothing about `Ä`, `ẞ`, `İ`, `ς` or `K`(U+212A). `G-3 PASSED` is a real result and
it is not evidence about Unicode uniqueness.

---

## 4. Unknown production environment

### 4.1 Mandatory facts — required before any locale decision

These are the facts without which OD-COLL-03 cannot be answered honestly. They map onto the ten properties
in the decision document **§7.1**, restricted to what production must supply.

| # | Fact | Where it is read | Why it is mandatory |
|---|---|---|---|
| 1 | **PostgreSQL major version** (`server_version_num`) | `SHOW server_version_num` | catalog shape, `NULLS NOT DISTINCT` availability, provider support (`b` builtin is 17+), rendering of predicates |
| 2 | **Database encoding** | `pg_database.encoding` | byte semantics of every fold |
| 3 | **Collation provider** | `pg_database.datlocprovider` | decides who implements `lower()` and `=`: libc, ICU, or (17+) builtin |
| 4 | **`datcollate` and `datctype`** | `pg_database` | with a libc provider these *are* the profile; `lower()` follows `datctype` |
| 5 | **`daticulocale`** | `pg_database` | the ICU equivalent of 3–4; NULL for libc |
| 6 | **Database collation version** | `pg_database.datcollversion` (and `pg_collation_actual_version` where applicable) | the only catalog signal that a library change occurred — and only where it is populated |
| 7 | **Per-index collation and operator class for the six indexes** | `pg_index.indcollation`, `pg_index.indclass` → `pg_collation`, `pg_opclass` | the three text keys resolve to `database_default`; the opclass decides comparison independently of collation |
| 8 | **Determinism of every collation in use** | `pg_collation.collisdeterministic` | the contract requires `true`; a non-deterministic collation changes the equality relation itself |
| 9 | **Which database the application will actually run against** | deployment configuration, not the catalog | a profile approved for one database is not a profile for another; the CI lesson is that per-database locale is real |

### 4.2 Useful diagnostic facts — recorded if available, never a pass condition

| Fact | Why it is useful | Why it is not a gate |
|---|---|---|
| Server build string and packaging (`Debian …`) | explains which libc/ICU build is in play | packaging can change without changing any decision the owner makes |
| `pg_collation` inventory and namespaces | detects name reuse and namespace collisions | a name is not an identity (R2 §5.5, §5.6) |
| Per-index expression text (`pg_get_expr`) | confirms `lower(name)` is what is deployed | rendering, not source; stable only within a major |
| `pg_get_indexdef()` full text | human-readable cross-check | explicitly not a decision source (guard design §5.2) |
| Actual fold behaviour on representative strings | the closest thing to semantic evidence | it is a sample, not a proof, and it is not obtainable without running queries |

### 4.3 What is known about production today

| Fact | Status |
|---|---|
| Major version | `UNKNOWN` |
| Provider | `UNKNOWN` |
| `datcollate` / `datctype` | `UNKNOWN` |
| `daticulocale` | `UNKNOWN` (NULL if libc, but "libc" itself is not established) |
| Collation version | `UNKNOWN` |
| Encoding | `UNKNOWN` |
| Which database the application targets | `UNKNOWN` |
| Whether any of the six indexes exists there | `UNKNOWN` — migration 0001 is **NOT AUTHORIZED** for production, so they probably do not, which is itself relevant to sequencing |

No production access is authorised in this session or in any session to date; the limitations of every
preceding document say so explicitly (`decision doc §15.3`, `File C §16.4`, `R2 §14`).

---

## 5. Six-index impact analysis

### 5.1 The six indexes, and what a collation profile actually touches

Verbatim definitions from `prisma/migrations/0001_phase04a_question_bank/migration.sql` PART C, as recorded in
the decision document **§4.1** and the guard design **§3.1** (`VERIFIED`):

| # | Index | Structure | Keys and collation source | Locale changes its *meaning*? |
|---|---|---|---|---|
| 1 | `uq_question_versions_one_published_per_question` | unique, **partial** (`status = 'PUBLISHED'`) | 1 key, `uuid` → no collation (`indcollation = 0`) | **no** |
| 2 | `uq_question_sources_identity` | unique, **`NULLS NOT DISTINCT`** | 5 keys, `uuid`/`enum` → no collation | **no** |
| 3 | `uq_topics_chapter_order` | unique, **partial** (`is_active`) | 2 keys, `uuid`/`int4` → no collation | **no** |
| 4 | `uq_tags_name_lower` | unique, **expression** | `lower(name)`, `text` → **database default** (`indcollation = 100`) | **yes** |
| 5 | `uq_colleges_name_lower` | unique, **expression** | `lower(name)`, `text` → **database default** | **yes** |
| 6 | `ix_question_assets_checksum` | **non-unique**, partial (`checksum IS NOT NULL`) | `checksum`, `text` → database default | **ordering only** |

Eleven index keys in total: **eight `none`, three `database_default`** (R2 investigation **§12.1**).

### 5.2 Three tiers, and why they must not be flattened

| Tier | Indexes | What the locale decision changes | What it does not change |
|---|---|---|---|
| **1 — uniqueness semantics** | `uq_tags_name_lower`, `uq_colleges_name_lower` | which strings are considered *equal* after `lower()`, therefore which rows may coexist | the index definition, its name, its expression, its opclass |
| **2 — collation-bearing but non-unique** | `ix_question_assets_checksum` | sort order and index-usable range behaviour | uniqueness (there is none); equality lookups still resolve under a deterministic libc collation |
| **3 — collation-free** | indexes 1, 2, 3 | nothing | their integrity still depends on predicate text, `NULLS NOT DISTINCT`, key order and opclass — properties a *collation* decision does not govern |

Stating this plainly matters for two reasons. First, it prevents an over-broad claim that "the collation
profile governs the six indexes" — it governs the meaning of two of them, the ordering of a third, and
nothing about the rest. `DERIVED` from §5.1 and R2 §12.1.

Second, it prevents the opposite error — treating indexes 1–3 as trivially safe. Their guarantees are
structural: M9 shows a `uq_question_sources_identity` recreated **without** `NULLS NOT DISTINCT` still looks
like a five-key unique index while no longer de-duplicating partial rows (`VERIFIED`, guard design §9.2, M9).
That is a collation-independent failure mode and remains outside OD-COLL-03's reach.

### 5.3 The measured consequence for tier 1 (local evidence, not CI)

The decisive experiment is reproducibility of a silent weakening on the **real schema** (R2 investigation
**§10.6**, `VERIFIED`):

| Database | `datcollate` | `lower('Ärger')` | Insert `Ärger`, then `ärger` | `indcollation` |
|---|---|---|---|---|
| `real_c` | `C` | `Ärger` | **both accepted — 2 rows** | `100 (default)` |
| `real_u` | `C.utf8` | `ärger` | **second rejected** — `duplicate key … "uq_tags_name_lower"` | `100 (default)` |

The same divergence was reproduced by a plain `pg_dump`/restore rather than by `ALTER TABLE` (decision doc
**§11.3**, E8: restored `C` copy accepts both rows, `rows=2`), and by an index recreated with an explicit
`COLLATE "C"` (guard design **§9.2**, M10: `indcollation` 100 → 950, detected structurally). A related false
negative is M-note **N1**: `ALTER TABLE tags ALTER COLUMN name TYPE text COLLATE "C"` rebuilds the dependent
index and leaves `indcollation = attcollation`, so a relationship-only rule passes while the guarantee changed.

### 5.4 The product promise at stake

`server/questions/publish/db-errors.ts:68–77` tells end users *"A tag with this name already exists (names are
compared ignoring case)"* and the same for colleges (`VERIFIED`, decision doc §4.3). Under a `C`-locale
production database that sentence is true for ASCII and **false** for `Ä/ä`, `ẞ/ß`, `İ/i` and `K`(U+212A)/`k`
(local measurements). Under a UTF-8 locale it is true for those pairs and still false for `ς/σ`, `ẞ/ss` and
`ﬁ/fi`, which fold under neither (decision doc §5.3). No locale available in PostgreSQL makes the sentence
literally true for all Unicode. `DERIVED`

### 5.5 Collation sensitivity is not the same as guard importance

A profile decision does not protect index 2's `NULLS NOT DISTINCT` semantics, index 1's or 3's predicates, or
index 6's opclass. Those need the structural control described in the guard design, which is **not
implemented and not authorised** (§13). Conversely, no structural control detects that a `C.utf8` database was
restored into `C` — that is only visible from the environment, which is why OD-COLL-03/04/05 exist at all.
`DERIVED`

---

## 6. CI-to-production compatibility

### 6.1 The dimensions that must agree, and what "agreeing" would even mean

| Dimension | If it matched | Why matching is still not proof of equivalent comparison |
|---|---|---|
| Provider | both `libc` (or both ICU) | provider decides *who* implements folding, not *what* it folds |
| Locale name | both `en_US.utf8` | a locale name is an identifier; its implementation comes from the OS library, which differs by build |
| Collation version | both `2.41` | the catalog value is only as trustworthy as the library's report, and it is NULL on many builds |
| PostgreSQL major | both 16 | a major bump can change catalog shape and rendering, and may add a builtin provider (17+) |
| ICU vs libc | same provider | ICU locale data versions change independently of PostgreSQL and of the OS |
| Determinism | both deterministic | determinism is required, and a non-deterministic collation changes equality itself — but "both deterministic" does not make two collations equal |

`DERIVED` from decision doc §7.2, §8.5 and R2 §4.1–§4.3.

### 6.2 Why identical names and identical OIDs are specifically not evidence

Two databases can both report `collname = 'default'` and `indcollation = 100`, and still enforce different
equality — measured twice, by two different mechanisms (R2 §10.6; decision doc §11.3 E8). OID `100` is a
**per-database placeholder whose meaning is `pg_database`** (R2 §4.1). This is the single finding that makes a
naive "the collation is `default`, so we agree" argument invalid, and it is why the guard design's contract
expresses the expectation **symbolically** (`database_default`, `none`, `named(schema,name)`,
`column(table,column)`) and resolves it inside the target database at check time (R2 §12.1; guard design
§10.1).

### 6.3 What the fingerprint is, and is not

The `collation-fingerprint/v1;…` string is:

- an **identity** of a measured environment, and
- a **change-detection** device across runs, byte-comparable and cheap.

It is **not** a proof that two environments compare strings the same way, because:

| Gap | Consequence |
|---|---|
| It carries no per-index information | an index rebuilt with an explicit `COLLATE` changes no fingerprint field |
| `datcollversion` may be NULL | where it is NULL, a library upgrade is invisible (the CI image populates it; other builds may not) |
| It records names, not behaviour | two `en_US.utf8` builds can differ in Unicode data version |
| It says nothing about the collations actually in use by other objects | only the database default is captured |

`DERIVED` from decision doc §8.5 and R2 §11.4.

### 6.4 The evidence standard that *would* support a compatibility claim

Nothing short of all three, obtained from the target database itself, would justify the statement "production
behaves like CI for these two indexes" (`PROPOSED`; none of it is performed):

1. **Profile equality or recorded divergence** — the target database's profile read from `pg_database` plus
   per-index `indcollation`/`indclass` for the six indexes, compared field by field with CI's measured values.
2. **Behavioural corroboration on representative strings** — a read-only `SELECT` over a small fixed string
   set exercising ASCII case, a Latin-1 accented pair, `İ/i`, `K`(U+212A), `ς/σ` and an NFC/NFD pair, run in
   the target database, showing which pairs collide under its `lower()`.
3. **A read-only data report** — §7's validation, so that the *consequence* of the difference is known on real
   data rather than argued from examples.

Even then the claim is "measured agreement on this evidence set", not "semantic equivalence in general".

---

## 7. Existing-data validation

### 7.1 The rule that already governs this

> No uniqueness semantics may change until a **validation report** has been produced from a read-only snapshot
> of the target database and reviewed by the owner. If the report finds collisions, the policy change is
> blocked until a separate, approved data-remediation plan exists.

Source: decision document **§10.1**. This brief does not restate the whole specification; §10.2–§10.7 of that
document is the authoritative procedure and OD-COLL-06 is the decision that owns it.

### 7.2 Why a locale choice is a data question, not only an environment question

Changing the profile changes which strings `uq_tags_name_lower` and `uq_colleges_name_lower` consider equal. If
two rows are distinct under today's semantics and equal under the proposed ones, the *existing* data cannot
satisfy the new guarantee — the index build fails (safe) or, worse, a naive remediation merges two institutions
and splits their provenance (`question_sources.college_id`). `DERIVED`; the merge hazard is analysed in
decision doc §10.5 and §6.2.

### 7.3 The seven read-only checks a candidate profile needs

| # | Check | Why it decides the risk | Status |
|---|---|---|---|
| 1 | Row counts vs `count(DISTINCT lower(name))` per table | proves whether duplicates already exist under **current** semantics | `PROPOSED` (decision doc §10.2) |
| 2 | Collisions under each **candidate** key (current, `COLLATE "C"`, proposed fold) | each hit is a policy that cannot be adopted without remediation | `PROPOSED` (§10.3) |
| 3 | **Unicode normalisation variants** — `name <> normalize(name, NFC)` | a normalisation policy merges rows that look identical in the UI | `PROPOSED` (§10.4) |
| 4 | **Case-folding behaviour** of the actual expression per index — `lower(name)` under the target's `datctype` | the fold is the semantics; `lower()` is not full Unicode folding | `PROPOSED` (§10.4, §5.3) |
| 5 | The **actual expression** used by each index — `lower(name)` for indexes 4–5, bare `checksum` for 6, none for 1–3 | validating a different expression than the index enforces is a false assurance | `VERIFIED` (definitions, §5.1); report `PROPOSED` |
| 6 | Whether previously valid rows would conflict — pairwise current key vs candidate key | defines the exact remediation scope | `PROPOSED` (§10.4) |
| 7 | Merge feasibility and referential integrity for any candidate collision | a merge can cascade and destroy question–tag links | `PROPOSED` (§10.5) |

### 7.4 Hard prohibitions

- No scan of production or staging data was performed in preparing this brief, and none is authorised.
- Validation runs against a **read-only snapshot**, never the live system (`PROPOSED`, decision doc §10.7).
- Deduplication is never automatic: a merge that removes a row is a data decision requiring its own approval
  (decision doc §10.6, §10.7).
- A validation report is evidence for the owner; it is not an approval.

---

## 8. Decision options

None is selected. Each is technically credible; each requires evidence that does not yet exist. Locale
availability is deliberately **not** assumed — whether a given locale exists in the production image is itself
an unmeasured fact, and the CI lesson is that the image's `initdb` decides it.

### 8.1 Option A — retain the environment's existing default, after measuring and validating it

| Aspect | Assessment |
|---|---|
| **Meaning** | approve "whatever `initdb` produced" as the profile, with its measured values recorded |
| **Advantages** | no production configuration change; no index rebuild; no risk of breaking something that currently works; the profile can still be *recorded* and drift-detected later |
| **Risks** | the retained locale is whatever a platform default happens to be, which may be `C` — in which case the two `lower(name)` guarantees are ASCII-only and the user-facing message is wrong for non-ASCII names; the value could change silently on a future instance re-creation unless the fingerprint is enforced |
| **Compatibility** | maximum compatibility with the existing instance by definition; says nothing about CI equivalence |
| **Operational** | lowest cost; requires only measurement + validation + approval; later `pg_dump`/restore into a different-locale database reintroduces E8 unless the fingerprint gate exists |
| **Required evidence** | the full §4.1 fact set; §7 report under the retained semantics (to know whether the current guarantee is already violated) |
| **Evaluable without changing production** | **yes** — entirely read-only |

### 8.2 Option B — explicitly select a named libc collation profile

| Aspect | Assessment |
|---|---|
| **Meaning** | pin a specific libc locale (the register's examples are `C` and `C.utf8`; other locales exist but must not be assumed installed) |
| **Advantages** | deterministic and reviewable; `C.utf8` gives non-ASCII case folding without ICU; the expected value can be enforced by a fingerprint gate; makes the product promise substantially truer than `C` |
| **Risks** | picking a locale **for existing data** may create collisions that must be remediated; `C.utf8` is still not full Unicode folding (`ς/σ`, `ẞ/ss`, `ﬁ/fi` fold under neither); changing the database locale is not a `CREATE INDEX` change — it usually means re-creating the database or `ALTER DATABASE … SET` plus a rebuild, which is an operational event in its own right |
| **Compatibility** | closer to CI's UTF-8 behaviour than `C`, but *not proven equivalent* to `en_US.utf8` — they were never compared directly |
| **Operational** | requires an implementation plan and a change window; interacts with backup/restore and with any future restore drill |
| **Required evidence** | §4.1 facts; confirmation the locale exists in the target image; §7 report for the chosen locale; a rebuild plan |
| **Evaluable without changing production** | **partly** — availability and collision analysis can be done on a copy; the change itself cannot |

### 8.3 Option C — explicitly select an ICU collation profile

| Aspect | Assessment |
|---|---|
| **Meaning** | provider `icu` with an explicit `daticulocale`, deterministic |
| **Advantages** | the only route to locale rules that are independent of the OS libc build; the only way to reach broader Unicode behaviour than a libc UTF-8 locale |
| **Risks** | provider change is the largest of the four options; ICU availability in the target image is unmeasured, and ICU is **not supported** in the environment used for this repository's experimentation (R2 §10.8, `NOT TESTED`); ICU data versions move independently of PostgreSQL; non-deterministic ICU collations are **explicitly prohibited** by the contract (decision doc §7.5) and must be excluded by policy as well as by check |
| **Compatibility** | diverges furthest from the measured CI profile; the fingerprint would change in three fields at once |
| **Operational** | requires a database re-create or a provider change with index rebuilds, plus ICU version tracking in the runbook |
| **Required evidence** | everything in B, plus measured ICU availability, measured `daticulocale` behaviour, and a determinism proof for every collation in use |
| **Evaluable without changing production** | **no** — not even availability, without access to the target image |

### 8.4 Option D — defer profile selection until the deployment environment and compatibility requirements are known

| Aspect | Assessment |
|---|---|
| **Meaning** | record the *requirement* that a profile be pinned, and defer the value |
| **Advantages** | matches the evidence: production is unmeasured and unknown; prevents a locale being chosen to fit CI; keeps the decision reversible; consistent with `B2 WITHHELD` and the absence of a deployment date |
| **Risks** | the guarantee stays environment-dependent in the interim — but that is already true today, so deferral preserves the status quo rather than creating a new exposure; deferral can drift into indefinite neglect unless it has stated exit criteria |
| **Compatibility** | no claim made, therefore none wrong |
| **Operational** | no work now; the measurement and validation work is deferred with it |
| **Required evidence** | none to *defer*; the exit criteria are the §4.1 facts plus a deployment decision that fixes the environment |
| **Evaluable without changing production** | **yes** — it is the current position |

---

## 9. Operational prerequisites

Seven gates, in order, each with its own evidence and its own authority. None may be merged with the next.

| # | Gate | Evidence it must produce | Who authorises | Status |
|---|---|---|---|---|
| 1 | **Environment measurement** | the §4.1 fact set, read-only, from the actual target database | separate explicit authorisation for the read-only access | `NOT TESTED` |
| 2 | **Read-only data validation** | the §7 report against a snapshot | same, plus a named reviewer | `PROPOSED` |
| 3 | **Evidence review** | a reviewed note stating which option the evidence supports, and which it rules out | owner + reviewer | not started |
| 4 | **Index-integrity verification** | structural confirmation of the six indexes in the target database (`guard.py catalog` exists; the proposed index guard does **not**) | existing controls, unchanged | `PROPOSED` |
| 5 | **Backup and recovery readiness** | backup exists, restore verified, RTO/RPO stated | owner; **OD-22 is OPEN** — no operational targets are approved | `NOT VERIFIED` (File C §10, items 1–3) |
| 6 | **Explicit owner decision** | a recorded answer to OD-COLL-03, in the register, with the profile string | owner only | `OPEN` |
| 7 | **Separately authorised implementation/deployment plan** | the change itself, with change window, rollback and post-deploy assertion | **B1b/B2 path — unchanged** | `NOT AUTHORIZED` |

Two of those gates deserve emphasis because they are frequently assumed rather than checked:

- **Backup** is not "we have `pg_dump` in CI". File C §10 records a genuine measured drill on disposable
  infrastructure and, next to it, the absence of a production backup, schedule, retention, storage or
  encryption policy (`PARTIALLY VERIFIED`), no measured restore duration and no RTO/RPO
  (`NOT VERIFIED (RTO)`). A locale change that requires a database rebuild depends directly on that gap.
- **Implementation authority** is not implied by a decision. Approving a profile in stage 6 authorises nothing
  in stage 7; B1b and B2 remain exactly as the register records them.

---

## 10. Dependencies on OD-COLL-01/02/04/05/06

OD-COLL-03 is one of six interlocking decisions. None is closed or rewritten by this brief.

| Decision | What it asks | Relationship to OD-COLL-03 | State |
|---|---|---|---|
| **OD-COLL-01** — tags uniqueness semantics | ASCII-only, locale-dependent `lower()`, explicit Unicode fold, or alternative | **Depends on** the profile for option B's meaning, but is *not* determined by it: a `C.utf8` profile still leaves "is `lower()` the right semantics?" open; an explicit-fold option would need migration 0002, which is prohibited | `OPEN` |
| **OD-COLL-02** — colleges uniqueness semantics | same four options, independently | same dependency; independently decided because `uq_colleges_name_lower` is the **only** uniqueness rule on the entity and a merge splits provenance (decision doc §6.3) | `OPEN` |
| **OD-COLL-04** — fingerprint fields and canonical form | which fields, what representation | **Mutually dependent**: the approved profile is what the fingerprint would carry, and the fingerprint's field set determines what "the profile" even means | `OPEN` |
| **OD-COLL-05** — drift failure policy | R-FAIL / R-WARN / R-REPIN / R-ALLOW | **Depends on** the profile for the values it compares, and supplies the consequence when the profile changes | `OPEN` |
| **OD-COLL-06** — existing-data validation requirements | none / report-first / report+remediation / +concurrent build | **Prerequisite to** any option that changes uniqueness semantics; the report's *candidate keys* are defined by the chosen profile | `OPEN` |
| **T1** — measure CI | — | **CLOSED** (Session 18); supplies §3 | `CLOSED` |
| **R2** — collation comparison rule | — | **PARTIALLY RESOLVED**: the rule is established; the production half of the environmental unknown is what OD-COLL-03 would close | `PARTIALLY RESOLVED` |

**What this means practically:** no first-mover exists. Choosing a profile without OD-COLL-04/05 leaves no way
to assert or police it; choosing a profile without OD-COLL-06 risks rows that cannot satisfy the guarantee;
choosing a semantics without a profile leaves `database_default` meaning "whatever happens". The decision
document's §13 records the same blocking structure from the other direction.

---

## 11. Owner decision table

| Field | Record |
|---|---|
| **Decision ID** | `OD-COLL-03` |
| **Decision question** | What approved locale/provider profile governs the production database on which the six hand-written indexes operate? |
| **Options** | **A** retain and record the existing default · **B** explicit named libc profile · **C** explicit ICU profile (deterministic only) · **D** defer until the deployment environment is known |
| **Evidence currently available** | CI profile measured and reproducible (§3.1–§3.2); local measurements of `C` vs `C.utf8` on the real schema (R2 §10.6, decision doc §11.3 E8) and of the catalog model (R2 §4–§5); the six index definitions and their collation sources (decision doc §4.1, R2 §12.1); the guard contract that would consume the profile (R2 §12, guard design §10.1) |
| **Evidence missing** | every §4.1 production fact: major version, provider, locale, `daticulocale`, collation version, encoding, per-index metadata, determinism inventory, target database identity; any behavioural comparison between CI and production; any data-validation report |
| **Consequences of deciding now** | the profile would be chosen without knowing production, i.e. an approval that cannot be verified and may not even be applicable; if it implied an implementation, it would also imply a rebuild and a data-validation gate that have no evidence behind them; it would also risk closing R2's remaining half on evidence that does not exist |
| **Consequences of deferring** | the current environment-dependent semantics persist — unchanged from today; the guard's environment group (group B) cannot be implemented; R2 stays partial; the user-facing case-insensitivity promise remains environment-dependent; no new exposure is created by waiting |
| **Recommendation** | **sequence, not value**: complete stage 1 (measurement) and stage 2 (validation) before any option is evaluated on its merits; no locale is recommended (§12.1) |
| **Owner approval status** | **`OPEN — NO PRODUCTION LOCALE SELECTED`** |

A technical recommendation in the row above does **not** constitute approval, and this table is not a decision
record. Under the register's own rule (`§12.1` of the decision document), recording a decision requires an
explicit owner statement plus a reviewed document change.

---

## 12. Recommendation and unresolved questions

### 12.1 Recommendation — about process only

**No locale recommendation is technically justified by the current evidence.** The reasons are structural, not
diplomatic:

1. The question is about **production**, and no production fact has ever been measured.
2. Three of the four options (A, B, C) cannot even be *evaluated* until the environment is known — C cannot be
   evaluated at all without access, since ICU availability is unknown.
3. Choosing a profile would silently pre-empt **OD-COLL-01/02** (is `lower()` the right semantics?) and
   **OD-COLL-04/05** (what is carried and enforced?), which are separate owner decisions.
4. Any choice that changes uniqueness semantics requires the **OD-COLL-06** validation report first; no report
   exists.

What *is* recommended (`PROPOSED`, and it changes no decision):

> **Treat Option D as the operative position until stages 1–3 of §9 are complete**, with explicit exit criteria:
> the §4.1 fact set measured, the §7 report reviewed, and a deployment decision that fixes which database the
> application will use. Then evaluate A, B and C against that evidence and record the answer in the register.

Deferral here is not indecision. It preserves a status quo that is already environment-dependent, while
refusing to convert an unmeasured assumption into an approval.

### 12.2 Unresolved questions that block a decision

| # | Question | Why it blocks | Who can answer |
|---|---|---|---|
| Q1 | Which PostgreSQL major version, provider and build will production run? | every other fact is interpreted relative to it | infrastructure/deployment owner |
| Q2 | Which database will the application actually use, and is it a managed service? | a managed service may impose the locale and forbid re-initialisation | deployment owner |
| Q3 | Is ICU available in that image, and at which data version? | decides whether Option C is even available | infrastructure owner |
| Q4 | Is the current production locale `C`, a UTF-8 locale, or unset by the platform? | decides whether the product promise is currently true for non-ASCII names | measurement (stage 1) |
| Q5 | Are there existing rows that would collide under a UTF-8 fold? | decides whether Option B is adoptable without remediation | validation report (stage 2) |
| Q6 | Does the owner intend `lower()` to be the uniqueness semantics at all (OD-COLL-01/02)? | a profile cannot make `lower()` into full Unicode folding | owner |
| Q7 | Which fields will the fingerprint carry, and what happens on drift (OD-COLL-04/05)? | a profile with no assertion mechanism is a note, not a control | owner |
| Q8 | Is a production backup and restore path verified, with RTO/RPO? | a locale change may require a rebuild | owner / ops (OD-22 `OPEN`) |

### 12.3 What would change the recommendation

- A **deployment decision that fixes the environment** would make stage 1 actionable immediately.
- A **measured production profile identical to CI's** would still leave §6's behavioural corroboration and §7's
  data report outstanding — it would narrow the options, not select one.
- A **measured production `C`-locale database** would sharpen OD-COLL-01/02 substantially, because the ASCII-only
  behaviour of the two uniqueness guarantees would then be a fact to be accepted or changed.
- An **owner statement of intent for OD-COLL-01/02** would reorder the options: an explicit-fold policy would
  reduce OD-COLL-03 to provider/encoding compatibility rather than folding semantics.

---

## 13. Explicit non-authorisations

This brief authorises **none** of the following, and none of them is implied by anything in it:

- selecting, pinning, changing or "recommending for adoption" any production locale, provider or encoding;
- connecting to production or staging, or reading any production catalog or data;
- performing any data scan, validation run or deduplication against real data;
- creating, dropping, rebuilding or altering any index, including the six;
- implementing the index guard, the environment fingerprint check, or an expectation file;
- modifying `prisma/schema.prisma`, migration 0001, or creating migration 0002 (**DO NOT COMMIT** stands);
- modifying application code, workflows, scripts, probes or tests;
- changing **G-1** (FAILED), **G-3** (PASSED), **Option C** (approved, controlled workflow only), **B1a**
  (APPROVED, workflow-scoped), **B1b** (NOT APPROVED), **B1c** (NOT APPROVED), **B2** (WITHHELD), migration
  0001 (NOT AUTHORIZED for production), **G-2** (DEFERRED), **OD-17** / **OD-21** / **OD-NM-1** (OPEN);
- closing **OD-COLL-01…06**, resolving **R2** beyond `PARTIALLY RESOLVED`, or reopening **T1** (CLOSED);
- creating a pull request, merging, or deploying.

---

## 14. Evidence and source-document references

### 14.1 Repository documents cited

| Document | Sections used |
|---|---|
| `docs/database/phase-04a-database-collation-product-and-environment-decision.md` | §4.1 (six indexes), §4.2 (no `COLLATE`), §4.3 (product promise), §4.4 (G-3 case 30), §5.3 (fold table), §6.3, §7.1–§7.2 (ten properties, four levels), §7.5 (determinism prohibition), §7.6 (refusal to name a locale), §7.7 (CI/production gap), §8.5 (fingerprint gaps), §8.7–§8.7.1 (measured CI profile, `datcollversion` correction), §9 (drift policy), §10.1–§10.7 (validation specification), §11.3 (structural-vs-environmental proof), §12 (register), §13 (blocking dependencies), §15.3 (limitations) |
| `docs/database/phase-04a-ci-collation-profile-measurement-proposal.md` | §17.4 (T1 completion update: run, check run, exact fingerprint, prediction-vs-observation) |
| `docs/database/phase-04a-index-collation-r2-investigation.md` | §4.1–§4.3 (default-collation semantics), §5.5–§5.7, §10.6 (the integrity finding), §10.7–§10.8 (version metadata, ICU unavailable), §10.11 (what was not executed), §11.5 (measured CI profile), §12.1–§12.4 (contract and expectation forms), §14 (limitations L1–L8) |
| `docs/database/phase-04a-index-integrity-guard-design.md` | §3.1–§3.5 (inventory, catalog representation, per-key structure), §5.2–§5.3, §9.2 (matrix incl. M9–M11, N1), §10–§10.1 (`collname = 'default'` revisited), §11 (CI execution design), §15 (R2 risk), §16 (recommendation), §17.3 |
| `docs/database/phase-04a-final-database-deployment-decision-package.md` | §5.3–§5.4 (what G-3 proves/does not), §8 (index preservation), §10 (operational readiness incl. backup/RTO), §12–§13 (B1b/B2), §16.4 (limitations) |
| `prisma/migrations/0001_phase04a_question_bank/migration.sql` | PART C `:613`–`:649` (the six index definitions, verbatim) |
| `server/questions/publish/db-errors.ts` | `:68–77` (user-facing case-insensitivity messages) |

### 14.2 CI evidence identifiers

| Item | Value |
|---|---|
| Run | `45546248909` (`success`) |
| Check run | `138976563830` |
| Measurement commit | `0aae1368a16cf6447cb7a01afc7554a9fdab4bc0` |
| Documentation reconciliation commits | `b8873c1729e21036f1139ea56822881a4e267e09` (Revision 2 / T1 closure), `4d04e4461338ea5931d26faf67d312fbed21de43` (historical evidence reconciliation) |

### 14.3 What was *not* consulted

No production or staging configuration, credential, catalog, backup or log was read. No database was started,
queried or written in this session. The absence of production evidence in §4 is not an oversight; it is the
finding.

---

## 15. Revision history

| Revision | Date | Change |
|---|---|---|
| 1 | 2026-11-24 | Initial OD-COLL-03 decision brief. Consolidates the measured CI profile (Session 18), the corrected libc `datcollversion` interpretation, the six-index impact analysis, the CI-to-production compatibility standard, the existing-data validation prerequisites, four unselected options, the operational gate sequence, the dependency structure with OD-COLL-01/02/04/05/06, and an owner decision table whose status is `OPEN — NO PRODUCTION LOCALE SELECTED`. **No locale selected; no production or staging access; no database operation; no guard, schema, migration, workflow, script or test modified; nothing committed or pushed.** |

**Standing decisions preserved exactly, unchanged by this document:** G-1 **FAILED** · G-3 **PASSED** ·
Option C **APPROVED — controlled migration workflow only** · B1a **APPROVED (workflow-scoped)** · B1b **NOT
APPROVED** · B1c **NOT APPROVED** · B2 **WITHHELD** · migration 0001 **NOT AUTHORIZED for production
deployment** · migration 0002 **DO NOT COMMIT** · G-2 **DEFERRED** · **T1 CLOSED** · **R2 PARTIALLY RESOLVED** ·
OD-COLL-01…06 **OPEN** · OD-17 **OPEN** · OD-21 **OPEN** · OD-NM-1 **OPEN**. Production locale **UNKNOWN and
NOT DECIDED**.

**A brief that frames a decision is not a decision. Nothing here is approved, and no locale is selected.**
