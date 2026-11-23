# Option C prototype — controlled Prisma migration workflow

**Result: PASSED (9/9 claims).** See [`expected/RESULT.md`](expected/RESULT.md) for the
run URLs, commit, versions and the exact evidence.

**This prototype does not adopt Option C.** It establishes that the workflow is
technically real in Prisma 7.10.1 rather than merely plausible. The architectural
decision is requested in §11.4.7 of the
[proposal](../../phase-04a-question-bank-physical-schema-proposal.md#1147-decision-request).

## The question

Experiments 1 and 2 ([`../experiment-2/`](../experiment-2/README.md)) proved that
Prisma treats the five approved composite FKs as drift and generates a migration to
delete them. Option C keeps the constraints and changes the **workflow** instead:

> Prisma generates the baseline → C‑1…C‑5 are appended as reviewed SQL → every later
> change comes from a **schema-to-schema** diff → `migrate dev` is prohibited → CI
> rejects any migration that removes a protected constraint → the catalog is asserted
> after every deployment.

The premise: a schema-to-schema diff compares two **data models**. A composite FK is
invisible to a data model, on both sides, so such a diff can never propose dropping
one.

## Contents

| Path | Purpose |
|---|---|
| `schema.prisma` | The datamodel Prisma generates from. Reduced but faithful; carries the three support uniques natively. |
| `manual-baseline.sql` | The appended SQL. The five FKs are asserted byte-identical to the approved reference. |
| `run.sh` | The prototype driver: 10 numbered steps, each stating what it tests and what its result establishes. |
| `expected/RESULT.md` | Recorded results, run URLs, versions, and what was *not* established. |

## The finding that shapes the workflow

There are two obvious ways to give CI a drift safety net. **Only one of them works**,
and the difference is not visible from the flag names:

| Mechanism | Verdict |
|---|---|
| `migrate diff --from-migrations … --to-schema …` | **Does not work.** It replays history into the shadow database and then introspects the resulting *catalog*, so all five composite FKs appear as drift. Measured: exit 2, 5 × `DROP CONSTRAINT`. It is a database→datamodel diff wearing a different name. |
| `migrate diff --from-schema A --to-schema B` | **Works.** Compares two committed datamodel snapshots and never opens a database; C‑1…C‑5 are equally invisible on both sides. Verified non-vacuous by requiring it to detect a real change (exit 2). |

This is why Option C specifies schema-to-schema diffs explicitly rather than "use
`migrate diff`". A CI check built on `--from-migrations` would fail on every commit and
train the team to ignore it.

## Running it

Workflow: [`.github/workflows/phase04a-option-c-prototype.yml`](../../../../.github/workflows/phase04a-option-c-prototype.yml)

Provisions **three** disposable `postgres:16` containers (primary, replay, shadow),
pins Node 22, asserts Prisma CLI 7.10.1 from `node_modules`, then runs the driver. No
production credentials or URLs.

```bash
bash docs/database/g1-spike/option-c/run.sh \
  --url        "postgresql://user@localhost:5432/oc_main"    # must be empty
  --shadow-url "postgresql://user@localhost:5432/oc_shadow"  # required by --from-migrations
  --replay-url "postgresql://user@localhost:5432/oc_replay"  # optional: reproducibility proof
```

`--shadow-url` is not optional in practice: Prisma 7 refuses to diff a migrations
directory without `datasource.shadowDatabaseUrl`. The driver fails with that exact
message rather than silently skipping the check.

## What each step establishes

| Step | Establishes |
|---|---|
| 0–0b | Pinned toolchain; both databases empty (the workflow builds from nothing) |
| 1 | Prisma can emit a complete baseline from the datamodel alone, with no database |
| 2 | The appended SQL is the **approved** SQL, byte for byte |
| 3–3b | `migrate deploy` applies a partly hand-written migration and records clean history |
| 4 | **The central claim** — a schema-to-schema diff contains no `DROP` and never mentions C‑1…C‑5 |
| 5a | `--from-migrations` reports all five as drift → unusable as a CI check |
| 5b | Snapshot-to-snapshot diff is clean → usable |
| 5c | …and that check really detects drift, so it is not vacuously clean |
| 6 | An additive migration deploys and preserves 5/5 |
| 7 | All five are still **enforced** (14/14), not merely present |
| 8 | An independent database replays to 5/5 (reproducibility) |
| 9 | **Negative test** — the CI guard rejects an injected destructive migration |

## What this does not settle

- Whether Option C should be **adopted** — that is decision D‑1.
- Whether a passing workflow prototype clears **G‑1** — decision D‑2. G‑1 stays
  FAILED unless you decide otherwise.
- Whether the `migrate dev` prohibition can be **enforced** rather than merely
  documented. Nothing here prevents a developer running it.
- Behaviour when a schema change touches a *constrained column* (e.g.
  `questions.subject_id`), which would require C‑1 and C‑2 to be rebuilt by hand.
  **Untested, and a real risk.**
- The external-authority alternative (Option C2), which was **not** prototyped.
