# G-1 experiment 2 — Prisma migration history + manually appended composite FKs

**Status: FAILED — and decisive.** See [`expected/RESULT.md`](expected/RESULT.md) for the
recorded result (commit, run URLs, versions, exact procedure, per-criterion results) and
[§11.3.3](../../phase-04a-question-bank-physical-schema-proposal.md#1133-g1-experiment-2--result-fail-but-decisive)
of the proposal for the disposition.

The short version: the five composite FKs **can** be created, deployed and enforced inside a
Prisma-managed database (14/14 enforcement cases, and the no-change diff is confined to
exactly the five). But Prisma's no-change `migrate dev` **generates a migration that drops
all five** — it reads them as drift. Acceptance criterion 4 fails; criteria 5–6 were never
reached because the harness stops at the first failure.

Experiment 1 asked: *when the five approved composite FKs exist in PostgreSQL but
not in the Prisma datamodel, does Prisma drop them?* It answered **yes** — and that
answer was real, but it was **not** a clean verdict on the composite FKs, because
experiment 1's database had no migration history, so Prisma was entitled to treat the
whole schema as unmanaged and propose rebuilding it. It dropped every ordinary foreign
key and every ordinary unique along with C‑1…C‑5.

Experiment 2 asks the question production actually faces:

> If the schema is created **by Prisma** — so migration history genuinely exists — and
> the five composite FKs are **appended to a Prisma-generated migration**, do they
> survive deployment, later migrations, and shadow-database replay?

## Why the design is different

| | Experiment 1 | Experiment 2 |
|---|---|---|
| Schema created by | hand-written SQL | **Prisma** (`migrate dev`) |
| Migration history | none | **real** (`_prisma_migrations`) |
| Composite FKs | present from the start | **appended** to a generated migration |
| Support uniques `uq_*_id_*` | hand-written | **declared in the datamodel**, created by Prisma |
| Ordinary FKs / uniques | hand-written | **created by Prisma** |
| Enforcement test | 14 cases | **same 14 cases, reused verbatim** |

The third-from-last row is the key improvement. In experiment 1 the three support
unique keys were *also* undeclared, so the diff could not distinguish “Prisma drops
what it cannot model” from “Prisma drops what the datamodel forgot”. Here the support
keys are modelled with their approved names, so **any remaining difference must involve
only the objects Prisma genuinely cannot express**:

- the five composite foreign keys C‑1…C‑5
- the active-only partial index `uq_topics_chapter_order` (E‑7, rev. 5)
- the two chain `CHECK`s

## Contents

| Path | Purpose |
|---|---|
| `schema.prisma` | The datamodel Prisma generates the baseline from. Declares every expressible object, including the three support uniques with their approved names. |
| `manual/001_composite_fks.sql` | **Everything that is appended by hand, and nothing else.** The five FKs verbatim from §3.11.6, the two chain CHECKs, the partial index. |
| `run.sh` | The experiment driver. Numbers every step and states what each one establishes. |
| `expected/` | Recorded results, run URLs, versions and the verbatim artefacts. |

`run.sh` asserts that each of the five FK definitions in `manual/001_composite_fks.sql`
is **identical to the approved reference copy** in [`../sql/0001-schema.sql`](../sql/0001-schema.sql)
(compared with identifier quoting normalised, whitespace collapsed). The hand-written
part therefore cannot silently drift away from the approved design, and
“do not alter their definitions” is a machine-checked property rather than a promise.

## Running it

### In CI (preferred)

Workflow: [`.github/workflows/g1-experiment-2.yml`](../../../../.github/workflows/g1-experiment-2.yml)

It provisions **two** disposable `postgres:16` containers — one for the deployed
migrations, one for the shadow database — pins Node 22 and asserts Prisma CLI **and**
client are exactly 7.10.1 from `node_modules`, then runs `run.sh`. No production
credentials, no production URL, no shared database.

Triggered by changes to this directory, to `../sql/`, or manually via
`workflow_dispatch`.

### Locally

Requires PostgreSQL 15+ (16 recommended), Node 22, and `npm ci`. **Both databases must
be empty** — the script refuses to run otherwise and will not drop an existing schema.

```bash
createdb g1_exp2_test
createdb g1_exp2_shadow

bash docs/database/g1-spike/experiment-2/run.sh \
  --url        "postgresql://user@localhost:5432/g1_exp2_test" \
  --shadow-url "postgresql://user@localhost:5432/g1_exp2_shadow"
```

Artefacts are written to `out/` (git-ignored).

> The Prisma schema engine is downloaded from `binaries.prisma.sh` on first use. An
> environment that cannot reach that host cannot run the Prisma steps, and `run.sh`
> will stop at step 1 saying so. It never reports success for a step it did not run.

## What each step establishes

| Step | Operation | What its result establishes |
|---|---|---|
| 0 | Pinned toolchain | The Prisma that runs is the project's 7.10.1, not a downloaded one |
| 0b | Both databases empty | The experiment creates the schema from nothing; no pre-existing state can flatter it |
| 1 | `migrate dev --create-only` | Prisma can express this schema at all, and produces a real, non-empty migration file |
| 2 | Inspect generated SQL | The ordinary FKs and uniques are **Prisma's own work**, before any hand-written SQL exists |
| 3 | Compare FKs to reference | The appended definitions are the **approved** ones, unaltered |
| 4 | `migrate deploy` | Prisma's real migration workflow accepts and applies a migration whose SQL it did not write in full |
| 5 | Catalog inspection | Deployment created C‑1…C‑5 and did not disturb the ordinary layer |
| 6 | 14-case enforcement | The constraints are **enforced**, not merely present |
| 7 | No-change `migrate diff` | Whether a database-first diff still proposes anything, and — critically — whether **ordinary** constraints appear in it |
| 8 | No-change `migrate dev` | Whether Prisma would *write* a destructive next migration, and whether shadow replay reaches that conclusion |
| 9 | Second deployment / replay | A fresh environment replaying history from scratch ends up with all five |
| 10 | Additive migration | A subsequent legitimate migration is ADD-only and does not remove them |
| 11 | Second `migrate deploy` | Deployment is idempotent; the final catalog still holds exactly the five |

## Interpreting a failure

The harness is written so a failure says which of these happened:

- **Ordinary constraints appear in the step‑7 diff** → the datamodel is wrong, and the
  composite-FK question is *not* answered. Diagnose the mapping first. (This is exactly
  the mistake experiment 1 made and then corrected; see
  [`../expected/ci-evidence.md`](../expected/ci-evidence.md).)
- **`migrate deploy` rejects the appended SQL** → Prisma will not carry hand-written
  DDL in a managed migration at all.
- **Step 8 generates a migration containing `DROP`** → Prisma treats the appended FKs
  as drift and would remove them on the next apply. That is a fail even though nothing
  was destroyed *yet*.
- **Step 9 replay loses the constraints** → a new environment or CI run would not
  reproduce them.
- **Step 10 additive migration contains `DROP`** → ordinary development silently strips
  them.

No constraint is ever weakened to obtain a pass.
