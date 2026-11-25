# Phase 04A — OD-COLL-01 / OD-COLL-02 Owner Decision Worksheet

**Date:** 2026-11-24
**Repository:** `Tanim-Boss/HSC-ALIM-ICT-Question-Bank`
**Branch:** `arena/49496cf8-hsc-alim-ict-question-bank`
**HEAD when written:** `4d04e4461338ea5931d26faf67d312fbed21de43`
**Purpose:** to make two owner questions answerable — **OD-COLL-01 (tags)** and **OD-COLL-02 (colleges)** —
without selecting an option, without inventing data, and without treating a proposed implementation as
existing behaviour.
**Nature:** decision preparation only. No option is chosen, no default is pre-selected, no status changes, and
the decision records in §10 are intentionally blank.

Source documents: `phase-04a-od-coll-01-02-uniqueness-semantics-decision-brief.md` (722 lines, the primary
source), `phase-04a-final-database-deployment-decision-package.md` (§11, §14), the Session 27 consolidation
audit, the Session 29 owner-review handoff, `phase-04a-index-collation-r2-investigation.md` (§10.6, §12.1), the
authoritative register in `phase-04a-database-collation-product-and-environment-decision.md` (§5, §8, §12), and
the committed implementation (`migration.sql`, `schema.prisma`, `server/questions/publish/db-errors.ts`).

Labels: `VERIFIED` (read from a committed artifact) · `OBSERVED` (measured in a disposable local cluster) ·
`DERIVED` · `PROPOSED` · `UNKNOWN` · `NOT TESTED` · `OPEN`.

---

## 1. Executive summary

### **WORKSHEET PREPARED — BOTH QUESTIONS ANSWERABLE — NO OPTION SELECTED — OD-COLL-01/02 `OPEN`**

Six findings shape this worksheet, and none of them answers either question:

1. **Both questions are business questions, and neither needs production data to be *answered*.** They need
   production data — and an authorised audit — to be *implemented*. The split is stated in every section below,
   because merging the two is how an owner is pushed into an implementation choice disguised as a policy.
2. **The current rule is narrower than its name.** `uq_tags_name_lower` and `uq_colleges_name_lower` enforce
   equality of `lower(name)` **under the database's ctype** — not "case-insensitivity", not Unicode case
   folding, and not normalisation (`VERIFIED` DDL; `OBSERVED` probes E1–E9, E17–E20, D1–D3). What that means
   depends on a database property that is `UNKNOWN` for production (OD-COLL-03).
3. **There is no application write path for either entity.** No tag or college create, rename or merge code
   exists; `app/` holds `layout.tsx`, `page.tsx`, two assets and three empty placeholder directories
   (`(admin)`, `(student)`, `api`) — no route handler and no reference to tags or colleges;
   `prisma.tag.*` / `prisma.college.*` appear only in one integration test; no slug generator exists
   (`VERIFIED` by search). The only product statement in the
   repository is the user-facing message *"names are compared ignoring case"* (`server/questions/publish/
   db-errors.ts:68–72`). Intent therefore cannot be inferred from behaviour, because there is no behaviour.
4. **The two decisions look identical and are not.** Tags have a **second** unique rule (`uq_tags_slug`,
   format-checked) and an M2M merge path that can lose associations; colleges have **only** the name rule, an
   unexercised nullable `code`, and a merge path that collides with an attribution rule. Identical index
   definitions, different consequences (§3, §5).
5. **A genuine ambiguity must be resolved before any answer is recorded: the option letters are not stable.**
   The register labels the status quo **B** (A = ASCII-only, B = locale-dependent `lower()`, C = explicit fold,
   D = alternative). The brief's §8 and §12 label the status quo **A** (A = preserve `lower()`, B = exact
   string, C = normalisation, D = identity key, E = defer), while its own §5.5 uses the register's letters.
   In addition, **"Option C" already means the approved controlled migration workflow** everywhere else in the
   package, and means "ICU profile" in OD-COLL-03. **Answer by option *name*, never by letter, until the
   lettering is reconciled** (finding **W-1**, §9).
6. **Nothing is implementable today even if answered.** Migration 0002 is `DO NOT COMMIT`; no index change, no
   canonical column, no data remediation and no deployment is authorised. An answer records a policy; it
   authorises nothing (§12).

**Why these two first, and separately:** they are the only two decisions in the package that require no
environment measurement. They nevertheless feed OD-COLL-06, which cannot define a candidate-key comparison
until it knows which equality relation to look for (§8).

---

## 2. Evidence boundary

### 2.1 What is established, and how

| Claim | Label | Where |
|---|---|---|
| `uq_tags_name_lower` = `UNIQUE (lower("name"))` on `tags`; `uq_colleges_name_lower` = `UNIQUE (lower("name"))` on `colleges` | `VERIFIED` | `migration.sql:640–641` (PART C) |
| Neither index appears in Prisma; `Tag` declares `@@unique([slug])` only; `College` declares no `@@unique` | `VERIFIED` | `schema.prisma:380–390`, `:430–441` |
| `tags`: `name NOT NULL`, `slug NOT NULL`, unique slug, `ck_tags_slug_format` (`^[a-z0-9]+(-[a-z0-9]+)*$`), `ck_tags_name_not_blank` | `VERIFIED` | `migration.sql:214–221`, `:366`, `:588–589` |
| `colleges`: `name NOT NULL`, **`code TEXT NULL` with no unique rule**, `is_active`; **no location column** | `VERIFIED` | `migration.sql:247–256` |
| `question_tags` PK `(question_id, tag_id)`, both FKs `ON DELETE CASCADE` | `VERIFIED` | `migration.sql:224–230`, `:447` |
| `question_sources.college_id` nullable, `ON DELETE RESTRICT`; `uq_question_sources_identity` is `NULLS NOT DISTINCT` | `VERIFIED` | `migration.sql:456`, `:629–631` |
| Index metadata: both indexes are one-key btree, `text_ops`, `indcollation = 100` (database default), no predicate | `OBSERVED` | brief §3.2 (disposable 16.2 catalog) |
| Folding behaviour of `lower()` on `C.utf8`: rejects `Logic Gate`/`logic gate`, `Ärger`/`ärger`, `ẞ`/`ß`, `İstanbul`/`istanbul`, U+212A/`k`; **accepts** `ẞ`/`ss`, `ς`/`σ`, NFC/NFD, trailing space | `OBSERVED` | brief §7.3 (E1–E9) |
| College-side probes: `Notre Dame College`/`notre dame college` and `École Normale`/`école normale` rejected; NFC/NFD accepted; `code` duplicated (`DUPCODE2`) and NULL accepted | `OBSERVED` | brief §7.3 (E17–E20, E10, E13) |
| Same migration, different database locale, different guarantee: `real_c` accepts `Ärger`+`ärger`; `real_u` rejects the second | `OBSERVED` | brief §7; decision brief 03 §5.3; R2 §10.6 |
| `lower()` is a per-code-point case mapping, not full folding: `lower('ẞ')='ß'`, `lower('ς')='ς'`, `lower('İ')='i'` | `OBSERVED` | brief §7.3 (D1) |
| No write path, no slug generator, no college editor; no read of `college.code` anywhere. `app/` contains 7 files: `layout.tsx`, `page.tsx`, `globals.css`, `icon.svg` and three `.gitkeep` placeholders; no route handlers exist | `VERIFIED` (absence) | brief §5.2, §6.2; re-verified this session (`find app -type f`, `find app -name route.ts` → 0) |
| The only product statement is the duplicate-name message | `VERIFIED` | `server/questions/publish/db-errors.ts:68–75`; `errors.ts:44` |

### 2.2 What is not established

| Gap | Status | Consequence for these decisions |
|---|---|---|
| How many tags or colleges exist | `UNKNOWN` — no dataset is reachable | no collision counts; no sizing for any option |
| Whether any real pair differs only by case, normalisation or folding | `UNKNOWN` | the audit in OD-COLL-06 must measure it; an answer cannot be sized until it does |
| Production provider/locale/ctype | `UNKNOWN` (OD-COLL-03) | the *meaning* of the status quo is undefined for production |
| Folding behaviour in CI (`en_US.utf8`) | `NOT TESTED` — CI measured the catalog, not folding | local measurements do not transfer automatically |
| `en_US.utf8` versus `C.utf8` behaviour | `NOT TESTED` — the locale is unavailable locally | no evidence that the two locales agree |
| ICU behaviour, PostgreSQL 15/17/18 | `NOT TESTED` | No ICU or other-major option can be evaluated |
| Whether an application write path will exist | `UNKNOWN` — none exists today | "how tags are entered" cannot be inferred |

### 2.3 Five concepts that must not be conflated

The worksheet keeps five distinct concepts apart. **Only two of them exist in this repository** — PostgreSQL
`lower()` in the two index expressions, and collation equality, which the keys inherit from the database
default — while the other three appear in no layer at all.

| Concept | What it does | Where it exists here | Behaviour on the measured build |
|---|---|---|---|
| **PostgreSQL `lower()`** | per-code-point case mapping from the OS locale tables | the current indexes (`lower(name)`) | folds ASCII and accented Latin case; locale-dependent |
| **Unicode case folding** | a defined mapping including `ẞ`→`ss`, `ς`→`σ`, full case closure | **nowhere** | not performed; `ẞ`/`ss` remain distinct (E4) |
| **Unicode normalisation (NFC/NFD)** | canonical composition/decomposition equality | **nowhere** (no generated column, no expression, no app code) | `é` and `e`+U+0301 are distinct (E8, E19) |
| **Collation equality** | comparison/equality as defined by the collation attached to the key | the index key inherits `pg_database` default (`indcollation = 100`) | `C` versus `C.utf8` gives different uniqueness (real_c/real_u) |
| **Application-level canonicalisation** | the app stores a canonical form before insert | **nowhere** — no write path exists | no canonicalisation of any kind |

**A policy may name any of these, but the repository implements two and inherits their environment dependence.**
Neither case folding, normalisation nor application canonicalisation exists, so any option that relies on them
requires new implementation — and any change to either index requires a migration, while migration 0002 is
`DO NOT COMMIT` today.

---

## 3. OD-COLL-01 — the question

### 3.1 The exact question

> **What makes two tags the same tag for uniqueness purposes** — and therefore which equality relation should
> `uq_tags_name_lower` express?

The register phrases it as *"Which case-insensitivity semantics apply to `tags.name`?"* (decision document §12,
quoted in brief §2.1). The brief's reformulation is broader and is the one this worksheet uses, because the
register's wording presupposes that the answer is a *case-insensitivity* choice, whereas the options include
"exact string" and "identity moved to a key".

### 3.2 The ten sub-questions, with what the repository can and cannot answer

| # | Question | Recorded answer | Label |
|---|---|---|---|
| 1 | What constitutes tag identity? | **Not recorded.** Technically the row's `id`; the schema also enforces unique `slug` and unique `lower(name)`, so three constraints claim identity, and only one is treated as identity by any convention | `UNKNOWN` (business) |
| 2 | Which equality distinctions should be significant? | **Not recorded.** Case-only and accented-case-only differences are currently *not* significant (E1, E2); normalisation-only, `ẞ`/`ss` and `ς`/`σ` differences *are* (E4, E7, E8) | `UNKNOWN` (business) |
| 3 | Case variants (`ICT` / `ict`) | **Currently one tag** — rejected as duplicates by `lower()` on ASCII (E1). Whether that is intended is unrecorded; the error message asserts it | `OBSERVED` / intent `UNKNOWN` |
| 4 | Unicode case-folding differences (`ẞ`/`ss`, `ς`/`σ`, `İ`/`i`) | **Currently distinct tags** — `lower()` is a case mapping, not full folding (E4, E7, E5) | `OBSERVED`; desired policy `UNKNOWN` |
| 5 | Normalisation differences (`é` NFC vs `e`+U+0301) | **Currently distinct tags** (E8). Nothing normalises anywhere. Note the practical hazard: the two rows look identical on screen | `OBSERVED`; desired policy `UNKNOWN` |
| 6 | Whitespace differences (trailing space, inner runs) | **Currently distinct**, except that `btrim(name) <> ''` prevents an all-space name. `"Dhaka College "` and `"Dhaka College"` coexist (E9, tags side); no trimming exists in any layer | `OBSERVED`; desired policy `UNKNOWN` |
| 7 | Which distinctions are business policy, and which are implementation details? | **Business:** which of the five concepts in §2.3 is the intended equality; whether the display name may be ambiguous. **Implementation:** which SQL expression or column realises it; where the fold runs; whether an index expression, a generated column or an application write is used. **Neither:** Prisma's inability to model the index — that is a tooling fact | `DERIVED` |
| 8 | Consequences for existing tags and associations | Unknown in scale (`UNKNOWN` — no data), but the *mechanics* are measured: a naive repoint collides with `question_tags_pkey` (E11); deleting the loser **silently cascades away question–tag links** (E11c); the safe shape (insert-if-absent, then delete) preserved links in the probe (E11b). A question carrying both tags **loses information** when they are merged, rather than de-duplicating | `OBSERVED` |
| 9 | What data audit is required before implementation? | The seven detections of brief §9.1 (exact duplicates; duplicates under the current expression; collisions under each candidate key; NFC/NFD variants; folding collisions; pairs that collide only after a locale change; references affected by a prospective merge), then the five stages of §9.2, none of which may be collapsed. **No audit is authorised and no capability exists** | `PROPOSED` / `NOT TESTED` |
| 10 | What each option means operationally | §4 below, option by option | `DERIVED` |

---

## 4. OD-COLL-01 — options and trade-offs

### 4.1 The options, exactly as the source records them, by name

**The letters conflict (finding W-1).** Brief §8 and §12 number them A = keep `lower()`, B = exact string, C =
normalisation, D = identity key, E = defer. The register and brief §5.5 number them A = ASCII-only, B = keep
`lower()` (status quo), C = explicit fold, D = alternative. **The content sets also differ**: "exact string"
and "defer" have no register letter, and "ASCII-only" has no §8 heading. Answers must use names.

#### Option 1 — Keep `lower(name)` (status quo). Register letter **B**; brief §8 letter **A**

| Aspect | Record |
|---|---|
| Semantic meaning | two names are the same when `lower()` maps them to the same string *in the database's locale* |
| Benefits | zero implementation; already deployed and negative-tested in G-3 (`PASSED`); strongest available behaviour on a UTF-8 locale; no data migration, therefore fully reversible |
| Risks | the guarantee silently weakens on a `C`-locale database (real_c accepts `Ärger`+`ärger`); no normalisation (E8), no full folding (E4/E7); the user-facing message overstates it; its meaning is *defined by* an environment nobody has measured |
| Migration implication | none |
| Evidence status | behaviour `OBSERVED` locally; production meaning `UNKNOWN` |
| Downstream | defines what OD-COLL-05 must treat as a behavioural difference; OD-COLL-03 decides whether the guarantee is meaningful |
| Reversible? | **yes** — no data change |

#### Option 2 — Exact-string uniqueness. Register: no direct letter; brief §8 letter **B**

| Aspect | Record |
|---|---|
| Semantic meaning | spelling and case are both meaningful; `ICT` and `ict` are two tags |
| Benefits | portable, locale-independent, trivially predictable; no data remediation (pairs now rejected simply become legal) |
| Risks | **weakens** today's guarantee everywhere; contradicts the shipped error message and its mapping; duplicate-looking tags become possible; it makes an existing user-facing promise false |
| Migration implication | new migration replacing the expression index — **0002, `DO NOT COMMIT`** |
| Evidence status | behaviour of the alternative is trivially `VERIFIED` (byte equality); the *cost* is unmeasured (no data) |
| Downstream | the audit must still count today's case-variant pairs (they measure how much the guarantee was doing) |
| Reversible? | yes (recreate the expression index), but only after the duplicates created in the meantime are resolved |

#### Option 3 — Explicit fold, then uniqueness. Register letter **C**; brief §8 letter **C**

| Aspect | Record |
|---|---|
| Semantic meaning | a *written* equality rule — named fold (and optionally NFC) — realised in a stored canonical column or a pinned expression index |
| Benefits | environment-independent by construction; the rule becomes reviewable and testable; the error message can be made true for the folded subset |
| Risks | **larger equivalence classes than today** ⇒ pairs that are legal become duplicates; needs a fold specification and a pinned Unicode version; `lower()`+NFC is **not** full folding; `unaccent` is unavailable in the measured build |
| Migration implication | new column or expression → **0002**; data must satisfy the new rule before the index can be built, i.e. remediation precedes creation |
| Evidence status | the fold's *effects* are partially `OBSERVED` (E4/E7/E8 show what today's mapping misses); the *size* of the change is `UNKNOWN` |
| Downstream | OD-COLL-06 in full; merge mechanics E11/E11b/E11c become operative |
| Reversible? | **partially** — a fold that merges rows cannot be undone without a record of the merge |

#### Option 4 — Identity moved to a key, name becomes display. Register **D** ("alternative"); brief §8 letter **D**

| Aspect | Record |
|---|---|
| Semantic meaning | `name` is a label; identity is `slug` (unique, format-checked, authoring-supplied) or a generated canonical key |
| Benefits | separates "what it is called" from "which one it is"; **no Unicode policy needed for identity**; the pattern the repository's `boards` table already uses; renaming becomes free |
| Risks | slugs are authoring-supplied today with **no generator**, so uniqueness rests on data-entry discipline; case variants of the name become visible in listings; relaxes a rule users may rely on |
| Migration implication | index change → **0002**; possibly a slug-derivation change (code, not migration) |
| Evidence status | `slug` uniqueness `VERIFIED`; the intent is `UNKNOWN` (T3); no generator exists |
| Downstream | OD-18 (slug representation) becomes involved; OD-COLL-06 must check that no two rows collide on the chosen key |
| Reversible? | **partially** — once names are non-unique, duplicates must be cleaned before the old rule can return |

#### Option 5 — Defer. Register: implicit in "no decision"; brief §8 letter **E**

| Aspect | Record |
|---|---|
| Semantic meaning | no policy change; the environment keeps deciding |
| Benefits | no data risk; reversible; lets OD-COLL-03 and the audit supply missing evidence first |
| Risks | the promise stays environment-dependent; an audit run later must be repeated if the environment changes |
| Migration implication | none |
| Evidence status | — |
| Reversible? | not applicable — it *is* the reversible state |

### 4.2 The one recorded recommendation (process only, and not a policy)

The brief recommends, explicitly as `PROPOSED` and without approving anything (brief §13.1): answer the
business question before the environment question; do not choose the fold option merely to future-proof; treat
`slug` as a candidate rather than a fact; never merge automatically; keep OD-COLL-01 and OD-COLL-02 recorded
separately even if the same policy is chosen. **No source recommends a policy for tags.**

---

## 5. OD-COLL-02 — the question

### 5.1 The exact question

> **Is `colleges.name` the institution's identity or its display label — and if the latter, what carries
> identity, given that `code` is nullable, non-unique and read by nothing?**

### 5.2 The eight sub-questions

| # | Question | Recorded answer | Label |
|---|---|---|---|
| 1 | Identity key or display label? | **Today it is the identity key** — `uq_colleges_name_lower` is the entity's **only** uniqueness rule, and `code` has no constraint. The schema does not separate the two concepts | `OBSERVED` |
| 2 | May two distinct institutions legitimately share a name? | **Not recorded anywhere** — no data, no documentation, no owner statement. **This is the decisive question of the decision** | `UNKNOWN` |
| 3 | If names are not unique, what identifies an institution? | Candidates only: `id` (stable but opaque), `code` (nullable, non-unique, unread), a generated key, or a composite with new columns. **No location, city, district or address column exists**, so "same name, different place" is not representable today | `VERIFIED` (absence) |
| 4 | Can `code` safely serve as identity? | **Not under current evidence.** It is `TEXT NULL`, has **no unique rule**, and two rows sharing `DUPCODE2` plus one NULL row were accepted (E10). It is populated in seed data, which shows intent to carry an abbreviation, not an identity key. Some seed/real rows may have no code at all | `OBSERVED` |
| 5 | What evidence exists about `code`? | nullable (`VERIFIED` DDL); non-unique (`OBSERVED` E10/E13); unread by application code (`VERIFIED` by search); duplicated and NULL values accepted (E10); the integration test creates colleges with `name` only, so `code` is NULL there | `VERIFIED` / `OBSERVED` |
| 6 | Consequences of changing the name rule | Narrowing (fold/accent-insensitive) creates collisions that must be merged; widening (exact string) makes case-variant rows possible; moving identity to a key relaxes the only rule. Merge mechanics are measured: repointing a source can violate `uq_question_sources_identity` (`NULLS NOT DISTINCT`, E12b) and `ON DELETE RESTRICT` blocks deleting a referenced college | `OBSERVED` / `DERIVED` |
| 7 | What audit is needed before changing the index? | The same five stages, with college-specific detections: existing case-variant pairs; NFC/NFD variants; punctuation/spacing variants such as `Notre-Dame`/`Notre Dame` (D3 shows `lower()` does **not** equate them); sources per college, to size any repoint; duplicate/NULL `code` counts if a key option is considered | `PROPOSED` / `NOT TESTED` |
| 8 | What happens to existing records under a new policy? | Unknown in scale. If identity moves to a key, **every row needs a non-null, unique value** — a backfill whose failure mode is "some institutions have no code". If the rule narrows, colliding rows need a reviewed merge that may have to adjudicate which attributions are duplicates | `DERIVED` |

### 5.3 Owner-domain question versus database-design question

| Part | Question | Who can answer | What the repository can say |
|---|---|---|---|
| **Owner domain** | may two distinct institutions share a name; if so, what distinguishes them in the real world | **owner only** | nothing — no data, no documentation, no location field |
| **Database design** | how identity is represented: which column or expression is unique, whether `code` becomes `NOT NULL` and unique, whether new columns are needed | owner + engineering, after the domain answer | the current state, the constraints, and the cost of each shape |
| **Not answerable by document review** | the size of any remediation | audit (OD-COLL-06), once authorised | — |

The decision is therefore **not** "should colleges be case-insensitive"; it is whether the name is allowed to be
the identity, which is a statement about the institution registry.

---

## 6. OD-COLL-02 — options and trade-offs

### 6.1 The options, by name

The structural options are the same five as §4.1, evaluated independently; the differences below are what makes
this decision heavier than OD-COLL-01.

| Option | What it means for colleges specifically | Principal risk | Migration implication |
|---|---|---|---|
| **Keep `lower(name)`** | case-insensitive equality is the whole identity rule | a `C`-locale database accepts `École Normale` alongside `école normale`; nothing else catches it | none |
| **Exact string** | `Dhaka College` and `dhaka college` become two institutions | visible duplicates by typing alone; the only rule stops protecting the registry | index replacement → 0002 |
| **Explicit fold (+ optional accent/punctuation insensitivity)** | `École`=`Ecole` and possibly `Notre-Dame`=`Notre Dame` become one institution | a much higher chance of *genuine* collisions; `unaccent` unavailable in the measured build; merges collide with the attribution rule | 0002 + data remediation before the index |
| **Identity moved to a key** | name becomes display; `code` (or a generated key) becomes identity | `code` is nullable and non-unique today — backfill and duplicate resolution are prerequisites; institutions without a code must be handled | 0002 (index) + `code NOT NULL` + backfill |
| **Defer** | status quo | the weakest position of the five for colleges, because there is no second rule behind the name | none |

**An existing precedent, precisely stated:** the repository already uses a code-as-identity pattern for boards —
`boards.code` is `NOT NULL` and carries `uq_boards_code` (`schema.prisma:411–423`; `migration.sql:372`). Colleges
do **not** follow it: `colleges.code` is `TEXT NULL` with no unique rule, so adopting the pattern is a schema
change with a backfill, not a convention that already exists.

**A sixth shape is sometimes implied and is not an option today:** a composite identity (name + location). It
requires columns that do not exist and a domain statement about what distinguishes institutions. It is recorded
as an **unresolved option-definition gap** (C2), not as an option.

---

## 7. Existing-data implications

### 7.1 What is at stake, per entity

| Aspect | Tags | Colleges |
|---|---|---|
| Rows | unknown count (`UNKNOWN`) | unknown count (`UNKNOWN`) |
| Associations affected by a merge | `question_tags` (PK collision on repoint, E11; silent cascade on delete, E11c) | `question_sources.college_id` (NND attribution collision, E12b; `RESTRICT` blocks deletion) |
| Information lost by a merge | a question that carried both tags keeps one link — a real loss, not a de-duplication | an attribution may have to be judged a duplicate — a provenance decision, not a cleanup |
| Safe merge shape | measured: insert-if-absent (`ON CONFLICT DO NOTHING`), then delete the loser (E11b) | **not measured**; the brief records the constraint, not a proven procedure |
| Reversibility of a merge | no record of the merge exists unless one is created | same |

### 7.2 What must be measured before any implementation (not before an answer)

Per brief §9.1, on a snapshot, read-only: exact duplicates; duplicates under the current expression; collisions
under each **candidate** key; NFC/NFD variants; folding collisions; pairs that would collide only after a locale
change; references affected by a prospective merge. Then the five stages of brief §9.2: discovery · owner review per
group · explicit remediation approval · remediation · index creation and verification.

**No part of this has been run, is authorised, or has a capability in the repository.** Any numeric statement
about existing data in this worksheet would be invented, so none is made.

### 7.3 What changes for existing records under each class of option

| Option class | Existing rows |
|---|---|
| Keep `lower()` | unchanged |
| Exact string | unchanged, but previously-impossible duplicates can appear afterwards |
| Explicit fold | colliding rows **must** be resolved before the index can be built (the build fails closed by design) |
| Identity key | every row needs a unique, non-null key value; backfill is mandatory and may be blocked by rows that have no natural code |
| Defer | unchanged |

---

## 8. Dependency and downstream impact

### 8.1 The verified dependency: 01 → 06 and 02 → 06

OD-COLL-06 defines **what must be validated before a uniqueness change**. It cannot define its candidate-key
comparison until the candidate key exists — and the candidate key *is* the answer to 01/02:

| What OD-COLL-06 needs | Why it cannot be produced without 01/02 |
|---|---|
| the comparison expression (`GROUP BY <key>`) | the key is the policy: `lower(name)`, `name`, a folded canonical form, or `slug`/`code` |
| what a "collision" means | a collision under `lower()` is a different set of pairs than under NFC folding or byte equality |
| the remediation semantics | a merge is only defined once the equality that makes two rows "the same" is defined |
| the acceptance criterion ("zero unresolved groups") | "unresolved" refers to pairs the *chosen* rule would reject |
| the reverse counterfactual (newly-distinct pairs) | applies only to options that narrow the rule |

This is why the dependency is a **genuine prerequisite for Q1–Q3 and Q7** of OD-COLL-06, while the rest of 06
(scope rule, report fields, snapshot rule, gates, remediation prohibition) can be specified independently.

### 8.2 Impact on the five objects named in the request

| Object | Impact of an answer | What must not be assumed |
|---|---|---|
| `uq_tags_name_lower` | every option except "keep `lower()`" changes its expression or removes its role as the identity rule | that a change is implementable — migration 0002 is `DO NOT COMMIT` |
| `uq_tags_slug` | relevant only if identity moves to `slug`; it already exists, is unique and format-checked, so no new constraint is needed — but no slug generator exists, so derivation stays a code decision (OD-18) | that slugs are stable or auto-generated today — they are authoring-supplied |
| `uq_colleges_name_lower` | the whole decision turns on it; it is the sole rule | that a second key already protects colleges — none exists |
| Existing tag associations | any tag merge moves or destroys `question_tags` rows; the safe shape is measured, the unsafe shapes are measured as failing | that cascade behaviour is benign — E11c shows links vanish silently |
| Question-source identity | a college merge can violate `uq_question_sources_identity` (`NULLS NOT DISTINCT`); `ON DELETE RESTRICT` blocks deletion | that colleges can be de-duplicated without adjudicating provenance |

### 8.3 Downstream summary

| Downstream | Depends on 01 | Depends on 02 |
|---|---|---|
| OD-COLL-06 candidate comparison | **yes** | **yes** |
| OD-COLL-05 Layer E (behavioural compatibility) | **yes** — defines what counts as a behavioural difference | **yes** |
| Any uniqueness-index change | **yes** (+ 06) | **yes** (+ 06) |
| OD-18 (`slug`/`code` representation) | if identity moves to `slug` | if identity moves to `code` |
| OD-COLL-03 | no | no — these two are environment-independent questions |

---

## 9. Unresolved questions

### 9.1 From the source brief (verbatim in substance)

| ID | Question | Entity | Who |
|---|---|---|---|
| T1 | Should `ICT` and `ict` be one tag, and is the current ASCII/UTF-8 split acceptable? | tags | owner |
| T2 | Should spellings differing only by Unicode normalisation be one tag? | tags | owner |
| T3 | Is `slug` intended as the tag's permanent identity? | tags | owner + architecture (OD-18) |
| T4 | Will tags be typed free-form, or chosen from a maintained list? | tags | product owner |
| C1 | **Can two genuinely distinct colleges share a name?** | colleges | owner (domain) — decisive |
| C2 | If yes, what distinguishes them, given there is no location field? | colleges | owner + a schema decision |
| C3 | Is `code` meant to be the stable identifier, and is a canonical code list available? | colleges | owner + operations |
| C4 | Should `École`/`Ecole` or `Notre-Dame`/`Notre Dame` be the same institution? | colleges | owner |
| X1 | How many rows exist, and how many collision pairs each option would create? | both | OD-COLL-06, once data access is authorised |
| X2 | What profile will the production database have? | both | OD-COLL-03 |

### 9.2 Raised by this worksheet

| ID | Finding | Status |
|---|---|---|
| **W-1** | **Option letters are not stable across the package.** Register/S23 §5.5: A = ASCII-only, B = status quo `lower()`, C = explicit fold, D = alternative. S23 §8/§12: A = keep `lower()`, B = exact string, C = normalisation, D = identity key, E = defer. The content sets also differ (exact-string and defer have no register letter; ASCII-only has no §8 heading) | **`OPEN`** — an answer by letter alone is ambiguous. **Answer by name.** Reconciling the lettering is a documentation decision nobody has made |
| **W-2** | **"Option C" is overloaded three ways** in this package: the approved controlled migration workflow (`Option C`, G-3), "explicit normalisation then uniqueness" (OD-COLL-01/02), and "ICU profile" (OD-COLL-03 §8.3) | **`OPEN`** — never use the bare label in an answer; always qualify (e.g. "OD-COLL-01 — explicit fold") |
| **W-3** | **No write path exists for either entity**, so no option can be validated against real user behaviour, and any option that depends on application canonicalisation is a *design* choice on an unwritten path | `VERIFIED` absence; consequence `DERIVED` |
| **W-4** | **The register's phrasing ("which case-insensitivity semantics") presupposes a case-insensitivity answer**, while the package's options include exact-string and identity-key answers | `DERIVED` — the brief's broader phrasing is used here |
| **W-5** | **`colleges.code` is not an identity key** under current evidence: nullable, non-unique, unread, duplicated and NULL values accepted | `OBSERVED` — option 4 for colleges therefore has an unresolved prerequisite, not a ready alternative |

---

## 10. Owner decision record — blank

**This record is intentionally blank. Nothing below has been filled in, and nothing may be inferred from the
order or wording of the options.** A decision becomes recorded only when the owner writes it into a reviewed
document; it cannot be inferred from a recommendation, a brief, or the existence of this worksheet (register
§12.1).

### 10.1 OD-COLL-01 — tags uniqueness semantics

| Field | Record |
|---|---|
| **Decision ID** | `OD-COLL-01` |
| **Selected option** | `NOT DECIDED` — record the **name** of the option (and its letter only with its source named) |
| **Owner rationale** | `NOT RECORDED` |
| **Accepted trade-offs** | `NOT RECORDED` |
| **Required follow-up evidence** | `NOT RECORDED` — e.g. the OD-COLL-06 audit scope, or a statement that none is required before implementation |
| **Decision date** | `NOT RECORDED` |
| **Approval status** | **`OPEN`** |
| **Authorised by this record** | **nothing** — no index change, no migration, no code, no data operation, no deployment |

### 10.2 OD-COLL-02 — colleges uniqueness semantics

| Field | Record |
|---|---|
| **Decision ID** | `OD-COLL-02` |
| **Selected option** | `NOT DECIDED` — record the **name** of the option (and its letter only with its source named) |
| **Owner rationale** | `NOT RECORDED` |
| **Accepted trade-offs** | `NOT RECORDED` |
| **Required follow-up evidence** | `NOT RECORDED` — if identity moves to a key, record how institutions without a `code` are to be handled |
| **Decision date** | `NOT RECORDED` |
| **Approval status** | **`OPEN`** |
| **Authorised by this record** | **nothing** — no index change, no migration, no code, no data operation, no deployment |

### 10.3 What a completed record would look like (structure only, still blank)

```text
Decision: OD-COLL-01 | OD-COLL-02
Option selected: <name>
Source of the option definition: <document + section>
Rationale: <owner's own words>
Trade-offs accepted: <one line per accepted consequence>
Follow-up evidence required before implementation: <none | OD-COLL-06 audit | other>
Recorded in (document, date): <…>
Approval status: OPEN until the owner records it in a reviewed document
```

---

## 11. S-1 minimal correction proposal — not applied

### 11.1 The gap

`phase-04a-final-database-deployment-decision-package.md` §11 ("Decision and blocker matrix") states that
*"Every status below was checked against the authoritative register in this session"* and then lists G-1, G-3,
Option C, B1a, B1b, B1c, B2, migration 0001, migration 0002, G-2, OD-17, OD-21, OD-NM-1, the preserved index,
production readiness, OD-22 and OD-26-1/5. A text search for `OD-COLL` in that file returns **zero hits**; `T1`
and `R2` appear nowhere. Recorded as finding **S-1** in the Session 29 handoff.

### 11.2 Proposed paragraph (verbatim, for the owner to approve or reject)

> **Collation decisions still open (pointer, added YYYY-MM-DD).** Six collation decisions — **OD-COLL-01**
> (tags uniqueness), **OD-COLL-02** (college-name uniqueness), **OD-COLL-03** (production profile),
> **OD-COLL-04** (fingerprint specification), **OD-COLL-05** (drift policy) and **OD-COLL-06** (existing-data
> validation) — remain `OPEN`. Each has its own brief under `docs/database/`, and all six are summarised for
> review in `docs/database/phase-04a-owner-review-readiness-and-decision-handoff.md`. None of them changes a
> status in the table above, and none authorises implementation, an index change, a migration or a deployment.
> They matter to this package because they govern the same three collation-bearing indexes it would deploy:
> `uq_tags_name_lower` and `uq_colleges_name_lower` are the subject of OD-COLL-01/02, and any future change to
> either index — or to `ix_question_assets_checksum` — is gated by OD-COLL-06. `T1` is `CLOSED` and `R2` is
> `PARTIALLY RESOLVED`; both are described in the same package.

### 11.3 Where it should go, and why

| Item | Proposal |
|---|---|
| **Location** | the end of §11, immediately after the decision matrix and before the `---` that precedes §12 ("Decision B1b") |
| **Why there** | §11 is the matrix an owner reads to see "what is undecided"; the pointer belongs with the statuses it qualifies. Placing it in §14 (owner questions) would bury it; placing it in §1 would overstate its authority |
| **Why not a matrix row** | a row would imply a status, an owner action and a blocker for each of six decisions — six rows of summary that would duplicate and eventually contradict the briefs. A pointer cannot drift |
| **Why not edited now** | the package is a historical record (Session 21); the gap is a silence, not a false statement, and Session 29's rule is that completeness gaps are reported rather than silently patched. **Applying it requires explicit owner authorisation** |

---

## 12. Explicit non-authorizations

This worksheet authorises **none** of the following:

- deciding, preselecting, recommending or implying an answer to OD-COLL-01 or OD-COLL-02;
- changing any decision status, including OD-COLL-01…06, G-1, G-3, Option C, B1a, B1b, B1c, B2, 0001, 0002,
  G-2, T1, R2, OD-17, OD-20, OD-21, OD-22 or OD-NM-1;
- implementing any canonicalisation, folding, normalisation, generated column, expression index or application
  write path;
- modifying `prisma/schema.prisma`, `migration.sql`, any migration, any index, `server/questions/publish/
  db-errors.ts`, or any application code;
- performing a data audit, running any query, connecting to production or staging, or starting a database;
- creating migration 0002;
- editing the source decision briefs, the deployment package, or applying the §11 paragraph;
- staging, committing, pushing, opening a PR, merging or deploying.

**An answer to either question authorises nothing.** It records a policy; implementation needs OD-COLL-06, a
new migration authorisation, an implementation authorisation, and — for production — B1b and B2.

---

## 13. Revision history

| Revision | Date | Change |
|---|---|---|
| 1 | 2026-11-24 | Initial owner decision worksheet for OD-COLL-01 and OD-COLL-02 (Session 30). Restates both questions with their recorded evidence, separates business policy from implementation, distinguishes PostgreSQL `lower()` / Unicode case folding / Unicode normalisation / collation equality / application canonicalisation, reproduces the documented options **by name**, records five new findings (**W-1** unstable option letters, **W-2** overloaded "Option C", **W-3** no write path, **W-4** register wording presupposes a case answer, **W-5** `code` is not an identity key), proves the 01/02 → 06 dependency, and leaves both owner decision records blank. **No document was edited; no option was selected; both decisions remain `OPEN`.** |

**Standing decisions reproduced exactly, unchanged by this document:** G-1 **FAILED** · G-3 **PASSED** ·
Option C **APPROVED — controlled migration workflow only** · B1a **APPROVED (workflow-scoped)** · B1b **NOT
APPROVED** · B1c **NOT APPROVED** · B2 **WITHHELD** · migration 0001 **NOT AUTHORIZED for production
deployment** · migration 0002 **DO NOT COMMIT** · G-2 **DEFERRED** · **T1 CLOSED** · **R2 PARTIALLY RESOLVED** ·
**OD-COLL-01 `OPEN`** · **OD-COLL-02 `OPEN`** · OD-COLL-03/04/05/06 **`OPEN`** · OD-17 / OD-20 / OD-21 / OD-22 /
OD-NM-1 **`OPEN`**. CI profile **OBSERVED**; production profile **UNKNOWN**; production locale **NOT DECIDED**;
CI↔production equivalence **NOT ESTABLISHED**.

**A worksheet is not an answer. Two questions are framed, no option is chosen, and nothing here may be cited as
an owner decision.**
