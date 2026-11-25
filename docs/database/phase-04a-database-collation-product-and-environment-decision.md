# Phase 04A — Database Collation: Product Decision and Production Environment Contract

**Date:** 2026-11-24
**Repository:** `Tanim-Boss/HSC-ALIM-ICT-Question-Bank`
**Branch:** `arena/49496cf8-hsc-alim-ict-question-bank`
**HEAD at the start of this session:** `36a444a67a4c7de6ba6f4f292f42b765820e6027`
**Status:** decision **preparation only**. **No owner decision has been made.** Nothing in this document is
an approval, an authorisation, or a change to any environment.

**Revision 2 — 2026-11-24.** Revision 1 was written while the CI profile was `INCONCLUSIVE`. It is now
**measured** (§8.7). Revision 1's text is **preserved**; every statement this revision supersedes is marked in
place rather than rewritten, so the record shows what was believed and what was then observed. Three things did
**not** change: the production profile is still **UNKNOWN**, no production locale is **selected**, and
OD-COLL-01…06 are all still **OPEN**.

**Labels used throughout**

| Label | Meaning |
|---|---|
| `VERIFIED` | measured or read directly, this session or Session 14, with the source or command named |
| `PROPOSED` | a design recommendation; not implemented, not approved |
| `NOT TESTED` | not executed here; no claim is made |
| `OPEN OWNER DECISION` | the owner must choose; this document deliberately does not choose |

---

## 1. Executive summary

Session 14 established that the six hand-written integrity indexes rest on a database property that the
committed migration never states: **migration 0001 contains no `COLLATE` clause at all** (`grep -c COLLATE
prisma/migrations/0001_phase04a_question_bank/migration.sql` → `0`). `uq_tags_name_lower` and
`uq_colleges_name_lower` are `lower(name)` expression uniques whose equality therefore comes from the
**database's** collation, not from anything in the repository. `VERIFIED`

This session adds four measurements that make the risk concrete rather than hypothetical:

1. **A dump/restore silently converts a correct index into a weaker one.** `pg_dump` of `tags` from a
   `C.utf8` database emits `CREATE UNIQUE INDEX uq_tags_name_lower ON public.tags USING btree
   (lower(name));` — no `COLLATE`. Restored into a `C`-locale database it applies cleanly, both databases
   report `indcollation = 100 (default)`, and yet the source rejects `'ärger'` after `'Ärger'` while the
   restored database **accepts both** (`rows=2`). No warning, no error, no catalog difference. `VERIFIED`
2. **`lower()` is not Unicode case folding.** In a `C.utf8` database, `lower('ς') = 'ς'` so `ς` and `σ`
   never collide; `lower('ẞ') ≠ 'ss'`; `upper('ß') = 'ß'`. Conversely `lower('İ') = 'i'` (length 1), which
   **disagrees with JavaScript**, where `'İ'.toLowerCase()` is `i` + U+0307 (length 2). `VERIFIED`
3. **The application already promises what the database may not deliver.** `server/questions/publish/
   db-errors.ts:70` returns *"A tag with this name already exists (names are compared ignoring case)."*
   In a `C`-locale database that sentence is true for ASCII and false for `Ä/ä`, `ẞ/ß`, `İ/i`,
   `K`(U+212A)`/k`. `VERIFIED`
4. **No existing evidence can distinguish the policies.** The G-3 enforcement suite exercises only
   `'Logic Gate'`/`'logic gate'` (`enforce.sql:632–645`) and `'Notre Dame College'`/`'notre dame college'`
   (`:670–682`), and the repository contains **no non-ASCII fixture of any kind** in `tests/`, `prisma/`,
   `lib/`, `server/`. `G-3 PASSED` is therefore compatible with every policy in §5. `VERIFIED`

**What this document delivers:** six owner decisions (§12, all `OPEN OWNER DECISION`), a proposed
production environment contract (§7), a proposed database fingerprint with a canonical form (§8), a
fail-closed drift policy for ten scenarios (§9), an existing-data validation process (§10), and the
architectural split between structural and environmental assertions in the index guard (§11).

**What this document does not do:** it does not choose a production locale, does not choose a
case-insensitivity policy, does not change the schema, does not implement the guard, and does not
authorise the deployment of migration 0001. Every decision below remains with the owner.

**Register preserved exactly:** G-1 **FAILED** · G-3 **PASSED** · Option C **approved, controlled migration
workflow only** · B1a **APPROVED (workflow-scoped)** · B1b **NOT APPROVED** · B1c **NOT APPROVED** ·
B2 **WITHHELD** · migration 0001 **NOT AUTHORIZED for production deployment** · migration 0002 **DO NOT
COMMIT** · G-2 **DEFERRED** · OD-17 **OPEN** · OD-21 **OPEN** · OD-NM-1 **OPEN**. Session 14's R2 remains
**PARTIALLY RESOLVED** and authorises neither guard implementation nor deployment.

### 1.1 Revision 2 — the CI profile is now measured

Revision 1 could not fill in the CI profile. Session 16 proposed a read-only probe, Sessions 17–18 implemented
and executed it, and Session 18 made the result readable through the Check Runs annotations API. The measured
CI environment (§8.7) is:

```text
collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=en_US.utf8;ctype=en_US.utf8;iculocale=-;collversion=2.41
```

`g3f_main` and `g3f_replay` produced **byte-identical** fingerprints on PostgreSQL `16.16 (Debian
16.16-1.pgdg13+1)`. Two of Revision 1's expectations were confirmed (`en_US.utf8`, provider `libc`) and one was
**wrong**: `datcollversion` is not NULL for libc here — it is `2.41` (§8.7.1).

| Thing | Status after Revision 2 |
|---|---|
| CI environment profile | **OBSERVED** (§8.7) |
| Production environment profile | **UNKNOWN** — never measured |
| Production locale selection | **NOT DECIDED** — OD-COLL-03 **OPEN** |
| `T1` | **CLOSED** (§14.2) |
| `R2` | **PARTIALLY RESOLVED** — unchanged |

Measuring CI does not resolve OD-COLL-03; it sharpens it, because CI is now known to be a UTF-8 locale while
production is not known at all (§7.7).

---

## 2. Scope and non-goals

### 2.1 In scope

| # | Scope item | Where |
|---|---|---|
| 1 | Case-insensitivity semantics for `tags.name` and `colleges.name`, evaluated separately | §5, §6 |
| 2 | Production database environment contract (encoding, provider, locales, version, determinism) | §7 |
| 3 | A database fingerprint suitable for CI comparison | §8 |
| 4 | Failure policy for ten environment-drift scenarios | §9 |
| 5 | Existing-data validation before any semantics change | §10 |
| 6 | How the index guard must separate structural from environmental assertions | §11 |
| 7 | The owner decision register | §12 |

### 2.2 Non-goals — deliberately not done

| Non-goal | Why |
|---|---|
| Implementing the guard, the fingerprint check or any SQL | Documentation-only session; R2 authorises no implementation |
| Changing `prisma/schema.prisma`, migration 0001, or creating migration 0002 | 0001 is not authorised for production; **0002 DO NOT COMMIT** stands |
| Changing any database locale, provider, extension or version | No production or staging access is permitted; no such change is proposed here |
| Cleaning, merging or normalising data | §10 defines a *validation process*; no cleanup is written or executed |
| Choosing the production locale | An owner/infrastructure decision, not a technical one (§7.6) |
| Choosing a uniqueness policy for tags or colleges | `OPEN OWNER DECISION` OD-COLL-01/02 |
| Re-opening G-1, G-3, B1a/b/c, B2 or the other OD items | Out of scope by instruction |

### 2.3 Safety boundaries observed

Read-only repository work plus a disposable PostgreSQL 16.2 cluster under `/tmp`, destroyed before this
document was written. No commit, push, PR, merge or deploy. The only file created is this one.

---

## 3. Session 14 findings carried forward

Session 14's deliverable is `docs/database/phase-04a-index-collation-r2-investigation.md` (747 lines,
17 sections, untracked). The findings below are **carried forward unchanged**; the column "this session"
records what was actually re-checked, so nothing here is presented as independently re-performed.

| # | Session 14 finding | Original label | This session |
|---|---|---|---|
| S14-1 | OID 100 `default` is byte-identical in a `C` and a `C.utf8` database (provider `d`, every locale field NULL); the meaning lives in `pg_database` | `VERIFIED` | Re-read §4.1; not re-run. **New**: `pg_database_collation_actual_version()` probed, NULL for libc (§8.3) |
| S14-2 | The same committed migration enforces different uniqueness in the two databases: `'Ärger'`/`'ärger'` accepted in `C`, rejected in `C.utf8`, both reporting `indcollation = 100` | `VERIFIED` | **New evidence via a different mechanism**: dump/restore reproduces it (§9, E8) |
| S14-3 | `ALTER TABLE … ALTER COLUMN … TYPE text COLLATE "C"` is accepted, rebuilds dependent indexes (including expression indexes), and leaves `indcollation = attcollation` — so a relationship-only rule passes while the guarantee changes | `VERIFIED` | Not re-run; carried into §9 scenario 4 and §11.3 |
| S14-4 | A collation in use cannot be dropped, but can be **renamed**; the index keeps the same OID | `VERIFIED` | Not re-run |
| S14-5 | `pg_catalog."C"` (950) and `alt."C"` (16416) are different objects with identical attributes | `VERIFIED` | Not re-run |
| S14-6 | `pg_get_indexdef` elides inherited collations, so text cannot verify an expression key | `VERIFIED` | Re-read against the six indexes (§4.2) |
| S14-7 | No version field exists in `pg_index`; libc collations have NULL `collversion`, so version drift is invisible per index | `VERIFIED` | **Extended**: the database-level equivalent is also NULL (§8.3) |
| S14-8 | ICU is unavailable in the 16.2 build used; non-deterministic collations could not be created | `VERIFIED (unavailable)` | Not re-run; still the reason §5 Policy C and §7.5 are `NOT TESTED` |
| S14-9 | Recommended strategy: symbolic expectation → resolved OID → attribute verification, plus a **new** database fingerprint assertion | `PROPOSED` | Adopted as the basis of §7, §8, §11 |
| S14-10 | Verdict `PARTIALLY RESOLVED`, precisely because the CI/production collation is unmeasured | `PARTIALLY RESOLVED` | Unchanged; OD-COLL-03/04 are the route to closing it |

**What was re-read, not re-measured.** Session 14's index-collation matrix, its drop/rename tests and its
`ALTER COLUMN` test were not re-executed. They are cited as Session 14 results, not as new ones. Everything
labelled `VERIFIED` elsewhere in *this* document was executed this session and is listed in §15.2.

---

## 4. Current migration and index behavior

### 4.1 The six indexes, exactly as committed

From `prisma/migrations/0001_phase04a_question_bank/migration.sql`, PART C (`:613`–`:649`). Verbatim texts:

| Line | Object | Definition | Uniqueness | Keys / collation source |
|---|---|---|---|---|
| `:623` | `uq_question_versions_one_published_per_question` | `CREATE UNIQUE INDEX … ON "question_versions" ("question_id") WHERE "status" = 'PUBLISHED'` | unique, **partial** | 1 column key, `uuid` → no collation |
| `:629` | `uq_question_sources_identity` | `CREATE UNIQUE INDEX … ON "question_sources" ("question_id", "source_type", "board_id", "college_id", "academic_year_id") NULLS NOT DISTINCT` | unique, **NULLS NOT DISTINCT** | 5 keys, `uuid`/`enum` → no collation |
| `:635` | `uq_topics_chapter_order` | `CREATE UNIQUE INDEX … ON "topics" ("chapter_id", "order_index") WHERE "is_active"` | unique, **partial** | 2 keys, `uuid`/`int4` → no collation |
| `:640` | `uq_tags_name_lower` | `CREATE UNIQUE INDEX … ON "tags" (lower("name"))` | unique, **expression** | 1 expression key, `text` → **database default collation** |
| `:641` | `uq_colleges_name_lower` | `CREATE UNIQUE INDEX … ON "colleges" (lower("name"))` | unique, **expression** | 1 expression key, `text` → **database default collation** |
| `:645` | `ix_question_assets_checksum` | `CREATE INDEX … ON "question_assets" ("checksum") WHERE "checksum" IS NOT NULL` | **non-unique**, partial | 1 column key, `text` → database default collation |

`VERIFIED` (read from the file). The two `lower(name)` indexes are the only ones whose meaning depends on a
collation; the other four are collation-free by type (`indcollation = 0`) or non-unique.

### 4.2 What the migration does *not* say

| Absence | Consequence | Evidence |
|---|---|---|
| No `COLLATE` anywhere in migration 0001 | every text key inherits the database default; no file in the repository records which default is correct | `grep -c COLLATE` → `0` `VERIFIED` |
| No `@@unique` for the two expression indexes in `prisma/schema.prisma` | Prisma neither models nor migrates them; their semantics are invisible to `prisma migrate`, `db push` and to Prisma's own DDL | `model Tag` (`schema.prisma:380–391`) declares only `@@unique([slug])`; `model College` (`:430+`) declares none `VERIFIED` |
| No app-side normalisation | the database is the only enforcement point; no `toLowerCase()`/`normalize()` exists in `app/`, `components/`, `lib/`, `server/`, `tests/` | grep → 0 matches `VERIFIED` |
| No locale/provider pin in CI | `.github/workflows/phase04a-g3-full-schema-gate.yml` uses `image: postgres:16` at `:75`, `:88`, `:101` and sets no `LANG`, `LC_*` or `POSTGRES_INITDB_ARGS` | grep `VERIFIED` |

### 4.3 What the application already promises

`server/questions/publish/db-errors.ts` maps `23505` errors by **index name**:

| Line | Index | User-facing message |
|---|---|---|
| `:68–72` | `uq_tags_name_lower` | *"A tag with this name already exists (names are compared ignoring case)."* |
| `:73–77` | `uq_colleges_name_lower` | *"A college with this name already exists (names are compared ignoring case)."* |

The phrase *"compared ignoring case"* is a product claim made to end users. §5 measures exactly how far it
holds. The registry's coverage test is **name-based only** — `tests/integration/questions/unique-conflicts.test.ts:229–258`
regexes `CREATE UNIQUE INDEX "name"` out of the migration *file* and never looks at a database, so it can
verify that every index has a mapper entry but not that any index means what the message says. `VERIFIED`

> **Documentation accuracy note.** `db-errors.ts:63` says the registry is checked by
> `tests/integration/questions/unique-index-coverage.test.ts`. **That file does not exist**; the check lives
> in `tests/integration/questions/unique-conflicts.test.ts:242` and `:257`. Recorded here because this
> document cites paths, and a stale citation is worse than none. No file was edited. `VERIFIED`

### 4.4 What the enforcement suite actually exercises

| G-3 case | Values used | What it proves | What it cannot prove |
|---|---|---|---|
| 30 (`enforce.sql:632–645`) | `'Logic Gate'` vs `'logic gate'` | ASCII case folding works | nothing about `Ä`, `ẞ`, `İ`, `ς`, `K`(U+212A) |
| 32 (`enforce.sql:670–682`) | `'Notre Dame College'` vs `'notre dame college'` | same, for colleges | same |

Both pairs are pure ASCII. **`G-3 PASSED` is therefore compatible with every policy in §5** and cannot be
used as evidence for any of them. No non-ASCII fixture exists in the repository (grep for U+0980–U+09FF and
U+00C0–U+017F across `tests/`, `prisma/`, `lib/`, `server/` → **0 files**). `VERIFIED`

---

## 5. Tags uniqueness semantics (`tags.name`)

### 5.1 What the object is

| Property | Value | Source |
|---|---|---|
| Column type | `TEXT NOT NULL` (`name String` in Prisma) | `schema.prisma:382`, migration `:215–218` |
| Physical name | `tags` | `@@map("tags")` |
| Existing unique keys | `uq_tags_slug` (plain, `slug`), `uq_tags_name_lower` (expression, `lower(name)`) | migration `:366`, `:640` |
| Referenced by | `question_tags(question_id, tag_id)`, PK `(question_id, tag_id)`, `ON DELETE CASCADE` | `schema.prisma:393–405`, migration |
| Usage profile | free-ish vocabulary created by editors while publishing; short strings; English transliterations likely, Bengali plausible | domain reading of `server/questions/publish/*`; **not data** |
| App promise | "names are compared ignoring case" | `db-errors.ts:70` |

**No production data was examined**, so nothing here is a statement about what tags actually exist. §10
defines how that would be measured.

### 5.2 Policies evaluated for `tags.name`

#### Policy A — ASCII-only case-insensitive uniqueness

| Aspect | Assessment |
|---|---|
| Equivalent values | strings equal after folding `A–Z`→`a–z` only; `'Ärger'` ≠ `'ärger'` |
| Unicode behaviour | none beyond ASCII; U+00C0–U+024F untouched |
| Locale dependence | **none** — this is exactly what a `C`/`POSIX` locale already gives (§5.3) |
| Determinism | total: identical on every platform, provider and version |
| PostgreSQL implementation | today's definition **is** Policy A when the database is `C`-locale; to make it explicit without depending on the locale it would need `lower(name) COLLATE "C"` or a folding expression of its own |
| Migration implications | if it is to be pinned rather than inherited, the index must be recreated with an explicit collation → a new migration (**0002**, which is **DO NOT COMMIT**) |
| Existing data | no validation needed beyond ASCII pairs, which the current index already enforces |
| Enforceable by unique index | yes |
| App-side normalisation | not required for the index; **required if the UI is to explain the rule**, because the app's message currently claims more |
| Can app and database disagree | yes — a JS `toLowerCase()` in any future UI filter would fold `Ä`, the database would not |

**Product reading:** Policy A is defensible only if the owner accepts *"tags differing only in the case of a
non-ASCII letter are different tags"*. In a Bengali-medium product, Bengali has no case, so Bengali tags are
unaffected either way; the exposure is Latin-accented and other cased scripts used in transliteration.

#### Policy B — Locale-dependent lowercase uniqueness (the status quo)

| Aspect | Assessment |
|---|---|
| Equivalent values | whatever `lower()` does under the approved database locale; today that is `C` in CI-unknown and `C.utf8` in one measured profile |
| Unicode behaviour | **partial and provider-specific** — measured: `Ä/ä` collapse, `ẞ/ß` collapse, `K`(U+212A)/`k` collapse, `İ/i` collapse; `ς/σ` do **not**, `ẞ/ss` do **not**, `ﬁ/fi` do **not** |
| Locale dependence | total — the whole point, and the whole risk |
| Determinism | **none across environments**: the same file yields two different guarantee levels (§9 E8) |
| PostgreSQL implementation | already implemented; needs no DDL change |
| Migration implications | none for the index; **but** the guarantee becomes a property of the environment, so the environment must be contractually pinned (§7) |
| Existing data | no validation needed *if* the environment never changes and never has been different |
| Enforceable by unique index | yes, but the index does not encode which semantics it has |
| App-side normalisation | not required; app and database agree only by accident |
| Can app and database disagree | **yes, measured** — `İ`: PostgreSQL `lower()` → `i` (length 1), JavaScript `toLowerCase()` → `i`+U+0307 (length 2) |

**Product reading:** Policy B is the only policy under which the current migration and the current user-facing
message are already "correct" — provided the environment is pinned and the owner accepts that the promise
degrades to ASCII in a `C`-locale database.

#### Policy C — Unicode-aware case-insensitive uniqueness

| Aspect | Assessment |
|---|---|
| Equivalent values | defined by an explicit folding specification, e.g. Unicode **full** case folding + NFC, so `ẞ`≡`ss`, `ς`≡`σ`, `İ`≡`i̇` |
| Unicode behaviour | complete *by construction*, and independent of the OS locale |
| Locale dependence | none, if implemented as an explicit expression or a generated column rather than `lower()` |
| Determinism | high, **conditional on pinning the Unicode data version** used by the implementation |
| PostgreSQL implementation | three viable shapes: (i) a **stored generated column** holding an app-produced fold, unique-indexed; (ii) an expression index on `normalize(lower(name), NFC)` — verified that `normalize()` exists, but `lower()` keeps the locale dependence, so this is *not* fully Policy C; (iii) an ICU non-deterministic collation — **ICU unavailable in the only build obtainable here**, so `NOT TESTED` |
| Migration implications | a new column or a changed expression ⇒ **migration 0002**, which is currently **DO NOT COMMIT**; and Prisma cannot express either, so it must be hand-written like the six indexes |
| Existing data | **must** be validated: full folding creates equivalence classes that do not exist today (`ẞ`/`ss`, `ς`/`σ`), so a previously-legal pair becomes a duplicate and the new index cannot be built (§10) |
| Enforceable by unique index | yes, in forms (i) and (ii); form (iii) also changes the **equality relation**, which affects `=` comparisons everywhere, not just this index |
| App-side normalisation | **required** in shape (i) — the fold must be produced by code that the application and the index agree on |
| Can app and database disagree | only if two implementations of the fold diverge; with one shared implementation, by design no |

**Availability evidence:** `citext`, `unaccent`, `pg_trgm`, `pg_collkey` are **not available** in the
build measured (`pg_available_extensions` → 0 rows). `citext` would not help anyway: it is `lower()`-based
and therefore as locale-dependent as Policy B. `NOT TESTED` for ICU shapes.

#### Policy D — alternatives considered, and why none is recommended yet

| Candidate | Technical rationale | Why it is not proposed |
|---|---|---|
| **D1. Drop name-level uniqueness; keep `slug`** | `uq_tags_slug` already exists and is the stable key; name duplicates become a *warning* rather than an error | Weakens a guarantee the application's error map and messages assume, and would need OD-08-style approval |
| **D2. Enforce in the application only** | the app can implement one folding rule exactly | Not enforceable against concurrent writers without a database constraint; two instances can race |
| **D3. `UNIQUE (lower(name), …)` per-tenant/per-scope** | future multi-tenant scoping may make "case-insensitive globally" wrong | Speculative scope that is not in the approved schema; out of scope |
| **D4. ICU non-deterministic collation on the column** | makes the *equality operator* case-insensitive, so every query matches, not just the index | Requires ICU, changes comparison semantics product-wide, changes `LIKE`/`ORDER BY` behaviour, and is `NOT TESTED` here (§7.5) |

### 5.3 The measured behaviour table (the evidence behind §5.2)

Executed this session on PostgreSQL 16.2. `=` means "the two values are equal under `lower()` in that
database", i.e. a unique index on `lower(name)` would reject the second.

| Pair | `C.utf8` database | `C` database | Node 22 `toLowerCase()` |
|---|---|---|---|
| `A` / `a` | equal | **equal** | equal |
| `Ä` / `ä` | equal | **not equal** | equal |
| `ẞ` / `ß` | equal | **not equal** | equal |
| `ẞ` / `ss` | not equal | not equal | not equal |
| `ς` / `σ` | **not equal** | not equal | not equal |
| `İ` / `i` | **equal** (PostgreSQL `lower('İ')` = `i`, length 1) | **not equal** | **not equal** (JS = `i`+U+0307, length 2) |
| `K` (U+212A KELVIN SIGN) / `k` | equal | **not equal** | equal |
| `ﬁ` / `fi` | not equal | not equal | not equal |

Additional single-value measurements: `lower('ß') = 'ß'`, `upper('ß') = 'ß'` (**no** full case mapping —
Unicode would give `SS`), `lower('ẞ') = 'ß'`, `length(lower('İ')) = 1` in `C.utf8`. `VERIFIED`

**Three conclusions that constrain every policy:**

1. **"PostgreSQL `lower()`" is not "Unicode case folding".** It is not full (`ẞ`↛`ss`), it is not stable
   across final sigma (`ς`↛`σ`), and it does not do compatibility folding (`ﬁ`↛`fi`).
2. **It is not even the same function across locales** — `İ/i`, `Ä/ä`, `K/k` change verdict between `C`
   and `C.utf8`, and one of them (`K` U+212A) is a Unicode-identity folding that a `C` database does not do.
3. **It does not agree with the application's runtime** on `İ`. Any policy that relies on `lower()` inherits
   a documented divergence from JavaScript's `toLowerCase()`.

### 5.4 Enforcement and disagreement summary for `tags.name`

| | A | B | C |
|---|---|---|---|
| Enforceable by a unique index today, no new migration | only if the DB is `C` | **yes** (status quo) | no — needs 0002 |
| Depends on the environment | no | **yes** | no (if implemented in code) |
| Matches the current user-facing message literally | no (`Ä`) | **no** (`Ä` unless UTF-8 locale; `ς` always) | yes |
| Requires app-side normalisation | no | no | yes (shape i) |
| Requires existing-data validation | no | no (if the environment is unchanged) | **yes** |
| Reproducible outside one environment | yes | no | yes |

`OPEN OWNER DECISION` → **OD-COLL-01**.

---

## 6. Colleges uniqueness semantics (`colleges.name`)

### 6.1 What the object is — and how it differs from tags

| Property | `colleges` | `tags` | Consequence |
|---|---|---|---|
| Column | `name TEXT NOT NULL` (`schema.prisma:432`) | same | — |
| Other identity columns | `code TEXT` (**optional**, no unique) | `slug TEXT` (**unique**, `uq_tags_slug`) | a college has no mandatory machine key |
| Existing uniques | `uq_colleges_name_lower` **only** | `uq_tags_name_lower` **and** `uq_tags_slug` | for colleges, name is the **sole** uniqueness rule (the design doc calls this out for `uq_colleges_name_lower`: *"under the sole uniqueness rule (A2/A3: the plain unique was removed)"*, guard design `:202`) |
| Referenced by | `question_sources.college_id` (single FK) | `question_tags.tag_id` (M2M, PK `(question_id, tag_id)`) | merging differs fundamentally (§10.5) |
| Cardinality | small, curated, slowly changing | open vocabulary, grows during publishing | a bad merge is a *reference-data* event, not a content event |
| Optional `is_active` | yes | no | retiring a college is modelled; retiring a tag is not |
| App mapping | `COLLEGE_NAME_CONFLICT` (`db-errors.ts:73–77`) | `TAG_NAME_CONFLICT` (`:68–72`) | independent messages |

`VERIFIED` from `schema.prisma`, the migration, and `db-errors.ts`.

### 6.2 Why the two fields must be decided separately

1. **Different failure cost.** A duplicate tag pollutes a filter list; a duplicate college splits a
   question's provenance across two rows and makes "which questions came from Notre Dame College?"
   under-count. Provenance is a first-class product concept here (`question_sources`).
2. **Different data-entry path.** Colleges are reference data likely entered once from an official list;
   tags are typed repeatedly during publishing. Tags therefore have far more case-variant opportunities.
3. **Different normalisation exposure.** Bengali-medium institution names are commonly written in
   transliteration with inconsistent diacritics (`'Notre Dame College'` vs `'Notre-Dame College'`) and
   sometimes in Bengali script. Diacritic-insensitive matching (`unaccent`) is a plausible product want for
   colleges and not for tags — **and `unaccent` is not available in the measured build** (§5.2).
4. **Different remedies.** Because `colleges.name` is the *only* unique rule, a policy change there is a
   change to the entity's identity; for tags, `slug` remains a second, stable key.

### 6.3 Policies evaluated for `colleges.name`

The policy definitions are identical to §5.2; only the product consequences differ, so this table records
the differences rather than repeating every row.

| Aspect | A | B | C |
|---|---|---|---|
| Typical pairs that decide it | `'Dhaka College'`/`'dhaka college'` (equal under all three) | `'Ärger'`-style accents in a `C` DB would split | `'Notre-Dame'`/`'Notre Dame'` only if punctuation folding is chosen |
| Effect on the sole identity rule | accepts `'ÉCOLE'`/`'école'` as **different** colleges | depends on the environment, invisibly | defines the equivalence class explicitly |
| Existing-data risk | low | low if the environment is unchanged | **high** — colleges are curated, and a fold that merges two genuinely different institutions is a data-integrity event that cannot be auto-merged (§10.5) |
| Migration cost | new migration if pinned explicitly | none | new migration (0002, blocked) |
| Recommendation status | no recommendation; owner decision | no recommendation; owner decision | no recommendation; owner decision |

**One asymmetry worth the owner's attention:** because `uq_colleges_name_lower` is the *only* uniqueness
rule on the entity, silently weakening it (as a `C` restore does) removes the last defence against duplicate
colleges — whereas a weakened `uq_tags_name_lower` still leaves `uq_tags_slug`. `VERIFIED` (catalog/DDL
reading) — this is a difference in exposure, not a recommendation.

`OPEN OWNER DECISION` → **OD-COLL-02**.

---

## 7. Production database environment contract

### 7.1 The ten properties the brief requires

| # | Property | Where it lives | Measured on 16.2 | Provider-specific? | Proposed status |
|---|---|---|---|---|---|
| 1 | Database encoding | `pg_database.encoding` | UTF8 in every disposable database | no | **environment contract** |
| 2 | Locale provider | `pg_database.datlocprovider` (`"char"`) | `c` for libc databases; `d` never appears in `pg_database`, only in `pg_collation` | `c` libc, `i` ICU, `b` builtin (17+, `NOT TESTED`) | **environment contract** |
| 3 | `datcollate` | `pg_database.datcollate` | `C` or `C.utf8` depending on creation | no | **environment contract** |
| 4 | `datctype` | `pg_database.datctype` | equal to `datcollate` in both profiles | no | **environment contract** |
| 5 | ICU locale | `pg_database.daticulocale` | **NULL** for libc databases | only meaningful when provider = `i` | **environment contract, conditional** |
| 6 | Collation version | `pg_database.datcollversion` | **NULL** for every libc database measured **locally**, but `2.41` in the measured CI image (**Revision 2**, §8.7.1) | ICU databases carry an ICU version; a recent glibc reports its own | **recorded, never a pass condition** (§8.4) |
| 7 | Provider/version compatibility | combination of 2 + 6 | not verifiable for libc (both NULL) | yes | **recorded + warning** |
| 8 | Server major version | `current_setting('server_version_num')/10000` | `16` | no | **environment contract** |
| 9 | Determinism of collations in use | `pg_collation.collisdeterministic` | `true` for every collation present | non-deterministic requires ICU | **environment contract: must be `true`** (§7.5) |
| 10 | Collation objects actually used by approved indexes | `pg_index.indcollation` → `pg_collation` | OID 100 (`default`) for the three text keys; 0 elsewhere | no | **per-index expectation**, not the environment contract (§7.4) |

### 7.2 Four levels, and which one each property belongs to

| Level | What it is | Which of the ten properties govern it | Belongs to |
|---|---|---|---|
| **Database default** | the `pg_collation` row with `collprovider = 'd'`, whose meaning is `pg_database` | 1–9 | **production environment contract** |
| **Column-level collation** | `pg_attribute.attcollation`; today every column is unannotated, so every text column is the database default | 1–5 indirectly | schema (currently implicit) + contract |
| **Index-key collation** | `pg_index.indcollation[k]` | resolves to the default unless overridden | **per-index expectation** |
| **Expression-index collation** | `pg_index.indcollation` for a key with `indkey = 0` | inherited through `lower()`, so still the database default | **per-index expectation** |
| **Operator class** | `pg_index.indclass[k]` → `pg_opclass.opcname` | not affected by any of the ten; `text_ops` vs `text_pattern_ops` changes comparison *independently* of collation (Session 14 §7) | **per-index expectation** |

**The separation is the whole point.** Collation *identity* is an index fact; collation *meaning* is a
database fact. Session 14 measured that the two can be identical while the behaviour differs (§3, S14-2), and
this session measured the same divergence produced by a dump/restore rather than by `ALTER TABLE` (§9, E8).

### 7.3 Proposed contract text

```text
PRODUCTION DATABASE ENVIRONMENT CONTRACT — v1 (PROPOSED, NOT APPROVED)

C-1  Server: PostgreSQL major version = 16.
     (Chosen because 16 is the only major measured for this schema; see §7.6.)
C-2  Encoding: UTF8.
C-3  Locale provider: exactly one of {libc, icu}, recorded per environment.
C-4  If libc: datcollate and datctype are an approved locale pair, identical to each other,
     and recorded verbatim in the approved profile.
C-5  If ICU: datlocprovider = 'i', daticulocale is an approved ICU locale tag,
     datcollversion is the ICU version, and C-4 does not apply.
C-6  Every collation used by an approved index has collisdeterministic = true.
C-7  datcollversion / collversion are recorded. A NULL value is reported as "unknown";
     it is never interpreted as "matches".
C-8  No approved index key specifies a collation explicitly. Every text key resolves to
     the database default. (This is the current state of migration 0001: zero COLLATE clauses.)
C-9  Changing any of C-1…C-7 is an environment change, not a schema change, and requires
     a reviewed re-pin (§8.7) before the deployment gate may pass again.
```

`PROPOSED`. Nothing in C-1…C-9 is approved, and **C-4's locale value is deliberately blank**: choosing it is
`OPEN OWNER DECISION` OD-COLL-03, and §7.6 explains why this document refuses to fill it in.

### 7.4 What the contract must **not** contain

| Forbidden | Reason | Evidence |
|---|---|---|
| `collname = 'default'` as an approved value | it names a role, not a collation; its locale fields are all NULL | Session 14 §3.2, §4.1 |
| A hard-coded OID such as `100` or `950` | OIDs are per-database catalog identities; the same number means different things in two databases | Session 14 §4.1 |
| `collname = 'C'` as "the pinned collation" | a same-named collation can exist in another schema with a different OID | Session 14 §5.5 |
| A guess such as "production is Supabase, therefore `en_US.UTF-8`" | **no measurement exists**; the repository only shows `NEXT_PUBLIC_SUPABASE_URL` in `.env.example:15` and a pooled/direct URL pair in `docs/development/database-migrations.md:14–22`, which indicates *a managed provider with a pooler*, not a locale | `INCONCLUSIVE` |
| Anything derived from the disposable experiment | the disposable cluster's `C.utf8` was chosen to *create* a contrast, not because it is desirable | §7.6 |

### 7.5 Non-deterministic collations: an explicit prohibition, not an option

A non-deterministic collation changes the **equality relation** — `'A' = 'a'` becomes true everywhere, not
just in one index. That would:

- make `uq_tags_name_lower` (`lower(name)`) redundant or contradictory,
- change the meaning of every `=`/`WHERE`/`JOIN` on that column, including the FK comparisons in
  `question_sources` and `question_tags`,
- make `lower()`-based indexes still function but no longer be the guarantee.

It is also **untestable here**: `CREATE COLLATION … (provider = icu, deterministic = false)` fails with
`ERROR: ICU is not supported in this build`, and no ICU-capable PostgreSQL binary was obtainable
(`NOT TESTED`). The contract therefore sets `collisdeterministic = true` as a **hard requirement** (C-6) and
the guard must treat any other value as unsupported rather than analysing it. `PROPOSED`

### 7.6 Why this document refuses to name a production locale

| Reason | Detail |
|---|---|
| It has never been measured | neither CI nor production has been queried; `docs/development/database-migrations.md` records no locale, and the B2 review and the final deployment decision package contain **zero** occurrences of `collat` or `locale` (grep → 0 matches in both) `VERIFIED` |
| The choice is not technical | `C` gives reproducibility and ASCII-only folding; `en_US.UTF-8`/`C.utf8` gives Latin case folding and OS-dependent sort orders; ICU gives independence but needs a provider decision. Each is defensible; the trade-off is a product/ops judgement |
| Picking the experiment's value would be circular | `C.utf8` exists in the record only because Session 14 created it to demonstrate a difference |
| Availability is not desirability | the disposable build is `--without-icu` and had no locale archive beyond `C`/`C.utf8`; that says nothing about what production should be |

**What can be said with justification:** whichever locale is chosen, the *contract* must pin it and the
*fingerprint* must record it (§8), because the migration cannot. `OPEN OWNER DECISION` → **OD-COLL-03**.

**Revision 2 — what changed here, and what did not.** CI is now measured as `en_US.utf8` (§8.7). That is a fact
about the CI service container. It is **not** a fact about production, which remains unmeasured, and it is
**not** a locale selection. Nothing in the table above is invalidated: production's locale is still unknown,
still unmeasured, and still `OPEN OWNER DECISION` **OD-COLL-03**.

### 7.7 Revision 2 — the CI-versus-production semantic gap

CI is measured as a UTF-8 locale; production is not measured at all. That difference is not cosmetic, because
the two expression indexes take their equality from the **database default**:

| Index | Depends on | Why it matters |
|---|---|---|
| `uq_tags_name_lower` | `lower(tags.name)` under the database default collation | case-insensitive tag uniqueness |
| `uq_colleges_name_lower` | `lower(colleges.name)` under the database default collation, and it is the **only** uniqueness rule on the entity (§6.3) | case-insensitive college uniqueness |

Revision 1 measured that a `C`-locale database folds ASCII only while a `C.utf8` database folds Latin letters
(§5.3). The pairs where that difference was observed are below; they are **empirical findings about the
environments actually measured**, not a universal table of Unicode behaviour:

| Pair | Under the measured UTF-8 collation (`C.utf8`) | Under `C` (measured) |
|---|---|---|
| `Ä` / `ä` | equal | **distinct** |
| `ẞ` / `ß` | equal | **distinct** |
| `İ` / `i` | equal (PostgreSQL `lower('İ')` = `i`) | **distinct** |
| `K` (U+212A) / `k` | equal | **distinct** |

Hedges that must travel with that table: `en_US.utf8` and `C.utf8` were **not** compared directly
(`en_US.utf8` is not installed in the working environment); the `İ` case differs between PostgreSQL `lower()`
and JavaScript `toLowerCase()` (§5.3); and the **fold behaviour was not re-measured inside the CI container** —
only the fingerprint was observed there. `NOT TESTED` for the direct CI fold.

**The consequence, stated plainly.** A passing index-integrity test in CI proves that the six indexes are
**structurally** preserved *under the measured CI environment*. It does **not** establish that a production
database with a different locale enforces the **same uniqueness**. A `C`-locale production database accepts
`'Ärger'` and `'ärger'` as two distinct tags where a UTF-8 locale rejects the duplicate — measured on the
**committed schema** (§14.2 S14-2) and reproduced by a plain `pg_dump`/restore into `C` (§9, E8).

This is the central evidence for **OD-COLL-03**, and the reason CI evidence cannot answer it: CI can only
testify about CI.

---

## 8. Database fingerprint proposal

### 8.1 Field-by-field evaluation of the Session 14 proposal

| Field | Exists on 16.2 | Available on 15? | Nullable? | Provider-specific? | Verdict |
|---|---|---|---|---|---|
| `pg_database.encoding` | yes (int) | documented, `NOT TESTED` | no | no | **keep** — compare via `pg_encoding_to_char()` |
| `pg_database.datlocprovider` (`"char"`) | yes (`c`) | documented as added in 15, `NOT TESTED` | no (but the set of values is version-dependent) | reveals libc vs ICU vs builtin | **keep** — normalise to a word (`libc`/`icu`/`builtin`), never compare the raw `"char"` |
| `pg_database.datcollate` (text) | yes | documented, `NOT TESTED` | **yes** — NULL for ICU databases in some versions | libc-specific | **keep, conditional** — NULL for ICU must be an expected value, not a failure |
| `pg_database.datctype` (text) | yes | documented, `NOT TESTED` | **yes**, same reason | libc-specific | **keep, conditional** — `lower()`/`upper()` follow ctype, so this field is *not* redundant with `datcollate` |
| `pg_database.daticulocale` (text) | yes (**NULL** for both measured libc databases) | documented as added in 15, `NOT TESTED` | **yes, routinely** | ICU-only | **keep** — must render as an explicit NULL sentinel |
| `pg_database.datcollversion` (text) | yes (**NULL** locally; `2.41` in the measured CI image — Revision 2, §8.7.1) | documented, `NOT TESTED` | **conditionally** — NULL where the libc does not expose a version, populated where it does | ICU databases carry the ICU version; a recent glibc reports its own | **keep as recorded evidence, never as a pass condition** (§8.4) |

`VERIFIED` for 16.2 column existence, values and NULLability. **PostgreSQL 15, 17 and 18 are `NOT TESTED`**:
no binary for any of them could be obtained in this environment (Session 14 §11.1), so their column presence,
names and NULL behaviour are documentation-based only and must be confirmed before the guard relies on them.

**New in this session:** `pg_database_collation_actual_version(oid)` **exists** on 16.2 and returns `NULL` for
both a `C` and a `C.utf8` libc database — i.e. the database-level equivalent of
`pg_collation_actual_version()` is also unable to verify a libc locale. `VERIFIED`

### 8.2 Fields the brief asks about that are *not* in the Session 14 list

| Question | Answer | Rationale |
|---|---|---|
| Should the fingerprint include the **server major version**? | **Yes, as a separate block.** | A major upgrade can change `pg_collation` contents, provider support (`builtin` provider is 17+), and the exact `lower()` implementation via a different ICU/libc build. Keeping it separate means an "environment changed" message can say *which* dimension changed. `PROPOSED` |
| Should it include the **actual collation objects used by approved indexes**? | **Yes, but as a second, per-index block, not inside the database fingerprint.** | The database fingerprint answers "what does *default* mean here"; the per-index block answers "is each key still attached to the expected object". Merging them would make one failure ambiguous between a locale change and an index change — the exact confusion §11 exists to prevent. `PROPOSED` |
| Should it include `datname`, `oid`, timestamps or the `version()` string? | **No.** | `datname`/`oid` are environment identity, not semantics; `version()` includes the build string and patch level, so it would fail on every minor upgrade for no semantic reason. Use `server_version_num / 10000`. `PROPOSED` |
| Should it include `server_encoding`? | It is the same value as `encoding`; use one. | `pg_encoding_to_char(pg_database.encoding)`. `PROPOSED` |
| Should it include the current `search_path`, `TimeZone`, `default_text_search_config`? | **No.** | No effect on uniqueness or collation resolution. Out of scope. `PROPOSED` |

### 8.3 Canonical representation

Two blocks, fixed order, fixed keys, explicit NULL sentinel `-`, values rejected if they contain the
delimiters (`;`, newline) so the string can never be ambiguous:

```text
collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=C.utf8;ctype=C.utf8;iculocale=-;collversion=-
```

| Design choice | Reason |
|---|---|
| Version prefix `collation-fingerprint/v1` | the *comparison rules* are versioned with the string; a future field addition becomes `/v2`, not a silent change |
| `provider` as a word (`libc`/`icu`/`builtin`) | the raw `"char"` (`c`/`i`/`b`) is terse and easy to mis-map; the word is reviewable in a diff |
| `pg=<major>` inside the string | makes "same locale, different major" a distinguishable fingerprint rather than a surprise |
| `-` for NULL | distinguishes `NULL` from the empty string, which matters for `daticulocale` and `datcollversion` |
| ordered keys, `;` separated | deterministic byte-for-byte comparison; no JSON key-order or whitespace ambiguity |
| optional `sha256:` prefix form | lets CI store a short token while the full string stays available for diagnostics |

**A NULL in `collversion` is a fact about the environment, not a match.** Two databases with identical locale
but different glibc builds produce **identical** fingerprints, because both are `-`. This is the honest limit
of catalog evidence and it is why C-7 says "recorded, never a pass condition". `VERIFIED` (both NULL on 16.2)

### 8.4 Should a fingerprint change fail the gate automatically?

| Change | Automatic gate failure? | Reason | Label |
|---|---|---|---|
| `pg` major differs | **yes** | unsupported-version and untested-catalog risk | `PROPOSED` |
| `enc` differs | **yes** | could alter byte semantics of `lower()` and of the index | `PROPOSED` |
| `provider` differs | **yes** | this is the "correct locale name, different provider" case (§9.2) | `PROPOSED` |
| `collate`/`ctype` differ | **yes** | directly changes the guarantee (§9 E8) | `PROPOSED` |
| `iculocale` differs | **yes** | same, for ICU profiles | `PROPOSED` |
| `collversion` differs, recorded on both sides | **yes** — reviewed re-pin required | a locale library upgrade can change folding and ordering; PostgreSQL itself refuses `REFRESH VERSION` in some cases (Session 14 §10.7) | `PROPOSED` |
| `collversion` NULL on one or both sides | **no automatic failure; a mandatory warning line** | there is nothing to compare; failing would block every libc deployment for ever, passing silently would be a false assurance | `PROPOSED` |

So: **a change in a *known* fingerprint field fails the gate; an *unknown* field produces a warning that a
human must read.** Neither is allowed to pass silently, and neither auto-updates the approved value.

### 8.5 What the fingerprint does not cover

| Gap | Consequence | Label |
|---|---|---|
| A glibc/ICU upgrade that leaves `datcollversion` NULL | undetectable from the catalog — **and only where it is NULL**: the measured CI image populates `2.41` (Revision 2, §8.7.1) | `VERIFIED (absent locally)` / `VERIFIED (present in CI)` |
| A dump/restore into a database whose *name* differs but whose locale is identical | fingerprint equal; correctly no failure | `PROPOSED` |
| A restored database whose locale differs | **fingerprint differs → gate fails**, even though every index is structurally identical | `PROPOSED` — this is the E8 scenario |
| Non-deterministic collations appearing later | caught separately by C-6, not by the fingerprint | `PROPOSED` |

### 8.7 Revision 2 — the measured CI profile (Session 18)

Revision 1 recorded the CI profile as `INCONCLUSIVE`. It is now **observed**. Every value below was read from
the CI service containers themselves, not inferred from an image definition and not taken from a local replica.

| Item | Value |
|---|---|
| CI run | `45546248909` — success |
| Check run | `138976563830` (`G-3 full-schema gate (node 22, postgres 16)`) |
| Commit measured | `0aae1368a16cf6447cb7a01afc7554a9fdab4bc0` |
| PostgreSQL | `16.16 (Debian 16.16-1.pgdg13+1)` — the **Debian 13 (trixie)** variant, not the `bookworm` variant Session 16 read |
| Databases measured | `g3f_main` (port 5432) and `g3f_replay` (port 5434) — **not** the image's default `postgres` database |
| Measurement | `docs/database/g1-spike/option-c/g3-full/collation-probe.sh`, step 11 of the `g3-full` job: read-only, after the gate, before the artifact upload |
| Retrieval | `GET /repos/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/check-runs/138976563830/annotations` — two `notice` annotations. Job logs and the artifact archive were unreachable from the working environment, which is why the values were published as annotations |

**`g3f_main`** and **`g3f_replay`**, byte-identical:

```text
collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=en_US.utf8;ctype=en_US.utf8;iculocale=-;collversion=2.41
```

| Field | Measured CI value | Revision 1 expectation |
|---|---|---|
| `pg` | `16` | `16` |
| `enc` | `UTF8` | `UTF8` |
| `provider` (`datlocprovider`) | `libc` (`c`) | `libc` |
| `datcollate` | `en_US.utf8` | `en_US.utf8` |
| `datctype` | `en_US.utf8` | `en_US.utf8` |
| `daticulocale` | `-` (NULL) | NULL |
| `datcollversion` | **`2.41`** | **NULL — wrong** |

Three statuses that must not be blurred:

| Thing | Status |
|---|---|
| The CI environment profile | **OBSERVED** — this section |
| The production environment profile | **UNKNOWN** — never measured; no production access is permitted |
| A production locale selection | **NOT DECIDED** — OD-COLL-03 **OPEN** |

#### 8.7.1 Correction — libc `datcollversion` is not always NULL

Revision 1 (§8.4, §15.3 L4) and Session 16 (§8.1) treated `datcollversion` as effectively NULL for libc and
therefore without discriminating power. **That generalisation is wrong**, and it is corrected here rather than
edited away.

| Point | Detail |
|---|---|
| PostgreSQL can expose a version for libc | `pg_database.datcollversion` is populated when the C library exposes its locale version; `2.41` is consistent with glibc 2.41, which matches the observed Debian 13 image |
| Why the local runs showed NULL | the disposable clusters ran against an older libc that does not expose a version (§15.2 E3). That was a property of *that* build, not of libc in general |
| Consequence | an image change (e.g. glibc 2.41 → 2.42) can change the fingerprint and is therefore **detectable** in CI |
| What a changed version means | a **review trigger**, not proof of index corruption: it says the collation implementation may have changed, not that any index is wrong |
| How NULL must be handled | **conditionally**, on the value the environment actually reports. The "unknown" branch stays for builds that report NULL, and must never be assumed merely because `provider = libc` |
| What must not be generalised | this is one image, one PostgreSQL version, one libc. Other distributions, libc builds and majors may report NULL — `NOT TESTED` everywhere else |

---

## 9. Environment drift and failure policy

### 9.1 The four response types

| Response | Meaning | Who may authorise |
|---|---|---|
| **R-FAIL** | the gate refuses; exit non-zero; deployment blocked | nobody — it is automatic |
| **R-WARN** | the gate passes but prints a mandatory warning that must be recorded in the deployment log | nobody — automatic, but requires a human acknowledgement field in the log |
| **R-REPIN** | the approved expectation is changed **by a reviewed commit**, after which the gate passes | owner + reviewer; never the tool |
| **R-ALLOW** | the situation is an explicitly permitted environment profile, listed in advance | owner, in the profile document |

**Recommended default: `R-FAIL`.** The guard is a control, not a convenience; a control that adapts to the
environment it is supposed to police is not a control. `PROPOSED`

### 9.2 The ten scenarios

| # | Scenario | Detected by | Class | Response | Rationale / evidence |
|---|---|---|---|---|---|
| 1 | Database has the **wrong default collation** | fingerprint `collate`/`ctype` ≠ approved | **environment** | **R-FAIL** | E8: measured that the same index enforces different uniqueness; a structurally perfect schema is deployed against the wrong semantics |
| 2 | **Correct locale name, different provider** (e.g. `C.utf8` via ICU vs via libc) | fingerprint `provider` (and `iculocale`) | **environment** | **R-FAIL** | provider decides who implements `lower()`; the name does not. `PROPOSED`, provider-level difference `NOT TESTED` (no ICU) |
| 3 | **Collation version changes** | `datcollversion` recorded vs actual, or approved vs current | **environment** | **R-WARN** when either side is NULL, **R-REPIN** when both are non-NULL and differ | Session 14 §10.7 measured NULL **locally**; the CI image reports `2.41` (Revision 2, §8.7.1), so in CI the R-REPIN branch is the reachable one |
| 4 | **A column collation changes** | `pg_attribute.attcollation` vs expectation; for a coordinated change, the pinned expectation (§11.3) | **schema** (with an environment cause) | **R-FAIL** | Session 14 §5.7: the change is accepted, dependent indexes are rebuilt, and the relationship rule still passes — only the pinned expectation catches it |
| 5 | **An index collation changes** | `pg_index.indcollation[k]` vs resolved expectation | **schema** | **R-FAIL** | deterministic identity comparison, no judgement needed |
| 6 | **An expression-index collation changes** | same, for keys with `indkey = 0` | **schema** | **R-FAIL** | text cannot show it (Session 14 §6); the catalog can |
| 7 | **Database restored into a different locale environment** | fingerprint alone — every index is byte-identical | **environment** | **R-FAIL** | **measured this session (E8)**: dump emits no `COLLATE`, restore succeeds, `indcollation = 100` in both, uniqueness silently weakens |
| 8 | **Upgraded to a different PostgreSQL major** | fingerprint `pg` | **environment** | **R-FAIL** until the major is explicitly approved (`R-REPIN` of the profile) | 15/17/18 are `NOT TESTED`; an unverified catalog is not a pass |
| 9 | **A collation becomes unavailable** (dropped, or a locale no longer installed) | resolution of the expectation fails; `pg_collation` row missing | **both** | **R-FAIL** | the index cannot survive a drop while it depends on it (Session 14 §5.6), so this is mostly a restore/upgrade symptom; fail closed rather than guess |
| 10 | **The guard cannot resolve an expectation symbolically** (no row, two rows, unknown kind, failed cast) | resolver returns `MISSING` / `AMBIGUOUS` / `UNKNOWN` | **guard** | **R-FAIL** | Session 14 §12.3; an unresolvable expectation is never "probably fine" |

### 9.3 Schema-integrity failure vs environment-policy failure

These must never be reported as the same thing, because they have different remedies:

| | Schema-integrity failure | Environment-policy failure |
|---|---|---|
| What it means | the database does not contain the approved schema | the database contains the approved schema but runs on an unapproved environment |
| Examples | index missing, wrong keys, wrong predicate, changed collation, `NULLS NOT DISTINCT` dropped | wrong `datcollate`, wrong provider, wrong major, restore into another locale |
| Who fixes it | migration author / reviewer | operations / owner (or a reviewed re-pin if the new environment is accepted) |
| Gate behaviour | fail; no re-pin path (the schema must be corrected) | fail; **re-pin is a review action on the profile, not on the schema** |
| Measured case | M10 (`COLLATE "C"` inside the index) | E8 (identical schema, different database) |

**A schema can be structurally correct and environmentally non-compliant — measured (E8).** That single
measurement is the argument for two assertion groups rather than one.

### 9.4 Why there is no "auto re-pin"

If the guard rewrote its expectation when the environment changed, the control would ratchet to whatever
environment it last saw, and the E8 restore would become *self-certifying*: the weakened database would pass
on its next run. Therefore re-pinning is a **commit** to the expectation file, reviewed like any other
change, and the guard only ever reads it. `PROPOSED`

---

## 10. Existing-data validation strategy

**No data was examined, modified, merged or cleaned in this session.** The validation below is a **process
specification** with read-only SQL sketches. Every query is `SELECT`-only; none was executed against any
database holding real data. `PROPOSED`

### 10.1 The rule

> No uniqueness semantics may change until a **validation report** has been produced from a read-only
> snapshot of the target database and reviewed by the owner. If the report finds collisions, the policy
> change is blocked until a separate, approved data-remediation plan exists.

### 10.2 Step 1 — baseline inventory (read-only)

```sql
-- row counts and the shape of the problem
SELECT 'tags' AS t, count(*) AS rows, count(DISTINCT lower(name)) AS distinct_lower FROM tags
UNION ALL
SELECT 'colleges', count(*), count(DISTINCT lower(name)) FROM colleges;
```

A difference between the two columns proves that duplicates **already** exist under the *current* semantics —
which would itself be a finding, because the current environment is supposed to prevent them. `PROPOSED`

### 10.3 Step 2 — collisions under each candidate policy (read-only)

```sql
-- Policy A (ASCII-only) — what a C-locale database enforces today
SELECT lower(name) COLLATE "C" AS key, count(*) FROM tags GROUP BY 1 HAVING count(*) > 1;

-- Policy B — whatever this database's default does
SELECT lower(name) AS key, count(*) FROM tags GROUP BY 1 HAVING count(*) > 1;

-- Policy C — an explicit fold (illustrative; NFC only, folding is a placeholder for the chosen spec)
SELECT normalize(lower(name), NFC) AS key, count(*) FROM tags GROUP BY 1 HAVING count(*) > 1;
```

Each query is a *counterfactual*: if it returns rows, that policy cannot be adopted without remediation.
`PROPOSED`

### 10.4 Step 3 — the Unicode questions that decide the risk

| Question | Query shape | What a hit means |
|---|---|---|
| Are there NFC/NFD variants of the same name? | `WHERE name <> normalize(name, NFC)` | a normalisation policy would merge two rows that look identical in the UI — often the *same* college entered twice |
| Would the **candidate** policy create collisions that do not exist today? | pair-wise comparison of the current key against the candidate key (below) | these rows are the ones a broader fold would reject — the actual remediation scope |
| Are there full-folding collisions (`ẞ`/`ss`, `ς`/`σ`)? | equality under the chosen fold, not under `lower()` | the rows most likely to be *genuinely different*, so the ones most dangerous to merge |
| Do any names differ only by whitespace or punctuation? | `btrim`, `regexp_replace` | a normalisation scope question for the owner |

The pair-wise form, which is the one that decides the remediation scope:

```sql
-- rows that are DISTINCT under the key in force today but EQUAL under the candidate key
SELECT a.id AS a_id, b.id AS b_id, a.name AS a_name, b.name AS b_name
FROM tags a
JOIN tags b ON a.id < b.id
WHERE lower(a.name) <> lower(b.name)                       -- distinct today (current default)
  AND <candidate_fold>(a.name) = <candidate_fold>(b.name); -- equal under the candidate policy
```

**Direction of risk, stated precisely.** Choosing a *broader* fold (e.g. `C` → `C.utf8`, or `lower()` →
Unicode full folding) can make existing rows collide, so the new unique index cannot be built until they are
resolved. Choosing a *narrower* fold (e.g. `C.utf8` → `C`) creates no new collisions, but **silently weakens**
the guarantee, which is exactly the E8 failure mode — it needs no data validation and is therefore the more
dangerous direction to adopt by accident. `PROPOSED`

`PROPOSED`; none of these were run against real data (`NOT TESTED`).

**Measured caution:** `normalize(name, NFC)` and `length()` both exist and behave as expected on 16.2
(`normalize('e'+U+0301, NFC)` → `é`, length 1; NFD length 2) — so Step 3 is implementable. `VERIFIED`

### 10.5 Step 4 — merge feasibility and referential integrity

| Object | Reference path | Merge operation required | Risk |
|---|---|---|---|
| `tags` | `question_tags(question_id, tag_id)` PK `(question_id, tag_id)`, `ON DELETE CASCADE` | insert the missing `(question_id, survivor_id)` pairs, then delete the loser; the PK can collide, so it must be `ON CONFLICT DO NOTHING` | a naive `UPDATE question_tags SET tag_id = …` violates the PK; a naive `DELETE` cascades and **silently removes question–tag links** |
| `colleges` | `question_sources.college_id` (single FK, nullable) | repoint `question_sources.college_id` to the survivor | `question_sources` has `uq_question_sources_identity` (5 keys, `NULLS NOT DISTINCT`), so repointing two sources onto one college can **create a duplicate attribution** that the unique index will reject |

**Therefore: no automatic merge, ever.** Both merge paths can fail mid-way or silently destroy links, and a
`question_tags` cascade is easy to trigger by accident. `VERIFIED` (schema reading) / `PROPOSED` (procedure)

### 10.6 Step 5 — can the new index be created without data loss?

Order matters, and each step must be a separate reviewed operation:

1. Produce the validation report (§10.2–§10.4) — read-only.
2. If collisions exist: an approved remediation plan (owner decision), executed and verified separately.
3. Only then create the new unique index — `CREATE UNIQUE INDEX CONCURRENTLY` if the table is live, then
   `ALTER TABLE … ADD CONSTRAINT … USING INDEX` to make it the durable rule.
4. Do **not** drop the old index in the same step: keep both until the new one is `indisvalid = true` and the
   behaviour has been observed for a release.

A new unique index on existing data **cannot be created** while duplicates exist — PostgreSQL will reject it,
which is the desired fail-closed behaviour, but it means the migration and the remediation cannot be one
atomic step. `PROPOSED`

### 10.7 What validation must never do

- Never `DELETE`/`UPDATE` from a validation script.
- Never merge two records because their normalised keys collide — collision is a *question for a human*, not
  an instruction.
- Never run against production or staging in this phase (no access is permitted).
- Never be the same artefact as the remediation.

`OPEN OWNER DECISION` → **OD-COLL-06** (what validation is mandatory before any policy change).

---

## 11. Index guard architecture implications

### 11.1 The two assertion groups

| Group | Assertions | Source of truth | Can it be checked from the schema alone? |
|---|---|---|---|
| **A. Index structural integrity** | existence; unique/non-unique; key count and order; expression identity; predicate; operator class; **collation per key**; `NULLS NOT DISTINCT`; `indisvalid`/`indisready`/`indislive` | `pg_index`, `pg_class`, `pg_attribute`, `pg_opclass`, resolved `pg_collation` | yes, against the database's own catalog |
| **B. Environment integrity** | database fingerprint (§8); approved provider/locale profile; supported major version; collation determinism; collation version status | `pg_database`, `pg_collation`, `server_version_num` | no — it is a property of the *server*, not of the objects the migration defines |

### 11.2 Why they must be separate assertions

1. **They fail for different reasons and have different remedies** (§9.3). Collapsing them produces a message
   like "index definition wrong" for a database that is running on the wrong locale.
2. **One can be true while the other is false — measured.** E8: after a dump/restore, group A is *identical*
   (same OIDs, same rendering, same `indcollation = 100`) and group B is *different*. A single assertion that
   compares "collation" cannot distinguish "the index was tampered with" from "the database moved".
3. **The existing controls are already split this way**: G-3's shape assertion (`g3-full/run.sh:107–126`)
   counts objects, the catalog guard (`guard.py catalog`) checks FKs, and `deploy-gate.sh verify|deploy`
   (`scripts/db/deploy-gate.sh:1–10`, exit codes 0/1/2) checks migration *history*. Adding a structural
   index assertion and an environment fingerprint as two named checks fits the established pattern; merging
   them into one "collation check" would be a new, opaque control.
4. **Re-pinning must be possible for B and impossible for A.** The owner may legitimately approve a new
   environment profile; the owner may never "approve" an index that lost a key. Two groups make that
   asymmetry enforceable. `PROPOSED`

### 11.3 A schema can be structurally correct but environmentally non-compliant — and here is the proof

| | Group A (structure) | Group B (environment) | Enforced uniqueness |
|---|---|---|---|
| Source database (`C.utf8`) | pass | pass against a `C.utf8` profile | `'Ärger'`/`'ärger'` rejected `VERIFIED` |
| Restored copy (`C`) | **pass — identical** | **fail** against the same profile | both accepted (`rows=2`) `VERIFIED` |
| Column-collation change (Session 14 §5.7) | **fail** under a pinned expectation; **pass** under a relationship-only rule | pass | weakened, silently |

The third row is the one that shapes the contract: **the relationship rule (`indcollation = attcollation`) is
necessary but not sufficient**, because a coordinated change moves both sides together.

### 11.4 Interaction with the existing controls (no change proposed to any of them)

| Control | What it would see in the E8 restore | What it would see in the Session 14 column change |
|---|---|---|
| `g3-full/run.sh` shape (`:107–126`) | pass — six index names present | pass — names unchanged |
| `guard.py catalog` (FK-only) | pass | pass |
| `guard.py history` / `deploy-gate.sh verify` | pass — the migration file is untouched | pass |
| `tests/integration/.../unique-conflicts.test.ts` | pass — it reads the migration *file*, not a database | pass |
| **Proposed group A** | pass | **fail** (pinned expectation) |
| **Proposed group B** | **fail** (fingerprint) | pass |

No existing control was modified; the table records what each *would* observe, so the gap is explicit.

### 11.5 Rules the guard must obey (restating Session 14 §12.3 as architecture)

| Rule | Consequence |
|---|---|
| Never compare the string `default` | resolve `collprovider = 'd'` to an OID in the target database |
| Never store a literal OID in repository text | expectations are symbolic |
| Never auto re-pin on drift | re-pin is a reviewed commit (§9.4) |
| Never treat an unresolvable expectation as a pass | `MISSING`/`AMBIGUOUS`/`UNKNOWN` all fail |
| Never treat `collversion = NULL` as a match | report `unknown` |
| Never compare across databases | all resolution is local to the database under test |
| Never conflate A and B in the output | two named assertions, two messages, one exit code |

`PROPOSED`. Implementing any of this requires a decision that has not been taken (R2 is only
**PARTIALLY RESOLVED**).

---

## 12. Owner decision register

**Every item below is `OPEN OWNER DECISION`.** A "recommendation" column entry is a technical
recommendation offered for the owner's consideration — it is **not** an approval, and this document does not
adopt it. Where a recommendation is given it is limited to questions that have a defensible technical answer
(fingerprint fields, failure policy); where the question is a product or infrastructure choice (tags,
colleges, production locale) the recommendation is deliberately absent or explicitly non-committal.

| ID | Question | Options | Evidence | Recommendation | Owner decision | Consequence if unresolved |
|---|---|---|---|---|---|---|
| **OD-COLL-01** | Which case-insensitivity semantics apply to `tags.name`? | **A** ASCII-only · **B** locale-dependent `lower()` (status quo) · **C** explicit Unicode folding (fold + NFC, needs 0002) · **D** alternative (drop name uniqueness / app-only / ICU non-deterministic) | §5.2–§5.4; measured pair table §5.3 (`Ä/ä`, `ẞ/ß`, `ς/σ`, `İ/i`, `K`/`k`); user-facing message `db-errors.ts:70`; G-3 case 30 is ASCII-only (`enforce.sql:632–645`) | **None.** B is the only option that needs no new migration and no data validation; C is the only one that makes the message at `db-errors.ts:70` literally true; A is the only one reproducible in any environment. That is a cost/benefit statement, **not** a product decision | **OPEN** | `uq_tags_name_lower`'s meaning stays an accident of the database; the environment contract cannot be finalised; the guard cannot pin a per-key expectation with confidence; the user-facing message may be false for non-ASCII names |
| **OD-COLL-02** | Which case-insensitivity semantics apply to `colleges.name`? | same four options, evaluated independently | §6.3; `uq_colleges_name_lower` is the **sole** uniqueness rule on the entity (guard design `:202`); references via `question_sources.college_id`; merge risk §10.5 | **None.** Decided separately from OD-COLL-01 because the exposure differs: colleges have no second key, and a merge splits provenance | **OPEN** | duplicate institutions remain possible or become impossible depending on environment; provenance queries can under-count; a future merge cannot be planned |
| **OD-COLL-03** | What is the approved production database locale/provider profile? | libc `C` · libc `C.utf8` (or another specific locale) · ICU with an explicit locale · no pin (explicitly accept environment-dependent semantics) | §7.1–§7.6; measured that `default` has no locale fields; measured that `C` vs `C.utf8` changes uniqueness (§9 E8); **Revision 2: the CI locale is now measured (§8.7); no production locale has ever been measured**; B2 review and decision package contain zero mentions of locale (grep) | **Not given.** This document refuses to name a locale (§7.6). The *requirement* that a profile be pinned is recommended; the value is not | **OPEN** | `R2` stays PARTIALLY RESOLVED; the fingerprint has no approved value; environment drift cannot be detected; the deployment gate cannot include group B |
| **OD-COLL-04** | Which fields constitute the database fingerprint, and in what canonical form? | Session 14 six fields · six + `pg` major (proposed) · six + `pg` + per-index collation objects inside one string · something else | §8.1 (per-field availability/NULLability on 16.2) · §8.2 (what to add and what to exclude) · §8.3 (canonical string) · **Revision 2**: the CI image reports `datcollversion=2.41`, so the field does discriminate in at least one measured environment (§8.7.1) | **Recommended for consideration:** the six fields **plus** `pg` major, as a separate block from per-index expectations, in the `collation-fingerprint/v1;…` form with `-` for NULL and a version prefix (§8.2, §8.3). Justified by the measurement that `datcollversion` is NULL locally, so the string must be able to say "unknown" — **Revision 2**: it is *not* NULL in the CI image, so a populated version must also have a representation (§8.7.1) | **OPEN** | CI cannot compare environments; a restore into a different locale stays undetectable (§9.2 #7) |
| **OD-COLL-05** | What is the failure policy when the environment drifts? | R-FAIL everything · R-FAIL unknown-field changes and R-WARN on NULL versions · R-WARN everything · R-ALLOW per listed profile · auto re-pin | §9.1–§9.4; measured E8 (restore changes uniqueness silently); Session 14 §10.7 (`datcollversion` NULL **locally**; `REFRESH VERSION` refused) · **Revision 2**: CI reports `2.41`, so the R-REPIN branch is reachable there (§8.7.1) | **Recommended for consideration:** fail closed (R-FAIL) for every *known* field change and for every unresolvable expectation; **R-WARN** only where the catalog genuinely cannot distinguish (NULL `collversion`); **R-REPIN** only via a reviewed expectation commit; **never** auto re-pin (§9.4) | **OPEN** | the guard has no defined behaviour on drift; a future restore could pass the gate; or, if over-strict, every libc deployment blocks on an uncomparable field |
| **OD-COLL-06** | What existing-data validation is mandatory before any uniqueness change? | none (rely on the new index to fail on duplicates) · read-only report first · report + owner-reviewed remediation plan · report + remediation + concurrent index build | §10; measured that `normalize()`/`length()` exist so the report is implementable; merge hazards in `question_tags` (PK collision, cascade) and `question_sources` (`NULLS NOT DISTINCT` duplicates) | **Recommended for consideration:** report first, always read-only; remediation only as a separate approved step; never automatic merge (§10.6) | **OPEN** | a policy change could be attempted against data that cannot satisfy it — the index creation fails (safe) or, worse, a naive merge cascades and destroys question–tag links |

### 12.1 What "OPEN" means operationally

- No file may be changed on the strength of this document alone.
- The fingerprint has **no approved value**; the guard has **no approved expectation file**.
- OD-COLL-01…06 are **new**; they do not modify OD-17, OD-21 or OD-NM-1, which remain open and separate.
- Recording an owner decision requires an explicit owner statement plus a reviewed document change; it cannot
  be inferred from a recommendation in this table.

---

## 13. Blocking dependencies

| Blocked item | Blocked by | Why | What it would take |
|---|---|---|---|
| Finalising the guard's per-key collation expectations | OD-COLL-03 (profile), OD-COLL-01/02 (what the keys are supposed to mean) | the expectation is `database_default`, whose meaning *is* the unapproved profile | an approved profile + a decision on both names |
| Implementing the environment fingerprint check (group B) | OD-COLL-03, OD-COLL-04, OD-COLL-05 | no value, no canonical form, no failure policy | three owner decisions, then R2 can close |
| Closing `R2` | same as above, plus OD-COLL-06 where data exists | R2 is PARTIALLY RESOLVED precisely because the environment is unmeasured | decisions + a measurement of CI's locale |
| Implementing the structural guard (group A) | `R2` (only partially resolved) and the owner's authorisation | Session 14 established the rule; implementation is not authorised | explicit authorisation after R2 closes |
| Any policy change on tags/colleges | OD-COLL-01/02 and OD-COLL-06 | a semantics change without validation can destroy data | decision + validation report |
| Migration 0002 | **DO NOT COMMIT** (standing) and OD-COLL-01/02/06 | any change to the two indexes needs a migration, which is currently prohibited | removal of the 0002 prohibition by the owner, on its own merits |
| Production deployment of 0001 | **B2 WITHHELD**; V-1…V-5 incomplete | unrelated to collation, and unaffected by this document | the existing B2 conditions |
| G-2 | **DEFERRED** (standing) | unrelated | the existing G-2 conditions |

**Nothing in this document unblocks anything.** It names the decisions that would.

---

## 14. Recommendations and next steps

### 14.1 Recommendations (all `PROPOSED`, none approved)

| # | Recommendation | Justification | Owner action needed |
|---|---|---|---|
| P1 | Pin a production environment profile (§7.3), including a locale *value* | measured: the migration cannot express it, and the environment silently changes the guarantee | OD-COLL-03 |
| P2 | Adopt the versioned fingerprint string of §8.3, with `pg` major inside it | measured: six fields suffice to distinguish the environments actually observed, and NULLs are common and must be representable | OD-COLL-04 |
| P3 | Fail closed on every known-field change; warn only on uncomparable NULL versions | measured **locally**: `datcollversion` is NULL there, so a strict rule would block everything while a lenient one would assure nothing. **Revision 2:** the CI image reports `2.41`, so in CI the strict branch applies and the lenient one is narrower than assumed (§8.7.1) | OD-COLL-05 |
| P4 | Keep structural and environmental assertions separate in the guard, with two messages | measured: E8 shows A-pass/B-fail with identical structure | part of the guard authorisation |
| P5 | Require a read-only validation report before any policy change | the merge hazards in §10.5 are real and asymmetric | OD-COLL-06 |
| P6 | Add non-ASCII cases to the enforcement suite (`Ä/ä`, `ẞ/ß`, `ς/σ`, `İ/i`) so `G-3`'s result is meaningful for whichever policy is chosen | measured: every existing case is ASCII, so `G-3 PASSED` cannot distinguish policies | future task T5 |

### 14.2 Future tasks — documented, not performed

| # | Task | Why it is a future task | Blocked by |
|---|---|---|---|
| T1 | Measure the CI service's actual `pg_database` row (one read-only query in the G-3 workflow) | **DONE — Session 18.** CI is measured as `libc` / `en_US.utf8` / glibc `2.41` on PostgreSQL 16.16 (§8.7). It still does not decide whether CI represents *production* | **CLOSED** — evidence in §8.7 |
| T2 | Measure the staging/production environment's `pg_database` row | no production or staging access is permitted | owner-supplied output or an approved read-only probe |
| T3 | Write the expectation file (`collation` per key) in the guard's data format | implementation is not authorised (R2 partial) | OD-COLL-03, R2 closure |
| T4 | Implement group A (structural) and group B (fingerprint) as two named assertions | same | R2 closure + authorisation |
| T5 | Extend `enforce.sql` and the integration tests with non-ASCII pairs | test changes are out of scope this session | OD-COLL-01/02 |
| T6 | Produce the validation report (§10.2–§10.4) against a copy of real data | requires data access and a read-only snapshot | OD-COLL-06 |
| T7 | If a policy change is chosen: design migration 0002 (§10.6 order) | **0002 DO NOT COMMIT** stands | OD-COLL-01/02/06 and removal of the prohibition |
| T8 | Fix the stale test-path reference at `db-errors.ts:63` | a one-line comment fix, unrelated to behaviour | any authorised code-change session |

**T1 is CLOSED (Session 18).** Both CI databases were measured and their fingerprints read back through the
Check Runs annotations API: run `45546248909`, check run `138976563830`, commit
`0aae1368a16cf6447cb7a01afc7554a9fdab4bc0`, PostgreSQL `16.16 (Debian 16.16-1.pgdg13+1)`; the two fingerprints
are byte-identical (§8.7). What T1 converted is `INCONCLUSIVE` → **observed for CI only**. Production remains
**unmeasured** and no owner decision follows from the measurement.

---

## 15. Evidence and limitations

### 15.1 Repository sources inspected this session

| Path | What was taken from it |
|---|---|
| `docs/database/phase-04a-index-collation-r2-investigation.md` (747 lines, 17 sections, untracked) | §3 carried forward; §5.7 column change; §10.6 two-database divergence; §12 contract; §13.2 negative cases |
| `docs/database/phase-04a-index-integrity-guard-design.md` (729 lines, 17 sections, untracked) | §3.4 per-key table (`:158–176`); gap table (`:60`); `uq_colleges_name_lower` sole-rule note (`:202`); M10 (`:434`); R2 (`:638`); R5 (`:641`); §10 locale row (`:492`); sample message (`:568`) |
| `docs/database/phase-04a-final-database-deployment-decision-package.md` (957 lines, untracked) | §8 integrity-index gap; **zero** occurrences of `collat`/`locale` |
| `docs/database/phase-04a-b2-production-migration-decision-review.md` | B1a/b/c and B2 framing; **zero** occurrences of `collat`/`locale` |
| `docs/development/database-migrations.md` | §Current state (`:5–13`); §Environment (`:14–22`); §Authorization B1a/B2 (`:23–44`); Option C workflow (`:45+`). **Note:** the brief cites `docs/database/database-migrations.md`; the file is actually at `docs/development/database-migrations.md` |
| `prisma/schema.prisma` | `model Tag` (`:380–391`), `model QuestionTag` (`:393+`), `model College` (`:430+`); no collation attribute anywhere |
| `prisma/migrations/0001_phase04a_question_bank/migration.sql` | PART C (`:613–:649`), the six definitions at `:623`, `:629`, `:635`, `:640`, `:641`, `:645`; `grep -c COLLATE` → `0` |
| `server/questions/publish/db-errors.ts` | `UNIQUE_INDEX_MAP` (`:66+`), the two "ignoring case" messages (`:70`, `:75`), the stale citation (`:63`) |
| `tests/integration/questions/unique-conflicts.test.ts` | name-based coverage assertions (`:229–258`) — file-based, never database-based |
| `docs/database/g1-spike/option-c/g3-full/enforce.sql` | case 30 (`:632–645`), case 32 (`:670–682`) — ASCII pairs only |
| `docs/database/g1-spike/option-c/g3-full/run.sh` | `assert_shape` (`:107–126`) — six-name count |
| `scripts/db/deploy-gate.sh` | modes `verify`/`deploy`, exit codes 0/1/2 (`:1–10`) |
| `.github/workflows/phase04a-g3-full-schema-gate.yml` | `postgres:16` at `:75`, `:88`, `:101`; no `LANG`/`LC_*`/`POSTGRES_INITDB_ARGS` |
| `.env.example`, `package.json` | `NEXT_PUBLIC_SUPABASE_URL` (`:15`); Prisma `^7.10.1`, Next `^16.4.6` |

### 15.2 Measurements executed this session (all `VERIFIED`, PostgreSQL 16.2, `server_version_num = 160002`)

| ID | Measurement | Result |
|---|---|---|
| E1 | `grep -c COLLATE` on migration 0001 | **0** — no collation is pinned anywhere |
| E2 | `pg_database_collation_actual_version(oid)` on three databases | function exists; **NULL** for `C` and `C.utf8` libc databases |
| E3 | `pg_database` row for a `C.utf8` and a `C` database | `provider=c`, `daticulocale=NULL`, `datcollversion=NULL`, encoding UTF8 in both — **local build only**; the CI image reports `2.41` (§8.7.1) |
| E4 | case-pair matrix, 8 pairs, in `C.utf8` and in `C` | §5.3 table; `Ä/ä`, `ẞ/ß`, `K`(U+212A)`/k`, `İ/i` fold in `C.utf8` only; `ς/σ`, `ẞ/ss`, `ﬁ/fi` fold in neither |
| E5 | single-value case mapping | `upper('ß')='ß'`, `lower('ẞ')='ß'`, `length(lower('İ'))=1` in `C.utf8` |
| E6 | Node 22.22.3 `toLowerCase()` on the same values | `'İ'.toLowerCase()` = `i`+U+0307 (**length 2**) — disagrees with PostgreSQL `lower()` |
| E7 | `normalize(text, NFC/NFD)` | available and correct (`é` NFC length 1, NFD length 2) |
| E8 | **dump/restore drift**: `pg_dump -t tags` from `C.utf8` → restore into `C` | dump ships `CREATE UNIQUE INDEX … (lower(name))` with **no COLLATE**; restore succeeds; `indcollation = 100` in both; source rejects `'ärger'`, restored database accepts it (`rows=2`) |
| E9 | extension availability | `citext`, `unaccent`, `pg_trgm`, `pg_collkey` → **0 rows** in `pg_available_extensions` |
| E10 | non-ASCII fixture search across `tests/`, `prisma/`, `lib/`, `server/` | **0 files** containing U+0980–U+09FF or U+00C0–U+017F |
| E11 | locale/provider mentions in the B2 review and the decision package | **0** occurrences of `collat`/`locale` in either |

**Environment:** PostgreSQL 16.2 (`pgserver` wheel build, `--without-icu`), `initdb --locale=C
--encoding=UTF8`, socket-only exposure (`listen_addresses=''`), databases `postgres`, `u8` (C.utf8), `c8`
(C). Destroyed after measurement (`pg_ctl -m fast stop`; `rm -rf /tmp/c15 /tmp/pgenv /tmp/pgw`; verified
absent).

### 15.3 Limitations — stated, not glossed

| # | Limitation | Consequence | Label |
|---|---|---|---|
| L1 | **PG 15, 17, 18 not tested** | every cross-version statement (column availability, `builtin` provider, `pg_collation` column renames) is documentation-based | `NOT TESTED` |
| L2 | **ICU unavailable** | non-deterministic collations, ICU locale profiles and the ICU shapes of Policy C are unmeasured; `datlocprovider='i'` never observed | `NOT TESTED` |
| L3 | **No production locale measured** *(Revision 2: CI is now measured — §8.7 — production still is not)* | OD-COLL-03 cannot be answered from the repository; `R2` stays partial | `INCONCLUSIVE` (production only) |
| L4 | **`datcollversion` NULL for libc *in some builds*** *(Revision 2: corrected — the CI image reports `2.41`; §8.7.1)* | a glibc upgrade is invisible **only** where the field is NULL; where it is populated, a change is a review trigger | `VERIFIED (absent locally)` / `VERIFIED (present in CI)` |
| L5 | **`lower()` ≠ Unicode case folding** | no policy based on `lower()` can deliver the full promise in `db-errors.ts:70` | `VERIFIED` |
| L6 | **No real data examined** | §10 is a process specification; the collision queries are `PROPOSED` and were never run against real rows | `NOT TESTED` |
| L7 | **`unaccent`/`citext` unavailable** | diacritic-insensitive matching for colleges is not implementable in the measured build | `VERIFIED (unavailable)` |
| L8 | **The disposable build is not a candidate environment** | its `C.utf8` exists to demonstrate a contrast, not to recommend anything | `PROPOSED` (stated) |

### 15.4 What this document deliberately does not claim

- It does **not** claim production is Supabase-Postgres-with-locale-X, nor that CI is `C` or `C.utf8`.
- It does **not** claim that `en_US.UTF-8` (or any locale) is available, installable or approved.
- It does **not** claim `lower()` is safe, nor that ASCII-only is unacceptable.
- It does **not** claim any guard exists, passes, or has been exercised against these scenarios.
- *(Revision 2)* It does **not** claim that CI and production share collation semantics. CI is measured;
  production is not.

---

## 16. Revision history

| Revision | Date | Change |
|---|---|---|
| 2 | 2026-11-24 | **Revision 2 — CI profile measured (Session 18).** The probe proposed in Session 16 was implemented (commits `e4fa80d`, `0aae136`) and executed; its values were retrieved through the Check Runs annotations API. Both CI databases report `collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=en_US.utf8;ctype=en_US.utf8;iculocale=-;collversion=2.41` and are byte-identical (run `45546248909`, check run `138976563830`, commit `0aae1368a16cf6447cb7a01afc7554a9fdab4bc0`, PostgreSQL `16.16 (Debian 16.16-1.pgdg13+1)`). Adds §1.1, §7.7 and §8.7; **corrects** the libc `datcollversion` generalisation (§8.7.1); marks superseded statements in place instead of rewriting them; closes **T1** (§14.2). **No owner decision is made**, the production profile remains **UNKNOWN**, no production locale is selected, and OD-COLL-01…06 stay **OPEN**. |
| 1 | 2026-11-24 | Initial decision-preparation document. Carries Session 14 forward without re-performing its experiments; adds four new measurements (E4–E6 case-mapping matrix including a JavaScript comparison, and E8 dump/restore drift). Defines the production environment contract (§7), the fingerprint (§8), the ten-scenario drift policy (§9), the validation process (§10), the guard split (§11), and six open owner decisions (§12). **No owner decision is made.** **No file other than this one was created or modified; nothing was committed, pushed, merged or deployed; no production or staging resource was contacted.** |

**Standing decisions, unchanged and not revisited:** G-1 **FAILED** · G-3 **PASSED** · Option C **approved,
controlled migration workflow only** · B1a **APPROVED (workflow-scoped)** · B1b **NOT APPROVED** · B1c
**NOT APPROVED** · B2 **WITHHELD** · migration 0001 **NOT AUTHORIZED for production deployment** ·
migration 0002 **DO NOT COMMIT** · G-2 **DEFERRED** · OD-17 **OPEN** · OD-21 **OPEN** · OD-NM-1 **OPEN** ·
R2 (Session 14) **PARTIALLY RESOLVED**.

**No owner decision has been made. Nothing here authorises implementation, a schema change, a data change, or
a deployment.**
