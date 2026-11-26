# Phase 04A — OD-COLL-01 & OD-COLL-02: Uniqueness Semantics — Owner Decision Brief

**Date:** 2026-11-24
**Repository:** `Tanim-Boss/HSC-ALIM-ICT-Question-Bank`
**Branch:** `arena/49496cf8-hsc-alim-ict-question-bank`
**HEAD when written:** `4d04e4461338ea5931d26faf67d312fbed21de43` (parent `b8873c1729e21036f1139ea56822881a4e267e09`)
**Subject:** **OD-COLL-01** — *which case-insensitivity semantics apply to `tags.name`?* and **OD-COLL-02** —
*which case-insensitivity semantics apply to `colleges.name`?* Two independent decisions.
**Nature:** investigation and decision input. **Documentation only.** No index, schema, migration, application
file, workflow, script or test was modified; no production or staging resource was contacted. One **disposable
local PostgreSQL cluster** was created, used for read/write probes on the real migration, and destroyed
(§7.2). The document is untracked, pending owner review.

Labels used throughout:

| Label | Meaning |
|---|---|
| `VERIFIED` | read directly from a committed repository artifact, or already recorded as executed CI evidence |
| `OBSERVED` | measured **this session**, in a **disposable local** PostgreSQL instance — not CI, not production |
| `DERIVED` | follows from `VERIFIED`/`OBSERVED` facts by stated reasoning; not itself measured |
| `PROPOSED` | design or process, not applied, not approved |
| `UNKNOWN` | a fact about an environment or data set nobody has measured |
| `NOT TESTED` | could not be, or deliberately was not, executed |
| `OPEN` | an owner decision with no answer |

**Standing statement:** this brief frames two decisions. It makes neither. A technical recommendation below is
**not** owner approval, and no uniqueness policy is implied by any observation in it.

---

## 1. Executive verdict

### **BOTH DECISIONS FRAMED — NEITHER ANSWERED — NO UNIQUENESS POLICY SELECTED**

Six findings carry the brief, and none of them selects a policy:

1. **The current guarantee is narrower than its name.** `uq_tags_name_lower` and `uq_colleges_name_lower`
   enforce equality of `lower(name)` **under the database's ctype**, not "case-insensitivity" and not Unicode
   case folding. On a UTF-8 locale this folds accented Latin case (`Ä/ä`, `É/é` — `OBSERVED`, E2/E18); it is
   ASCII-only on a `C` locale (`VERIFIED`, Session 14 §10.6 reproduced by Session 15 §11.3); and it folds
   neither `ς/σ` nor `ẞ/ss` anywhere (`OBSERVED`, E4/E7).
2. **The expression does not normalise.** Canonically equivalent spellings (`é` NFC versus `e`+U+0301) are two
   **different** tags and two **different** colleges today (`OBSERVED`, E8/E19). Nothing in the schema or code
   normalises; the database is the only enforcement point (`VERIFIED`, decision doc §4.2).
3. **The two indexes have identical definitions but not identical consequences.** Structurally they are the
   same object shape (§3). Around them the entities differ fundamentally: a tag has a second unique key
   (`slug`, format-checked) and an M2M merge path; a college's name is its **only** uniqueness rule, its
   optional `code` is neither unique nor read by any code, and its merge path can collide with the
   attribution rule (§5, §6, §10).
4. **No business intent is documented anywhere in the repository.** There is **no application write path** for
   either table — no tag or college create/update/merge code exists — so intent cannot be read from behaviour
   (`VERIFIED`, §5.2/§6.2). The only product statement is the user-facing error text *"names are compared
   ignoring case"*.
5. **Both merge hazards are now executed evidence, not schema reading.** A naive
   `UPDATE question_tags SET tag_id = …` collides with `question_tags_pkey` (E11); a naive `DELETE` of a used
   tag **silently cascades away question–tag links** (E11c); repointing a `question_sources.college_id` onto a
   survivor collides with `uq_question_sources_identity` (E12b). A safe tag-merge shape was also executed and
   preserved links (E11b).
6. **Neither decision needs a production locale to be *clarified*, but both need one to be *implemented*.**
   The business question ("what should count as the same tag / the same college?") is answerable by the owner
   today; the enforcement question is entangled with OD-COLL-03/04/05/06 (§11).

**Status of both decisions: `OPEN — NO OWNER DECISION RECORDED`** (§12).

---

## 2. Scope and decision separation

### 2.1 The two questions, exactly as the register records them

From `docs/database/phase-04a-database-collation-product-and-environment-decision.md` **§12**:

> **OD-COLL-01** — Which case-insensitivity semantics apply to `tags.name`? — Options **A** ASCII-only ·
> **B** locale-dependent `lower()` (status quo) · **C** explicit Unicode folding (fold + NFC, needs 0002) ·
> **D** alternative (drop name uniqueness / app-only / ICU non-deterministic).
>
> **OD-COLL-02** — Which case-insensitivity semantics apply to `colleges.name`? — same four options,
> evaluated independently.

The register is explicit that **B is the status quo** and that neither decision has a recommendation attached:
*"That is a cost/benefit statement, **not** a product decision."*

### 2.2 Why they must be decided separately — and not by analogy

| Difference | `tags.name` | `colleges.name` | Consequence |
|---|---|---|---|
| Other uniqueness rules | `uq_tags_slug` (unique, format-checked) | **none** — name is the sole rule | weakening the college rule removes the last defence against duplicate institutions |
| Reference shape | `question_tags` M2M, PK `(question_id, tag_id)`, `ON DELETE CASCADE` | `question_sources.college_id`, single nullable FK, `ON DELETE RESTRICT` | merging differs mechanically, not just in tone (§10) |
| Cardinality and change rate | open vocabulary, grows while publishing (`DERIVED` from seed shape and the M2M model) | small curated reference data (`DERIVED` from `is_active`, curated seed codes) | a bad tag merge pollutes a filter; a bad college merge splits provenance |
| Optional `is_active` | absent | present | colleges can be retired; tags cannot |
| Data-entry path | editor-typed during publishing (**not implemented**) | curated from an official list (**not implemented**) | case-variant pressure is plausibly much higher for tags (`DERIVED`, stated as a hypothesis) |
| Normalisation appetite | unclear; diacritics are meaningful in ICT terminology | plausibly diacritic/punctuation-insensitive, but `unaccent` is unavailable in the measured build | the options do not have equal product value per entity |

**A single answer for both entities is therefore not assumed anywhere in this brief**, and §12 contains two
independent records.

### 2.3 What these decisions are not

- They are **not** the production profile question — that is **OD-COLL-03**.
- They are **not** the fingerprint field set (**OD-COLL-04**) or the drift policy (**OD-COLL-05**).
- They are **not** the validation requirements (**OD-COLL-06**), although no answer to 01/02 can be
  implemented before 06 produces a report.
- They do **not** authorise a migration: any change to either expression index requires a schema change, and
  **migration 0002 is `DO NOT COMMIT`** (`VERIFIED`, standing register).
- They are adjacent to, but separate from, **OD-18**, whose register entry lists *"tag representation"* among
  its scope (`docs/architecture/technology-decisions.md:59`; the approved portion recorded in that entry
  concerns the structured-content block schema). Whether tag *modelling* is thereby closed is **not stated**;
  this brief does not assume either way.

---

## 3. Verified current index definitions

### 3.1 The definitions, from the committed migration

`prisma/migrations/0001_phase04a_question_bank/migration.sql` (PART C), `VERIFIED`:

```sql
CREATE UNIQUE INDEX "uq_tags_name_lower" ON "tags" (lower("name"));
CREATE UNIQUE INDEX "uq_colleges_name_lower" ON "colleges" (lower("name"));
```

### 3.2 The eleven attributes asked for

Read from the migration, the Prisma schema, and the catalog of a disposable 16.2 cluster holding this exact
migration (`OBSERVED`; E-probes in §7.3). Every attribute below is identical for the two indexes **except**
the table and column.

| # | Attribute | `uq_tags_name_lower` | `uq_colleges_name_lower` |
|---|---|---|---|
| 1 | Table and column | `tags.name` | `colleges.name` |
| 2 | Expression | `lower(name)` | `lower(name)` |
| 3 | Unique | yes (`indisunique = t`) | yes (`indisunique = t`) |
| 4 | Predicate | none (`indpred` NULL) | none (`indpred` NULL) |
| 5 | Key attributes | 1 key, 1 attribute total — no `INCLUDE` | 1 key, 1 attribute total — no `INCLUDE` |
| 6 | Collation metadata | `indcollation = 100` → `pg_catalog."default"`, provider `d`, deterministic, whose **meaning is `pg_database`** | identical |
| 7 | Operator class | `indclass = 3126` = `text_ops` (default btree text opclass) | identical |
| 8 | Null semantics | `name TEXT NOT NULL`, so a NULL key cannot occur; `indnullsnotdistinct = f` is therefore inert here | identical |
| 9 | In Prisma schema? | **No.** `model Tag` declares `@@unique([slug])` only — the expression index is invisible to Prisma (`schema.prisma:380–390`) | **No.** `model College` declares **no** `@@unique` at all (`schema.prisma:430–441`) |
| 10 | Hand-maintained outside Prisma? | **Yes** — written directly in migration PART C; Prisma neither generates, validates nor diffs it | **Yes** — same |
| 11 | Column-level collicity | `pg_attribute.attcollation` = 100 (database default) — the expression inherits it | identical |

`VERIFIED` (migration, schema) / `OBSERVED` (catalog values on a disposable instance).

### 3.3 Identical definitions, different entities

The two index definitions are byte-identically shaped. That is the only thing they share:

- The **tags** table carries a **second** unique rule (`uq_tags_slug`, with a format constraint
  `slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'` and `btrim(name) <> ''` as well — `OBSERVED`, D-level catalog read),
  so a tag's identity is partly expressed outside `name`.
- The **colleges** table carries `code TEXT NULL` and **no** unique constraint on it (`OBSERVED`, E10/E13: the
  only unique indexes on `colleges` are `colleges_pkey` and `uq_colleges_name_lower`).

**Therefore:** "both indexes use `lower(name)`" is true and irrelevant. The decisions differ because the
*consequences* of equality differ (§5, §6).

---

## 4. Database guarantees versus business semantics

Six concepts, kept apart. Every "current guarantee" cell below is `OBSERVED` on a disposable PostgreSQL 16.2
cluster with `datcollate = datctype = C.utf8`, provider `libc`, encoding UTF8 (§7.2) unless marked otherwise.

| Concept | What it means | Does the current index guarantee it? | Collation-dependent? | What a different strategy would need | Business decision needed |
|---|---|---|---|---|---|
| **A — Exact-string uniqueness** | two names conflict only when stored strings are identical | **Yes, but as a by-product and only as the strongest case.** The index compares `lower(name)`, so identical strings always collide (E13 control; `tests/integration/questions/unique-conflicts.test.ts:128–148`) — but so do many non-identical strings | no | nothing: drop the expression, index `name` directly | "must spelling differences be allowed to coexist?" |
| **B — Case-insensitive uniqueness** | names differing only by case conflict | **Partially, and only as far as `lower()` reaches in this environment.** ASCII always (E1, E17); Latin-1 accents on a UTF-8 locale (E2, E18); **not** `ς/σ` (E7), **not** `ẞ/ss` (E4) | **yes** — `datctype` decides | an explicit fold expression or provider, independent of locale | "what does 'ignoring case' mean for non-ASCII scripts?" |
| **C — Locale-dependent case conversion** | the same index enforces differently depending on the environment | **Yes — this is the current fact.** `C` versus `C.utf8` on the same migration: `Ärger`/`ärger` both accepted versus rejected (`VERIFIED`, Session 14 §10.6; reproduced by dump/restore, decision doc §11.3) | **yes, definitionally** | pin a locale (OD-COLL-03) and/or an explicit fold | "is environment-dependent behaviour acceptable for a user-facing promise?" |
| **D — Unicode normalization** | canonically equivalent sequences compare equal | **No.** `é` (NFC, 1 code point) versus `e`+U+0301 (NFD, 2 code points) are **distinct** tags (E8) and **distinct** colleges (E19); `normalize()` exists and works, but no expression uses it (`VERIFIED`, decision doc E7) | **no** — normalisation is independent of collation | a normalising expression or a stored canonical column (both need migration 0002) | "should the same name typed by two keyboards be one row?" |
| **E — Full Unicode case folding** | `ẞ ≡ ss`, `ς ≡ σ`, `İ ≡ i̇` | **No.** `lower()` performs case *mapping*, not full folding: `lower('ẞ')='ß'`, `lower('ς')='ς'` (D1), and `ẞ` versus `ss` are two tags (E4), `ς` versus `σ` two tags (E7) | partly | an explicit full fold (implementation-defined), pinned to a Unicode version | "is `lower()`-equivalence the intended contract, or merely the cheapest?" |
| **F — Accent / compatibility equivalence** | `Ecole ≡ École`, `ﬁ ≡ fi` | **No.** Accents are not removed (`É`/`E` are different names; `unaccent` is unavailable in the measured build — `VERIFIED`, decision doc §5.2). Compatibility forms do not fold either (`ﬁ/fi` — `VERIFIED`, decision doc §5.3) | no (for accent stripping) | `unaccent` (unavailable), a stored folded column, or ICU | "should `Notre-Dame`/`Notre Dame` or `Ecole`/`École` be the same institution?" |

Two clarifications that must not be lost:

- **`lower()` is not a case-insensitivity specification.** It is an implementation whose behaviour depends on
  the environment (concept C). Describing the current rule as "case-insensitive" is a product claim, not a
  technical description.
- **`lower()` must never be described as full case folding.** It is a per-code-point case mapping whose table
  comes from the operating system; full folding is a different operation with different results (`ẞ`→`ss`,
  `ς`→`σ`), and no layer of this system performs it (`OBSERVED`, E4/E7; decision doc §5.2).
- **A stricter policy is not automatically a better one.** Concepts D–F are technically reachable; whether
  they are *desirable* is a business question this brief deliberately does not answer.

---

## 5. OD-COLL-01 — tags

### 5.1 The entity, verified

| Property | Value | Source |
|---|---|---|
| Columns | `id uuid`, `name text NOT NULL`, `slug text NOT NULL`, `created_at` | migration `:214–221`; `schema.prisma:380–390` |
| Unique rules | `uq_tags_slug` (plain), `uq_tags_name_lower` (expression) | migration `:366`, `:640` |
| Check constraints | `ck_tags_name_not_blank` (`btrim(name) <> ''`), `ck_tags_slug_format` (`^[a-z0-9]+(-[a-z0-9]+)*$`) | `OBSERVED` (catalog) |
| References | `question_tags(question_id, tag_id)`, PK `(question_id, tag_id)`, both FKs `ON DELETE CASCADE` | migration `:224–230`, `:447`; `schema.prisma:393–404` |
| Seed shape | curriculum topics: `Computer Network`, `Database`, `Programming` with derived slugs | `docs/database/g1-spike/option-c/prod-ready/v2/seed-data.sql:69–72` |

### 5.2 Is there an implemented creation or merge workflow?

**No.** `VERIFIED` (absence, by grep over `server/`, `app/`, `lib/`, `components/`, `scripts/`):

- no `prisma.tag.*` call exists outside tests — the only `prisma.tag.create` occurrences are in
  `tests/integration/questions/unique-conflicts.test.ts`;
- no slug generator exists (slugs are supplied by whoever writes the row);
- `app/` contains only `layout.tsx` and `page.tsx`; `server/` contains the publish-validation pipeline, which
  does not touch tags or colleges;
- the only production-ish reference to the index names is the error-mapping registry
  `server/questions/publish/db-errors.ts:68–72` and its type union `errors.ts:44`.

**Consequence:** any statement about "how tags are created today" would be invented. What exists is a
constraint plus a prepared error message for a workflow that has not been written.

### 5.3 The product intent question

| Question | Evidence | Answer |
|---|---|---|
| Are tags labels whose spelling and case are meaningful? | `uq_tags_name_lower` rejects case variants (E1); the error text says *"names are compared ignoring case"*; `slug` is separate and unique | **Case is not meaningful to the database; spelling is** — but the two answers disagree for non-ASCII input (§4) |
| Should `ICT` and `ict` be one tag? | E1: they are one tag today (ASCII case) | technical answer: **one**. Business answer: **not recorded** — no owner statement exists |
| Should canonically equivalent Unicode spellings be one tag? | E8: they are **two** tags today | technical answer: **two**. Whether that is intended is `UNKNOWN` |
| Are tags a reusable taxonomy rather than arbitrary labels? | M2M `question_tags`, unique format-checked slug, curriculum-shaped seed data, `ix_question_tags_tag_id` for reverse lookup | **`DERIVED` (probable, not established):** the schema is shaped for a controlled vocabulary. No editor, listing endpoint or dedupe UI exists to confirm it |
| Does a merge affect `question_tags`? | E11/E11c (§5.4) | **Yes, decisively** |
| Could a merge create duplicate associations or PK conflicts? | E11: naive repoint → `question_tags_pkey` violation | **Yes** |
| What happens to historical question references? | `ON DELETE CASCADE` on `question_tags.tag_id` → deleting a tag removes its links (E11c), leaving questions intact but untagged | **Links are destroyed silently; questions are not deleted** |

### 5.4 The merge mechanics, executed

| Probe | Action | Result |
|---|---|---|
| **E11** | `UPDATE question_tags SET tag_id = <survivor> WHERE tag_id = <loser>` where a question carries both tags | **REJECTED** — `duplicate key value violates unique constraint "question_tags_pkey"` |
| **E11b** | insert missing `(question_id, survivor)` pairs with `ON CONFLICT DO NOTHING`, then delete the loser | **ACCEPTED** — surviving links preserved (count = 1) |
| **E11c** | `DELETE FROM tags WHERE id = <tag in use>` | **CASCADE** — `question_tags` rows for that tag reach 0, with no error |

**Reading:** a tag merge is implementable, but only in a specific shape; the shapes people reach for first
(repoint, then delete) fail or destroy data. This is why the validation rule says *"no automatic merge, ever"*
(decision doc §10.5) — now executed rather than argued.

### 5.5 What OD-COLL-01 actually decides

Not "should tags be case-insensitive" — that is the status quo — but **which equality relation is the intended
one**, and therefore whether the present relation is acceptable as the contract:

- **A** — ASCII-only folding, identical everywhere, weaker than the message;
- **B** — `lower()` under the environment's ctype (status quo), strongest where the locale is richest, invisible
  where it is not;
- **C** — an explicit fold (+ normalisation) that the database and application share, requiring migration 0002;
- **D** — a different identity model (e.g. slug or a generated canonical key becomes the key; name becomes
  display-only);
- **E** — defer.

§8 evaluates these for tags; §12 records the decision.

---

## 6. OD-COLL-02 — colleges

### 6.1 The entity, verified

| Property | Value | Source |
|---|---|---|
| Columns | `id uuid`, `name text NOT NULL`, **`code text NULL`**, `is_active boolean NOT NULL DEFAULT true`, timestamps | migration `:247–256`; `schema.prisma:430–441` |
| Unique rules | `uq_colleges_name_lower` **only** | `OBSERVED`, E13: unique indexes on `colleges` are `colleges_pkey` and `uq_colleges_name_lower` |
| `code` uniqueness | **none** — two colleges share `DUPCODE2`, one row has `code` NULL, all accepted | `OBSERVED`, E10 |
| References | `question_sources.college_id` (nullable), `ON DELETE RESTRICT` | migration `:456`; `schema.prisma:461–485` |
| Location fields | **none** — no city, district, region or address column exists | `VERIFIED` (`schema.prisma:430–441`) |
| Seed shape | `Notre Dame College` / `NDC`, `Dhaka College` / `DC` | `seed-data.sql:60–62` |

### 6.2 Is there an implemented workflow?

**No** — same absence as §5.2: no `prisma.college.*` outside tests, no read of `college.code` anywhere in
application code, no college editor. The integration test creates a college with `name` only
(`tests/integration/questions/unique-conflicts.test.ts:159–174`), so `code` is NULL in every row that test
creates.

**Consequence:** `code` is a *declared but unexercised* field. It is populated in seed data, which is evidence
that someone intended it to carry an abbreviation — not evidence that it is an identity key.

### 6.3 Identity questions, with what the repository can and cannot answer

| Question | Evidence | Answer |
|---|---|---|
| Is `name` a display label or an identity key? | it is the **sole** unique rule; `code` exists but is unconstrained | **Today: identity key.** The schema does not separate the two |
| Can two genuinely distinct colleges share a name? | no data, no documentation, no owner statement | **`UNKNOWN`** — this is the decisive business question and it is not answerable from the repository |
| Does geographic or institutional context distinguish them? | **no location field exists**; only `name`, `code`, `is_active` | **Not representable today.** A "same name, different place" rule would need new columns (forbidden by standing decisions) |
| Is a stable identifier available? | `code TEXT NULL`, non-unique, unread by code; `id uuid` is stable but opaque | **Partially** — `id` is a stable key but not a human-meaningful one; `code` is not yet a key |
| Would case-insensitive uniqueness reject distinct institutions? | E18: `École Normale` and `école normale` collide; E17: ASCII case collides | **Yes, whenever two distinct institutions differ only by case.** Whether such pairs exist is `UNKNOWN` (no data) |
| Does changing uniqueness affect `question_sources` attribution? | E12/E12b (§6.4) | **Yes** — through the NND attribution rule, and through `ON DELETE RESTRICT` |
| Could merging/repointing create duplicate source identities? | E12b: repointing one of two otherwise-identical sources onto the survivor → **REJECTED** by `uq_question_sources_identity` | **Yes, and it fails loudly** |

### 6.4 The merge and attribution mechanics, executed

| Probe | Action | Result |
|---|---|---|
| **E12** | two `question_sources` rows for the same question/type/year, different `college_id` | **ACCEPTED** — distinct colleges are distinct attributions |
| **E12b** | repoint the second row onto the survivor's `college_id` | **REJECTED** — `duplicate key value violates unique constraint "uq_question_sources_identity"` |
| — | `ON DELETE RESTRICT` on `question_sources.college_id` | `VERIFIED` from DDL: deleting a referenced college is blocked, so a "delete the duplicate" strategy fails while any source points at it |
| **E10/E13** | `code` duplicated / NULL | **ACCEPTED** — no unique rule on `code` |

**Reading:** a college merge is not merely a rename. It must repoint attributions *without* creating a
`NULLS NOT DISTINCT` duplicate, which means the merge may have to decide which attributions are duplicates —
a provenance judgement, not a data-cleaning step.

### 6.5 Distinct identity from display similarity

The repository's own counter-example is `boards`: `code String` (required) with `uq_boards_code`, plus two
display-name columns (`name_bn` nullable, `name_en` required) and an `is_active` flag (`schema.prisma`, `Board`). That is the pattern
"identity key ≠ display label". `colleges` half-adopts it: the `code` column exists and is seeded, but is
nullable, non-unique and unused. **`DERIVED`:** the missing step is a decision, not a field.

---

## 7. Unicode and collation evidence

### 7.1 What is already established about CI (and what it is not)

| Fact | Value | Label |
|---|---|---|
| CI PostgreSQL | `16.16 (Debian 16.16-1.pgdg13+1)` | `VERIFIED` (run `45546248909`, check run `138976563830`, commit `0aae1368`) |
| CI profile | UTF8, provider `libc`, `datcollate = datctype = en_US.utf8`, `daticulocale` NULL, `datcollversion = 2.41` | `VERIFIED` |
| Both CI databases | byte-identical fingerprints | `VERIFIED` |

Boundaries that must travel with those facts, unchanged from the source documents:

- CI is **not** production; production's provider, locale and version remain `UNKNOWN`.
- CI-to-production **semantic equivalence is not established**.
- CI's **folding behaviour was not measured** in that run — only the `pg_database` row was read.
- `en_US.utf8` and `C.utf8` were **never compared directly** in this repository's measurements.
- The `Ä/ä`, `ẞ/ß`, `İ/i`, `K`(U+212A)`/k` examples in earlier documents are **local `C.utf8`-versus-`C`**
  observations, not CI behaviour, and are not generalisable to other PostgreSQL, libc, ICU or Unicode versions.

### 7.2 The disposable experiment executed this session

Because the guarantees in §4 are the substance of both decisions, they were measured directly on the real
migration rather than inferred. The environment is recorded exactly, and it is **not** CI and **not**
production:

| Item | Value |
|---|---|
| PostgreSQL | `16.2` on `x86_64-pc-linux-gnu` (pywheel build) |
| Database | fresh cluster, `initdb --locale=C.utf8 --encoding=UTF8` |
| `datcollate` / `datctype` | `C.utf8` / `C.utf8` |
| Encoding | UTF8 |
| Provider | `libc` (`datlocprovider = 'c'`) |
| `daticulocale` | NULL |
| `datcollversion` | **NULL** (this local build; the CI image reports `2.41` — a different environment) |
| Schema | `prisma/migrations/0001_phase04a_question_bank/migration.sql` applied verbatim — 18 tables, both expression indexes created |
| Lifetime | disposable; stopped with `pg_ctl -m fast stop` and deleted after the probes |

### 7.3 Every probe and its outcome

Each row was executed; none is inferred. "REJECTED" means the unique index refused the second row.

| ID | Probe | Outcome |
|---|---|---|
| E1 | `Logic Gate` then `logic gate` (tags) | **REJECTED** — `uq_tags_name_lower` |
| E2 | `Ärger` then `ärger` | **REJECTED** — `uq_tags_name_lower` |
| E3 | `ẞ` then `ß` | **REJECTED** — `uq_tags_name_lower` |
| E4 | `ẞ` then `ss` | **ACCEPTED** — no full case folding |
| E5 | `İstanbul` then `istanbul` | **REJECTED** — `uq_tags_name_lower` |
| E6 | `K` (U+212A) then `k` | **REJECTED** — `uq_tags_name_lower` |
| E7 | `ς` then `σ` | **ACCEPTED** — no final-sigma folding |
| E8 | `é` (NFC) then `e`+U+0301 (NFD) | **ACCEPTED** — no normalisation |
| E9 | `Dhaka College`, then the same name with one trailing space | **ACCEPTED** — no trimming |
| E10 | two colleges sharing `code = DUPCODE2`; one with `code` NULL | **ACCEPTED** — no unique rule on `code` |
| E11 | naive tag merge: `UPDATE question_tags SET tag_id = survivor` | **REJECTED** — `question_tags_pkey` |
| E11b | tag merge as insert-if-absent (`ON CONFLICT DO NOTHING`) then delete loser | **ACCEPTED** — links preserved |
| E11c | `DELETE` a tag in use | **CASCADE** — its `question_tags` links silently removed |
| E12 | two sources for one question differing only by college | **ACCEPTED** — distinct attributions |
| E12b | repoint the second source onto the survivor college | **REJECTED** — `uq_question_sources_identity` |
| E13 | unique indexes on `colleges` | **2** — `colleges_pkey`, `uq_colleges_name_lower` |
| E17 | `Notre Dame College` then `notre dame college` (colleges) | **REJECTED** — `uq_colleges_name_lower` |
| E18 | `École Normale` then `école normale` | **REJECTED** — `uq_colleges_name_lower` |
| E19 | `Ecole é`(NFC)`lite` then NFD variant | **ACCEPTED** — no normalisation |
| E20 | `Notre-Dame College` and a genuinely different name | **ACCEPTED** (control: distinct names coexist) |
| D1 | `lower()` mapping | `lower('ẞ')='ß'`, `lower('İ')='i'`, `lower('K')='k'`, `lower('ς')='ς'` |
| D2 | normalisation primitives | `length(NFC é)=1`, `length(NFD)=2`, `normalize(NFD, NFC)` equals the NFC string |
| D3 | punctuation/whitespace | `lower('Notre-Dame College') ≠ lower('Notre Dame College')`; `lower('Dhaka  College') ≠ lower('Dhaka College')` |

### 7.4 What remains unmeasured

| Item | Why | Label |
|---|---|---|
| ICU and non-deterministic collations | ICU is not supported in the obtainable build (Session 14 §10.8) | `NOT TESTED` |
| PostgreSQL 15, 17, 18 | only a 16.2 binary distribution is available here | `NOT TESTED` |
| `en_US.utf8` versus `C.utf8` directly | `en_US.utf8` is not installed in this environment | `NOT TESTED` |
| CI's own folding behaviour | the CI run read the catalog, not folded strings | `NOT TESTED` |
| **Any real tag or college data** | no production or staging access; no data set exists in the repository | `UNKNOWN` |
| Production's profile | out of scope here (OD-COLL-03) | `UNKNOWN` |

---

## 8. Candidate uniqueness strategies

Five candidate strategies, evaluated **independently** per entity. None is approved. Each row states what the
option would mean, not that it would be wise.

### 8.1 Option A — preserve `UNIQUE(lower(name))` (status quo)

| Aspect | Tags | Colleges |
|---|---|---|
| Business meaning | "same name modulo `lower()` in whatever locale the database has" | identical formulation, much higher stakes: it is the entity's only identity rule |
| Technical implementation | no change | no change |
| Advantages | zero work; already deployed and negative-tested; strongest available behaviour where the environment is a UTF-8 locale | same, plus: no data migration risk |
| Risks / edge cases | silently weaker on a `C`-locale database (E8-class behaviour); no normalisation (E8); no full folding (E4/E7); the user-facing message overstates it | same, plus: a `C`-locale production database would accept `ÉCOLE`/`école` as two colleges with no other rule to catch it |
| Unicode implications | equals `lower()`, nothing more | same |
| Existing data | none (no change) | none |
| Referential integrity | none | none |
| Prisma / migration | none — Prisma does not model the index | none |
| Required validation | none for the change itself | none for the change itself |
| Depends on OD-COLL-03 | **yes** — its meaning *is* the environment | **yes** |

### 8.2 Option B — exact-string uniqueness

| Aspect | Tags | Colleges |
|---|---|---|
| Business meaning | spelling and case are both meaningful; `ICT` and `ict` are two tags | two colleges differing only in case are two colleges |
| Technical implementation | `UNIQUE(name)` — a migration replacing the expression index | same |
| Advantages | fully portable, locale-independent, trivially predictable | same |
| Risks / edge cases | contradicts the current user-facing message *and* the existing error mapping; would **weaken** today's guarantee everywhere (a UTF-8 database currently rejects case variants) | would allow `Dhaka College` and `dhaka college` as separate institutions — a provenance split the current rule prevents |
| Unicode implications | none — byte equality | none |
| Existing data | any pair currently rejected as a case variant would now be legal, so **no** remediation needed; but the *report* must still show how many such pairs exist today | same, and the count is a direct measure of how much the status quo has been relied upon |
| Referential integrity | none | none |
| Prisma / migration | a new migration (0002 — **`DO NOT COMMIT`**) | same |
| Required validation | inventory of existing case-variant pairs | same |
| Depends on OD-COLL-03 | no | no |

### 8.3 Option C — explicit normalisation then uniqueness

| Aspect | Tags | Colleges |
|---|---|---|
| Business meaning | an explicit, written equality rule: fold case by a named specification and normalise (e.g. NFC), optionally more | same, with the option of accent/punctuation insensitivity if the owner wants it |
| Technical implementation | a stored generated canonical column (app-produced fold) or an expression index over a pinned fold; either way a schema change | same |
| Advantages | environment-independent by construction; the rule becomes reviewable; the user-facing message can be made true for the folded subset | same |
| Risks / edge cases | **larger** equivalence classes than today ⇒ previously legal pairs become duplicates; needs a fold specification and a pinned Unicode version; `lower()`+`NFC` alone is *not* full folding (decision doc §5.2) | higher data risk: colleges are curated, and a fold that merges two real institutions cannot be undone |
| Unicode implications | explicit and testable, but only as good as the chosen specification | same, plus `unaccent` is unavailable in the measured build |
| Existing data | **must** be validated before the index can be built — the build will fail if collisions exist | same, with a much higher chance of genuine collisions |
| Referential integrity | merges implied by collisions hit the `question_tags` PK (E11) | merges implied by collisions hit `uq_question_sources_identity` (E12b) |
| Prisma / migration | a new column or expression ⇒ **0002** (prohibited) and hand-written SQL | same |
| Required validation | §9 in full | §9 in full |
| Depends on OD-COLL-03 | **no** (that is its purpose) | **no** |

### 8.4 Option D — a stable canonical identity key separate from the display name

| Aspect | Tags | Colleges |
|---|---|---|
| Business meaning | `name` becomes display-only; identity lives in a key (today's `slug` is the candidate) | `name` becomes display-only; identity lives in a code or generated key (`code` is the candidate field, currently nullable/non-unique) |
| Technical implementation | make the existing `slug` the authoritative key (it already is unique and format-checked) and relax or drop `uq_tags_name_lower`; optionally standardise slug derivation in code | make `code` `NOT NULL` + unique (or introduce a generated key), then relax the name rule |
| Advantages | separates "what it is called" from "which one it is" — the `boards` pattern the repository already uses; **no** Unicode policy needed for identity | same; also fixes the current situation where an institution cannot be distinguished by anything but its spelling |
| Risks / edge cases | slugs are authoring-supplied today (no generator exists), so uniqueness would rest on data-entry discipline; renaming becomes free while identity stays stable — which may or may not be desired | `code` is NULL in existing test-created rows and absent from all application code; making it NOT NULL is a data-migration event; no owner has defined what a college code *is* |
| Unicode implications | none for identity; the display name may then be non-unique, so case variants become **visible** in listings | same |
| Existing data | rows whose slug equals another row's slug cannot exist (already unique); the validation is about whether duplicate *names* should be allowed to coexist | code backfill for every existing row, and duplicate codes may already exist (E10 shows nothing prevents them) |
| Referential integrity | none directly; a name-only duplicate is then a **display** problem, not a data-loss problem | none directly |
| Prisma / migration | a unique index change is a migration (0002); `code` NOT NULL is a migration plus backfill | same |
| Required validation | whether any two tags share a name and differ only in a way the owner considers meaningful | whether any two colleges share a name today (i.e. how often the current rule has already merged or rejected them) |
| Depends on OD-COLL-03 | no | no |

### 8.5 Option E — defer

| Aspect | Tags | Colleges |
|---|---|---|
| Business meaning | no policy change; the environment keeps deciding | same |
| Technical implementation | none | none |
| Advantages | no data risk; reversible; lets OD-COLL-03/06 supply the missing evidence first | same |
| Risks / edge cases | the user-facing promise stays environment-dependent; a `C`-locale production deployment would silently weaken `uq_colleges_name_lower` with no other rule behind it | same, and worse: colleges have no second rule |
| Unicode implications | status quo, undocumented | status quo, undocumented |
| Existing data | unchanged | unchanged |
| Referential integrity | unchanged | unchanged |
| Prisma / migration | none | none |
| Required validation | none to defer | none to defer |
| Depends on OD-COLL-03 | it *waits* for it | same |

---

## 9. Existing-data validation

### 9.1 What must be detected, per table

Read-only, on a snapshot, never on the live system. Query shapes are the same for both tables; the table names
differ.

| # | Detection | Query shape | What a hit means |
|---|---|---|---|
| 1 | Exact duplicate names | `GROUP BY name HAVING count(*) > 1` | impossible under the current index — a hit would mean the index is absent or invalid |
| 2 | Duplicates under the current expression | `GROUP BY lower(name) HAVING count(*) > 1` | likewise impossible today; a hit is an integrity finding |
| 3 | Collisions under each candidate key | `GROUP BY lower(name) COLLATE "C"`, `GROUP BY normalize(lower(name), NFC)`, `GROUP BY <chosen fold>` | each hit marks a pair the candidate policy would reject |
| 4 | NFC/NFD variants of one name | `WHERE name <> normalize(name, NFC)` and a normalised-key grouping | a normalisation policy would merge two rows that look identical on screen (E8/E19 prove they coexist today) |
| 5 | Case-folding collisions under a candidate fold | `GROUP BY <fold(name)>` versus today's key | the exact remediation scope for Option C |
| 6 | Pairs that would collide **only after a locale change** | compare `lower(name)` under `C` versus under the target UTF-8 locale for the same rows | measures the silent weakening a restore or a rebuild would cause (`VERIFIED` mechanism: Session 14 §10.6) |
| 7 | References affected by a prospective merge | `question_tags` counts per tag; `question_sources` counts per college | defines what a merge would move, and whether it can move at all (§9.3) |

### 9.2 The five stages, which must not be collapsed

| Stage | Content | Output | Authority |
|---|---|---|---|
| 1 | Read-only discovery (§9.1) | a collision report | a separate, explicit authorisation for read-only access |
| 2 | Owner review of collision groups | a decision per group: distinct rows, duplicate rows, or "cannot tell" | **owner** |
| 3 | Explicit remediation approval | a reviewed plan naming the rows and the operation | **owner** |
| 4 | Data remediation | the merges/renames themselves, executed and verified | owner + reviewer |
| 5 | New index creation and verification | `CREATE UNIQUE INDEX CONCURRENTLY`, then verification, then (later) removal of the old rule | owner + reviewer |

No stage produces the next automatically, and **no automatic merge exists or is proposed**.

### 9.3 Entity-specific hazards

| Entity | Hazard | Evidence |
|---|---|---|
| Tags | naive repoint collides on `question_tags_pkey` | E11 |
| Tags | `ON DELETE CASCADE` silently deletes question–tag links; a "delete the loser" step destroys them | E11c |
| Tags | a question may legitimately carry **both** tags, in which case the merge **loses information** rather than de-duplicating it | `DERIVED` (PK means at most one link per pair; a merge collapses two to one) |
| Colleges | repointing sources can violate `uq_question_sources_identity` (`NULLS NOT DISTINCT`) | E12b |
| Colleges | `ON DELETE RESTRICT` blocks deleting a referenced college | `VERIFIED` (DDL) |
| Colleges | merging two colleges can create duplicate *attributions*, which is a provenance judgement, not a cleanup | `DERIVED` from E12b |

### 9.4 Prohibitions, restated because they are easy to violate

- No scan of production or staging data exists, and none is authorised.
- A validation script never `DELETE`s or `UPDATE`s (decision doc §10.7).
- A collision is a **question for a human**, never evidence that rows should be merged.

---

## 10. Referential-integrity and migration implications

### 10.1 What any change costs, structurally

| Requirement | Consequence |
|---|---|
| Changing the expression of either index | a new migration; **migration 0002 is `DO NOT COMMIT`** (`VERIFIED`, standing register) — so no change is implementable today |
| Prisma models the indexes | **No.** Neither expression index appears in `schema.prisma`; Prisma would neither create nor preserve them, so any change must be hand-written and reviewed like the originals |
| Building a new unique index over existing data | fails closed if collisions exist — by design, and the reason stage 4 precedes stage 5 (§9.2) |
| Dropping and recreating on a live table | `CREATE UNIQUE INDEX CONCURRENTLY` then `ALTER TABLE … ADD CONSTRAINT … USING INDEX`; **keep the old rule until the new one is valid** (`PROPOSED`, decision doc §10.6) |
| A generated canonical column (Option C/D) | new column + backfill + index = a migration with a data step, which the standing decisions do not authorise |

### 10.2 What the executed probes change about the risk picture

Before this session, both merge hazards were recorded as `VERIFIED` by *schema reading* (decision doc §10.5).
They are now `OBSERVED` by execution (E11, E11c, E12b), which upgrades the statement from "this follows from
the DDL" to "this is what PostgreSQL does with this migration". The safe tag-merge shape was executed too
(E11b), so the hazard is known to be avoidable — but only deliberately.

### 10.3 What is *not* implied

- Neither index needs to change for the current schema to be correct. Both are valid, present, and negative-
  tested in G-3 (`VERIFIED`, `G-3 PASSED`).
- No deployment is required, proposed or authorised by this brief.

---

## 11. Decision dependency map

| Decision | Question | Relationship to OD-COLL-01/02 | Can it be clarified independently? |
|---|---|---|---|
| **OD-COLL-01** | tags equality semantics | — | **yes** — it is a business question; the environment only changes its *enforcement* |
| **OD-COLL-02** | colleges equality semantics | independent of 01 | **yes**, for the same reason |
| **OD-COLL-03** | production collation profile | **supplies the meaning** of Option A/B; is not answered by either | **no** — needs production measurement |
| **OD-COLL-04** | fingerprint fields / canonical form | carries whichever profile 03 selects; says nothing about uniqueness | partly — the *shape* can be agreed before values exist |
| **OD-COLL-05** | drift failure policy | decides what happens when the environment changes under a chosen semantics | partly — policy shape is independent; its values are not |
| **OD-COLL-06** | existing-data validation requirements | **prerequisite** to implementing any option that changes equivalence (B, C, D) | partly — its *requirements* can be fixed now; the *report* needs data |
| **OD-18** (existing register) | structured-content schema, including *tag representation* | adjacent: if tags are modelled differently at the content layer, 01's scope changes | `UNKNOWN` — the register entry's approved portion concerns the block schema; tag modelling status is not stated |
| `T1` / `R2` | CI measurement / comparison rule | `T1` **CLOSED**, `R2` **PARTIALLY RESOLVED**; neither answers 01/02 | — |

Four separations that must survive any summary:

1. **A business uniqueness policy does not select a production locale.** OD-COLL-01/02 can be answered while
   OD-COLL-03 stays open; the answer would then be *unimplementable until the profile is known* if it depends
   on `lower()`.
2. **A selected locale does not establish the correct business identity policy.** OD-COLL-03 being answered
   (say, a UTF-8 profile) makes Option B *predictable*, not *correct*.
3. **A fingerprint does not prove semantic equivalence** (decision doc §8.5; OD-COLL-03 brief §6.3).
4. **A passing CI test does not establish production data compatibility.** G-3's tag case is ASCII-only
   (`enforce.sql:632–645`, `VERIFIED`).

---

## 12. Independent owner decision tables

### 12.1 OD-COLL-01 — tags

| Field | Record |
|---|---|
| **Decision ID** | `OD-COLL-01` |
| **Business question** | What makes two tags "the same tag" for uniqueness purposes: exact spelling, case-insensitive equality (which one), a normalised/folded form, or a key other than the name? |
| **Current database guarantee** | Equality of `lower(name)` under the database's ctype — ASCII case and (on UTF-8 locales) accented Latin case collide; NFC/NFD variants, `ς/σ`, `ẞ/ss` and trailing spaces do **not** (§4, §5.4) |
| **Candidate options** | **A** keep `lower()` (status quo) · **B** exact string · **C** explicit normalisation/fold · **D** identity moved to `slug` (name becomes display) · **E** defer |
| **Evidence available** | the exact index definition and catalog metadata (§3); current behaviour measured (E1–E9); the promise made to users (`db-errors.ts:68–72`); the M2M merge mechanics measured (E11–E11c); `slug` already unique and format-checked |
| **Evidence missing** | **any real tag data** — how many tags exist, how many pairs differ only by case or normalisation; whether the publishing editor will type free text or pick from a list; whether `slug` derivation will be automated; the owner's product intent; production's profile (OD-COLL-03) |
| **Data-impact considerations** | Option C/D can create collisions requiring merges; merges must respect `question_tags_pkey` and must not rely on `ON DELETE CASCADE`; a question carrying both tags loses one association |
| **Related dependencies** | OD-COLL-03 (meaning of A/B), OD-COLL-04/05 (assertion and drift), OD-COLL-06 (validation), OD-18 (representation) |
| **Technical recommendation, if justified** | **No policy recommendation is justified.** The evidence does not distinguish A/B/C/D on merit; only the mechanics are established. A *process* recommendation is in §13.1 |
| **Owner approval status** | **`OPEN — NO OWNER DECISION RECORDED`** |

### 12.2 OD-COLL-02 — colleges

| Field | Record |
|---|---|
| **Decision ID** | `OD-COLL-02` |
| **Business question** | Is `colleges.name` the institution's identity, or its display label — and if the latter, what carries identity, given that `code` is nullable, non-unique and read by no code today? |
| **Current database guarantee** | The same folded equality as tags — and, unlike tags, it is the entity's **only** uniqueness rule. Two colleges differing only by case (including accented case) cannot coexist (`OBSERVED`, E17/E18); NFC/NFD variants can (E19) |
| **Candidate options** | **A** keep `lower()` · **B** exact string · **C** explicit normalisation/fold (possibly accent/punctuation-insensitive) · **D** identity moved to `code` or a generated key (name becomes display) · **E** defer |
| **Evidence available** | the exact index definition and catalog metadata (§3); the **sole-rule** status (§6.1); behaviour measured (E17–E20); the attribution merge mechanic measured (E12/E12b); `code` non-uniqueness measured (E10/E13); the `boards` precedent for key-versus-display; `ON DELETE RESTRICT` on the FK |
| **Evidence missing** | **any real college data**; whether distinct institutions legitimately share a name; whether a canonical college list with codes exists outside the repository; what a "college code" is meant to be; why `code` was seeded but never constrained; production's profile |
| **Data-impact considerations** | a stricter policy can reject legitimate institutions; a looser one allows provenance splits; a merge can violate `uq_question_sources_identity` and is blocked by `ON DELETE RESTRICT` while sources point at the row; there is **no location field** to distinguish same-named institutions |
| **Related dependencies** | OD-COLL-03/04/05/06; OD-08 (conditional association of college in `question_sources`, per `docs/database/data-dictionary.md`) |
| **Technical recommendation, if justified** | **No policy recommendation is justified.** The decisive question ("can two distinct colleges share a name?") is not answerable from the repository, and the schema has no field to express the distinction if the answer is "yes". A process recommendation is in §13.2 |
| **Owner approval status** | **`OPEN — NO OWNER DECISION RECORDED`** |

**Neither status may be inferred from the other.** They are separate records with separate evidence gaps.

---

## 13. Recommendations and unresolved questions

### 13.1 What *is* recommended (process only, `PROPOSED`, approves nothing)

1. **Answer the business question before the environment question.** For each entity the owner can state, in
   plain language, which of these is true: *spelling matters*, *letter case does not matter*, *accent and
   normalisation do not matter*, or *identity is carried by a key and the name is display*. That statement
   needs no production access and no migration.
2. **Do not choose Option C to "future-proof" the data.** Its equivalence classes are larger than today's, so
   it converts a theoretical problem into a data-remediation project, and there is no data to size it.
3. **Treat `slug` (tags) and `code` (colleges) as candidates, not as facts.** Both exist; neither is exercised
   by any code; `code` additionally has no uniqueness rule.
4. **Never merge automatically.** The executed probes show both naive shapes fail or destroy data (E11, E11c,
   E12b) and one deliberate shape works (E11b).
5. **Keep 01 and 02 separate in the register.** Even if the owner chooses the same policy for both, record it
   twice with its own evidence — the failure costs differ (§2.2).

### 13.2 Unresolved questions

| # | Question | Entity | Who can answer |
|---|---|---|---|
| T1 | Should `ICT` and `ict` be one tag, and is the current ASCII/UTF-8 split acceptable? | tags | owner |
| T2 | Should two spellings of the same word that differ only in Unicode normalisation be one tag? | tags | owner |
| T3 | Is `slug` intended as the tag's permanent identity (i.e. is renaming a tag allowed to change its name but not its slug)? | tags | owner + architecture (OD-18) |
| T4 | Will tags be typed free-form during publishing, or chosen from a maintained list? | tags | product owner |
| C1 | **Can two genuinely distinct colleges share a name?** | colleges | owner (domain) — this is the decisive question |
| C2 | If yes, what distinguishes them today, given there is no location field? | colleges | owner + schema decision (would need new columns) |
| C3 | Is `code` meant to be the institution's stable identifier, and is a canonical code list available? | colleges | owner + operations |
| C4 | Should `École`/`Ecole` or `Notre-Dame`/`Notre Dame` be the same institution? | colleges | owner |
| X1 | How many tag and college rows exist, and how many collision pairs would each option create? | both | OD-COLL-06 validation, once data access is authorised |
| X2 | What production profile will the database have? | both | OD-COLL-03 |

### 13.3 What would change the picture

- **Real row counts and collision counts** (X1) would convert T2/C4 from preference to arithmetic.
- **An owner statement that a college name is display-only** would move OD-COLL-02 towards Option D and make
  `code` a schema task rather than a semantics task.
- **A production profile** (OD-COLL-03) would not choose a policy, but it would decide whether the status quo
  is meaningfully case-insensitive or effectively ASCII-only.

---

## 14. Explicit non-authorisations

This brief authorises **none** of the following, and none is implied:

- changing `uq_tags_name_lower`, `uq_colleges_name_lower`, `uq_tags_slug`, or any other index;
- selecting or recommending a uniqueness policy, or closing OD-COLL-01/02;
- normalising, trimming, merging, renaming or deleting any tag, college or association;
- adding a college code constraint, a canonical-name column, or any column at all;
- modifying `prisma/schema.prisma`, migration 0001, or creating migration 0002 (**`DO NOT COMMIT`** stands);
- implementing normalisation code, an index-integrity guard, or an environment check;
- modifying application code, workflows, scripts, probes or tests;
- connecting to production or staging, reading their catalogs, or scanning their data;
- changing **OD-COLL-03/04/05/06** (all `OPEN`), **T1** (`CLOSED`), **R2** (`PARTIALLY RESOLVED`);
- changing **G-1** (FAILED), **G-3** (PASSED), Option C (approved, controlled workflow only), **B1a**
  (APPROVED, workflow-scoped), **B1b/B1c** (NOT APPROVED), **B2** (WITHHELD), migration 0001 (NOT AUTHORIZED
  for production), **G-2** (DEFERRED), **OD-17/OD-21/OD-NM-1** (OPEN);
- creating a pull request, merging, deploying, committing or pushing.

---

## 15. Evidence references

### 15.1 Repository artifacts read

| Artifact | What was taken from it |
|---|---|
| `prisma/migrations/0001_phase04a_question_bank/migration.sql` | `:214–221` (`tags`), `:224–230` (`question_tags`), `:247–256` (`colleges`), `:366` (`uq_tags_slug`), `:447`/`:456` (FKs and their delete actions), `:640–641` (the two expression indexes) |
| `prisma/schema.prisma` | `model Tag` (380–390), `model QuestionTag` (393–404), `model College` (430–441), `model QuestionSource` (461–485), `model Board` (code + two names), `enum SourceType` |
| `server/questions/publish/db-errors.ts` | `:68–77` — the user-facing messages naming both indexes |
| `server/questions/publish/errors.ts` | `:44–46` — the error-code union |
| `tests/integration/questions/unique-conflicts.test.ts` | `:128–175` — executed cases for both indexes, ASCII only |
| `docs/database/g1-spike/option-c/g3-full/enforce.sql` | `:632–645` — G-3 case 30, ASCII case for `uq_tags_name_lower`; `:647–668` — case 31, the `NULLS NOT DISTINCT` rule |
| `docs/database/g1-spike/option-c/prod-ready/v2/seed-data.sql` | `:60–62` (colleges with codes), `:69–72` (tags with slugs) |
| `docs/database/phase-04a-database-collation-product-and-environment-decision.md` | §4.1–§4.4, §5.1–§5.4, §6.1–§6.3, §7.5, §7.7, §8.5, §10.1–§10.7, §11.3, §12 (register rows OD-COLL-01/02), §13 |
| `docs/database/phase-04a-index-collation-r2-investigation.md` | §4.1–§4.3 (default collation as a placeholder), §5.5–§5.7, §10.6 (the `C`-versus-`C.utf8` integrity finding), §10.8 (ICU unavailable), §12.1 (expectation forms) |
| `docs/database/phase-04a-index-integrity-guard-design.md` | §3.1–§3.5 (inventory and catalog metadata), §9.2 (M9–M11), §10.1 |
| `docs/database/phase-04a-od-coll-03-production-collation-profile-decision-brief.md` | §3 (CI evidence and its boundaries), §5 (six-index impact analysis), §6.3 (fingerprint is identity, not equivalence), §11 |
| `docs/database/phase-04a-final-database-deployment-decision-package.md` | §8 (index preservation), §10 (operational readiness), §12–§13 (B1b/B2 unchanged) |
| `docs/architecture/technology-decisions.md` | `:59` — OD-18's register row (scope includes *tag representation*); `:63` — OD-22 open |
| `docs/database/data-dictionary.md` | `:23` — `QuestionTag` entry ("entity versus join and normalization OD-18") |

### 15.2 Executed evidence

| Item | Value |
|---|---|
| CI run / check run / commit | `45546248909` / `138976563830` / `0aae1368a16cf6447cb7a01afc7554a9fdab4bc0` |
| Session 14 R2 experiments | `C` versus `C.utf8` on the real migration (`real_c`/`real_u`) |
| This session's local probes | §7.2–§7.3 — PostgreSQL 16.2, UTF8, `C.utf8`, libc, `datcollversion` NULL; disposable cluster, destroyed |

### 15.3 What was not consulted

No production or staging system, credential, catalog, backup or log was read; no real tag or college data was
examined. The absence of data evidence is a finding of this brief, not an omission from it.

---

## 16. Revision history

| Revision | Date | Change |
|---|---|---|
| 1 | 2026-11-24 | Initial OD-COLL-01/02 decision brief. Verifies both index definitions against the committed migration, the Prisma schema and a disposable PostgreSQL 16.2 catalog; separates six semantic concepts (exact string, case-insensitivity, locale dependence, normalisation, full folding, accent/compatibility); analyses tags and colleges independently, including the absence of any application write path; executes 20 probes on the real migration covering fold behaviour, normalisation, whitespace, the `colleges.code` rule, and both merge hazards; evaluates five candidate strategies per entity without selecting one; maps dependencies across OD-COLL-03/04/05/06 and OD-18; records two owner decisions as `OPEN — NO OWNER DECISION RECORDED`. **No policy selected; no data accessed; no schema, migration, application, workflow, script, guard or test modified; nothing committed or pushed.** |

**Standing decisions preserved exactly, unchanged by this document:** G-1 **FAILED** · G-3 **PASSED** ·
Option C **APPROVED — controlled migration workflow only** · B1a **APPROVED (workflow-scoped)** · B1b **NOT
APPROVED** · B1c **NOT APPROVED** · B2 **WITHHELD** · migration 0001 **NOT AUTHORIZED for production
deployment** · migration 0002 **DO NOT COMMIT** · G-2 **DEFERRED** · **T1 CLOSED** · **R2 PARTIALLY RESOLVED** ·
OD-COLL-01/02 **OPEN** · OD-COLL-03/04/05/06 **OPEN** · OD-17 **OPEN** · OD-21 **OPEN** · OD-NM-1 **OPEN**.
Production locale **UNKNOWN and NOT DECIDED**.

**Two open decisions, framed and unowned. Nothing here is approved, and no uniqueness policy is selected.**
