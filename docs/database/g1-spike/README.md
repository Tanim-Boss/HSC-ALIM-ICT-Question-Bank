# G-1 spike — Prisma drift test for the five composite foreign keys

**Status: BLOCKED in the environment where it was first attempted. Nothing here is a
passing result.** See §11.3 of
[`../phase-04a-question-bank-physical-schema-proposal.md`](../phase-04a-question-bank-physical-schema-proposal.md)
for the recorded outcome.

This directory holds the complete, reproducible experiment for pre-migration gate
**G-1**: do the five approved hand-written composite foreign keys (Request **C**,
§3.11.6 of the proposal) survive Prisma introspection and migration diffing, or does
Prisma propose dropping them?

## What is here

| Path | Purpose |
|---|---|
| `sql/0001-schema.sql` | Reduced but faithful schema with **C‑1…C‑5**, the three support unique keys, the Revision 5 partial unique `uq_topics_chapter_order`, and the chain `CHECK`s |
| `sql/0002-enforce.sql` | Self-checking enforcement suite: every constraint must reject an invalid write, and legitimate writes must still be accepted. Prints `PASS`/`FAIL` per case and aborts on any `FAIL` |
| `prisma/schema.prisma` | Prisma datamodel reproduction — models and **single-column** relations only. The composite FKs are deliberately absent, because that is the condition being tested |
| `run.sh` | The driver. Steps 1–3 always run; steps 4–7 need a working Prisma schema engine and **stop with an error rather than pretending** |
| `expected/` | Recorded output from a real run |

## How to run it

```bash
# 1. a throwaway PostgreSQL 15+ database — never staging, never production
createdb g1_spike
export G1_URL="postgresql://postgres@127.0.0.1:5432/g1_spike"

# 2. Prisma CLI at the project's pinned version
npm ci                       # the repo pins prisma 7.10.1

# 3. run
./run.sh "$G1_URL"
```

The script refuses URLs containing `prod`, `prod`, `staging` or `supabase.co`, and
warns on anything that is not local. It drops and recreates schema `g1`.

## What a PASS requires

1. All five composite FKs are created.
2. PostgreSQL rejects every invalid write with the **specific** constraint name
   (SQLSTATE `23503`), and still accepts legitimate rows.
3. `prisma migrate diff --from-url … --to-schema-datamodel …` emits **no**
   `DROP CONSTRAINT` for them.
4. An unrelated additive change produces `ADD COLUMN` only.
5. `prisma migrate dev` with no datamodel change produces no `DROP` for them.
6. The five constraints are still present in `pg_constraint` at the end.

Any `FAIL` line, any `DROP`, or a non-empty drift script means G‑1 does not pass and
Request C reverts to its documented fallback (service validation plus a scheduled
integrity query), which requires re-approval.

## Environment note

The first attempt was made in a sandbox whose only reachable hosts were
`github.com`, `codeload.github.com`, `api.github.com`, `registry.npmjs.org`,
`pypi.org` and `files.pythonhosted.org`. `binaries.prisma.sh` — where the Prisma
schema engine is fetched from — is not among them, so no Prisma migration,
introspection or diff command could start. PostgreSQL itself ran fine (16.2,
installed from PyPI), so steps 1–2 were executed for real; steps 3–7 were not.
