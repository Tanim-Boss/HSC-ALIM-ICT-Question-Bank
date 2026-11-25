# Phase 04A — PostgreSQL Index Collation Semantics: R2 Investigation

**Date:** 2026-11-24
**Repository:** `Tanim-Boss/HSC-ALIM-ICT-Question-Bank`
**Branch:** `arena/49496cf8-hsc-alim-ict-question-bank`
**HEAD when written:** `36a444a67a4c7de6ba6f4f292f42b765820e6027`
**Subject:** R2 in `docs/database/phase-04a-index-integrity-guard-design.md` — how the proposed index guard
must compare index collations without assuming the collation is literally named `default`
**Nature:** read-only repository investigation plus disposable PostgreSQL experimentation. **No repository
file other than this document was created or modified.** Nothing was committed or pushed. All clusters were
disposable and have been destroyed.

**Labels:** `VERIFIED` (measured this session) · `PROPOSED` (design, not implemented) · `NOT TESTED` ·
`INCONCLUSIVE`

**Revision 2 — 2026-11-24 (recorded in Session 20).** This is the Session 14 investigation and is preserved as
written, including every experiment, negative test and limitation. Two of its statements about the **CI**
environment have since been superseded by measurement: Session 18 observed the CI collation profile and
Session 19 recorded it. Those two places (§10.11, §11.5) and the limitations in §14 that depended on them are
annotated in place. The verdict is **unchanged: PARTIALLY RESOLVED** — production's profile is still unknown
and the two environments' semantic equivalence is still not established.

---

## 1. Executive verdict

### **PARTIALLY RESOLVED** — the comparison rule is established and deterministic; two environment facts remain open

*(Revision 2: one of those two is now measured — CI's profile, Session 18. Production's is not. The verdict
is unchanged.)*

**The rule R2 asked for is now evidence-backed:** an index key's collation must be compared as a **resolved
object identity inside the target database**, never as a name or a hard-coded OID, and the expectation must
be written **symbolically** (`none`, `database_default`, `named(schema,name)`, or `column(table,column)`),
resolved to an OID at check time, and then verified by **both** identity and — where a column exists —
the column relationship.

Three measured findings drove that design, and each one invalidates a simpler rule:

1. **`default` (OID 100) is a per-database placeholder, not a meaning.** It is byte-identical in two
   databases here — same OID, same name, provider `d`, all locale fields `NULL` — while `lower('Ärger')`
   returns `Ärger` in one and `ärger` in the other. **Same committed migration, same index, same catalog
   value: one database accepts `Ärger` and `ärger` as two distinct tags, the other rejects the duplicate.**
   That is a real, silent weakening of `uq_tags_name_lower` and it is invisible to every current control.
   `VERIFIED`
2. **The relationship rule alone is not enough.** `ALTER TABLE tags ALTER COLUMN name TYPE text COLLATE "C"`
   is accepted by PostgreSQL, silently **rebuilds** the dependent `lower(name)` index, and leaves
   `indcollation = attcollation`. The "index must match its column" check therefore **passes** while the
   guarantee has changed. Only a pinned expectation catches it. `VERIFIED`
3. **Names are unstable, OIDs are stable — while the index exists.** A collation in use cannot be dropped
   (`cannot drop collation … because other objects depend on it`) but **can be renamed**, leaving the
   index's OID untouched. Two collations can share the name `C` in different namespaces with different
   OIDs. `VERIFIED`

**Consequence for the guard contract:** per-index collation expectations alone are not sufficient; a
**database collation fingerprint** assertion (`encoding`, `datlocprovider`, `datcollate`, `datctype`,
`daticulocale`, `datcollversion`) must accompany them, because "database default" is otherwise semantically
undetermined. This is new scope, discovered here, and it is the reason the verdict is **PARTIALLY
RESOLVED** rather than RESOLVED: the fingerprint value for CI and for production has not been measured by
anyone, and ICU (non-deterministic) collations could not be created in this environment at all.
*(Revision 2: the CI half of that sentence has since been measured — Session 18, run `45546248909`, check run
`138976563830`, commit `0aae1368`; see §11.5. Production's has still not been measured by anyone, and ICU
remains `NOT TESTED`, so the verdict does not move.)*

Nothing here authorises implementation. R2 is a question about a **proposed** guard; resolving it changes
no decision: **G-1 FAILED · G-3 PASSED · Option C approved for the controlled workflow only · B1a APPROVED ·
B1b NOT APPROVED · B1c NOT APPROVED · B2 WITHHELD · 0001 NOT AUTHORIZED for production · 0002 DO NOT
COMMIT · G-2 DEFERRED · OD-17 OPEN · OD-21 OPEN · OD-NM-1 OPEN.**

---

## 2. The R2 problem statement

R2 as recorded in the Session 13 design:

> **R2 — Collation pinning may be environment-dependent** (`default` vs an explicit locale name in CI).
> Open; resolve before pinning. `INCONCLUSIVE`
>
> *(Revision 2: quoted as the Session 13 record, not as current status. Current status is **PARTIALLY
> RESOLVED** — §14 L1 and §15.)*

The candidate guard compares, per key, `pg_index.indcollation[k]` against an expectation. In the first
prototype that expectation was the literal string `default` as rendered by `pg_collation.collname`. The
question was whether that is safe.

**It is not safe, for three independent reasons**, each now measured:

| Concern | Why the literal is unsafe | Section |
|---|---|---|
| The name `default` describes a *role*, not a collation | OID 100 carries no locale at all; its meaning comes from `pg_database` | §4 |
| The name can be reused in another namespace | `pg_catalog."C"` (950) and `alt."C"` (16416) are different objects with the same name | §5.5 |
| The name can change while the object does not | `ALTER COLLATION … RENAME` is permitted on a collation an index depends on | §5.6 |

And the deeper problem the investigation surfaced, which is not about the guard at all: **the same
migration can enforce materially different uniqueness depending on the database's collation** (§10.6). A
guard that merely compared names would certify both databases as correct.

---

## 3. PostgreSQL catalog model (measured on 16.2)

### 3.1 Catalog columns that exist

| Catalog | Relevant columns (measured) |
|---|---|
| `pg_index` | `indexrelid`, `indrelid`, `indnatts`, `indnkeyatts`, `indisunique`, `indnullsnotdistinct`, `indisvalid`, `indisready`, `indislive`, `indkey` (`int2vector`), `indcollation` (`oidvector`), `indclass` (`oidvector`), `indoption` (`int2vector`), `indexprs`, `indpred` — **no version field** |
| `pg_attribute` | `attnum`, `attname`, `atttypid`, **`attcollation`** — nothing else collation-related |
| `pg_collation` | `oid`, `collname`, `collnamespace`, `collowner`, `collprovider` (`"char"`), `collisdeterministic`, `collencoding`, `collcollate`, `collctype`, `colliculocale`, `collicurules`, `collversion` |
| `pg_opclass` | `oid`, `opcname`, `opcnamespace`, `opcowner`, `opcfamily`, `opcintype`, `opcdefault`, `opcmethod` |
| `pg_class` | `relname`, `relnamespace`, `relkind`, `relam` |
| `pg_database` | `encoding`, `datlocprovider`, `datcollate`, `datctype`, `daticulocale`, `datcollversion` |

`VERIFIED` — column lists queried directly from `pg_attribute`.

### 3.2 The collations present in a fresh cluster (`initdb --locale=C`)

| OID | name | namespace | provider | deterministic | encoding | locale fields | version |
|---|---|---|---|---|---|---|---|
| 100 | `default` | `pg_catalog` | **`d`** (database default) | t | -1 | **all NULL** | **NULL** |
| 950 | `C` | `pg_catalog` | `c` (libc) | t | -1 | `C` / `C` | **NULL** |
| 951 | `POSIX` | `pg_catalog` | `c` | t | -1 | `POSIX` / `POSIX` | NULL |
| 962 | `ucs_basic` | `pg_catalog` | `c` | t | 6 (UTF8) | `C` / `C` | NULL |
| 963 | `unicode` | `pg_catalog` | `i` (ICU) | t | -1 | iculocale `und` | NULL |
| 12344 | `C.utf8` | `pg_catalog` | `c` | t | 6 | `C.utf8` / `C.utf8` | NULL |

Two facts matter immediately: **OID 100 has no locale of its own**, and **every libc collation here has a
NULL `collversion`** — so collation *version* tracking contributes nothing in this environment (§11.4).
`VERIFIED`

### 3.3 Array semantics (important for reading `indcollation` correctly)

Measured with `CREATE INDEX i_incl ON multi (a COLLATE "C") INCLUDE (b)`:

```
indnkeyatts=1  indnatts=2  indkey = 1 2  indcollation = 950  indclass = 3126
```

**`indkey` has `indnatts` entries; `indcollation` and `indclass` have `indnkeyatts` entries.** A guard
iterating `1 … indnatts` over `indcollation` would read past the array. Iterate `1 … indnkeyatts`.
`VERIFIED`

---

## 4. Default collation semantics

### 4.1 How the database default is represented

`pg_collation` contains exactly one row with `collprovider = 'd'`: OID **100**, name `default`, **all
locale fields NULL, `collversion` NULL**. It is a *reference to the database's own setting*, resolved from
`pg_database`:

| Database | `datlocprovider` | `datcollate` | `datctype` | `datcollversion` | `encoding` |
|---|---|---|---|---|---|
| `colla` (created with `LC_COLLATE 'C'`) | `c` | `C` | `C` | NULL | UTF8 |
| `collb` / `real_u` (created with `LC_COLLATE 'C.utf8'`) | `c` | `C.utf8` | `C.utf8` | NULL | UTF8 |

And the `default` row in **both** databases is identical:

```
colla : oid=100 name=default provider=d det=t collate=(null) ctype=(null) version=(null)
collb : oid=100 name=default provider=d det=t collate=(null) ctype=(null) version=(null)
```

`VERIFIED` — so a guard comparing an index's collation to `collname = 'default'` is comparing a *pointer to
whatever this database happens to be*, and calling the result "the approved collation".

### 4.2 The difference is not cosmetic

| Expression | `colla` (C) | `collb` (C.utf8) |
|---|---|---|
| `lower('Ärger')` | `Ärger` | `ärger` |
| `lower('ÉCOLE')` | `École` | `école` |
| `lower('İ')` | `İ` | `i` |
| `lower('DHAKA')` | `dhaka` | `dhaka` |

In a `C`-locale database, `lower()` folds **ASCII only**; non-ASCII letters are left alone. In a `C.utf8`
database it folds the full Latin repertoire. `VERIFIED`

### 4.3 Why the name is therefore not a universal identity test

- The **same OID** (100) and the **same name** (`default`) describe **different semantics** in two
  databases. Cross-database comparison of collation values is therefore meaningless, and pinning the
  string `default` pins nothing at all.
- The **meaning** lives in `pg_database`, which is **not** part of any index definition and not visible
  from `pg_index` in any form.
- Nothing in `pg_index` or `pg_attribute` records a collation version, so a locale or ICU upgrade cannot be
  detected per index either (§11.4).

---

## 5. Column/index collation relationships

All measurements below are from database `colla` (locale `C`), table
`t(id, name text, name_c text COLLATE "C", name_u text COLLATE "C.utf8")`. `VERIFIED`.

### 5.1 The matrix

| Index DDL | key | `attcollation` | `indcollation` | Equal? |
|---|---|---|---|---|
| `i_plain ON t (name)` | `name` | 100 | 100 | **yes** |
| `i_col_c ON t (name_c)` | `name_c` | 950 | 950 | **yes** |
| `i_col_c_same ON t (name_c COLLATE "C")` | `name_c` | 950 | 950 | **yes** |
| `i_override_c ON t (name COLLATE "C")` | `name` | 100 | **950** | **no — detected** |
| `u_plain ON t (name)` | `name` | 100 | 100 | yes |
| `u_c ON t (name COLLATE "C")` | `name` | 100 | 950 | **no — detected** |
| `i_expr_plain ON t (lower(name))` | `<expr>` | — | 100 | n/a |
| `i_expr_override ON t ((lower(name) COLLATE "C"))` | `<expr>` | — | **950** | n/a |
| `i_expr_on_c_col ON t (lower(name_c))` | `<expr>` | — | **950** | n/a |

Two rules follow directly:

1. For a **column** key, `indcollation == pg_attribute.attcollation` is a valid, cheap relationship check,
   and it **does** detect an explicit `COLLATE` on the index.
2. For an **expression** key there is no column to compare against; `indcollation` is authoritative and
   must be compared to a pinned expectation.

### 5.2 Collation inheritance through an expression

`i_expr_on_c_col` = `lower(name_c)` over a column declared `COLLATE "C"` yields `indcollation = 950`
without any `COLLATE` token in its DDL. `pg_get_indexdef` renders it as `lower(name_c)` — **the inherited
collation is invisible in the text**. Any text-based comparison is therefore structurally incapable of
verifying an expression index's collation. `VERIFIED`

### 5.3 Rendering: `COLLATE` appears only when explicit

| Index | `pg_get_indexdef()` |
|---|---|
| `i_plain` | `CREATE INDEX i_plain ON public.t USING btree (name)` |
| `i_override_c` | `CREATE INDEX i_override_c ON public.t USING btree (name COLLATE "C")` |
| `i_expr_on_c_col` | `CREATE INDEX i_expr_on_c_col ON public.t USING btree (lower(name_c))` |
| `i_alt_c` | `CREATE INDEX i_alt_c ON public.ns USING btree (v COLLATE alt."C")` |

`VERIFIED`. The renderer shows a collation when it is *explicitly written on that key* and elides it when
it is inherited — including the case where the inherited collation is not the database default.

### 5.4 Per-key collations can differ inside one index

`CREATE INDEX i_mixed ON multi (a, b COLLATE "C")` →

| key | column | `indcollation` |
|---|---|---|
| 1 | `a` | 100 (`default`) |
| 2 | `b` | 950 (`C`) |

The DDL text shows `COLLATE` only on `b`, and key 1's collation (default) is only readable from the
catalog. Collation must be compared **per key**, not per index. `VERIFIED`

### 5.5 Same name, different namespace

```
CREATE COLLATION alt."C" (provider = libc, locale = 'C');
CREATE INDEX i_pg_c  ON ns (v COLLATE "C");        -- oid 950,  pg_catalog.C
CREATE INDEX i_alt_c ON ns (v COLLATE alt."C");    -- oid 16416, alt.C
```

| | `pg_catalog."C"` | `alt."C"` |
|---|---|---|
| OID | 950 | **16416** |
| name | `C` | `C` |
| provider / locale / ctype / determinism | `c` / `C` / `C` / true | `c` / `C` / `C` / true |
| `oid` equal | — | **false** |

Same name, same attributes, **different objects**. The rendering disambiguates (`alt."C"`), which is why
the full `pg_get_indexdef` is worth keeping as a diagnostic — but name-based equality would silently treat
them as the same. `VERIFIED`

### 5.6 Identity stability: drop is blocked, rename is not

| Operation on a collation an index depends on | Result |
|---|---|
| `DROP COLLATION alt."C"` | **refused** — `cannot drop collation alt."C" because other objects depend on it … index i_alt_c depends on collation alt."C"` |
| `ALTER COLLATION alt."C" RENAME TO "C_renamed"` | **accepted** — index `i_alt_c` keeps `indcollation = 16416`, and `pg_collation.collname` now reads `C_renamed` |

So **the OID is stable for the life of the index, and the name is not**. `VERIFIED`

### 5.7 Can a column's collation change under an index? Yes — and it is the dangerous case

| Attempt | Result |
|---|---|
| `ALTER TABLE t ALTER COLUMN name COLLATE "C"` | **syntax error** — a `TYPE` clause is required |
| `ALTER TABLE t ALTER COLUMN name TYPE text COLLATE "C"` | **accepted** |

After the accepted form, on a database holding migration 0001:

```
before: uq_tags_name_lower -> indcollation=100 (default) ; tags.name attcollation=100
after : uq_tags_name_lower -> indcollation=950 (C)       ; tags.name attcollation=950
```

Both the plain unique and the **expression** index were rebuilt, and each adopted the new collation,
**without any `CREATE INDEX` statement in the migration**. `VERIFIED`

**Why this is the decisive case for R2:** the relationship rule (`indcollation == attcollation`) **still
passes** after that migration, because both moved together:

```
rule_REL_pass = t   rule_PIN_pass = f   actual_collation = C
```

Only a pinned expectation notices. And the semantic consequence is real: after the change, `'Ärger'` and
`'ärger'` both inserted successfully (`rows=2`), where the untouched database rejects the second as a
duplicate. `VERIFIED`

---

## 6. Expression-index analysis

### 6.1 Can an expression's collation be established reliably?

**Yes, but only from `pg_index`, and only as an inherited/derived value.** For a key with `indkey = 0`:

- `indcollation[ord]` is the collation PostgreSQL bound the expression to. It resolves through the
  expression tree: `lower(name)` inherits `name`'s collation; `lower(name) COLLATE "C"` is explicitly
  `C`; `lower(name_c)` over a `"C"` column is `C`.
- `pg_get_indexdef(indexrelid, ord, true)` renders the *key*, including `COLLATE` **only when explicit**.
- There is **no catalog field** that names the expression's source column, so "does it match its argument
  column" cannot be computed in general.

For the six real indexes:

| Index | key | `indcollation` |
|---|---|---|
| `uq_tags_name_lower` | `lower(name)` | 100 (`default`) |
| `uq_colleges_name_lower` | `lower(name)` | 100 (`default`) |
| `ix_question_assets_checksum` | `checksum` (column, text) | 100 (`default`) |
| `uq_question_versions_one_published_per_question` | `question_id` (uuid) | **0** (non-collatable) |
| `uq_question_sources_identity` | 5 keys (uuid/enum) | **0** |
| `uq_topics_chapter_order` | `chapter_id` uuid, `order_index` int4 | **0** |

`VERIFIED` — identical in a `C` database and in a `C.utf8` database (§10.6).

### 6.2 Consequences for the contract

1. For expression keys, **pin the expectation symbolically** (`database_default` here) and compare the
   resolved OID. Do not attempt "does it match the expression's source column".
2. Where the six indexes are concerned, the expectation is `database_default` for the three text keys and
   `none` (OID 0) for the eight non-collatable keys.
3. `indcollation = 0` is **not** "missing data" — it is "this type has no collation". A guard that treated
   0 as null/unknown would fail closed on every uuid key. The expectation `none` exists precisely to make
   0 an *expected* value.
4. If a future migration introduces an expression whose collation cannot be pinned (e.g. a function whose
   result collation depends on session state), the correct behaviour is to **fail and require a reviewed
   expectation**, not to accept.

---

## 7. Operator-class interaction

`text_ops` and `text_pattern_ops` indexes were created on the same columns:

| Index | opclass | `indcollation` |
|---|---|---|
| `i_plain ON t (name)` | `text_ops` | 100 |
| `i_pattern_ops ON t (name text_pattern_ops)` | `text_pattern_ops` | **100** |
| `i_pattern_ops_c ON t (name_c text_pattern_ops)` | `text_pattern_ops` | 950 |

**Identical collation values, different comparison semantics.** `text_pattern_ops` compares bytewise for
pattern-matching support; a guard that compared only collation would regard `i_plain` and `i_pattern_ops` as
equivalent, and a `text_ops → text_pattern_ops` swap as harmless. `VERIFIED`

Therefore:

- **Collation and opclass must be validated as separate fields**, both compared per key.
- They are **mutually consistent** in one direction only: for a non-default opclass the collation still
  describes the collation-bound operators of that class; neither field implies the other.
- The Session 13 matrix case **M11** (`text_pattern_ops`) remains valid and is the test that keeps this
  separation honest. `VERIFIED` (basis) / `NOT TESTED` (integrated guard).

---

## 8. Candidate strategy comparison

| Strategy | Correctness | Portability | False-positive risk | False-negative risk | Expression keys | Database default | Explicitly collated columns |
|---|---|---|---|---|---|---|---|
| **A. Compare OIDs directly** | High **within one database**; meaningless across databases (OID 100 ≠ OID 100) | None — OIDs are per-database | Low | **High** if the expectation is a literal OID | Works (OID is authoritative) | Works only if "100" is understood as a role | Works |
| **B. Compare name/namespace/provider/locale/version** | Medium — identifies *equivalent-looking* objects | Good | Medium (a renamed or re-created object) | **High** for `default` (no attributes at all) and for two same-attribute collations (950 vs 16416) | Works | **Fails** — `default` has NULLs on every attribute | Works |
| **C. Index vs its column (`indcollation = attcollation`)** | Good for overrides | Excellent | None | **Measured failure** (§5.7: coordinated change passes) and undefined for expressions | **Cannot** — no column to compare | Implicitly right until someone changes the column | Works |
| **D. Pinned symbolic expectation + relationship + attributes + database fingerprint** | Highest | Good — resolves inside each database | Low; intentional fail-closed on equivalence-not-identity | Low | Works | Works (role resolved, then fingerprinted) | Works |
| **E. Behavioural probe** (insert duplicates and observe) | Tests real semantics | Good | High (mutates data; needs a writable DB) | Medium (partial predicates complicate fixtures) | Works | Works | Works |

**Recommendation: D.** Reasons, each traceable to a measurement:

- A alone is unimplementable as a *contract* because a literal OID is not portable (§4.1), and the whole
  point of the expectation is that it survives a move between databases.
- B alone cannot express `default` at all, since every attribute of OID 100 is NULL (§3.2), and it accepts
  950 ≡ 16416 (§5.5).
- C alone was **measured to pass** after a real integrity change (§5.7) — it cannot be the decision.
- E is the only strategy that tests true behaviour, but it requires writes, cannot be run pre-deployment,
  and duplicates the enforcement suite's job; it belongs in the test suite, not in a read-only definition
  guard.
- **D combines the three that each cover a different failure**: symbolic resolution makes `default`
  meaningful and portable; OID comparison makes identity exact within the database; the relationship check
  catches a single-sided override; attribute verification catches a same-named-but-different object; and the
  database fingerprint catches the environment-level change that no index field can express.

---

## 9. Disposable experiment methodology

| Aspect | Detail |
|---|---|
| PostgreSQL | **16.2**, `pgserver` wheel binaries (the only version obtainable in this environment; see §11.1) |
| Cluster | `initdb -D /tmp/coll/data -U collab --auth=trust --encoding=UTF8 --locale=C` |
| Exposure | started with `-c listen_addresses=''` and `unix_socket_directories=/tmp/coll/sock` — **socket only, no TCP port** |
| Databases | `postgres` (C), `colla` (C), `collb` (C.utf8), `collc` (C.utf8), `collprod` (C.utf8), `real_c` (C), `real_u` (C.utf8) |
| Real schema | migration 0001 applied verbatim with `psql -f` to `collprod`, `real_c`, `real_u` (18 tables, 26 FKs, 47 CHECKs each) |
| Mutations | performed only on these disposable databases: `CREATE COLLATION`, `ALTER COLLATION … RENAME`, `DROP COLLATION` (refused), `ALTER TABLE … TYPE … COLLATE`, index creation variants |
| Teardown | `pg_ctl -m fast stop`, then `rm -rf /tmp/coll /tmp/pgenv /tmp/pgw2` — **verified removed** |
| Repository | read-only; the only writes were `psql` reads of `prisma/migrations/0001_.../migration.sql` |
| Production | never contacted; no credentials exist in this environment |

**Every claim labelled `VERIFIED` below comes from a query whose output is quoted in this document.**

---

## 10. Experiment results

### 10.1 Column and index collation identity (R2.1)

See §5.1: `attcollation` and `indcollation` are directly comparable **for column keys**, and the
comparison detects an index-level `COLLATE` override. `VERIFIED`

### 10.2 Default collation semantics (R2.2)

See §4: OID 100 is identical in two databases with different locales; `pg_database` differs; behaviour
differs. `VERIFIED`

### 10.3 Expression inheritance (R2.1, §6)

`lower(name)` → 100; `lower(name) COLLATE "C"` → 950; `lower(name_c)` over a `"C"` column → 950; the
inherited cases are **not visible** in `pg_get_indexdef`. `VERIFIED`

### 10.4 Same name, different namespace (case 7)

Two objects named `C`, OIDs 950 and 16416, identical attributes. `VERIFIED`

### 10.5 Per-key and INCLUDE array semantics

`i_mixed` → `[100, 950]`; `i_incl` → `indcollation` length 1 for `indnkeyatts` 1 / `indnatts` 2. `VERIFIED`

### 10.6 Two databases, different default collations (case 6) — **the integrity finding**

Real migration 0001, real `uq_tags_name_lower`, two disposable databases:

| Database | `datcollate` | `lower('Ärger')` | Insert `Ärger` then `ärger` | `indcollation` of the index |
|---|---|---|---|---|
| `real_c` | `C` | `Ärger` | **both accepted — 2 rows** | `100 (default)` |
| `real_u` | `C.utf8` | `ärger` | **second rejected** — `duplicate key value violates unique constraint "uq_tags_name_lower"` | `100 (default)` |

Note the same test repeated at the catalogue level in `colla`/`collb` gave the same result, so it is
reproducible and not an artefact of the real schema.

**Reading:** `uq_tags_name_lower` is documented as a *case-insensitive* uniqueness guarantee. Under a
`C`-locale database it is case-insensitive **for ASCII only** — `Dhaka`/`dhaka` collide, `Ärger`/`ärger`
do not. The catalog says the two databases have the same collation. **They do not have the same
semantics.** `VERIFIED`

### 10.7 Collation version metadata (case 8)

| Collation | `collversion` | `pg_collation_actual_version(oid)` | Mismatch detectable? |
|---|---|---|---|
| `default` (100) | NULL | NULL | **no** |
| `C` (950) | NULL | NULL | **no** |
| `C.utf8` (12344) | NULL | NULL | **no** |
| `unicode` (963, ICU stub) | NULL | NULL | **no** |

A mismatch *can* be manufactured and detected — `UPDATE pg_collation SET collversion = '999.0' WHERE
collname = 'C'` succeeds as superuser, after which `pg_collation_actual_version(oid) IS DISTINCT FROM
collversion` is **true** — and `ALTER COLLATION "C" REFRESH VERSION` then refuses with
`invalid collation version change`. But in a stock libc cluster **both sides are NULL**, so the comparison
yields nothing. `VERIFIED (mechanism)` / `NOT TESTED (a genuine version upgrade)`.

*(Revision 2: "both sides are NULL" describes **this build**, not libc in general. The measured CI image
reports `datcollversion = 2.41` (§11.5), so a libc environment *can* expose a version and a version change is
detectable there. What is unaffected is the other half of this subsection: **no index or attribute field
carries a version**, so per-index drift remains undetectable by construction.)*

**No index or attribute field carries a version** (`pg_index`: none; `pg_attribute`: `attcollation` only), so
per-index version drift is **undetectable by construction**. `VERIFIED`

### 10.8 ICU / non-deterministic collations

`CREATE COLLATION ci (provider = icu, locale = 'und-u-ks-level1', deterministic = false)` →
**`ERROR: ICU is not supported in this build`**, despite a `unicode` row with `collprovider = 'i'` existing
as a stub. Non-deterministic collations — where `'A'` and `'a'` compare equal and a unique index enforces
case-insensitivity *by collation* rather than by `lower()` — **could not be created**, so they are
`NOT TESTED`. `VERIFIED (unavailable)`.

This matters because a non-deterministic collation is the one construct that can change the **equality
relation** itself; the guard must therefore treat `collisdeterministic = false` as *unsupported → fail
closed*, not as "just another collation".

### 10.9 Column collation changed after index creation (case 9)

Accepted; both indexes rebuilt; relationship rule still passes; pinned rule fails; uniqueness weakened.
See §5.7. `VERIFIED`

### 10.10 Collation identity stability

Drop refused by dependency; rename accepted. See §5.6. `VERIFIED`

### 10.11 What was **not** executed

| Case | Why | Label |
|---|---|---|
| PostgreSQL 15, 17, 18 | only a 16.2 binary distribution is obtainable here (§11.1) | `NOT TESTED` |
| ICU / non-deterministic collation semantics | ICU not supported in this build (§10.8) | `NOT TESTED` |
| A genuine libc/ICU version upgrade | would require replacing the OS locale archive | `NOT TESTED` |
| The CI service's actual locale | no Docker access; workflow sets no `LANG` (§11.5) — **superseded**: measured in Session 18 (§11.5) | `SUPERSEDED (measured)` |
| Production's locale | no production access, by instruction | `NOT TESTED` |

---

## 11. Version compatibility

### 11.1 Versions actually obtained

| Version probe | Result |
|---|---|
| `postgres --version` | `PostgreSQL 16.2` |
| `SHOW server_version_num` | `160002` |
| `pgserver` wheel (PyPI) | bundles exactly one build, 16.2 |
| `postgresql-wheel`, `pgbin`, `pg-embed` | **no matching distribution** |
| ICU | `--without-icu` build; `CREATE COLLATION … provider=icu` fails |

So **15, 17 and 18 are `NOT TESTED`**, and every statement about them below is documentation-based.

### 11.2 The supported floor

**The floor stays at PostgreSQL 15.** It is not a judgement call; migration 0001 cannot be applied below it:

| Feature | Introduced | Consequence |
|---|---|---|
| `NULLS NOT DISTINCT` (and `pg_index.indnullsnotdistinct`) | 15 | migration 0001 fails to apply on 14 or earlier |
| `pg_database.datlocprovider`, `daticulocale` | 15 (documentation; present and used on 16.2 — `VERIFIED` here) | the database fingerprint cannot be read below 15 |
| `pg_index.indnkeyatts`, `indclass`/`indcollation` covering key columns only | 11 | INCLUDE detection |
| `pg_collation.collversion`, `pg_collation_actual_version()` | 10 | version diagnostics |

The guard should assert `server_version_num >= 150000` and **exit 2 (unsupported)** rather than pass; below
the floor it cannot even see the column it would need.

### 11.3 Catalog representation across versions

Measured only on 16.2. Two representation risks must be treated as open until checked on 17/18:

- `pg_collation.colliculocale` / `collicurules` are documented to change shape in newer majors (a generic
  `colllocale`). **`NOT TESTED`.**
- `pg_database.daticulocale` likewise.

**Mitigation, not a guess:** the guard's decision path uses only `collname`, `collnamespace`,
`collprovider`, `collisdeterministic`, `collversion` and `pg_database.datcollate/datctype/datlocprovider`.
Those are stable on 15–16 as measured; anything version-specific must be selected dynamically and a
missing column must **fail closed**, not be ignored.

### 11.4 Collation version tracking — the honest position

Collation *version* is not recorded per index and is NULL for every libc collation in this environment
(§10.7). A guard cannot verify that the collation's **library version** is the one it was approved against.
It can only record what it sees. This is a real limitation of any catalog-based guard, and it should be
stated in the guard's output rather than papered over — a NULL version must read `unknown`, never
"matches". `VERIFIED`

*(Revision 2: "NULL for every libc collation in this environment" remains true **of this environment**. It is
not a property of libc: the measured CI image reports `datcollversion = 2.41` (§11.5). The rule above is
unchanged and becomes conditional — record the value the environment reports, print `unknown` when it is
NULL, and treat a changed version as a review trigger, not as proof of index corruption.)*

### 11.5 CI environment

`.github/workflows/phase04a-g3-full-schema-gate.yml` uses `image: postgres:16` and sets **no** `LANG`,
`LC_*` or `POSTGRES_INITDB_ARGS` (measured by grep). The effective `datcollate` of that service is therefore
whatever the image's `initdb` uses — **unverified from here**. Given §10.6, this is not a cosmetic detail:
it decides whether CI's evidence about `uq_tags_name_lower` reflects a UTF-8 production database or a
byte-ordered one. `INCONCLUSIVE` *(superseded immediately below: the measurement was made in Session 18.)*

**Revision 2 — measured (Session 18).** The paragraph above is preserved as the Session 14 position. The CI
database row was subsequently read from both CI databases by a read-only probe in the G-3 job, and its values
were retrieved through the Check Runs annotations API:

| Item | Observed value |
|---|---|
| Databases | `g3f_main` (5432) and `g3f_replay` (5434) — not the image's default `postgres` database |
| Provider | `libc` (`datlocprovider = 'c'`) |
| `datcollate` / `datctype` | `en_US.utf8` / `en_US.utf8` |
| `daticulocale` | NULL (`-`) |
| `datcollversion` | **`2.41`** — not NULL (§10.7, §11.4) |
| PostgreSQL | `16.16 (Debian 16.16-1.pgdg13+1)` — the Debian 13 (trixie) image variant |
| Fingerprint (both databases, byte-identical) | `collation-fingerprint/v1;pg=16;enc=UTF8;provider=libc;collate=en_US.utf8;ctype=en_US.utf8;iculocale=-;collversion=2.41` |

Evidence: run `45546248909`, check run `138976563830`, commit `0aae1368a16cf6447cb7a01afc7554a9fdab4bc0`;
recorded as Revision 2 §8.7 of `phase-04a-database-collation-product-and-environment-decision.md`.

What that closes: **CI's locale is no longer unknown.** CI is a UTF-8 `libc` environment, so CI's evidence
about `uq_tags_name_lower` does reflect a UTF-8 locale rather than a byte-ordered one.

What it does **not** close — the three qualifications that keep the label honest:

1. **CI folding behaviour was not directly measured.** Session 18 read the `pg_database` row; it did not
   compare folded strings. `en_US.utf8` versus `C.utf8` was never compared directly in this environment
   either (`en_US.utf8` is not installed here). The pair evidence in §10.6 is local `C.utf8`-versus-`C`
   evidence, not a CI measurement.
2. **Production's profile is still unmeasured**, so CI/production **semantic equivalence is not
   established**. Both databases could report the same `collname = 'default'` and the same OID `100` while
   enforcing different equality — which is the §4.1 finding, and the reason the fingerprint assertion in §12
   exists.
3. **The guard was not exercised in CI.** The probe measured the database row; no index assertion was added,
   and the probe's index output went to an artifact archive that is unreachable from the working environment
   (`EOF`). CI's per-index `indcollation` values remain unread.

---

## 12. Revised collation guard contract

### 12.1 Expectation forms (one per key)

| Form | Meaning | Resolves to |
|---|---|---|
| `{"kind": "none"}` | the key's type is not collatable | OID `0` |
| `{"kind": "database_default"}` | whatever this database's default is | the single `pg_collation` row with `collprovider = 'd'` |
| `{"kind": "named", "schema": "...", "name": "..."}` | a specific collation object | that row, resolved by namespace + name |
| `{"kind": "column", "table": "...", "column": "..."}` | follow a real column | `pg_attribute.attcollation` of that column |

For the six Phase 04A indexes the expectations are, exactly and without ambiguity: **`none` for eight
keys** (`uq_question_versions_one_published_per_question` 1, `uq_question_sources_identity` 5,
`uq_topics_chapter_order` 2 — all uuid/enum/int4, `indcollation = 0`), and **`database_default` for three
keys** (`uq_tags_name_lower`, `uq_colleges_name_lower`, `ix_question_assets_checksum`, `indcollation =
100`). Eleven keys in total. `VERIFIED`

### 12.2 Resolution and comparison (pseudocode, no implementation written)

```text
resolve(expectation, conn):
    case none             -> 0
    case database_default -> rows = SELECT oid FROM pg_collation WHERE collprovider = 'd'
                             require exactly one row, else AMBIGUOUS -> FAIL
    case named            -> rows = SELECT oid FROM pg_collation
                                    WHERE collnamespace = to_regnamespace(schema) AND collname = name
                             require exactly one row, else MISSING/AMBIGUOUS -> FAIL
    case column           -> a = SELECT attcollation FROM pg_attribute
                                WHERE attrelid = to_regclass(table) AND attname = column
                             require exactly one row, else FAIL   -- a = 0 is a valid resolution
    otherwise             -> UNKNOWN EXPECTATION -> FAIL

verify_attributes(oid):
    if oid = 0: require expectation.kind = none
    else: compare (collprovider, collisdeterministic, collcollate, collctype, colliculocale)
          against the pinned attributes for that expectation
          require collisdeterministic = true            -- non-deterministic = unsupported -> FAIL
          collversion: record; a NULL is "unknown", never "matches"

check_index(idx):
    require indcollation array length = indnkeyatts        -- INCLUDE already rejected separately
    for each key k in 1..indnkeyatts:
        expected = resolve(expectation[k]); verify_attributes(expected)
        require indcollation[k] = expected
        if expectation[k].kind = column:
            require indcollation[k] = attcollation(that column)   -- relationship, for column keys only
    record pg_get_indexdef(oid, k, true) for diagnostics only

check_database():
    fingerprint = (encoding, datlocprovider, datcollate, datctype, daticulocale, datcollversion)
    require fingerprint = the approved fingerprint for this environment
    if datcollversion IS NULL: report "collation version unknown" (diagnostic, never a pass claim)
```

### 12.3 The rules, stated as answers to §6 of the brief

| Question | Answer |
|---|---|
| Authoritative fields | `pg_index.indcollation`, `pg_attribute.attcollation`, `pg_collation.oid` (resolved), `pg_collation.collprovider/collisdeterministic/collcollate/collctype/colliculocale`, `pg_database` locale columns |
| Diagnostic only | `pg_get_indexdef()` full and per-key text, `collname`, `collversion` |
| Inherited column collations | column keys: `indcollation` must equal `attcollation` **and** the pinned expectation; expression keys: pinned expectation only |
| Explicit collations | compare the resolved OID of the named collation; a same-named object in another namespace is a different OID → FAIL (fail-closed on equivalence-not-identity) |
| Expression indexes | resolved from `indcollation`; never inferred from text; never compared to a guessed source column |
| Database default | resolved as the `collprovider = 'd'` row, plus the **database fingerprint** assertion; the literal string `default` is never compared |
| Missing or ambiguous data | FAIL with a named reason (`MISSING`, `AMBIGUOUS`, `UNKNOWN EXPECTATION`) — never pass |
| Below the version floor | exit 2, "unsupported server version", with the required floor printed |
| Changed collation | **FAIL immediately**; changing an expectation is a reviewed code change (a re-pin), not an automatic adaptation |
| Non-deterministic collation | **FAIL** as unsupported (measured as untestable here, §10.8) |
| Cross-database comparison | never performed; all resolution happens inside the database under test |

### 12.4 What this adds to the Session 13 contract

- `collation` becomes a **symbolic expectation object**, not a string.
- A **database fingerprint** assertion is added (new, and the reason §1's verdict is PARTIALLY RESOLVED).
- Two explicit fail-closed classes are added: non-deterministic collations, and unknown/ambiguous
  resolution.
- `collversion`, when present, is reported, never compared as a pass condition.

---

## 13. Negative-test implications

### 13.1 Existing cases

| Case | Status under the revised contract |
|---|---|
| **M10** — `uq_colleges_name_lower` recreated with `COLLATE "C"` | **Still meaningful, and stronger.** It changed `indcollation` from 100 to 950 against a `database_default` expectation, so it fails on identity, not on a name string. Under the revised contract the message becomes "resolved pg_catalog.C (950) ≠ expected database default (100)". The Session 13 result stands; only the diagnosis improves. `VERIFIED` (basis) |
| **M19** — predicate rewritten as `is_active = true` | **Unaffected.** Predicates are textual and collation plays no part. `VERIFIED` (basis) |
| **M11** — opclass `text_pattern_ops` | **Unaffected, and remains necessary** (§7). `VERIFIED` (basis) |
| **M9** — `NULLS NOT DISTINCT` removed | Unaffected. `VERIFIED` (basis) |

### 13.2 Cases that must be **added** (not yet executed against a guard — `NOT TESTED`)

| # | Mutation | Why the current design would miss it, and what the revised contract does | Under revised contract |
|---|---|---|---|
| **N1** | `ALTER TABLE tags ALTER COLUMN name TYPE text COLLATE "C"` (index rebuilt automatically) | **Measured false negative** for the relationship rule (§5.7). Caught only by the pinned `database_default` expectation | **FAIL** |
| **N2** | Recreate `uq_tags_name_lower` as `lower(name) COLLATE "C"` | Caught by both old and new rules; keep it as the expression-side control | **FAIL** |
| **N3** | Same-named collation used from another namespace (`alt."C"`) | Old rule compared `collname` ⇒ would have **passed**. New rule compares resolved OID | **FAIL** |
| **N4** | `ALTER COLLATION … RENAME` of a used collation | OID unchanged, semantics unchanged: a `named` expectation stops resolving → fail closed with `MISSING` | **FAIL (fail-closed)** |
| **N5** | Database created with a different `LC_COLLATE` and the same migration applied | No index field changes; **only the fingerprint assertion** notices | **FAIL** on the fingerprint, PASS on the six index definitions |
| **N6** | Non-deterministic collation introduced for a protected key | Not constructible here (§10.8) | **FAIL** as unsupported (`NOT TESTED`) |

N1 and N5 are the two that justify this whole investigation: without them the guard would certify a
weakened index and a differently-collated database as correct.

---

## 14. Unresolved limitations

| # | Limitation | Consequence | Label |
|---|---|---|---|
| L1 | **CI collation measured; production's unknown** — and their **semantic equivalence is not established** *(Revision 2; the original wording "CI and production collations are unknown" is superseded)* | CI is a known UTF-8 `libc` locale (§11.5), so CI evidence about `lower(name)` is internally meaningful — but it may still not represent production, and no fingerprint can be **approved** until an owner value exists | `PARTIALLY RESOLVED` (CI: `VERIFIED`; production: `NOT TESTED`; equivalence: `NOT TESTED`) |
| L2 | **Only PostgreSQL 16.2 tested** | 15/17/18 behaviour, and the `pg_collation` column renames, are unverified | `NOT TESTED` |
| L3 | **ICU unavailable** | Non-deterministic collations — the one construct that changes equality itself — are untested; the guard treats them as unsupported | `NOT TESTED` |
| L4 | **Collation version is NULL for libc *in this build*** *(Revision 2: corrected — CI reports `2.41`, §11.5)* **and never per-index** | A library upgrade is invisible where the version is NULL, and per-index drift is invisible everywhere; where the version is populated, a change is at least detectable as a review trigger | `VERIFIED (absent locally)` / `VERIFIED (present in CI)` |
| L5 | **`lower()` is locale-dependent** | No guard can make `uq_tags_name_lower` "case-insensitive" in a `C` database; the fix is an environment decision, not a guard | `VERIFIED` |
| L6 | **Equivalence vs identity** | `alt."C"` and `pg_catalog."C"` are behaviourally identical but different objects; the rule fails closed and requires a re-pin | `PROPOSED` (deliberate) |
| L7 | **A guard reading the catalog can be fooled by a falsified payload** | Same class as every catalog control in this repository; the guard trusts what the database reports | `PROPOSED` |
| L8 | **Fingerprint expectation is an environment approval**, i.e. a new owner/ops input | Someone must approve "CI is `C.utf8`, production is `X`" | `PROPOSED` |

---

## 15. Final recommendation

**Adopt strategy D and the §12 contract.** Specifically:

1. **Per key, store a symbolic expectation** (`none` / `database_default` / `named` / `column`), resolve it
   to an OID inside the target database, verify the resolved object's attributes, and compare OIDs. Never
   store or compare the string `default`; never store an OID as a literal in repository text.
2. **Keep the relationship check for column keys** (`indcollation = attcollation`) as a second, cheap
   assertion — but never as the only one (N1).
3. **Add the database fingerprint assertion** (`encoding`, `datlocprovider`, `datcollate`, `datctype`,
   `daticulocale`, `datcollversion`) with an approved value per environment. Without it, "database
   default" is an unverified assumption.
4. **Fail closed** on: unresolvable or ambiguous expectations, non-deterministic collations, unknown
   expectation kinds, servers below 15, and missing catalog columns.
5. **Treat `collversion` as diagnostic**, and print `unknown` rather than implying a match.

Two follow-ups are **not** guard work and should be decided separately, because §10.6 proved they are real:

- **Measure the CI database's collation** (one `psql -c "SELECT … FROM pg_database"` line, no schema
  change) so CI evidence is known to represent a UTF-8 locale.
  **DONE — Sessions 17–18; recorded in Session 19.** The probe was implemented as a read-only workflow step,
  executed (run `45546248909` / check run `138976563830`, commit `0aae1368`), and closed **T1**. Observed:
  `libc` / `en_US.utf8` / `datcollversion = 2.41` on PostgreSQL `16.16` (§11.5). The second follow-up — the
  intended `lower()` semantics, i.e. OD-COLL-01/02 with the profile in OD-COLL-03 — is **still open**.
- **Decide the intended `lower()` semantics** for `tags.name` / `colleges.name` in production. If
  production is `C`-locale, `uq_tags_name_lower` is ASCII-only case-insensitive and that is a product
  decision, not a bug in the guard.

**Verdict: PARTIALLY RESOLVED.** The implementation rule is deterministic and evidence-backed; what remains
open is environmental (production's collation, item 3's **approved** fingerprints) and untestable here
(ICU, other majors), and both are handled by failing closed rather than by guessing.

*(Revision 2: the environmental half is now half-closed — CI's profile is measured (§11.5), production's is
not, and **R2 stays PARTIALLY RESOLVED** because what remains is a value only the owner can approve. Nothing
here resolves OD-COLL-01…06; all six remain **OPEN**.)*

---

## 16. Evidence references

### 16.1 Repository sources read (read-only)

| Path | Used for |
|---|---|
| `docs/database/phase-04a-index-integrity-guard-design.md` | R2, §3.4 (per-key opclass/collation), §10 (version considerations, the `INCONCLUSIVE` open point) |
| `docs/database/phase-04a-final-database-deployment-decision-package.md` | §8 (the integrity-index gap), §11 (decision matrix) |
| `prisma/migrations/0001_phase04a_question_bank/migration.sql` | PART C 613–648 — the six indexes; applied verbatim to three disposable databases |
| `docs/database/g1-spike/option-c/guard.py` | existing `catalog` mode and `CATALOG_QUERY` (FK-only, `pg_constraint`) — the control this guard complements |
| `docs/database/g1-spike/option-c/g3-full/run.sh` | `assert_shape` 107–126 — the by-name index count that cannot see definitions |
| `.github/workflows/phase04a-g3-full-schema-gate.yml` | `postgres:16` services at 75/88/101; **no `LANG`/`LC_*`/`POSTGRES_INITDB_ARGS`** |

### 16.2 Measured outputs quoted in this document

- `pg_collation` inventory with OIDs (100/950/951/962/963/12344) and NULL version fields (§3.2).
- `indcollation` vs `attcollation` for eleven index variants (§5.1); per-key mixed collation (§5.4);
  INCLUDE array lengths (§3.3).
- `pg_get_indexdef` renderings showing elided inherited collations (§5.3).
- Drop refused / rename accepted on a used collation (§5.6).
- `ALTER COLUMN … TYPE text COLLATE "C"` accepted; both indexes rebuilt 100 → 950; relationship rule
  passes, pinned rule fails (§5.7).
- Real migration in `C` vs `C.utf8`: `2 rows accepted` vs `duplicate key … uq_tags_name_lower` (§10.6).
- `collversion` NULL everywhere **in this local cluster** (not universally — CI reports `2.41`, §11.5);
  `UPDATE pg_collation` mismatch visible; `REFRESH VERSION` refused (§10.7).
- `CREATE COLLATION … provider=icu` → "ICU is not supported in this build" (§10.8).

### 16.3 Environment

PostgreSQL 16.2 (`server_version_num = 160002`), `initdb --locale=C --encoding=UTF8`, `--without-icu`
build, socket-only exposure, all clusters destroyed after the session.

## 17. Revision history

| Revision | Date | Change |
|---|---|---|
| 2 | 2026-11-24 | **Revision 2 (recorded in Session 20).** Reconciles two CI-only statements with the measured CI profile from Session 18 (run `45546248909`, check run `138976563830`, commit `0aae1368`) and the Session 19 T1 closure: §10.11 CI row → `SUPERSEDED (measured)`; §10.7/§11.4 libc-NULL generalisation corrected (CI reports `2.41`); new §11.5 measurement table with the exact fingerprint; **L1 rewritten** as CI measured / production unknown / equivalence not established; L4 corrected; §15 follow-up marked DONE. Verdict unchanged: **PARTIALLY RESOLVED**. All Session 14 experiments, negative tests and limitations preserved. |
| 1 | 2026-11-24 | Initial R2 investigation. Reads the Session 13 design and Session 12 package, applies migration 0001 to three disposable PostgreSQL 16.2 databases with different locales, measures collation representation, inheritance, namespace collisions, identity stability, version metadata, expression behaviour and operator-class interaction. Establishes strategy D and the §12 contract. **No repository file created or modified except this document.** |

**Decisions preserved exactly and unchanged:** G-1 **FAILED** · G-3 **PASSED** · Option C **approved —
controlled migration workflow only** · B1a **APPROVED (workflow-scoped)** · B1b **NOT APPROVED** · B1c
**NOT APPROVED** · B2 **WITHHELD** · migration 0001 **NOT AUTHORIZED for production deployment** ·
migration 0002 **DO NOT COMMIT** · G-2 **DEFERRED** · OD-17 **OPEN** · OD-21 **OPEN** · OD-NM-1 **OPEN**.

**Resolving R2 authorises nothing.** It refines a control that does not yet exist; it does not approve the
guard's implementation, and it does not approve a deployment.
