# G-1 spike — Prisma drift test for the five composite foreign keys

**Status: BLOCKED.** See [§11.3.1](../phase-04a-question-bank-physical-schema-proposal.md#1131-g1-result--blocked-not-passed-not-failed)
of the proposal for the recorded outcome. Nothing in this directory is a passing result:
the PostgreSQL half has been executed and passes; the Prisma half has never run anywhere.

This directory holds the reproducible experiment for pre-migration gate **G-1**: do the
five approved hand-written composite foreign keys (Request **C**, §3.11.6 of the
proposal) survive Prisma introspection, diffing and migration generation — or does
Prisma propose dropping them?

## Contents

| Path | Purpose |
|---|---|
| `sql/0001-schema.sql` | Reduced but faithful schema with **C‑1…C‑5**, the three support unique keys, the Revision 5 partial unique `uq_topics_chapter_order`, and the chain `CHECK`s |
| `sql/0002-enforce.sql` | Machine-checked enforcement suite: 14 cases, each printing `PASS` or `FAIL: …`. It always completes and always reports |
| `prisma/schema.prisma` | Prisma datamodel reproduction — models and **single-column** relations only. The composite FKs are deliberately absent, because that is the condition being tested |
| `prisma/prisma.config.ts` | The spike's own Prisma config, so the repository's `prisma.config.ts` is never picked up |
| `run.sh` | The driver (7 steps). Fails at the first unverifiable step |
| `out/` | Per-run artefacts. Created by `run.sh`; **git-ignored** |

## Running it

### In CI (preferred)

`.github/workflows/g1-prisma-drift-spike.yml` runs the whole thing on a disposable
`postgres:16` service container with the pinned Prisma 7.10.1:

- automatically on any change under `docs/database/g1-spike/` or to `package.json`
- manually: **Actions → "G-1 Prisma drift spike" → Run workflow**

The job fails if any step fails, and uploads `docs/database/g1-spike/out/` as an
artefact. A green run means the complete Prisma workflow executed and passed; the
script stops at the first Prisma command it cannot run, so the PostgreSQL-only steps
alone can never produce a green build.

### Locally

```bash
# a throwaway PostgreSQL 15+ server; nothing else is touched
createdb g1_main
createdb g1_dev

npm ci                                                    # pinned prisma 7.10.1

G1_DEV_DATABASE_URL="postgresql://$USER@127.0.0.1:5432/g1_dev" \
  ./run.sh --url "postgresql://$USER@127.0.0.1:5432/g1_main"
```

`run.sh` refuses URLs containing `production`, `prod`, `staging`, `supabase.co`,
`render.com` or `rds.amazonaws.com`. It resets the **`public` schema of the database
you pass it**, so pass a disposable one.

Two databases are required, not one:

- `g1_main` — the hand-built schema the enforcement and drift steps assert on.
- `g1_dev` — an empty database used only by the `migrate dev` step. `migrate dev`
  against `g1_main` would reset it, because a hand-built schema has no migration
  history. Using a second database keeps the step meaningful instead of destroying
  the schema the other steps just verified.

## What a PASS requires

| Step | Check |
|---|---|
| 0 | Prisma CLI is exactly 7.10.1 from `node_modules/.bin` (no `npx`, nothing downloaded); PostgreSQL ≥ 15 |
| 1 | All five composite FKs exist in `pg_constraint` right after creation |
| 2 | Exactly **14** enforcement cases ran, **0** failed, and every expected case name is present |
| 3 | `prisma db pull` sees the database (output non-empty and contains `model Question`) |
| 4 | No-change `migrate diff` is **empty** (`--exit-code` returns 0, not 2) |
| 5 | An unrelated column produces `ADD COLUMN` only — no `DROP CONSTRAINT`, no `fk_*` in the output |
| 6 | `migrate dev` either reports the database is in sync, or produces a migration whose SQL is inspected and contains no `DROP`; afterwards 5/5 FKs must still exist |
| 7 | Final catalog still holds 5/5 composite FKs |

Harness guarantees, each deliberate:

- `set -Eeuo pipefail`, plus an `ERR` trap that names the failing line.
- Every command's exit status is checked; `migrate diff` distinguishes 0 (empty),
  2 (non-empty) and 1 (error) via `--exit-code`.
- Every Prisma output file must exist **and be non-empty** before it is parsed.
- The enforcement count, the case-name list and the expected total are asserted
  independently, so a truncated suite fails instead of passing quietly.
- An `migrate dev` run that generates nothing only passes if Prisma explicitly says
  the schema is in sync; silence is a failure.
- No output is written outside `out/`.

## Environment note from the first attempt

The first attempt was made in a sandbox whose only reachable hosts were `github.com`,
`codeload.github.com`, `api.github.com`, `registry.npmjs.org`, `pypi.org` and
`files.pythonhosted.org`. `binaries.prisma.sh` — where the Prisma schema engine is
fetched from — is not among them, so no Prisma command could start there. PostgreSQL
itself ran fine (16.2), so steps 0–2 were executed for real and steps 3–7 were not.
That is why G‑1 is BLOCKED rather than PASS or FAIL.
