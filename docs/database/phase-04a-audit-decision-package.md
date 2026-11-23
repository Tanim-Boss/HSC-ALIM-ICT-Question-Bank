# Phase 04A — Audit decision package: Q‑AUD‑1 … Q‑AUD‑5

**Status: DECISION PREPARATION ONLY. Nothing in this document is implemented.**

This package prepares five documentation decisions and one separate authorisation
question. It changes no schema, no migration, no application code and no approved
decision. Every measurement below was taken on **PostgreSQL 16.2** against the
committed migration `prisma/migrations/0001_phase04a_question_bank/migration.sql`
applied to an empty database, and every figure is reproducible by re-running the
statements quoted in the appendix.

- **Source of the questions:** [§11.9.11 of the physical schema proposal](phase-04a-question-bank-physical-schema-proposal.md#11911-audit-decisions-requested).
- **Gate state, unchanged by this document:** **G‑1 = FAILED** (twice, not re-scored);
  **G‑3 = PASSED** against the full 18‑table schema (CI run `45273840004`);
  **production authorisation for migration 0001 = unresolved.**
- **None of Q‑AUD‑1 … Q‑AUD‑5 blocks anything.** They are documentation-consistency
  decisions. The blocking question is separate and is analysed in
  [§7](#7-separate-analysis-proceeding-with-option-c-while-g1-remains-failed).

---

## 1. Exact wording of the five questions

Reproduced verbatim from §11.9.11, with the recommendation each carries in the
proposal. Nothing is paraphrased here; the analysis in §3 onwards is separate from
this wording.

| # | Question (verbatim) | Proposal's own recommendation (verbatim) |
|---|---|---|
| **Q‑AUD‑1** | Correct §3.9's `block_ref` CHECK to the parenthesised form, so the document and the migration agree? | **Yes** — the current text cannot be applied to any PostgreSQL |
| **Q‑AUD‑2** | Correct §5's `Tag.name @unique` to match §3.3.13 (expression index only)? | **Yes** — otherwise a future reader recreates the plain unique |
| **Q‑AUD‑3** | Tighten §3.4.2's `colleges.name` wording to state the plain unique is *replaced*? | **Yes** — same reason |
| **Q‑AUD‑4** | Drop `ck_question_options_key_single_char` as redundant (CHECK count 47 → 46), or keep it? | **Keep** — a CHECK count change is a reviewer decision, and the redundancy is harmless |
| **Q‑AUD‑5** | Delete §3.3.1's reference to a non-existent `education_levels` support key? | **Yes** — cosmetic |

**Blocking status, for all five: non-blocking.** The 18‑table migration is already
written, deploys through `prisma migrate deploy`, and passed G‑3. Each of these
decisions changes prose, not the deployed database — with one exception worth stating
plainly: **Q‑AUD‑4, if answered "drop", would change the database** (one constraint
removed), and would therefore invalidate the recorded `47` and require a new migration
and a fresh G‑3 run. That asymmetry is why Q‑AUD‑4 is treated separately in §3.4.

### 1.1 Affected sections, at a glance

| # | Sections and artifacts the decision touches | Kind of change |
|---|---|---|
| Q‑AUD‑1 | §3.9 (CHECK definition), §3.3.12 (prose copy of the same pattern), §11.9.2 (finding record) | Document only |
| Q‑AUD‑2 | §5 `model Tag`, §3.3.13, §3.10, §11.9.3 | Document only |
| Q‑AUD‑3 | §5 `model College`, §3.4.2, §3.10, §11.9.4 | Document only |
| Q‑AUD‑4 | §3.3.9, §3.9, §3.14 (count), §11.9.5, the G‑3 driver (`EXPECTED_CHECKS`), `enforce.sql` case 33, the proposal's own §11 approval register | **Schema, if answered "drop"** |
| Q‑AUD‑5 | §3.3.1 only, §11.9.6 | Document only |

---

## 2. How to read the analyses

Each decision in §3 follows the same six-part structure: the technical issue; the
PostgreSQL / Prisma / migration / application implications; the options compared; risks,
reversibility and maintenance cost; consistency with approved decisions; and a
recommendation. **Each decision stands alone and requires its own approval** — they are
not bundled, and §6 lists them as five separate approval lines.

Two standing rules apply to all five:

1. **§3 is normative; §5 is illustrative.** This is stated in §5's own heading and was
   applied during the audit (§11.9.3, §11.9.4). It is what makes Q‑AUD‑2 and Q‑AUD‑3
   *prose* problems rather than *design* problems.
2. **No implementer may change an approved constraint.** This is why Q‑AUD‑4 was left
   in place with the redundancy recorded instead of removed.

---

## 3. Individual analyses

### 3.1 Q‑AUD‑1 — the `block_ref` CHECK is invalid SQL as documented

#### The technical issue

§3.9's statement, as written, is:

```sql
CHECK (block_ref ~ '^(/content/blocks/(0|[1-9][0-9]{0,2})(/data/blocks/(0|[1-9][0-9]{0,2}))?'
                || '|/options/[ABCDকখগঘ]/blocks/(0|[1-9][0-9]{0,2}))$')
```

`~` (regex match) and `||` (concatenation) have **equal precedence and both associate
left**, so this parses as `(block_ref ~ '…') || '…'`. `block_ref ~ '…'` yields
`boolean`; `boolean || text` yields **`text`**. A `CHECK` requires a boolean expression.
PostgreSQL rejects the whole statement.

**Measured on PostgreSQL 16.2** — applying the documented form:

```
ERROR:  argument of CHECK must be type boolean, not type text
```

and applying the parenthesised form:

```
CREATE TABLE
```

This is not a style objection. The statement cannot be executed, so a future reader
following §3.9 verbatim would get an error with no explanation, and might "fix" it by
altering the pattern — which is the real risk this correction removes.

#### What the migration does today

The committed `migration.sql` parenthesises the two literals so concatenation binds
first, and carries an in-place `NOTE (audit, Revision 14)` comment explaining why. The
catalog shows what PostgreSQL actually stored:

```
CHECK ((block_ref ~ ('^(/content/blocks/(0|[1-9][0-9]{0,2})(/data/blocks/(0|[1-9][0-9]{0,2}))?'::text
                  || '|/options/[ABCDকখগঘ]/blocks/(0|[1-9][0-9]{0,2}))$'::text)))
```

#### The pattern is provably unchanged

Comparing the two-literal concatenation with the **single literal** §3.3.12 already
writes — i.e. the intended rule — PostgreSQL itself reports:

| Check | Result |
|---|---|
| `(a || b) = '<single literal>'` | **true** |
| `octet_length(a || b)` | **129** bytes |
| Left-associative (unparenthesised) form compiles | **no** |

Behaviour on real pointers, run against the parenthesised expression:

| Input | Accepted |
|---|---|
| `/content/blocks/0` | yes |
| `/content/blocks/12/data/blocks/3` | yes |
| `/options/B/blocks/0` | yes |
| `/options/ক/blocks/9` | yes |
| `/content/blocks/01` (zero-padded index) | no |
| `/content/blocks/0/data/blocks/001` | no |
| `/stems/0` (not a documented root) | no |
| `content/blocks/0` (not rooted) | no |
| `/content/blocks/0/data/blocks/1/data/blocks/2` (two levels) | no |

The correction is therefore **syntactic only**. It changes no accepted or rejected
value.

#### PostgreSQL / Prisma / migration / application implications

- **PostgreSQL:** none beyond the fact that the statement now compiles. Regex
  behaviour is unchanged.
- **Prisma:** none. `CHECK` constraints are invisible to Prisma; it neither generates
  nor diffs them. This decision cannot affect the Option C workflow, the snapshots, or
  `migrate diff`.
- **Migration:** none. The migration is already correct and already deployed through
  `prisma migrate deploy` in CI. Correcting §3.9 does **not** edit migration 0001 —
  editing an applied migration is precisely what G‑3 criterion 5b detects.
- **Application:** none. `block_ref` validation in the publish gate (I‑8, I‑14) parses
  and resolves pointers; it is not built today and is not affected by prose.

#### Options compared

| Option | What it means | Assessment |
|---|---|---|
| **A. Correct §3.9 to the parenthesised form** (and mirror it in §3.3.12's copy) | Document matches the deployed, working statement | Removes the only known-unappliable statement in the proposal. Costs one prose edit. |
| **B. Leave §3.9 as written, rely on the migration's comment** | The authoritative document stays wrong; the truth lives in a code comment | A future reader re-derives the bug. Contradicts the document's own role as the specification. |
| **C. Rewrite the CHECK as a single literal in both places** | Equivalent to A, and also matches §3.3.12's existing single-literal copy | Also valid and slightly tidier; but it is a *larger* prose change than A, and the two-literal split was presumably chosen for line-length reasons. |

#### Risks, reversibility, maintenance cost

- **Risk of doing it:** essentially none. The pattern is measured byte-identical and
  behaviourally identical.
- **Risk of not doing it:** a future reader either cannot apply the spec or applies a
  subtly different one while "fixing" it.
- **Reversibility:** a prose edit; trivially reversible.
- **Maintenance cost:** zero. It removes a latent trap rather than adding maintenance.

#### Consistency with approved decisions

Consistent. The pattern is an **approved** decision (request **E‑17** / the
asset-pointer decision, approval register row 9). This option changes the *expression
of* the approved rule, not the rule. No approved constraint is relaxed.

#### Recommendation

**Option A — correct §3.9 to the parenthesised form, and mirror the correction in
§3.3.12's prose copy of the same pattern so the document states it once.**

Evidence: the documented form is rejected by PostgreSQL with a specific error; the
corrected form compiles; the corrected pattern is byte-identical (129 bytes) to §3.3.12's
single-literal form and to the deployed constraint; and nine pointer cases behave
identically. **No migration change accompanies this** — migration 0001 is already correct.

**Owner approval required: yes**, because it edits an approved design statement, even
though the edit is provably semantics-preserving.

---

### 3.2 Q‑AUD‑2 — `tags.name` uniqueness is specified two ways

#### The technical issue

Three places disagree, and the disagreement encodes two different behaviours:

| Location | Says |
|---|---|
| §3.3.13 prose | `UNIQUE (lower(name))` as an expression index **instead of** a plain `UNIQUE (name)` |
| §3.10 SQL | `CREATE UNIQUE INDEX uq_tags_name_lower ON tags (lower(name));` |
| §5 sketch, `model Tag` | `name String @unique` |

A plain `@unique` on `name` is **case-sensitive** in PostgreSQL. It permits
`Logic Gate` and `logic gate` to coexist. §3.3.13 says explicitly that they must not.

#### What was measured

Applied as migrated (expression unique only):

| Insert | Result |
|---|---|
| `('Logic Gate', slug 'logic-gate')` | accepted |
| `('logic gate', slug 'lg2')` | **rejected** by constraint `"uq_tags_name_lower"` |

Then the §5 sketch was simulated exactly — `uq_tags_name_lower` dropped, a plain
`UNIQUE (name)` added, table emptied:

| Insert | Result |
|---|---|
| `('Logic Gate', slug 'logic-gate')` | accepted |
| `('logic gate', slug 'lg2')` | **accepted** |
| `('Logic Gate', slug 'lg3')` — exact repeat | rejected by `"tags_name_key"` |

**So the contradiction is real and behavioural, not cosmetic.** The §5 sketch would
silently permit the duplicate that the prose forbids. That is measured, not inferred.

Enforcement case 30 in the G‑3 suite proves the shipped behaviour, and it asserts the
**constraint name**, so it would have failed had the plain unique been created instead.

#### PostgreSQL / Prisma / migration / application implications

- **PostgreSQL:** `lower(name)` on `text` is `IMMUTABLE` under the default collation
  used here, so the expression index is legal; it is already deployed and enforcing.
- **Prisma:** Prisma cannot express an expression unique index, which is exactly why
  this one is hand-written (Part C of the migration). Prisma also **cannot see** it —
  a `migrate diff` from the datamodel will neither create nor drop it. This is a known,
  documented limitation and is the same class as the composite FKs.
- **Migration:** a future migration must not accidentally add `@unique` to `Tag.name`;
  if someone does, `prisma migrate diff` *will* generate `CREATE UNIQUE INDEX … ON
  "tags"("name")`, which would be an additive second constraint, not a replacement —
  and would then reject only exact duplicates. The prose contradiction is what invites
  this.
- **Application:** services doing tag creation must handle a `23505` raised by
  `uq_tags_name_lower` (not by a named Prisma constraint), so `P2002` mapping needs to
  tolerate a constraint Prisma does not know about. This is a real implementation note
  for Phase 05, captured here rather than discovered later.

#### Options compared

| Option | What it means | Assessment |
|---|---|---|
| **A. Correct §5's `Tag.name` to remove `@unique`, add a comment pointing at §3.3.13** | §5 stops contradicting §3 | Matches the deployed behaviour exactly, keeps §3 authoritative, and removes the invitation to add a plain unique. Zero deployment effect. |
| **B. Change the design: add plain `@unique` on `name` and drop the expression index** | Case-sensitive tag names | **Rejects an approved decision** (§3.3.13) and re-permits `Logic Gate` / `logic gate`. Would require a new migration plus a fresh G‑3 run. Not recommended, and not something an implementer may choose. |
| **C. Keep both a plain unique and the expression unique** | Belt and braces | The expression unique already implies the plain one for exact duplicates; a second index buys nothing and costs writes. Pointless. |
| **D. Leave the contradiction recorded but uncorrected** | Status quo | Acceptable only if no one reads §5. §5 is the section a developer opening the file is most likely to copy from. |

#### Risks, reversibility, maintenance cost

- **Risk of A:** none to the database; one prose edit.
- **Risk of leaving it:** the next person adds `@unique` because §5 shows it, producing
  an extra index and an inconsistent uniqueness rule.
- **Reversibility:** trivially reversible.
- **Maintenance cost:** zero now; it prevents a recurring confusion.

#### Consistency with approved decisions

Option A is the **only** option consistent with §3.3.13, which is the approved decision.
It changes an illustrative sketch to match the approval, which is what §5's own heading
already authorises ("illustrative — §3 is normative").

#### Recommendation

**Option A — remove `@unique` from `Tag.name` in §5 and add a one-line comment
referring to §3.3.13 and `uq_tags_name_lower`.**

Evidence: measured case-sensitivity divergence (case variant rejected as migrated,
accepted under the §5 sketch); enforcement case 30 already pins the shipped behaviour by
constraint name; the expression index is deployed and enforcing. **No migration change.**

**Owner approval required: yes** — it edits the approved §5 sketch, and it is the point
at which the document stops containing a rule that a reader could implement two ways.

---

### 3.3 Q‑AUD‑3 — `colleges.name` uniqueness is specified two ways

#### The technical issue

§3.4.2 says: "`UNIQUE (name)`; expression unique `UNIQUE (lower(name))` **instead of**
the plain one" — naming both, then stating one replaces the other, in a single clause.
§5's `model College` shows `name String @unique`. Same structural problem as Q‑AUD‑2,
but here the *prose itself* is the ambiguity, not only the sketch.

#### What was measured

As migrated:

| Insert | Result |
|---|---|
| `('Dhaka College')` | accepted |
| `('dhaka college')` | **rejected** by `"uq_colleges_name_lower"` |

The deployed catalog shows exactly one relevant index:
`CREATE UNIQUE INDEX uq_colleges_name_lower ON public.colleges USING btree (lower(name))`.
There is no plain unique on `name`. Enforcement case 32 pins this.

#### PostgreSQL / Prisma / migration / application implications

Identical in kind to Q‑AUD‑2:

- **PostgreSQL:** one expression unique, enforcing; no plain unique.
- **Prisma:** cannot express it; does not manage it; will not diff it.
- **Migration:** the risk is the reverse of Q‑AUD‑2's — because §3.4.2's sentence names
  `UNIQUE (name)` **first**, a reader could reasonably implement the plain unique and
  treat the expression index as the optional half. That reading inverts the design.
- **Application:** institution de-duplication is a human-facing concern — two spellings
  of one college is the exact case this guards. A case-sensitive rule would fail at the
  job it exists to do.

#### Options compared

| Option | What it means | Assessment |
|---|---|---|
| **A. Rewrite §3.4.2 to state the replacement unambiguously** (name the plain unique as *replaced*, exactly as §3.3.13 already does for tags) | Prose matches the deployed design | Removes the ambiguity at its source; makes the two tables' wording parallel, which also aids review. |
| **B. Match Q‑AUD‑2's fix in §5 only** | Fix the sketch, leave §3.4.2's "instead of" clause | Half a fix: §3.4.2 is normative, so the authoritative sentence would remain self-contradictory. |
| **C. Change the design to a plain unique** | Case-sensitive institutions | Rejects the approved §3.10 SQL; requires a migration and a new G‑3 run. |

#### Risks, reversibility, maintenance cost

Same profile as Q‑AUD‑2. One added consideration: the two tables will now read the same
way, so a future reviewer comparing them does not have to work out whether the
difference was deliberate.

#### Consistency with approved decisions

Option A is required for consistency with §3.10 (authoritative SQL) and with §3.3.13's
already-clear phrasing. It preserves the approved design exactly.

#### Recommendation

**Option A — rewrite §3.4.2 so the plain unique is unambiguously *replaced*, and align
§5's `model College` with Q‑AUD‑2's fix.**

Evidence: the deployed catalog has only the expression unique; a case variant is
rejected by `uq_colleges_name_lower`; enforcement case 32 pins it. **No migration change.**

**Owner approval required: yes**, for the same reason as Q‑AUD‑2.

---

### 3.4 Q‑AUD‑4 — `ck_question_options_key_single_char` is unreachable

#### The technical issue

Two `CHECK`s are declared on `question_options.key`:

| Constraint | Predicate |
|---|---|
| `ck_question_options_key_single_char` | `char_length(key) = 1` |
| `ck_question_options_key_allowed` | `key IN ('A','B','C','D','ক','খ','গ','ঘ')` |

Every member of the allowed set is exactly one character, so **`key_allowed` implies
`key_single_char`**. No row can violate the second without already violating the first.
PostgreSQL reports whichever it evaluates first, and that is always `key_allowed`.

#### What was measured

**Exhaustive search**, not an argument. All 1‑, 2‑ and 3‑character strings over the
allowed alphabet plus four near-miss characters (`E`, `a`, space) — 1 463 candidates:

| Measure | Result |
|---|---|
| Candidates probed | **1 463** |
| Candidates satisfying `key_allowed` | **8** |
| Candidates satisfying `key_allowed` **but violating** `key_single_char` | **0** |

Zero witnesses in 1 463. The implication holds on this domain.

Then, with a real fixture and the migration applied unchanged, inserting key `'AB'`:

```
ERROR:  new row for relation "question_options" violates check constraint "ck_question_options_key_allowed"
```

`ck_question_options_key_single_char` never fires.

Then the counterfactual — with `ck_question_options_key_single_char` dropped:

| Insert | Result |
|---|---|
| `'AB'` | still **rejected**, by `ck_question_options_key_allowed` |
| valid single-char key | accepted |

CHECK count went **47 → 46 → 47** across the test. The constraint was restored, so the
database is left exactly as the migration creates it.

#### PostgreSQL / Prisma / migration / application implications

- **PostgreSQL:** two `CHECK`s are evaluated per insert; the redundant one costs a
  trivial amount of evaluation on a small table. No correctness effect.
- **Prisma:** invisible either way; Prisma does not manage `CHECK`s.
- **Migration:** this is where the decision costs something. Today `47` is asserted in
  **five** places: `run.sh` (`EXPECTED_CHECKS=47`, the shape message, a CI note, the
  summary), `local-verify.sh` (twice), the G‑3 workflow's independent inventory
  (`18/7/26/47`), `enforce.sql` case 33, `prisma/schema.prisma`'s header comment,
  §3.14's count-movement paragraph, and the proposal's status lines. Dropping the
  constraint means: a new migration 0002 (`ALTER TABLE … DROP CONSTRAINT`), editing all
  of those assertions, and **re-running G‑3 in CI**, because the recorded pass is
  against a 47‑CHECK schema.
- **Application:** none. Both constraints are equally invisible to Prisma Client; no
  error-code mapping depends on which one fires, because the case suite already accepts
  either.

#### Options compared

| Option | What it means | Assessment |
|---|---|---|
| **A. Keep it** | 47 stays; the redundancy is documented | Zero cost, zero risk. It still expresses "one character" as an independent intent, which is defensible documentation even if currently implied. The G‑3 pass remains valid as recorded. |
| **B. Drop it** | 46; new migration 0002; five+ assertion sites updated; G‑3 re-run | Gains: removes a constraint that can never fire, and a marginally cheaper insert path. Costs: an applied-migration change requiring a new migration, edits to the acceptance evidence, and a fresh CI gate run — all for a constraint that is provably harmless. |
| **C. Replace `key_allowed` with a narrower form that makes `single_char` reachable** | reorder/express differently | Contrived. It would exist only to make a redundant check "do something". Rejects the approved predicates. |

**A note on honesty in the test suite:** the case suite does **not** pretend the
constraint is load-bearing. Case 23 explicitly records that `key_allowed` is what fires,
and case 33 asserts the *total* count of `ck_` constraints so an accidental omission
would still be caught. So keeping the constraint does not hide anything.

#### Risks, reversibility, maintenance cost

- **Keep (A):** risk none. Reversibility n/a. Maintenance: one documented redundancy.
- **Drop (B):** risk is *process* risk — an evidence-bearing number changes and the
  recorded G‑3 pass no longer describes the deployed schema until CI re-runs. Also, a
  dropped `CHECK` cannot be un-dropped without another migration, so it is less
  reversible than any of the other four decisions.
- **Neither option** affects correctness of stored data.

#### Consistency with approved decisions

Keeping (A) is consistent with the rule that an implementer may not delete an approved
constraint. Dropping (B) is *also* legitimate **if the owner decides it** — it is an
approved-constraint change, which is exactly why it is being asked rather than assumed.

#### Recommendation

**Option A — keep `ck_question_options_key_single_char`; leave the CHECK count at 47.**

Evidence: 1 463 probes found zero witnesses, so it can never be the constraint that
fires; dropping it changes no reject/accept outcome (measured: `'AB'` still rejected by
`key_allowed`); and dropping it would require a new migration plus a re-run of the G‑3
gate that is currently PASSED, at no correctness gain. The redundancy is already
recorded in §11.9.5 and in case 23, so nothing is hidden.

**Owner approval required: yes** — but note the asymmetry: if the answer is **keep**,
this closes the question with **no further work and no new evidence run**. If the answer
is **drop**, it becomes an implementation task (new migration, updated assertions, fresh
G‑3 CI run) and should be scheduled as such, not folded into a documentation pass.

---

### 3.5 Q‑AUD‑5 — §3.3.1 cites a support key that does not exist

#### The technical issue

§3.3.1 says `education_levels` has "the optional §3.11.6 support key on `(id, …)`".
No such key exists anywhere in §3.11.6, and none is needed: composite FK **C‑1**
references `level_subjects(level_id, subject_id)`, which is that table's **primary key**.
`education_levels` is not referenced by any composite FK at all.

#### What was measured

The only keys on the table, from the live catalog of the deployed migration:

```
education_levels_pkey  ::  PRIMARY KEY (id)
```

That is the complete list — no unique constraint other than the primary key, and no
`UNIQUE (id, …)` support key of the kind the other three support uniques take. Confirmed
across the whole schema: the three that exist are `uq_chapters_id_subject`,
`uq_topics_id_chapter`, `uq_subtopics_id_topic` — one per referencing composite FK that
needs a non-primary referenced key. **Zero** support keys exist on `education_levels`,
correctly, because C‑1's referenced key is a primary key.

#### PostgreSQL / Prisma / migration / application implications

- **PostgreSQL:** none. Nothing would change either way; the sentence describes
  something absent, and its absence is correct.
- **Prisma:** none.
- **Migration:** the real hazard is small but real — a reader implementing "the optional
  §3.11.6 support key" would add a **redundant unique index** on `education_levels(id, …)`,
  which is additive drift relative to the committed migration and would be rejected by
  the G‑3 shape assertion (`6 hand-written indexes`) only if it were hand-written into
  the migration; if it were added to `schema.prisma` it would pass validation and then
  appear in a future `migrate diff`.
- **Application:** none.

#### Options compared

| Option | What it means | Assessment |
|---|---|---|
| **A. Delete the clause** | Prose matches reality | One-sentence edit; removes an instruction that would cause redundant drift. |
| **B. Add the support key for consistency** | Every dimension gets one | Adds a unique index that nothing references. Costs an index, adds drift, and contradicts §3.11.6, which is silent and correct. |
| **C. Reword to "no support key is required; C‑1 references `level_subjects`' primary key"** | Explains *why* it is different from chapters/topics/subtopics | Slightly more words than A, and worth it: the asymmetry between this table and the other three is the thing a reader would otherwise question. |

#### Risks, reversibility, maintenance cost

Negligible in every direction; the only reason it is a question at all is that it was
recorded honestly instead of quietly deleted.

#### Consistency with approved decisions

Option A or C is consistent with §3.11.6, which is the approved definition and is
already correct. Option B would extend an approved design.

#### Recommendation

**Option C — replace the clause with a one-sentence statement that no support key is
required, because C‑1 references `level_subjects`' primary key.** (Option A — plain
deletion — is acceptable if brevity is preferred; the difference is one clause.)

Evidence: the live catalog shows only the primary key; the three real support uniques
exist where §3.11.6 says they do; §3.11.6 never mentions `education_levels`.

**Owner approval required: yes**, formally — it is an approved-section edit — though
this is the least consequential of the five.

---

## 4. Summary of the five recommendations

| # | Recommendation | Blocking? | Changes the database? | Needs a new G‑3 run? | Approval required |
|---|---|---|---|---|---|
| Q‑AUD‑1 | Correct §3.9 (+ §3.3.12 copy) to the parenthesised form | No | No | No | **Yes** |
| Q‑AUD‑2 | Remove `@unique` from §5's `Tag.name`, point at §3.3.13 | No | No | No | **Yes** |
| Q‑AUD‑3 | Rewrite §3.4.2 to state the plain unique is replaced; align §5's `College` | No | No | No | **Yes** |
| Q‑AUD‑4 | **Keep** `ck_question_options_key_single_char`; CHECK count stays 47 | No | No | No | **Yes** (and if "drop": new migration + re-run) |
| Q‑AUD‑5 | Replace §3.3.1's clause with "no support key required, because C‑1 references the primary key" | No | No | No | **Yes** |

**Combined effect if all five are approved as recommended: documentation only.** No
migration, no schema, no application code, no re-run of any gate.

---

## 5. Findings recorded during this preparation that are *not* among Q‑AUD‑1…5

Three further discrepancies surfaced while verifying the five questions. They are
recorded here because they bear on the decisions, and **none is resolved by
assumption**. They are not part of the five approvals and are raised separately.

### 5.1 §3.14 undercounts the hand-written index set

§3.14 says the 5 remaining hand-written indexes are the two partial uniques, the
`NULLS NOT DISTINCT` unique and the two expression uniques — and that
`uq_chapters_subject_number` became Prisma-native. That is all true. But the migration's
Part C also contains a **sixth** hand-written index, `ix_question_assets_checksum`, which
§3.3.11 documents and §3.14 omits. The deployed catalog confirms six `uq_`/`ix_`
hand-written indexes, and the G‑3 shape assertion expects **6**. So the *implementation*
and the *gate* are consistent; §3.14's prose lists five.

**Raised as a documentation discrepancy. Not corrected.** It is not one of the five
questions and should not be folded into them.

### 5.2 §11.9.7's parenthetical about `question_assets.checksum` is imprecise

§11.9.7 states that duplicate checksums "are prevented by `ix_question_assets_checksum`,
which is partial … and therefore cannot be a constraint." The index is indeed partial
and indeed non-unique — but a **non-unique** index does not prevent anything. Measured:
two asset rows with an identical `sha256:` checksum insert successfully
(`INSERT 0 2`), which is correct de-duplication-scan behaviour, not a uniqueness
guarantee.

The surrounding §3.3.11 prose is accurate ("for de-duplication"), so this is a wording
imprecision in the audit record only, with no design impact. **Recorded, not corrected.**

### 5.3 The proposal carries two "what approval authorises" sections that disagree

§11.8 says approval is "only once G‑1 is resolved", while §11.6.8 and the Revision 14
status line describe migration 0001 as implemented. Both are historically true — 0001
was written as gate evidence — but a reader arriving at §11.8 today would conclude the
migration does not exist. This is precisely the tension analysed in §7 and is the
strongest argument that the authorisation question needs an explicit answer rather than
another status sentence.

---

## 6. Exact owner approvals still required

Each line is a separate decision. **No line may be inferred from another.**

| # | Approval requested | Recommended answer | Consequence of approval |
|---|---|---|---|
| **A1** | "Correct §3.9's `block_ref` CHECK — and its copy in §3.3.12 — to the parenthesised form, with no change to migration 0001." | approve | Prose only; document and migration agree |
| **A2** | "Remove `@unique` from `Tag.name` in §5 and reference §3.3.13 / `uq_tags_name_lower`." | approve | Prose only; §5 stops contradicting §3 |
| **A3** | "Rewrite §3.4.2 so the plain unique is unambiguously replaced, and align §5's `College` with A2's treatment." | approve | Prose only |
| **A4** | "**Keep** `ck_question_options_key_single_char`; the CHECK count remains 47; the redundancy stays recorded in §11.9.5 and enforcement case 23." | approve | No work at all |
| **A5** | "Replace §3.3.1's support-key clause with a statement that no support key is required because C‑1 references `level_subjects`' primary key." | approve | Prose only |
| **A6** | "Record §5.1–§5.3 as documentation discrepancies to be corrected in a later documentation pass" (or: correct them now). | record now, correct later | Keeps the record honest without expanding this package |
| **B1** | The **separate** authorisation question in §7: whether to proceed with Option C toward production while **G‑1 remains FAILED**. | see §7.6 | This is the only approval that unblocks anything |
| **B2** | Whether C‑1…C‑5 may be **created in a production database** given G‑1's failure (the Request C condition), which is a *different* question from B1. | see §7.6 | Third option: deploy 0001 **without** Part D |

---

## 7. Separate analysis: proceeding with Option C while G‑1 remains FAILED

This is **not** Q‑AUD‑1 … Q‑AUD‑5. It is the blocking question, and it is analysed
separately because it has a different approval authority and a different consequence.

### 7.1 The distinction that must not be blurred

| Gate | Question it asks | Verdict | What it gates |
|---|---|---|---|
| **G‑1** | Does Prisma's **ordinary** workflow preserve C‑1…C‑5 across a routine schema change? | **FAILED** (twice, §11.3.2 / §11.3.3) | The **physical design** of Request C, and production use of the constraints |
| **G‑3** | Is the **controlled** Option C workflow safe enough to use? | **PASSED**, full 18‑table schema, run `45273840004` | The **workflow** |

**G‑3 does not reverse G‑1.** G‑1 measured that `prisma migrate dev` generates a
migration which drops exactly the five composite FKs; that result is unchanged and
unchangeable by any workflow evidence. G‑3 measured that a workflow exists in which that
command is never used. Both statements are true simultaneously.

Therefore: **the migration is not production-approved.** It is *workflow-validated*. The
difference is the subject of this section.

### 7.2 Why Option B remains rejected

Option B is "keep the FKs, keep ordinary Prisma workflows". It is not rejected on
preference — it was **measured and failed**, and the measurement is specific:

- With real Prisma migration history and the five constraints declared as they must be,
  a **no-change** `migrate dev` generates `DROP CONSTRAINT` for exactly the five
  (§11.3.3). The diff is confined to the five, which rules out "something else in the
  schema confused it".
- That means the failure is not probabilistic. It recurs on every routine schema change,
  and the resulting migration looks ordinary in review.
- The failure mode is the worst in the analysis: **silent removal of an integrity layer
  after the schema was believed correct.** No test can make this safe, because the tool
  regenerates the destructive SQL each time.

Option B therefore remains rejected on evidence, and the recorded verdict is not
softened here.

### 7.3 Why Option C is the proposed controlled workflow

Option C separates what Prisma is good at from what it cannot represent:

1. Prisma generates the baseline migration from the datamodel.
2. The five composite FKs and the hand-written artifacts are appended as reviewed SQL.
3. Later changes come from **schema-to-schema** diffs, which never open a database and
   are therefore blind to the composite FKs — the same property that makes Prisma unable
   to manage them makes the diff unable to delete them.
4. `migrate dev`, `migrate reset`, `db push` and `diff --from-migrations` are prohibited.
5. CI runs a guard, a live-catalog assertion and an enforcement suite after deployment.

**Why this is sound rather than a workaround:** the diff mechanism *cannot* propose
dropping the constraints. That was not assumed — the prototype proved the negative case
too, by requiring the same check to detect a real change (§11.4.3).

### 7.4 Operational safeguards that must hold, and their residual risk

| # | Safeguard | Status | Residual risk |
|---|---|---|---|
| 1 | `repo-guard.sh` rejects prohibited commands across executed surfaces | Implemented, negative-tested | A developer can run `migrate dev` locally before committing; the catalog assertion catches the consequence only at deployment |
| 2 | `guard.py catalog` compares the live catalog against the approved five | Implemented, caught both a weakened and a dropped FK in CI | Must actually run; not a database-level protection |
| 3 | `guard.py sql` textual guard on every migration | Implemented, 6/6 tampering variants rejected | Reviewer must run it; a hand-edit not caught by pattern is possible |
| 4 | `guard.py history` SHA‑256 checksum against `_prisma_migrations` | Implemented; **necessary** because Prisma does not detect edited applied migrations (measured twice) | Must be run; not automatic |
| 5 | Post-deployment enforcement suite | Implemented, 33/33 | Covers declarative invariants only; I‑3…I‑15 remain service invariants |
| 6 | Snapshot-to-snapshot diff on every schema change | Documented, prototyped | Requires discipline in maintaining two snapshot files |
| 7 | Prohibition documented in `docs/development/database-migrations.md` | Implemented | Convention, not a lock |

**Plain statement of residual risk:** six of the seven safeguards are *process*
controls. None of them is a database-level lock. If the team stops running them, the
guarantees degrade silently. This is inherent to Option C and is why it is a *conditional*
approval rather than a clean one.

### 7.5 Additional verification arguably required before production use

Honest list, none of which has been done:

1. **A second migration through the full workflow.** Every G‑3 run so far exercises
   migration **0001** and synthetic constrained-column changes applied by `psql`. No real
   *second* migration has yet been authored from a snapshot-to-snapshot diff, reviewed,
   guarded, deployed and verified end-to-end. That path — the one the team will use every
   week — is designed and prototyped but not exercised on this repository.
2. **Seeding verification.** §3.14's checklist requires seeding the six ICT chapters, a
   handful of subjects/boards/years and one MCQ + one CQ before 0001 is considered done.
   The G‑3 suite uses synthetic rows; realistic seed data has not been loaded.
3. **A restore drill.** §3.14 establishes Prisma Migrate is forward-only; rollback means
   backup restore or a compensating migration. Neither has been rehearsed.
4. **The publish-gate invariants (I‑3 … I‑15)** are service responsibilities and are not
   implemented, so the schema's guarantees are currently partial by design.
5. **`P2002` mapping for expression-unique violations** (see §3.2) — a known
   implementation detail for the service layer.

**Items 1 and 2 are the ones I would not skip before a first production deployment.**

### 7.6 What approval would authorise the next phase

Three distinct approvals are possible, and they are not equivalent. The owner should
choose one explicitly.

| Option | What is authorised | What it does **not** authorise | Risk profile |
|---|---|---|---|
| **B1a — Authorise the workflow only** | Use Option C for all future migrations; keep 0001 as the reference baseline; treat production deployment as still blocked | Anything touching a production database | Lowest. Records the decision G‑3 actually supports |
| **B1b — Authorise deployment of 0001 *including* C‑1…C‑5** | Full production deployment with the five composite FKs | — but this **overrides G‑1's failed condition** and requires accepting that the constraints exist outside Prisma's model permanently | Highest. Directly contradicts the Request C condition as written |
| **B1c — Authorise deployment of 0001 *without* Part D** | 18 tables, 7 enums, 21 ordinary FKs, 47 CHECKs, 6 indexes in production — no composite FKs | C‑1…C‑5 in production. The integrity guarantees would then rest on service validation (Option A), which needs its own re-approval | Middle. Delivers the schema while respecting G‑1 |

**My recommendation: B1a now, and B1b only after §7.5 items 1 and 2 are done and
recorded.** Option B1c is legitimate and coherent, but it silently converts an approved
declarative design into service-enforced logic, so it should be chosen deliberately,
never by default.

**No approval here makes the migration production-approved by itself.** B1b and B1c are
the only two that would, and each carries a named cost written above.

### 7.7 What is *not* being asked

- Not asking to re-score G‑1. It stays FAILED.
- Not asking to reinterpret G‑3 as a substitute. It is not one.
- Not asking to merge PR #10.
- Not asking to create migration 0002, change the schema, or write application code.

---

## 8. Confirmation

| Boundary | State |
|---|---|
| `prisma/schema.prisma` | **unchanged** — no edit in this task |
| `prisma/migrations/**` | **unchanged** — no migration added, edited or removed |
| Application code, services, DTOs, UI | **none created** |
| Approved constraints / schema decisions | **none altered** — Q‑AUD‑4 was tested and restored to 47 |
| Any question resolved by assumption | **none** — §5.1–§5.3 are recorded, not resolved |
| PR #10 | **open, not merged** |

All PostgreSQL experiments ran on a disposable database built by applying the committed
migration; the database was rebuilt from that migration after each mutation, and the
final state was verified as 18 tables / 47 `ck_` constraints / 26 foreign keys.

---

## Appendix — reproducible measurements

Every claim above can be re-derived with the following. Run against a disposable
PostgreSQL 16 database with `migration.sql` applied, never a shared one.

```sql
-- A. Q-AUD-1: the documented form is rejected, the parenthesised form is not
--    (expect ERROR: argument of CHECK must be type boolean, not type text)
CREATE TEMP TABLE t_bad (v text, CONSTRAINT c1 CHECK (v ~ 'a' || 'b'));

-- B. Q-AUD-1: the concatenation equals the single literal, and nothing is lost
SELECT ('^(/content/blocks/(0|[1-9][0-9]{0,2})(/data/blocks/(0|[1-9][0-9]{0,2}))?'
      || '|/options/[ABCDকখগঘ]/blocks/(0|[1-9][0-9]{0,2}))$')
     = '^(/content/blocks/(0|[1-9][0-9]{0,2})(/data/blocks/(0|[1-9][0-9]{0,2}))?|/options/[ABCDকখগঘ]/blocks/(0|[1-9][0-9]{0,2}))$'
     AS identical;                                    -- expect t

-- C. Q-AUD-4: no witness for key_allowed AND NOT key_single_char (expect 0)
WITH chars AS (SELECT unnest(ARRAY['A','B','C','D','ক','খ','গ','ঘ','E','a',' ']) AS c),
     s AS (SELECT c AS v FROM chars
           UNION ALL SELECT a.c||b.c FROM chars a, chars b
           UNION ALL SELECT a.c||b.c||d.c FROM chars a, chars b, chars d)
SELECT count(*) FILTER (WHERE v IN ('A','B','C','D','ক','খ','গ','ঘ') AND char_length(v) <> 1)
FROM s;

-- D. Q-AUD-4: which constraint fires for a 2-character key (expect key_allowed)
--    with the fixture from §3.4 and key = 'AB'

-- E. Q-AUD-2 / Q-AUD-3: exactly one relevant unique index per table
SELECT tablename, indexdef FROM pg_indexes
WHERE tablename IN ('tags','colleges') AND indexdef ILIKE '%name%';

-- F. Q-AUD-5: no support key on education_levels (expect only the primary key)
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'education_levels'::regclass AND contype IN ('p','u');

-- G. §5.1: the six hand-written indexes actually deployed
SELECT indexname FROM pg_indexes WHERE schemaname='public'
  AND indexname IN ('uq_question_versions_one_published_per_question','uq_topics_chapter_order',
                    'uq_question_sources_identity','uq_tags_name_lower',
                    'uq_colleges_name_lower','ix_question_assets_checksum');

-- H. §5.2: a non-unique index prevents nothing (expect INSERT 0 2)
SELECT indexdef FROM pg_indexes WHERE indexname='ix_question_assets_checksum';
```
