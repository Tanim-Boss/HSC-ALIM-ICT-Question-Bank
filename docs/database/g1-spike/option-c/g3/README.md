# G-3 — production-readiness gate for the Option C migration workflow

**Status: all six criteria PASS on the reduced prototype** — CI run
[`45263567929`](https://github.com/Tanim-Boss/HSC-ALIM-ICT-Question-Bank/actions/runs/45263567929).
See
[`../../../../../docs/database/phase-04a-question-bank-physical-schema-proposal.md`](../../../phase-04a-question-bank-physical-schema-proposal.md)
§11.6 for the acceptance criteria, the residual risks, and why this run does **not**
close the gate for the full 18-table schema.

Three earlier runs failed, and each failure was a defect in this harness rather
than a flaky test: an assumption that Prisma detects edits to applied migrations
(it does not), fixtures that only the local partial path created, and a `DROP
CONSTRAINT` on a `@@unique` that Prisma emits as a unique index. All three were
fixed by correcting the harness; no criterion was weakened.

G-3 is a *separate* gate from G-1. **G-1 remains FAILED** and is not re-scored:
it asked whether Prisma's ordinary migration workflow preserves C-1…C-5, and the
answer was no, twice. G-3 asks a different question:

> Given that the project will *not* use Prisma's ordinary migration workflow, is
> the replacement workflow safe enough to operate production with?

## The six mandatory criteria

| # | Criterion | What "tested" means |
|---|---|---|
| 1 | **Workflow enforcement** | An automated check rejects `prisma migrate dev` for the production schema, and rejects any script that would run it |
| 2 | **Migration-history consistency** | `migrate status` is clean before and after deployment; history matches `_prisma_migrations` |
| 3 | **Protected constraint integrity** | All five constraints verified against the **live catalog** after every deployment, not merely counted |
| 4 | **Constrained-column migration safety** | A real change to a column participating in a composite FK is generated, applied, and leaves integrity intact |
| 5 | **Tampering detection** | A migration that removes or weakens a protected FK is rejected **before deployment**; a hand-edited migration is also caught |
| 6 | **Reproducibility** | An independent, empty database replays to an identical, verified state |

## Why the guard is not a grep for `DROP CONSTRAINT`

The obvious guard — reject any `DROP CONSTRAINT` of a protected FK — is **wrong**,
and was disproved while building G-3. Changing a column that participates in a
composite FK *requires* dropping and re-adding that FK; PostgreSQL refuses the
`ALTER` while the constraint exists. The naive guard therefore blocks the only
correct fix for a legitimate change.

`../guard.py` encodes the rule that is actually right:

> A protected FK may be dropped **only if the same migration re-adds it with an
> equivalent definition** — same referencing columns, same referenced columns, and
> the approved `ON UPDATE CASCADE` / `ON DELETE RESTRICT`.

and, separately, compares the **live catalog** to the approved definitions after
deployment. The textual check is a fast pre-deployment filter; the catalog check is
the authoritative one.

## What was measured, including the result that contradicted the plan

Criterion 4 originally assumed that changing any constrained column would be
blocked by PostgreSQL and would therefore need hand-editing. Measurement showed
that is only true for **non-coercible** type changes:

| Change | PostgreSQL | Effect on the composite FK |
|---|---|---|
| `answer_keys.mcq_correct_option_key`: `text` → `varchar(16)` (inside C-5) | **accepted** | C-5 untouched and still enforcing; no hand-editing needed |
| `questions.subject_id`: `uuid` → `varchar(64)` (inside C-1, C-2) | **refused**: `incompatible types` | must be dropped and recreated by hand |

The second row is the risk: PostgreSQL refuses, and the tempting "fix" is to drop
the constraint. A migration that drops C-5, widens the column, and never restores
the constraint **applies cleanly** and leaves a schema where
`answer_keys.mcq_correct_option_key = 'Z'` is accepted with no matching option.
That is precisely the failure the textual guard and the post-deployment catalog
assertion exist to catch, and both were negative-tested against it.

Stated as plainly as possible: **a coercible constrained-column change is not a
hazard by itself, and the guard must not pretend otherwise.** This is why G-3
requires the catalog assertion after *every* deployment rather than trusting the
generated migration or the pre-deployment text check alone.

## Running it

```bash
bash docs/database/g1-spike/option-c/g3/run.sh \
  --url        postgresql://user@localhost:5432/g3_main     # must be empty
  --shadow-url postgresql://user@localhost:5432/g3_shadow
  --replay-url postgresql://user@localhost:5432/g3_replay
```

CI: [`.github/workflows/phase04a-g3-workflow-gate.yml`](../../../../../.github/workflows/phase04a-g3-workflow-gate.yml)

Every step prints which criterion it tests and what its result establishes. A
criterion is only recorded as PASS when the step that tests it ran and succeeded;
anything skipped is reported as **NOT TESTED**, never as a pass.

### PostgreSQL-only mode (local, development)

Where the Prisma schema engine is unavailable, criteria 3, 4 and 5 can still be
exercised against a disposable PostgreSQL:

```bash
python3 docs/database/g1-spike/option-c/g3/baseline_ddl.py \
  docs/database/g1-spike/option-c/schema.prisma > /tmp/base.sql

bash docs/database/g1-spike/option-c/g3/run.sh \
  --url postgresql://user@localhost:5432/g3_main \
  --shadow-url postgresql://user@localhost:5432/g3_shadow \
  --baseline-ddl /tmp/base.sql \
  --partial-postgres-only
```

`baseline_ddl.py` transcribes the datamodel into equivalent DDL so the constraints
behave identically. **It is not Prisma, and its output is not Prisma output.** A run
in this mode reports criteria 1, 2, 4a, 5b and 6 as not tested (or partial), exits
non-zero if any tested criterion fails, and is *local SQL evidence only* — never CI
evidence and never a G-3 pass.

## Repository guard

```bash
bash docs/database/g1-spike/option-c/repo-guard.sh   # scans scripts/ and .github/workflows/
```

Rejects `prisma migrate dev`, `migrate reset` and `db push` in any executed surface.
Documentation is deliberately **not** scanned: prose about a prohibited command is
not a violation of the rule, and a guard that fails on its own README is a guard
people disable. Exit 0 clean, 1 violation.
