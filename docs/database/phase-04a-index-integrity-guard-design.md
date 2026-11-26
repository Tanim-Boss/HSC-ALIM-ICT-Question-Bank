# Phase 04A — Index Integrity Guard: Investigation, Design and Negative Testing

**Date:** 2026-11-24
**Repository:** `Tanim-Boss/HSC-ALIM-ICT-Question-Bank`
**Branch:** `arena/49496cf8-hsc-alim-ict-question-bank`
**HEAD when written:** `36a444a67a4c7de6ba6f4f292f42b765820e6027`
**Subject:** the six hand-written PostgreSQL indexes of the Phase 04A Question Bank schema
**Nature:** investigation, design and negative testing. **No guard, schema, migration, workflow, script or
application file was modified.** Nothing was committed or pushed. The local test cluster was disposable
and has been destroyed.

**Labels used throughout:** `VERIFIED` (measured in this session) · `PROPOSED` (design, not implemented)
· `NOT TESTED` · `INCONCLUSIVE`

**Revision 2 — 2026-11-24 (recorded in Session 20).** This document is the Session 13 guard design and is
preserved as written. The environmental uncertainty it recorded about CI (§10, R2 in §15) has since been
**partly answered by measurement**: Session 18 measured the CI database's collation profile. §10.1 records
exactly what that measurement does and does not settle. The guard itself is still `PROPOSED` — nothing is
implemented, and no owner decision has been made.

---

## 1. Executive verdict

### **GAP CONFIRMED BY EXECUTION — GUARD DESIGN PROPOSED AND NEGATIVE-TESTED — NOTHING IMPLEMENTED**

The protection gap identified in the Session 12 decision package is real, and it is worse than a
"missing feature": **the three existing controls all return success on a database whose
`uq_question_sources_identity` index has been dropped or silently weakened.** That was not argued from
source-reading alone; it was executed (§2.2).

Against that, a candidate guard was designed and **run** against a disposable PostgreSQL **16.2** cluster
holding the real migration 0001: **25 of 25 negative/positive test cases produced the expected verdict**
(21 expected `FAIL`, 4 expected `PASS`), plus **4 fail-closed payload conditions** (X1–X4) and the **strict/relaxed inventory policy switch** (Y1/Y2).
The guard is `PROPOSED`, not implemented: no repository file contains it.

| Item | Result | Label |
|---|---|---|
| Existing `guard.py sql` detects a `DROP INDEX "uq_question_sources_identity"` | **No** — exit 0 | `VERIFIED` |
| Existing `guard.py sql` detects a weakened expression index recreation | **No** — exit 0 | `VERIFIED` |
| Existing `guard.py catalog` detects a **dropped** protected index | **No** — exit 0 | `VERIFIED` |
| Existing `guard.py catalog` detects a **weakened** (no `NULLS NOT DISTINCT`) index | **No** — exit 0 | `VERIFIED` |
| G-3/V-3 by-name count on the weakened database | **6 of 6 "present"** — passes | `VERIFIED` |
| G-3/V-3 by-name count on the dropped database | 5 — fails | `VERIFIED` |
| Candidate structural guard on those same two databases | **rejects both** | `VERIFIED` (as an experiment) |
| Candidate guard negative-test matrix | **25/25 as expected** | `VERIFIED` (as an experiment) |
| Guard integrated into the repository | **not done** — requires authorisation | `PROPOSED` |

**What this does and does not change.** It completes, for the six indexes, the same argument G-1 makes for
C-1…C-5: that a name is not a definition. It changes **no** owner decision — **G-1 FAILED · G-3 PASSED ·
Option C approved for the controlled workflow only · B1a APPROVED · B1b NOT APPROVED · B1c NOT APPROVED ·
B2 WITHHELD · 0001 NOT AUTHORIZED for production · 0002 DO NOT COMMIT · G-2 DEFERRED · OD-17 OPEN ·
OD-21 OPEN · OD-NM-1 OPEN** — and it authorises no deployment.

---

## 2. The existing protection gap

### 2.1 The four controls that exist, and what each actually reads

| Control | Reads | Protects | Blind to |
|---|---|---|---|
| Migration checksum gate (`scripts/db/deploy-gate.sh` + `guard.py history`) | `_prisma_migrations.checksum` vs the file on disk | Edits to an **already-applied** migration | Raw SQL; a *new* migration that weakens something |
| SQL-text guard (`guard.py sql`) | migration text: `DROP CONSTRAINT` for the five protected FKs; `DROP TABLE` for seven tables | Textual FK drops/re-adds, protected tables | **All indexes**; anything not in text |
| Catalog FK guard (`guard.py catalog`) | `pg_constraint` filtered to `contype='f'` and five names | The five composite FKs, live | **All indexes** (`pg_index` never queried) |
| G-3 / V-3 shape assertion (`g3-full/run.sh:107–126`, `backup-restore-drill.sh:117–125`) | `count(*)` of six **index names** | Index **existence** | **Definitions**: columns, expressions, predicate, uniqueness, `NULLS NOT DISTINCT`, opclass, collation |

Source evidence, read this session: `guard.py:55–70` (`PROTECTED_FKS`, `PROTECTED_TABLES`),
`guard.py:96–131` (`check_migration_sql` — no `DROP INDEX` pattern exists), `guard.py:125–178`
(`assert_protected_fks` + `CATALOG_QUERY` — `pg_constraint`, `contype='f'` only),
`g3-full/run.sh:117` (name list), `:124` (count assertion), `deploy-gate.sh:181–230` (history only).

### 2.2 The gap, executed

A disposable PostgreSQL 16.2 cluster was initialised with `listen_addresses = ''` (socket only), migration
0001 applied verbatim, then tampered with. Everything below is a measured exit code, not a reading.

| Scenario | Existing control | Exit | Meaning |
|---|---|---|---|
| Migration text containing `DROP INDEX "uq_question_sources_identity";` alongside a legitimate C-1 drop/re-add | `guard.py sql` | **0** | accepted — the index drop is invisible to it |
| Migration text: `DROP INDEX "uq_tags_name_lower"; CREATE UNIQUE INDEX "uq_tags_name_lower" ON "tags" ("name");` | `guard.py sql` | **0** | accepted — expression uniqueness silently replaced by column uniqueness |
| Database where `uq_question_sources_identity` was **dropped** | `guard.py catalog` | **0** | "all five protected composite FKs present" — true and irrelevant |
| Database where `uq_question_sources_identity` was recreated **without `NULLS NOT DISTINCT`** | `guard.py catalog` | **0** | same |
| Same weakened database | G-3-style name count | **6** | "all six present" |
| Database where the index was dropped | G-3-style name count | **5** | caught — the only existing control that notices, and only for a *drop* |

The count is therefore a partial control that catches deletion and misses weakening — exactly the failure
mode that matters for `NULLS NOT DISTINCT`, where a plain unique index looks identical by name and by
column list.

### 2.3 Why this is not covered by any neighbouring control

- **Checksum verification** answers "was the applied file edited?" It cannot answer "does the live index
  still implement the guarantee?", because a new, correctly checksummed migration can weaken an index.
- **SQL-text protection** answers "does this migration text drop a protected object?" It knows only five
  FK names and seven table names; it has no notion of an index at all.
- **The FK catalog guard** answers "do C-1…C-5 exist with approved columns and actions?" It is a
  `pg_constraint` query. Indexes live in `pg_index`/`pg_class`.
- **Drift measurement** (G-1/Session 10) answers "what would Prisma *propose*?" It is a measurement, not a
  control, and it is never executed.
- **Application tests** answer "do the services behave?" They never inspect DDL, and the enforcement suite
  only catches a missing index where a case happens to insert a duplicate.

---

## 3. The six-index inventory, verified from the migration and from the catalog

### 3.1 Authoritative SQL, from `prisma/migrations/0001_phase04a_question_bank/migration.sql` (PART C, 613–648)

```sql
CREATE UNIQUE INDEX "uq_question_versions_one_published_per_question"
  ON "question_versions" ("question_id")
  WHERE "status" = 'PUBLISHED';

CREATE UNIQUE INDEX "uq_question_sources_identity"
  ON "question_sources" ("question_id", "source_type", "board_id", "college_id", "academic_year_id")
  NULLS NOT DISTINCT;

CREATE UNIQUE INDEX "uq_topics_chapter_order"
  ON "topics" ("chapter_id", "order_index")
  WHERE "is_active";

CREATE UNIQUE INDEX "uq_tags_name_lower" ON "tags" (lower("name"));
CREATE UNIQUE INDEX "uq_colleges_name_lower" ON "colleges" (lower("name"));

CREATE INDEX "ix_question_assets_checksum"
  ON "question_assets" ("checksum")
  WHERE "checksum" IS NOT NULL;
```

`VERIFIED` — read from the committed file; the file's SHA-256 is
`bf2fc840ebae92cacec04dfb5f8ee6e0224f1394746d80bea3e56027941a2333` (708 lines), unchanged.

### 3.2 What PostgreSQL 16.2 actually stored

Round-tripped from `pg_get_indexdef()` on the applied migration:

| Index | `pg_get_indexdef()` |
|---|---|
| `ix_question_assets_checksum` | `CREATE INDEX ix_question_assets_checksum ON public.question_assets USING btree (checksum) WHERE (checksum IS NOT NULL)` |
| `uq_colleges_name_lower` | `CREATE UNIQUE INDEX uq_colleges_name_lower ON public.colleges USING btree (lower(name))` |
| `uq_question_sources_identity` | `CREATE UNIQUE INDEX uq_question_sources_identity ON public.question_sources USING btree (question_id, source_type, board_id, college_id, academic_year_id) NULLS NOT DISTINCT` |
| `uq_question_versions_one_published_per_question` | `CREATE UNIQUE INDEX uq_question_versions_one_published_per_question ON public.question_versions USING btree (question_id) WHERE (status = 'PUBLISHED'::"VersionStatus")` |
| `uq_tags_name_lower` | `CREATE UNIQUE INDEX uq_tags_name_lower ON public.tags USING btree (lower(name))` |
| `uq_topics_chapter_order` | `CREATE UNIQUE INDEX uq_topics_chapter_order ON public.topics USING btree (chapter_id, order_index) WHERE is_active` |

Note what the rendering reveals: the enum predicate acquired a `::"VersionStatus"` cast the migration never
wrote, and `WHERE "is_active"` renders as `WHERE is_active` with no parentheses. **The text is a rendering,
not the source.** `VERIFIED`

### 3.3 Structural representation (`pg_index` + `pg_class` + `pg_am`)

| Index | relkind | uniq | nkey/natts | partial | expr | `indnullsnotdistinct` | am | `indkey` | `indoption` |
|---|---|---|---|---|---|---|---|---|---|
| `uq_question_versions_one_published_per_question` | i | t | 1 / 1 | **t** | f | f | btree | `2` | `0` |
| `uq_question_sources_identity` | i | t | 5 / 5 | f | f | **t** | btree | `2 3 4 5 6` | `0 0 0 0 0` |
| `uq_topics_chapter_order` | i | t | 2 / 2 | **t** | f | f | btree | `2 5` | `0 0` |
| `uq_tags_name_lower` | i | t | 1 / 1 | f | **t** | f | btree | `0` | `0` |
| `uq_colleges_name_lower` | i | t | 1 / 1 | f | **t** | f | btree | `0` | `0` |
| `ix_question_assets_checksum` | i | **f** | 1 / 1 | **t** | f | f | btree | `9` | `0` |

All six: schema `public`, `indisvalid = indready = indlive = true`, `relkind = 'i'`. `VERIFIED`

### 3.4 Per-key-column structure: operator class, collation, ordering

| Index | key | column / expression | opclass (`opcdefault`) | collation | DESC / NULLS FIRST |
|---|---|---|---|---|---|
| `uq_question_versions_one_published_per_question` | 1 | `question_id` | `uuid_ops` (t) | none (`0`) | no / no |
| `uq_question_sources_identity` | 1 | `question_id` | `uuid_ops` (t) | none | no / no |
| | 2 | `source_type` | `enum_ops` (t) | none | no / no |
| | 3 | `board_id` | `uuid_ops` (t) | none | no / no |
| | 4 | `college_id` | `uuid_ops` (t) | none | no / no |
| | 5 | `academic_year_id` | `uuid_ops` (t) | none | no / no |
| `uq_topics_chapter_order` | 1 | `chapter_id` | `uuid_ops` (t) | none | no / no |
| | 2 | `order_index` | `int4_ops` (t) | none | no / no |
| `uq_tags_name_lower` | 1 | `lower(name)` (expression) | `text_ops` (t) | **`default`** | no / no |
| `uq_colleges_name_lower` | 1 | `lower(name)` (expression) | `text_ops` (t) | **`default`** | no / no |
| `ix_question_assets_checksum` | 1 | `checksum` | `text_ops` (t) | **`default`** | no / no |

Structural rules that follow: expression keys have `indkey = 0` and `indcollation = 100` (`default`);
`uuid`/`enum`/`int4` keys have `indcollation = 0` (no collation); text keys carry the database default
collation. `VERIFIED`

**Scope of those values (Revision 2):** they are a **local PostgreSQL 16.2** measurement. CI's own per-index
rows were collected by the collation probe in Session 18 but land in the G-3 artifact archive, which is
unreachable from this environment (`EOF`) — so CI's `indcollation` values have **not** been read back here.
CI's *database* row is measured (§10.1); CI's *index* rows are not. `NOT TESTED` (CI index metadata)

### 3.5 Predicates and expressions, as stored

| Index | `pg_get_expr(indexprs)` | `pg_get_expr(indpred)` |
|---|---|---|
| `uq_question_versions_one_published_per_question` | — | `(status = 'PUBLISHED'::"VersionStatus")` |
| `uq_question_sources_identity` | — | — |
| `uq_topics_chapter_order` | — | `is_active` |
| `uq_tags_name_lower` | `lower(name)` | — |
| `uq_colleges_name_lower` | `lower(name)` | — |
| `ix_question_assets_checksum` | — | `(checksum IS NOT NULL)` |

`VERIFIED` — `indexprs` yields a single expression string here because each expression index has exactly
one expression; with multiple expression keys the list order defines the key order.

---

## 4. Integrity guarantees, and the weakening each one must reject

| Index | Guarantee it enforces (source) | Classes of weakening that must be rejected |
|---|---|---|
| `uq_question_versions_one_published_per_question` | At most **one PUBLISHED version per question** while DRAFT versions stay unlimited (proposal §3.10; migration comment 620–622) | predicate removed → two published versions allowed; predicate narrowed (`status = 'DRAFT'`); predicate inverted; index made non-unique; key column widened/narrowed; `INCLUDE` added |
| `uq_question_sources_identity` | **Provenance de-duplication including partial sources**, because `NULLS NOT DISTINCT` makes `(board, NULL college, year)` collide with itself (§3.10; migration comment 627–628) | **`NULLS NOT DISTINCT` dropped** (the headline risk: identical by name and columns, catastrophically weaker); a null dimension silently allowed twice; key column dropped; made non-unique; a predicate smuggled in |
| `uq_topics_chapter_order` | **ACTIVE-only** display-order uniqueness; a retired topic's position becomes reusable (Revision 5, E-7) | predicate removed → retired topics collide with active ones; predicate weakened (`is_active = false`) or replaced by `WHERE true`; key changed; made non-unique |
| `uq_tags_name_lower` | **Case-insensitive** tag uniqueness (human-facing names) | expression replaced by the plain column (`"Docker"`/`"docker"` both allowed); expression changed to `upper`/`citext`-like variant; uniqueness dropped; collation changed so case folding differs |
| `uq_colleges_name_lower` | Case-insensitive college uniqueness under the **sole** uniqueness rule (A2/A3: the plain unique was removed) | same as above; restoring a plain `@unique` alongside changes the semantics; collation change |
| `ix_question_assets_checksum` | Asset de-duplication **path**; partial because an unknown checksum is not a duplicate (§3.3.11) | predicate removed (an unknown checksum becomes a duplicate candidate); opclass changed so the de-duplication query no longer uses it; key changed; made unique (would forbid legitimate duplicates) |

Three of these are *uniqueness* guarantees that PostgreSQL will keep enforcing under a weakened definition
— that is precisely why the failure is silent: no error, no test failure, only a constraint that no longer
constrains what it was approved to constrain.

---

## 5. PostgreSQL catalog investigation

### 5.1 What each source can and cannot establish

| Source | Gives | Limits |
|---|---|---|
| `pg_class` | `relname`, `relnamespace`, `relkind`, `relam`, `reltuples` | nothing about keys or semantics |
| `pg_index` | `indisunique`, `indisvalid/ready/live`, `indnkeyatts`, `indnatts`, `indnullsnotdistinct`, `indkey`, `indcollation`, `indclass`, `indoption`, `indexprs`, `indpred`, `indexrelid`, `indrelid` | opaque ints/vectors — needs joins to be read |
| `pg_attribute` | `attname` for column keys | expression keys are `attnum = 0`, no name |
| `pg_opclass` | `opcname`, `opcdefault`, `opcnamespace` | operator-family semantics need `pg_opfamily`/`pg_amop` (not needed here) |
| `pg_collation` | `collname` (`default`, `C`, …) | oid `0` means "no collation" (non-collatable types) and is **not** a bug |
| `pg_am` | `amname` (`btree`) | — |
| `pg_namespace` | schema of the index **and of its opclass** | schema shadowing must be checked explicitly |
| `pg_get_indexdef()` | one canonical rendering, incl. `NULLS NOT DISTINCT`, opclass, collation | free text; version-dependent; schema-qualifies names |
| `pg_get_indexdef(oid, n, bool)` | per-key rendering (`lower(name)`, `question_id`, incl. `COLLATE "C"` when set) | still text |
| `pg_get_expr(indpred/indexprs, indrelid)` | predicate / expression text | **the only** access to predicate semantics; there is no structural node tree in SQL |
| `pg_indexes` view | `schemaname, tablename, indexname, tablespace, indexdef` | **cannot see `indnullsnotdistinct`** (measured: the view has exactly those five columns) — insufficient for this guard |

`VERIFIED` on PostgreSQL 16.2.

### 5.2 Is `pg_get_indexdef()` alone sufficient?

**No — and for a specific reason.** It *does* include `NULLS NOT DISTINCT` and non-default opclasses and
collations, so it is far better than a name check. But it is a **rendering**, and this session measured two
ways that matters:

1. **The rendering adds things the author did not write**: `WHERE "status" = 'PUBLISHED'` came back as
   `(status = 'PUBLISHED'::"VersionStatus")` — a type cast and parentheses the migration never contained.
   A guard comparing migration text to catalog text would fail on a perfectly correct database.
2. **Rendering can vary by version and by environment**: schema qualification (`public.`) and cast
   qualification (`::"VersionStatus"`, quoted because the type name is mixed-case) are formatter choices;
   they are stable within a major version and are not contractual across versions.

Therefore `pg_get_indexdef()` is used for **diagnostics** (it is what a human wants to read), and the
**decision** is made on structural fields. `PROPOSED`.

### 5.3 Where structure runs out: predicates

There is no structural SQL representation of `indpred` (or `indexprs`) node trees. For column-based partial
indexes, most of the *meaning* is nevertheless structural: the columns are in `indkey`, the uniqueness in
`indisunique`, the existence of a predicate in `indpred IS NOT NULL`. What remains textual is **which rows
the predicate admits**. Two consequences, both measured:

- **Re-rendering is stable**: recreating `uq_topics_chapter_order` with `WHERE (is_active)` — different
  whitespace and parentheses — produced byte-identical `pg_get_expr` output and **PASSED** (case M23).
  Whitespace is not a fragility.
- **Semantic equivalence is not identity**: recreating it with `WHERE is_active = true` — provably the same
  set of rows — stored as `(is_active = true)` and **FAILED** (case M19). This is a *false negative in the
  safe direction*: the guard refuses to certify a definition it was not asked to approve. The correct
  response is a reviewed one-line re-pin of the expectation, not a looser comparison.

`VERIFIED`.

---

## 6. Definition comparison strategy

**Decision rule: structural fields decide; text is evidence.** `PROPOSED`.

| Layer | Compared | On mismatch |
|---|---|---|
| Existence | exactly one relation named *N* in schema `public`, `relkind='i'` | REJECT "MISSING" / "ambiguous" |
| Table binding | `indexrelid → indrelid → relname` | REJECT "on table X, approved is Y" |
| Validity | `indisvalid AND indisready AND indislive` | REJECT "not valid/ready/live" |
| Architecture | `pg_am.amname = btree`; `indnatts = indnkeyatts` (no `INCLUDE`) | REJECT |
| Uniqueness | `indisunique` | REJECT |
| Null semantics | `indnullsnotdistinct` | REJECT |
| Keys | count; per key: `indkey ≠ 0` → column name, else expression text from `pg_get_indexdef(oid, n, true)` | REJECT with key index and both renderings |
| Key semantics | `pg_opclass.opcname`, `pg_collation.collname` (or none), `indoption` bits (DESC, NULLS FIRST) | REJECT |
| Predicate | `pg_get_expr(indpred)` vs pinned text, whitespace-normalized | REJECT, classified as missing / unexpected / changed |
| Diagnostics only | `pg_get_indexdef(oid)` full rendering, `key_def` per key | never decides |

**Why not compare `pg_get_indexdef()` strings?** Because it conflates three things the guard must report
separately — a changed column, a changed opclass, and a formatter difference — and because a single
character of formatting drift would then fail a correct database with an unhelpful message. Structure
gives a precise diagnosis; text cannot.

**Why not `pg_indexes.indexdef`?** It cannot see `indnullsnotdistinct` at all, which is the single most
important property in this inventory.

**Normalization applied to the two textual comparisons** (predicate and per-key expression): collapse runs
of whitespace, trim. Nothing else. Trimming parentheses, lower-casing or dropping casts was considered and
**rejected**: each of those makes the comparison *looser*, and the failure mode of a loose comparison here
is a silent pass. The pinned expectations in §3.5 are recorded verbatim from PostgreSQL 16.2.

---

## 7. Guard architecture proposal

### 7.1 Shape

Mirror the existing `guard.py` contract exactly, so the repository keeps **one** definition of "is this
safe?" and one failure vocabulary (`OK` / `REJECT` / exit 0/1/2):

```
python3 docs/database/g1-spike/option-c/guard.py indexes <catalog.json> [--no-strict-inventory]
```

- **Input**: a JSON document produced by SQL (never by the guard itself), so the guard stays pure and
  testable without a database:
  ```json
  { "indexes":  [ …one row per protected index name, in any schema… ],
    "inventory": [ …every partial / expression / NULLS-NOT-DISTINCT index on the six hosting tables… ] }
  ```
- **Query**: a new module-level constant `INDEX_CATALOG_QUERY`, in the same style as `CATALOG_QUERY`, so CI
  can emit the payload with `python3 -c "import guard; print(guard.INDEX_CATALOG_QUERY)"`.
- **Expectations**: a module-level `APPROVED_INDEXES` table holding exactly the facts in §3 — table,
  uniqueness, `NULLS NOT DISTINCT`, predicate text, and per-key `(kind, name, opclass, collation)`.
- **Verdict**: exit `0` only when every check passes; exit `1` with one line per problem; exit `2` on
  usage error. Same conventions as the existing modes.

### 7.2 The ten requirements, mapped to checks

| # | Requirement | Implemented as | Tested by |
|---|---|---|---|
| 1 | Missing index | no row for a protected name in `public` | M1, M2, M3 |
| 2 | Same-named index, changed columns | per-key `indkey → attname` comparison | M4, M22 |
| 3 | Same-named index, changed expressions | per-key `attnum = 0` ⇒ compare `pg_get_indexdef(oid,n,true)` | M8, M20 |
| 4 | Missing or weakened partial predicate | `indpred` presence **and** normalized text | M6, M7, M12, M19 |
| 5 | Changed uniqueness | `indisunique` | M5 |
| 6 | Missing `NULLS NOT DISTINCT` (and unexpected presence) | `indnullsnotdistinct` both directions | M9, M12, M21 |
| 7 | Changed opclass / collation | `pg_opclass.opcname`, `pg_collation.collname` per key | M10, M11 |
| 8 | Unexpected additional index violating the inventory | strict inventory: extra partial/expression/NND index on a protected table | M14, M24, Y1 |
| 9 | Fail closed on incomplete/ambiguous catalog | empty payload, malformed JSON, missing inventory, duplicate names across schemas, unknown row shape | X1–X4, M15 |
| 10 | Actionable diagnostics | each problem names the index, the key position and both values; full renderings retained in the payload for the log | §12 |

Additionally, beyond the ten: `relkind` (an index, not a table), access method (`btree`), table binding,
`INCLUDE` columns (`indnatts > indnkeyatts`), schema (`public`), and validity (`indisvalid/ready/live`) —
each tested (M15, M17, M18, M22).

### 7.3 Fail-closed rules, stated as rules

1. An **empty or missing payload** is failure, not "no violations" — the existing `guard.py catalog` already
   makes exactly this point in its own code.
2. A **malformed payload** is failure with the parse error.
3. A **duplicate name across schemas** is failure even when one copy is perfect: two relations with the
   approved name is ambiguous, and ambiguity must never resolve to "pass".
4. A row **missing `index_name`** (or with an unexpected shape) aborts the interpretation.
5. In strict mode, a **missing `inventory`** array is failure.
6. The guard **never** treats "no rows returned" as a vacuous pass; "no rows" and "six missing" are the
   same fact and both are reported as `MISSING`.

### 7.4 Strict-inventory semantics, deliberately narrow

Requirement 8 asks for detection of unexpected additional indexes **that violate the intended inventory**.
A blanket "no new indexes on these tables" rule would block legitimate Prisma-generated indexes, so the
inventory is defined as *hand-written-style* indexes only:

```
partial (indpred IS NOT NULL) OR expression (indexprs IS NOT NULL) OR NULLS NOT DISTINCT
```

on the six hosting tables. That set is exactly the six today — including `uq_question_sources_identity`,
which is neither partial nor an expression and would have been missed by a narrower definition — found by
the first test run, after which the inventory definition was widened and the matrix re-run. Plain
Prisma-declared indexes are excluded, so a legitimate new index
does not trip it (M24 measured `PASS`). A genuinely new hand-written index therefore requires a one-line,
reviewed addition to `APPROVED_INDEXES` — which is the intended gate, not an obstacle.

### 7.5 What the guard deliberately does **not** do

- It does not compare against `schema.prisma` (that is the Prisma drift path, prohibited).
- It does not generate or apply any SQL. It is read-only.
- It does not attempt to prove a predicate is *semantically* equivalent to the approved one; it compares the
  pinned rendering and fails closed on a difference (§5.3).
- It does not verify behaviour. Enforcement is the 33-case suite's job; this guard verifies definition.
- It does not check keys, columns, CHECK constraints or the five FKs — the FK catalog guard does that.

---

## 8. Integration-point comparison

| Option | Where | Duplication | Coupling | Verdict |
|---|---|---|---|---|
| **A — new `indexes` mode in `guard.py`** | `docs/database/g1-spike/option-c/guard.py` | **None** — reuses the JSON-in, exit-code-out contract, the fail-closed conventions and the CI's existing `import guard` pattern | One file already imported by CI (`python3 -c "import guard; print(guard.CATALOG_QUERY)"`) | **Recommended** `PROPOSED` |
| B — a separate `scripts/db/index-guard.py` | new file under `scripts/` | A second guard convention, its own JSON contract, its own test harness | Cleaner separation of concerns; but the repository's principle is "a guard CI and the repo enforce differently is not a control" (guard.py's own docstring) | Acceptable fallback |
| C — inline in `g3-full/run.sh` | bash, inside criterion 3 | Bash would need `json_build_object`, per-field comparisons and its own diagnostics — a second implementation of the same logic | Makes the *driver* the definition of safety; the independent CI step already re-implements the inventory in SQL for exactly that reason | **Rejected** |
| D — inside the deployment gate only | `deploy-gate.sh` | None, but the gate currently verifies history only and runs pre-deploy; a post-deploy assertion needs a live DB and a second invocation mode | Would change the gate's contract | Not now; see §11 |

**Recommended shape (A + CI wiring):**

1. `guard.py` gains `APPROVED_INDEXES` and `INDEX_CATALOG_QUERY` and mode `indexes`.
2. The existing "Independent schema inventory and catalog assertion" step in
   `.github/workflows/phase04a-g3-full-schema-gate.yml` gains one block per database (`g3f_main`,
   `g3f_replay`): emit the payload with the module constant, run the mode, fail the job on exit 1.
3. `phase04a-prod-ready-v1-v5.yml` (V-3 job) gains the same block after the restore, because a restore is
   exactly where a definition could silently differ.
4. Deploy gate: unchanged for now. It is a pre-deploy control and has no live connection in CI; adding a
   post-deploy assertion there would be a separate, larger change.

**Everything in this section is `PROPOSED` and requires authorisation. No file was changed.**

---

## 9. Negative-test matrix

### 9.1 How it was executed (so the results can be judged)

- PostgreSQL **16.2** (`pgserver` wheel binaries), `initdb --auth=trust --locale=C`, started with
  `listen_addresses = ''` and a socket in `/tmp/idxlab/sock` — **no TCP port, no network exposure**.
- One database `idxlab`; migration 0001 applied verbatim (`psql -f`, `ON_ERROR_STOP=1`): 18 tables, 26 FKs,
  47 CHECKs.
- A template clone `idxlab_tpl`, then **one fresh database per case** (`CREATE DATABASE … TEMPLATE`), so no
  case can inherit another's damage.
- Per case: apply the mutation → emit the catalog payload → run the guard → compare the verdict with the
  expectation.
- Teardown: cluster stopped, `/tmp/idxlab` and the virtualenv deleted. Nothing was written to the
  repository; no persistent database was touched.

### 9.2 The matrix — all 25 cases executed

| # | Mutation | Why it changes the guarantee | Expected | **Actual** |
|---|---|---|---|---|
| **B0** | none — the unmodified migration | baseline | PASS | **PASS** |
| **M1** | `DROP INDEX uq_question_sources_identity` | de-duplication gone entirely | FAIL | **FAIL** — MISSING |
| **M2** | `DROP INDEX ix_question_assets_checksum` | de-duplication path gone | FAIL | **FAIL** — MISSING |
| **M3** | `ALTER INDEX uq_tags_name_lower RENAME TO uq_tags_name_lower_old` | approval is by name; a rename silently retires the control | FAIL | **FAIL** — MISSING |
| **M4** | recreate `uq_question_sources_identity` with 4 key columns | `academic_year_id` no longer de-duplicated | FAIL | **FAIL** — 4 keys, approved 5 |
| **M5** | recreate `uq_tags_name_lower` as `CREATE INDEX` (non-unique) | duplicate tags become possible | FAIL | **FAIL** — UNIQUE False |
| **M6** | drop the predicate from `uq_question_versions_one_published_per_question` | two PUBLISHED versions per question | FAIL | **FAIL** — predicate MISSING |
| **M7** | predicate changed to `is_active = false` | active-order uniqueness replaced by retired-only | FAIL | **FAIL** — predicate changed |
| **M8** | recreate `uq_tags_name_lower` on plain column `name` | case-insensitive uniqueness → case-sensitive | FAIL | **FAIL** — key is a plain column |
| **M9** | recreate `uq_question_sources_identity` **without** `NULLS NOT DISTINCT` | partial sources no longer de-duplicate | FAIL | **FAIL** — NND False |
| **M10** | `uq_colleges_name_lower` with `COLLATE "C"` | case folding changes; equality set changes | FAIL | **FAIL** — collation C |
| **M11** | `ix_question_assets_checksum` with `text_pattern_ops` | different operator semantics; de-dup lookups may not use it | FAIL | **FAIL** — opclass text_pattern_ops |
| **M12** | same name, plain unique + `WHERE true` | name and columns look right; guarantee is gone | FAIL | **FAIL** — NND False |
| **M13** | restore the exact original definition | correct state | PASS | **PASS** |
| **M14** | add an unapproved partial index on `tags` | unreviewed hand-written artifact on a protected table | FAIL | **FAIL** — inventory |
| **M15** | same-named index created in schema `shadow` | ambiguity / name shadowing | FAIL | **FAIL** — "exists 2 times (public, shadow)" |
| **M16** | `uq_topics_chapter_order (chapter_id, order_index DESC)` | ordering semantics changed | FAIL | **FAIL** — DESC (+ NULLS FIRST) |
| **M17** | same index with `INCLUDE (order_index)` | shape not approved; widens the physical object | FAIL | **FAIL** — INCLUDE columns |
| **M18** | `UPDATE pg_index SET indisvalid = false` | an invalid index is not a guarantee | FAIL | **FAIL** — not valid |
| **M19** | predicate rewritten as `is_active = true` (semantically equal) | **not** a weakening — but not the approved definition either | FAIL (fail-closed) | **FAIL** — predicate text differs |
| **M20** | expression `lower(name)` → `upper(name)` | invented case-fold, different equality set | FAIL | **FAIL** — expression changed |
| **M21** | `uq_question_versions_one_published_per_question` gains `NULLS NOT DISTINCT` | changes which rows collide (DRAFT-side) — unapproved property | FAIL | **FAIL** — NND True |
| **M22** | recreate `uq_tags_name_lower` on `colleges(lower(name))` | wrong table; `tags` loses uniqueness | FAIL | **FAIL** — on table colleges |
| **M23** | identical definition, different whitespace/quoting in the DDL | formatting only | PASS | **PASS** |
| **M24** | add a plain Prisma-style index on `tags(slug)` | legitimate, not hand-written-style | PASS | **PASS** |

**Result: 25 executed, 25 matched expectation — 21 `FAIL` as designed, 4 `PASS` as designed.**

### 9.3 Fail-closed and policy tests (executed)

| # | Condition | Expected | Actual |
|---|---|---|---|
| X1 | empty payload file | FAIL | `REJECT  … is empty — no catalog was returned, refusing to pass` (exit 1) |
| X2 | malformed JSON | FAIL | `REJECT  … is not valid JSON (Expecting value…)` (exit 1) |
| X3 | payload has `indexes` but no `inventory`, strict mode | FAIL | `REJECT  catalog payload has no index inventory — refusing to pass` (exit 1) |
| X4 | `{"indexes": [], "inventory": []}` | FAIL | `REJECT  no protected-index rows were returned — indistinguishable from six missing indexes` (exit 1) |
| Y1 | M14 mutation with `--no-strict-inventory` | PASS | PASS (exit 0) — the policy switch behaves as designed |
| Y2 | M14 mutation, strict mode | FAIL | FAIL (exit 1) |

### 9.4 One case that could **not** be executed — recorded as such

`ALTER INDEX … SET SCHEMA` was attempted to test "index moved out of `public`" and is **a syntax error in
PostgreSQL 16.2** (`ERROR: syntax error at or near "SCHEMA"`). The intent was therefore covered by M15
(same name in a second schema ⇒ ambiguous ⇒ REJECT) and by the schema check in the guard. The
"moved-out" path itself is `NOT TESTED`; the code path that would catch it (schema comparison per row) is
the same one exercised by M15.

### 9.5 What the matrix does not establish

- It does not prove the guard catches every possible weakening — only the classes tested.
- It does not test `acldefault`, tablespace, `nulls_ordering` on non-text types, or tables with > 32 key
  columns.
- It does not test on PostgreSQL 15, 17 or 18 (§10).
- It does not integrate with CI; the CI wiring in §11 is `NOT TESTED`.

---

## 10. PostgreSQL version considerations

| Concern | Finding | Handling |
|---|---|---|
| `NULLS NOT DISTINCT` | Introduced in PostgreSQL **15**; migration 0001 therefore cannot be applied to an older server at all | The guard must assert `server_version_num >= 150000` and exit 2 (usage/unsupported) rather than pass. `PROPOSED`; the check itself is `NOT TESTED` here because only 16.2 was available |
| `pg_index.indnullsnotdistinct` | Column exists from 15; **absent** before | Same version gate; a query against an older server would error, which is a fail-closed outcome only if CI treats a query error as failure — it must |
| `pg_index.indnkeyatts` | Since 11; needed to detect `INCLUDE` | Part of the version floor |
| `pg_indexes` view | Has only `schemaname, tablename, indexname, tablespace, indexdef` — **no NND column** (measured) | Never used as the decision source |
| `pg_get_indexdef` rendering | Stable within a major version; not contractual across versions (`public.` qualification, quoted mixed-case type casts such as `::"VersionStatus"`) | Used for diagnostics only; decisions are structural |
| `pg_get_expr` predicate rendering | Rendering, not source: `WHERE "status" = 'PUBLISHED'` → `(status = 'PUBLISHED'::"VersionStatus")` (measured) | Pinned per major version; a major-version bump requires a deliberate re-pin with review |
| Tested version | **16.2** only | CI uses `postgres:16`; the guard's expectations are pinned against 16. **PG 15, 17, 18: `NOT TESTED`** |
| Locale / collation | `initdb --locale=C`; a production cluster with a different default collation would change what OID 100 *means* for text keys (the name stays `default`) | Expectation must be expressed as "the database default collation" (i.e. `collation IS NOT DISTINCT FROM` the column's default) rather than the literal string `default` — **`PROPOSED` refinement; the current experiment pinned the literal `default`**. *(Revision 2: CI's locale is now measured — `libc` / `en_US.utf8` — §10.1; production's is not)* |
| Locale effect on expression text | `lower(name)` renders the same regardless of locale | No action |

**Open point (`INCONCLUSIVE`):** whether pinning `collname = 'default'` is right in CI depends on the CI
service's `initdb` locale. That must be checked when the guard is implemented; the safer rule is to compare
against the collation actually attached to the underlying column rather than a literal string.
*(Revision 2 — half superseded: the CI `initdb` locale has since been measured. See §10.1.)*

### 10.1 Revision 2 — `collname = 'default'` revisited against the Session 18 measurement

The open point above was conditional on an unmeasured fact. That fact is now measured, so it is worth
separating four things the phrase "the collation is `default`" conflates.

| # | Thing | Status |
|---|---|---|
| 1 | **The CI database's resolved collation metadata** — `g3f_main` (5432) and `g3f_replay` (5434) | **OBSERVED**: provider `libc`, `datcollate` = `datctype` = `en_US.utf8`, `daticulocale` NULL, `datcollversion` = `2.41`, PostgreSQL `16.16 (Debian 16.16-1.pgdg13+1)` |
| 2 | **The symbolic expectation** this design needs (`database_default`) | **Unchanged, and now better justified.** OID 100 is a per-database placeholder, not a meaning: the identical catalog value means `en_US.utf8` in CI and would mean `C` in a `C`-initialised production database |
| 3 | **What the proposed guard would do at check time** | **Unchanged and still `PROPOSED`**: resolve the symbolic expectation to an OID *inside the target database*, verify the resolved object's attributes and the column relationship, then compare OIDs. No guard code exists |
| 4 | **Production's collation** | **Still unknown.** CI measurement says nothing about production |

The measured fingerprint, identical for both CI databases:

```text
collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=en_US.utf8;ctype=en_US.utf8;iculocale=-;collversion=2.41
```

**What that settles.** The CI `initdb` used a UTF-8, `libc` locale (which implies case folding for non-ASCII
text, although the folding itself was not measured — see below), so a CI run of the guard would be resolving
`database_default` against a UTF-8 collation rather than a byte-ordered one. A literal
`collname = 'default'` test would therefore not have failed *on the name* in CI — an inference from the
catalog model measured in Session 14 (§4.1), not a CI observation. And that is exactly why the symbolic rule
is still required: a name test cannot distinguish CI's `en_US.utf8` from a production `C`, because both report
the same name, the same OID and only different meanings.

**What that does not settle.** (a) The value a guard should *expect* — an owner/ops input; OD-COLL-03/04/05
remain **OPEN**. (b) Whether production agrees with CI — unmeasured, and not inferable from CI. (c) Anything
about the guard's behaviour in CI: the guard is **not implemented**, and the Session 18 probe measured the
`pg_database` row, not an index assertion. (d) CI's folding behaviour: the measurement read the catalog, it
did not compare folded strings, and `en_US.utf8` was never compared directly against `C.utf8` here
(`en_US.utf8` is not installed in this environment). The `Ä/ä`, `ẞ/ß`, `İ/i`, `K`(U+212A)`/k` evidence is
local `C.utf8`-versus-`C` evidence and is reported as such, not as a CI result.

**No claim of validation.** §3.4's per-key table remains a local 16.2 measurement; the probe's index output
was written to the G-3 artifact archive, which is unreachable from here. Nothing in this subsection should be
read as the guard having been exercised in CI.

Evidence: run `45546248909`, check run `138976563830`, commit `0aae1368a16cf6447cb7a01afc7554a9fdab4bc0`;
recorded in `phase-04a-database-collation-product-and-environment-decision.md` **§8.7 (Revision 2)**.

---

## 11. CI execution design

### 11.1 Where it runs

| Job | Database | When | Why there |
|---|---|---|---|
| `.github/workflows/phase04a-g3-full-schema-gate.yml` — "Independent schema inventory and catalog assertion" | `g3f_main` (5432) and `g3f_replay` (5434) | After the gate driver, with `if: always()` | This step already exists to re-derive the shape independently; the index assertion belongs beside the FK assertion it complements |
| `.github/workflows/phase04a-prod-ready-v1-v5.yml` — V-3 job | restored database | After the restore verification | A restore is the highest-risk moment for a silently different definition |
| *(optional, not proposed now)* V-1 job | post-`0002` database | After deploying the second migration | Would prove the *authoring* path preserves the six indexes, not just the deployed state |

### 11.2 The step, in the existing idiom

```yaml
- name: Protected index definitions must match the approved six
  run: |
    set -uo pipefail
    Q="$(python3 -c "import sys;sys.path.insert(0,'docs/database/g1-spike/option-c');import guard;print(guard.INDEX_CATALOG_QUERY)")"
    rc=0
    for target in "5432 g3f_main" "5434 g3f_replay"; do
      set -- $target
      psql -h localhost -p "$1" -U g3 -d "$2" -Atq -c "$Q" > "/tmp/$2-indexes.json"
      python3 docs/database/g1-spike/option-c/guard.py indexes "/tmp/$2-indexes.json" || rc=1
    done
    exit $rc
```

Notes that matter for reliability:

- `psql` failure must be a failure: use `set -o pipefail` on the redirect and check `$?` before invoking the
  guard; an empty file is already rejected by the guard, so a silent `psql` error cannot become a pass.
- The payload is written to `/tmp` and uploaded with the job's existing artefact, so a failure can be
  diagnosed from the CI UI without re-running.
- No new secrets: the CI service containers use the existing disposable credentials (`g3/g3spike`).

### 11.3 Negative tests in CI

The mutation matrix (§9) needs its own job, and it must not touch the databases the other criteria measure:

1. Clone `g3f_main` **after** its assertions into a third disposable database (`CREATE DATABASE … TEMPLATE`),
   or use a dedicated service container.
2. For each case: apply the mutation, emit the payload, run the guard, assert the exit code **equals the
   expected one**; treat "guard passed when it should have failed" as a job failure with a distinct
   `::error` title.
3. Dropping the clone at the end is the cleanup; the service container is destroyed with the job anyway.

**Mutation tests must never run against a persistent database** — the harness used here enforces that with
a `TEMPLATE`-clone per case and a socket-only cluster, and the CI version should inherit the same rule.

### 11.4 Runtime and cost

The payload query is one round trip over a catalog with ~130 relations; it ran in milliseconds locally
against the full 18-table schema. The guard is pure Python over a few kB of JSON. No measurable CI cost.

---

## 12. Failure diagnostics — real output from the executed tests

The guard reports one line per problem, naming the index, the key position and both values. These are
verbatim from the run:

```
REJECT  uq_question_sources_identity: MISSING from the catalog
REJECT  uq_question_sources_identity: NULLS NOT DISTINCT is False, approved is True
REJECT  uq_question_sources_identity: 4 key column(s), approved is 5
REJECT  uq_question_sources_identity: key 3 is column college_id, approved is academic_year_id
REJECT  uq_tags_name_lower: key 1 is a plain column name, approved is expression 'lower(name)'
REJECT  uq_tags_name_lower: UNIQUE is False, approved is True
REJECT  uq_colleges_name_lower: key 1 collation is C, approved is default
REJECT  uq_colleges_name_lower: key 1 expression is 'upper(name)', approved is 'lower(name)'
REJECT  ix_question_assets_checksum: key 1 operator class is text_pattern_ops, approved is text_ops
REJECT  uq_question_versions_one_published_per_question: partial predicate is MISSING (expected WHERE (status = 'PUBLISHED'::"VersionStatus"))
REJECT  uq_topics_chapter_order: predicate is '(is_active = false)', approved is 'is_active'
REJECT  uq_topics_chapter_order: key 2 is DESC, approved is ASC
REJECT  uq_topics_chapter_order: has INCLUDE columns (natts=3 > nkeyatts=2) — not approved
REJECT  uq_colleges_name_lower: index is not valid/ready/live
REJECT  uq_tags_name_lower: exists 2 times (public, shadow) — ambiguous, refusing to pass
REJECT  inventory: unapproved hand-written-style index 'ix_unapproved_partial' on a protected table (partial, expression or NULLS NOT DISTINCT — not in the approved set)
REJECT  catalog payload has no index inventory — refusing to pass
REJECT  no protected-index rows were returned — indistinguishable from six missing indexes
```

Two design points visible here:

- Every message names **what** differs and **both values**, so an operator can decide "someone weakened
  it" versus "we approved a change and forgot to re-pin".
- The success line names the count, not a vague "ok": `OK  all 6 protected indexes match their approved
  definitions`.

**A desirable addition (`PROPOSED`, not implemented):** on failure, also print the *actual*
`pg_get_indexdef()` line for the offending index, so the reviewer sees the whole definition rather than one
differing attribute. The payload already contains it (`full_definition`).

---

## 13. Security and operational boundaries

| Boundary | Position |
|---|---|
| Read-only | The guard executes **no** DDL and **no** DML. It reads a JSON file. |
| No drift path | It does not invoke Prisma, does not open a database connection itself, and cannot reintroduce the database→datamodel diff. Option C's prohibition is untouched. |
| No secrets | The payload is produced by the same disposable CI roles already in use (`g3/g3spike`); no production credential, URL or secret is required or introduced. |
| No existing guard weakened | `guard.py sql`, `guard.py catalog`, `guard.py history`, `repo-guard.sh`, `deploy-path-guard.py` and the deploy gate are all unmodified by this design. The new mode is additive. |
| Fail-closed | Empty, malformed, ambiguous or incomplete input is failure (§7.3). |
| Mutation testing isolation | Disposable clusters only; one template-cloned database per case; socket-only where run locally; destroyed afterwards (§9.1). |
| Production | Nothing here runs against production. A production *use* of this guard would be a post-deploy read-only assertion — not proposed in this session. |
| Evidence | Payload JSON and guard output are uploaded as CI artefacts alongside the existing ones. |

---

## 14. Implementation plan

Nothing below has been done. Each step is small and independently reviewable, and **none** touches
`prisma/schema.prisma`, migration 0001 or any application code. `PROPOSED`.

| # | Step | File(s) | Risk | Review gate |
|---|---|---|---|---|
| 1 | Add `APPROVED_INDEXES`, `INDEX_CATALOG_QUERY` and mode `indexes` to `guard.py` | `docs/database/g1-spike/option-c/guard.py` | None to existing modes (purely additive) | Diff review; existing modes' tests must stay green |
| 2 | Resolve the collation-pinning question (§10) before pinning: compare against the column's collation, not the literal `default` | same | Low | Reviewer confirms on the CI locale |
| 3 | Add the assertion step to the G-3 full-schema workflow for `g3f_main` and `g3f_replay` | `.github/workflows/phase04a-g3-full-schema-gate.yml` | Low; new step, `if: always()` idiom reused | Workflow diff review; run must stay green on an untouched database |
| 4 | Add the same assertion after the V-3 restore | `.github/workflows/phase04a-prod-ready-v1-v5.yml` | Low | same |
| 5 | Add the mutation job (clone-per-case) with the 25-case matrix and the 4 fail-closed cases | new `.github/workflows/phase04a-index-guard-negative.yml` | Medium — a new workflow, new disposable container | Review of the "expected FAIL" list; a case that stops failing must fail the job |
| 6 | Document the mode in the migration workflow doc | `docs/development/database-migrations.md` | Documentation only | — |
| 7 | *(optional)* Post-deploy production assertion | deploy gate | Out of scope here | Separate decision |

Suggested ordering: **1 → 2 → 3 → 5 → 4 → 6**. Step 5 before 4 because the negative tests are what make
the guard trustworthy; a control nobody has tried to defeat is a claim, not a control.

**Explicitly out of scope for the implementation:** changing any index, changing the migration, changing
`schema.prisma`, changing the deployment gate's contract, or adding a production step.

---

## 15. Risks and unresolved questions

| # | Risk / question | Assessment | Label |
|---|---|---|---|
| R1 | **Predicate comparison is textual.** A legitimate rewrite (`is_active = true`) fails closed and needs a re-pin. | Accepted; safe direction. Measured as M19. | `VERIFIED` |
| R2 | **Collation pinning is environment-dependent** — `default` is a per-database placeholder, not a meaning. | **PARTIALLY RESOLVED.** Session 14 established the resolution rule and the fingerprint requirement; Session 18 **measured the CI profile** (`libc` / `en_US.utf8` / `2.41`, PostgreSQL 16.16); Session 19 closed **T1**. Still open: production's profile, and the approved expectation value (§10.1). | `PARTIALLY RESOLVED` |
| R3 | **Cross-version rendering.** A PostgreSQL major-version bump could change predicate/expression rendering and require a re-pin. | Expected; the guard will fail loudly, which is correct. | `PROPOSED` |
| R4 | **Strict inventory may block a legitimate future hand-written index** until the expectation is extended. | Intended: that is the review gate. Cost is one line + review. | `PROPOSED` |
| R5 | **Guard does not prove behaviour**, only definition. A predicate could be textually identical but semantics change through an underlying operator change (e.g. a new collation on the column itself). | Out of scope; note that changing the *column's* collation is a different mutation that the FK/other checks also do not cover. | `NOT TESTED` |
| R6 | **`INCLUDE` and DESC detection** depend on `indnkeyatts`/`indoption`; correct on 16, untested elsewhere. | Low | `VERIFIED` on 16.2 |
| R7 | **The guard is not a substitute for the enforcement suite.** If an index is correct but a service bypasses it, this guard says nothing. | By design; complementary. | `VERIFIED` |
| R8 | **A hostile actor with DDL rights** can weaken the index and re-run the guard against a falsified payload. | Same class as every catalog control here; the guard reads what the database reports. Documented, not solvable at this layer. | `PROPOSED` |
| R9 | **V-1's second migration** adds an index — would it trip strict inventory? | It is a plain index on `questions`, which is not one of the six protected tables; M24 shows the analogous case passing. | `VERIFIED` (analogue) |
| R10 | **Six indexes only.** The 39 Prisma-generated indexes are not covered; a dropped one is caught by Prisma's own drift only. | Out of scope; state it plainly rather than implying total index coverage. | `VERIFIED (scope)` |

---

## 16. Recommendation

**Adopt the guard as a new `indexes` mode of the existing `guard.py`, and wire it into the G-3
full-schema job — after resolving the collation question in §10.** `PROPOSED`

*(Revision 2: the **environmental** half of that question is now measured for CI — §10.1 — but the **policy**
half is not: the approved expectation value and production's profile are still owner inputs. The sequencing
above is therefore unchanged, and implementation remains unauthorised.)*

Why this recommendation, in order of weight:

1. **The gap is not theoretical.** Three existing controls returned exit 0 on a database whose
   `uq_question_sources_identity` had been dropped or weakened (§2.2, executed). A control that reports
   success while the guarantee is gone is worse than no control, because it is believed.
2. **The design is small and the evidence is already there.** ~120 lines added to a file CI already imports,
   one new query, one expectation table whose contents are literally §3 of this document, and a step that
   follows an existing pattern.
3. **It is additive and reversible.** No existing mode, guard, workflow rule, migration or schema changes.
   If it proves noisy, removing the step restores today's state exactly.
4. **It was negative-tested before being proposed**, 25/25 including four positive controls (unmodified,
   restored, reformatted, legitimate new plain index). A guard that only ever fails is as useless as one
   that never fails; M13/M23/M24 are the proof it can distinguish.

What the recommendation does **not** say: that Session 12's blockers are resolved. The index guard closes
**one** of the three items named there. Operational readiness (runbook, RTO/RPO, monitoring, credential
model) and the OD-17 wire contract remain untouched, and **no deployment is authorised** by designing this
guard.

---

## 17. Evidence references and revision history

### 17.1 Repository sources read this session

| Path | Used for |
|---|---|
| `prisma/migrations/0001_phase04a_question_bank/migration.sql` | PART C 613–648 (the six indexes, verbatim), PART D 649–708 (context) |
| `docs/database/g1-spike/option-c/guard.py` | `PROTECTED_FKS` 55–63, `PROTECTED_TABLES` 66–70, `check_migration_sql` 96–131, `assert_protected_fks` 125–155, `CATALOG_QUERY` 156–178, `check_history` 179–217, CLI 218–279 |
| `docs/database/g1-spike/option-c/g3-full/run.sh` | `assert_shape` 107–126, criterion 3 332–375, `G3F_EXPECTED_CASES=33` 39 |
| `docs/database/g1-spike/option-c/prod-ready/v3/backup-restore-drill.sh` | index count 117–125, limits 285–294 |
| `scripts/db/deploy-gate.sh` | modes 75–160, history-only verification 181–230 |
| `scripts/db/deploy-path-guard.py`, `docs/database/g1-spike/option-c/repo-guard.sh` | existing guard surfaces (unchanged) |
| `.github/workflows/phase04a-g3-full-schema-gate.yml` | driver step 168–178, independent inventory/assertion step 180–228, `postgres:16` services 75/88/101 |
| `.github/workflows/phase04a-prod-ready-v1-v5.yml` | V-1/V-2+V-3/V-4+V-5 jobs, 551 lines |
| `docs/database/phase-04a-final-database-deployment-decision-package.md` | §8 (the gap stated), §11 (matrix), §15 (recommendation) |
| `docs/database/phase-04a-real-18-table-prisma-drift-investigation.md` | §15 (the measured drift that motivates index protection) |
| `docs/database/phase-04a-question-bank-physical-schema-proposal.md` | §3.10 (index rationale), §3.14 (count), §11.6.1/§11.6.5 (controls and residual risk), §11.12 (decisions) |
| `docs/development/database-migrations.md` | authorisation status 23–43; prohibitions |

### 17.2 Measurements made this session

- PostgreSQL **16.2** (wheel binaries), `initdb --locale=C`, `trust`, **socket-only** (`listen_addresses=''`).
- Migration 0001 applied verbatim: **18 tables, 26 FKs, 47 CHECKs**, six hand-written indexes.
- Catalog facts: §3.2–§3.5 (all `VERIFIED` on 16.2).
- Gap demonstration: `guard.py sql` exit **0** on a `DROP INDEX` migration; `guard.py catalog` exit **0** on
  a dropped and on a weakened index; name count **6** on the weakened database, **5** on the dropped one.
- Candidate guard: **25/25 cases matched**, 4 fail-closed payload cases rejected, strict/relaxed policy
  switch demonstrated.
- `ALTER INDEX … SET SCHEMA` is a **syntax error** in 16.2 (recorded, §9.4).
- `pg_indexes` has five columns and no `indnullsnotdistinct` (§5.1).

### 17.3 Limitations

1. One PostgreSQL version (16.2). Nothing was run on 15, 17 or 18.
2. The candidate guard exists only as an experiment; it is not in the repository, has no unit test, and is
   not wired into CI.
3. Predicate and expression comparisons remain textual by necessity (§5.3).
4. The matrix covers the mutation classes listed; it is not a proof of completeness.
5. The CI integration described in §11 is `NOT TESTED`.
6. No production observation of any kind; nothing was deployed.

**Revision 2 (2026-11-24).** Limitation 1 and the collation caveat in §10 were *environmental*, and one of
them has since been closed by measurement: Session 18 measured the CI database's collation profile (`libc` /
`en_US.utf8` / `datcollversion = 2.41`, PostgreSQL `16.16`), and Session 19 recorded it (decision document
§8.7, Revision 2) and closed **T1**. What that closes: **CI's locale is no longer unknown**. What it does not
close: production's locale (still unmeasured), an approved expectation value (OD-COLL-03/04/05 open),
ICU/non-deterministic collations (still `NOT TESTED`), PostgreSQL 15/17/18 (still `NOT TESTED`), and
limitation 2 — the guard is still unimplemented, so §11's CI integration remains `NOT TESTED`.

### 17.4 Revision history

| Revision | Date | Change |
|---|---|---|
| 2 | 2026-11-24 | **Revision 2 (recorded in Session 20).** Reconciles the environmental uncertainty in §10 and R2 (§15) with the measured CI profile from Session 18 (run `45546248909`, check run `138976563830`, commit `0aae1368`) and the Session 19 T1 closure. Adds §10.1 (four-way distinction between the CI database's resolved metadata, the symbolic expectation, the guard's target-database resolution, and production's unknown profile); annotates §3.4's scope; updates R2 to **PARTIALLY RESOLVED**. Original design, matrix and recommendation preserved. |
| 1 | 2026-11-24 | Initial investigation, design and negative-test report. Reads the Session 12 package, the Session 9–10 drift investigation, the physical schema proposal, the G-3 driver, `guard.py`, the deploy gate and migration 0001; verifies every claim against the applied migration on a disposable PostgreSQL 16.2 cluster; executes a 25-case mutation matrix plus four fail-closed cases. **No repository file was created or modified except this document.** |

**Decisions preserved exactly and unchanged:** G-1 **FAILED** · G-3 **PASSED** · Option C **approved —
controlled migration workflow only** · B1a **APPROVED (workflow-scoped)** · B1b **NOT APPROVED** · B1c
**NOT APPROVED** · B2 **WITHHELD** · migration 0001 **NOT AUTHORIZED for production deployment** ·
migration 0002 **DO NOT COMMIT** · G-2 **DEFERRED** · OD-17 **OPEN** · OD-21 **OPEN** · OD-NM-1 **OPEN**.

**Designing an index guard authorises nothing. It adds a control proposal; it does not approve a
deployment, and B1b/B2 remain exactly as the register records them.**
