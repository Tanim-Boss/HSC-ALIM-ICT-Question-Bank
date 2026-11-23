# G-3 full-schema — the gate against the real 18-table model

**Status: every criterion has passed in CI across two runs, but no single run has passed
all six yet — the honest one-line summary is *awaiting a clean run*, not *passed*.** See the proposal
[§11.6.8](../../../phase-04a-question-bank-physical-schema-proposal.md#1168-full-schema-g3--what-changed-in-revision-14)
and [§11.9](../../../phase-04a-question-bank-physical-schema-proposal.md#119-pre-implementation-audit--what-the-full-schema-authoring-found).

The reduced-prototype gate in [`../g3/`](../g3/README.md) passed in CI run
`45263567929` — but against a **10-table local transcription** of the schema, not the
schema itself. It had already diverged from Prisma's real output twice. This directory
removes that uncertainty.

## What is different here

| | Prototype (`../g3/`) | Full schema (this directory) |
|---|---|---|
| Datamodel | `../schema.prisma`, 10 models | `prisma/schema.prisma`, **18 models** |
| DDL source | `baseline_ddl.py` — hand-written transcriber | `prisma/migrations/0001_phase04a_question_bank/migration.sql` — **Prisma-generated** + reviewed SQL |
| Applied by | mixed | `prisma migrate deploy` **only** |
| Enforcement cases | 14 | **33** |
| CHECK constraints | none in the spike schema | **47** |
| Expression / partial / `NULLS NOT DISTINCT` indexes | 1 | **6** |

**No transcription step exists in this path.** That is the whole point: the schema
PostgreSQL is asked to enforce is the schema Prisma generated.

## Running it

```bash
# CI (the only form that constitutes G-3 evidence)
bash docs/database/g1-spike/option-c/g3-full/run.sh \
  --url        postgresql://user@localhost:5432/g3f_main     # must be empty
  --shadow-url postgresql://user@localhost:5432/g3f_shadow
  --replay-url postgresql://user@localhost:5432/g3f_replay
```

CI: [`.github/workflows/phase04a-g3-full-schema-gate.yml`](../../../../../.github/workflows/phase04a-g3-full-schema-gate.yml)

### Local SQL-level verification (NOT G-3 evidence)

Where the Prisma schema engine cannot be downloaded — this sandbox is one such place —
the SQL-level controls can still be exercised:

```bash
bash docs/database/g1-spike/option-c/g3-full/local-verify.sh \
  --url postgresql://user@localhost:5432/g3f_local
```

It applies the migration with `psql` instead of Prisma, so it can never be G-3 evidence.
It verifies: the migration applies; the shape is exactly `18/7/26/47/6`; the live-catalog
assertion passes **and** rejects a weakened and a dropped FK; 33/33 enforcement cases
pass; the textual guard accepts the committed baseline and rejects **6/6** tampering
variants; and the safe drop-and-re-add pattern applies without losing integrity.

It does **not** verify migration history, `migrate status`, reproducibility through
Prisma, or `migrate diff` visibility. Those need the engine and are CI-only.

## The 33 enforcement cases

Every case is a row in `g3f_results`; `run.sh` asserts the count is exactly 33 and that
every result is `PASS`. A case that silently stops running is a hard failure.

| Group | Cases | What is proved |
|---|---|---|
| Composite FKs C‑1…C‑5 | 2–7 | each rejects its invalid pairing **and names the right constraint**; `MATCH SIMPLE` skips a `NULL` key so a CQ rubric row is legal |
| Positive controls | 8, 9 | a consistent question is accepted; `NULL` taxonomy links are accepted |
| E‑7 partial uniqueness | 10–12 | a retired topic frees its position; two **active** topics may not share one; two retired ones may |
| Deletion action | 13 | `ON DELETE RESTRICT` blocks deleting a referenced chapter |
| Inventory | 14, 33 | all five protected FKs present; **all 47** `ck_` constraints present |
| `questions` CHECKs | 15–19 | `marks >= 0`; E‑11 (MCQ ≥ 1); **E‑10 rejected** — a CQ of 7 marks is accepted; both chain checks |
| `answer_keys` CHECKs | 20, 21 | exactly one payload: rejects both, rejects neither |
| `question_options` CHECKs | 22, 23 | unapproved label rejected; two-character key rejected |
| Content envelope | 24 | `format` / `version` / `blocks` presence is enforced |
| `block_ref` grammar | 25, 26 | an unrooted pointer is rejected; valid `/content/...` and `/options/খ/...` pointers are accepted |
| OD‑08 provenance guard | 27 | board **xor** college |
| Partial unique indexes | 28, 29 | one published version per question; two **drafts** still allowed |
| Expression uniques | 30, 32 | `Logic Gate` vs `logic gate`; college case-variants |
| `NULLS NOT DISTINCT` | 31 | identical attributions with both dimension columns `NULL` still de-duplicate |

## Two findings this suite produced

**Case 23 is a finding about the specification, not just a test.** §3.3.9/§3.9 declare
both `ck_question_options_key_single_char` and `ck_question_options_key_allowed`. Every
member of the allowed set is one character, so the second predicate **implies** the
first: no row can violate `single_char` without violating `key_allowed`, and PostgreSQL
reports `key_allowed`. The constraint is redundant. It is **kept, not removed** —
deleting a reviewer-approved constraint is a design change — and the redundancy is
reported as **Q‑AUD‑4** in §11.9.5.

**The `block_ref` CHECK in §3.9 was invalid SQL.** `~` and `||` share precedence, so the
statement evaluated to `text` and PostgreSQL refused it. The migration parenthesises the
literals; the pattern is unchanged. Recorded as Finding 1 / **Q‑AUD‑1** in §11.9.2, and
§3.9 now carries the corrected form.

## Three harness defects found by CI, and fixed here

These are recorded because each one is a case where the *test* was wrong and the
*schema* was right. None was fixed by weakening a criterion.

**1. `_prisma_migrations` counted as a 19th table** (`45272402867`). It is a real table in
`public`; it is Prisma's own bookkeeping and is excluded by name. Measured: with the
filter 18, without 19.

**2. Criterion 4 left the schema narrowed** (`45273199251`). It changes
`question_options.key` to `char(1)` and never restored it, so case 23's invalid
two-character key hit `value too long for type character(1)` instead of a
`check_violation`, and the suite silently ran **32 of 33** cases. Step 4f now restores
both columns and re-asserts the shape. Measured both directions: `char(1)` → 32,
`text` → 33. Note that the count assertion is what caught this — the suite would
otherwise have reported 32/32 as a pass.

**3. An out-of-scope drop test** (local). An early version asserted that the guard
rejects `DROP TABLE "question_versions"`. It
does not, and should not: the guard's protected-table scope is the seven tables the five
composite FKs touch, and PostgreSQL's own FK dependencies already block that drop. The
test was wrong, not the control. It was replaced with `DROP TABLE "question_options"`,
which **is** in scope and **is** rejected. The guard was **not** broadened to make a bad
test pass — the same principle that kept G‑3 honest in the prototype.
