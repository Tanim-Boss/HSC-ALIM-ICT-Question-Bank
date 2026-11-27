# Database migrations

**Purpose and scope.** Define how PostgreSQL schema changes are made for ICT Atlas with Prisma 7. This document covers workflow and safety rules only; it does not approve any domain model. The logical design lives in [database-design.md](../database/database-design.md); the physical schema remains open until the relevant decisions in the [open-decision register](../architecture/technology-decisions.md#open-decision-register) are approved.

## Current state

- `prisma/schema.prisma` now defines the **Phase 04A Question Bank** schema: 18 tables, 7 enums, 21 single-column foreign keys, 47 `CHECK` constraints and 6 hand-written partial/expression indexes. It is transcribed from — and subordinate to — the approved physical schema proposal (`docs/database/phase-04a-question-bank-physical-schema-proposal.md`, §3 is normative; §11.9 records the audit findings).
- **Migration 0002 (`0002_identity_audit`, Phase 04B)** adds `profiles`, `user_roles`, `audit_events`, the `AppRole` enum and authorship columns (additive only). Its hand-written part holds 7 CHECKs — two of them `NOT VALID` because rows written before 0002 have no author — and the append-only trigger on `audit_events`. The full inventory is now 21 tables, 8 enums, 33 foreign keys (28 + 5 composite) and 54 CHECKs; the G-3 full-schema gate asserts it.
- The baseline migration is `prisma/migrations/0001_phase04a_question_bank/`. It is Prisma-generated DDL **plus** reviewed hand-written SQL that Prisma cannot express: the 47 `CHECK`s, the partial/expression indexes, and the **five composite foreign keys** of Request C (§3.11.6).
- **`prisma migrate dev` is PROHIBITED for this repository.** It generates a migration that drops all five composite foreign keys — measured twice, recorded as gate **G‑1 FAILED** (§11.3.2/§11.3.3 of the proposal). `migrate reset` and `db push` are prohibited for the same reason. The repository guard `docs/database/g1-spike/option-c/repo-guard.sh` enforces this in CI.
- `negative_marks` and all examination tables are **not** in this schema: negative marking is configurable and deferred (Revision 13), and examination tables are Phase 05.
- The generated Prisma client lives in `lib/generated/prisma/` (git-ignored; regenerate with `npm run db:generate`).
- Runtime access goes through the singleton in `lib/db.ts` (Prisma 7 driver adapter `@prisma/adapter-pg`, connection string from `DATABASE_URL`). No other module constructs a Prisma client.

## Environment

| Variable | Use | Notes |
|---|---|---|
| `DATABASE_URL` | Application runtime (pooled) | Server-only. Validated by `lib/env.ts`; never prefixed `NEXT_PUBLIC_`. |
| `DIRECT_URL` | Migrations / direct connections | Server-only. Used by `prisma migrate` tooling. |

Copy `.env.example` to `.env.local` for development. Never commit real credentials.

## Authorization status (owner decisions B1a / B2)

**Option C is APPROVED as the controlled migration workflow for this project** (decision
**B1a**, recorded in §11.12 of the physical schema proposal). That approval is
**workflow-scoped** and carries five conditions:

1. Full-schema **G‑3 is PASSED** (CI run `45273840004`) — this is what the approval rests on.
2. **G‑1 remains FAILED** and is not reversed or re-scored by it.
3. **It does NOT authorise production deployment of migration 0001.**
4. The prohibitions below (`migrate dev`, `migrate reset`, `db push`,
   `diff --from-migrations`) are **approved conditions of using Option C**, not
   conventions — do not relax them.
5. The safeguards in the proposal's §11.6 (repo guard, catalog assertion, textual guard,
   checksum control, post-deployment enforcement suite, snapshot diff, documented
   prohibition) are **mandatory**.

**Production authorisation is WITHHELD (decision B2).** Migration 0001 may not be
deployed to a production database with the five composite foreign keys, and C‑1…C‑5 may
not be created in production, until the five verification tasks **V‑1…V‑5** (§11.12.3)
are completed and recorded **and** B1b/B2 are explicitly approved. Dropping C‑1…C‑5 to
unblock deployment is **not approved** (B1c).

## Workflow — Option C (the approved workflow for this project)

The Prisma migration-development command **must not be used**. Use snapshot-to-snapshot
diffs instead; they never read the database catalog, so they never see — and can never
propose removing — the five composite foreign keys.

> **The `npm run db:migrate` entry point is now disabled.** It previously invoked the
> prohibited migration-development command directly, and was documented as forbidden
> while remaining one keystroke away. It now runs `scripts/db/migrate-disabled.sh`,
> which prints the approved alternatives and **exits 1** without touching any database.
> The command behind it remains prohibited; the script exists so that reaching for it
> produces guidance instead of a destructive migration.

1. **Edit `prisma/schema.prisma`** only; never edit a migration that has been applied anywhere.
2. **Snapshot the current datamodel** before changing it:
   ```bash
   cp prisma/schema.prisma snapshots/prev.prisma
   ```
3. **Generate the next migration from a schema-to-schema diff:**
   ```bash
   npx prisma migrate diff \
     --from-schema snapshots/prev.prisma \
     --to-schema prisma/schema.prisma \
     --script --exit-code > /tmp/next.sql
   ```
   Review it line by line. It must contain **no `DROP CONSTRAINT`** for any of the five
   protected foreign keys. If the change touches a column that participates in one, the
   migration must drop and **re-add** that constraint with its approved definition —
   `docs/database/g1-spike/option-c/guard.py sql` encodes exactly that rule.
4. **Append any hand-written artifacts** the change needs, and run the guard:
   ```bash
   python3 docs/database/g1-spike/option-c/guard.py sql prisma/migrations/<name>/migration.sql
   ```
5. **Deploy** with `npm run db:deploy`, which runs the **mandatory checksum gate** and then
   `prisma migrate deploy` — see [The checksum gate](#the-checksum-gate-mandatory) below.
   Then assert the catalog: the protected constraints must still exist with
   `ON UPDATE CASCADE ON DELETE RESTRICT`.

### Prohibited commands

| Command | Why |
|---|---|
| `prisma migrate dev` / `npm run db:migrate` | proposes `DROP CONSTRAINT` for all five composite FKs |
| `prisma migrate reset` | replays history; unsafe combined with the above |
| `prisma db push` | forces the database to match the datamodel, discarding the hand-written layer |
| `prisma migrate diff --from-migrations` | replays history into a shadow database and reports the five FKs as drift |

**How these are enforced.** `docs/database/g1-spike/option-c/repo-guard.sh` fails the
build if any of the four commands appears in an executed surface. It scans `scripts/`
(`*.sh`, `*.bash`, `*.js`, `*.mjs`, `*.cjs`, `*.ts` and, since the first Python helper
landed, `*.py`), `.github/workflows/`, and — since the post-merge audit —
**`package.json` scripts**, with indirect forms followed (`npm run x` → `x`, and
`bash scripts/y.sh` → `y.sh`, including a wrapper calling another wrapper). It also matches `migrate diff --from-migrations`, which
it previously missed. Comment-only lines are ignored, and documentation is not scanned, so
this page can discuss the prohibited commands freely.

The guard is fail-closed: if `package.json` exists but cannot be parsed, it refuses to
report success rather than silently skipping the npm surface. Its regression suite is
`tests/unit/tooling/repo-guard.test.ts`.

Known limit worth stating: the guard is a **textual** control on the surfaces it scans. It
does not stop a human from typing a prohibited command into a terminal. That residual gap is
why the catalogue assertion and the checksum gate below exist alongside it.

The G-3 gates (`docs/database/g1-spike/option-c/g3/` for the prototype,
`docs/database/g1-spike/option-c/g3-full/` for the real 18-table schema) test that these
rules actually hold.
3. **Validate and regenerate the client:**
   ```bash
   npm run db:validate
   npm run db:generate
   ```
4. **Test against an isolated database.** Integration tests (`tests/integration/`) run against a throwaway PostgreSQL instance, never the development or production database. No destructive commands (`db push --force-reset`, manual `DROP`, truncating production tables) are permitted outside a disposable environment.
5. **Deploy** with `npm run db:deploy`, which applies pending migrations without creating new ones **and verifies the applied history first** ([checksum gate](#the-checksum-gate-mandatory)). Deployment applies migrations before the new application code that depends on them is released.

## The checksum gate (mandatory)

`prisma migrate deploy` applies pending migrations and **does not detect that an
already-applied migration file has been edited**. This was measured, not assumed: in the
G-1 spike, rewriting an applied `migration.sql` left both `migrate deploy` and
`migrate status` exiting 0. The database therefore cannot be trusted to notice that its
recorded history no longer matches the files in the repository.

`scripts/db/deploy-gate.sh` closes that gap.

```bash
npm run db:verify-history   # verify only  → bash scripts/db/deploy-gate.sh verify
npm run db:deploy           # verify, then deploy → bash scripts/db/deploy-gate.sh deploy
```

**What it does.** It reads the applied history from `_prisma_migrations`
(`finished_at IS NOT NULL AND rolled_back_at IS NULL` — the same predicate the V-3 drill
uses) and hands it to **`guard.py history`**, the single authoritative checksum
implementation. It does not re-implement SHA-256; a second algorithm would drift from the
guard the way a second validator always does. The deploy runs only if verification exits 0;
in `deploy` mode the script `exec`s Prisma **after** the check, under `set -Eeuo pipefail`.

**It fails closed — every case below refuses and prints `Nothing was deployed`.** Missing
`guard.py`; missing `python3`; missing `psql`; missing `DATABASE_URL`; a history query that
errors; `guard.py` exiting non-zero; an applied migration whose recorded checksum differs
from the file; a migration recorded as applied whose file no longer exists; a history row
with no checksum. A non-empty `public` schema with **no** `_prisma_migrations` table is
refused as inconsistent or tampered.

**An empty database is a determination, not a skip.** First deployment has nothing to verify,
so the gate requires both facts — no history table **and** `pg_tables` count = 0 — and then
says so explicitly (`DETERMINED: … not a skipped check`). It then proceeds to deploy.
Without this branch a first deployment would be impossible; with a silent `|| true` a
tampered database would pass.

**`deploy` mode accepts no history file.** `--history-json` is rejected there (exit 2), so a
caller cannot hand over a fabricated history and pass without touching a database. Arguments
after `--` are forwarded to Prisma, so needing `--config prisma.config.ts` is not a reason to
deploy around the gate:

```bash
bash scripts/db/deploy-gate.sh deploy -- --config prisma.config.ts
```

That is how the V-1 job deploys in `.github/workflows/phase04a-prod-ready-v1-v5.yml`.

### Scope — what is and is not covered

Covered, i.e. the gate is on the path and cannot be skipped silently:

| Surface | State |
| --- | --- |
| `npm run db:deploy` | **gated** — it *is* the gate |
| `.github/workflows/phase04a-prod-ready-v1-v5.yml`, "Deploy migration 0001 through the mandatory checksum gate" | **gated** — the step calls `deploy-gate.sh deploy`; it does not call Prisma directly |
| Every other npm script, file under `scripts/`, workflow step and G-1/G-3 harness | **checked by the deployment-path guard below**, which fails CI if a deploy bypasses the gate |

**Not covered — recorded as unresolved bypasses, not as enforcement:**

1. **A human typing `npx prisma migrate deploy` in a terminal.** The gate is a script; it
   cannot intercept a direct invocation. Nothing in the repository prevents it.
2. **The G-1 spike/drill scripts** — `option-c/run.sh`, `option-c/g3/run.sh`,
   `option-c/g3-full/run.sh`, `option-c/prod-ready/v1/v1-second-migration.sh`,
   `experiment-2/run.sh`. They are deliberately *not* wired to the gate: they are evidence
   producers against disposable databases, and one of them (g3-full step 5) exists
   specifically to demonstrate that `migrate deploy` does not notice an edited migration.
   Routing them through the gate would destroy the evidence the gate is built on.
3. **The psql-based applies** in the V-2/V-3 and V-4/V-5 jobs (`psql -f migration.sql`).
   Those create no Prisma history at all, so a Prisma checksum comparison does not apply;
   the V-3 job creates a faithful `_prisma_migrations` row itself so the drill is not a
   fiction. They are not deployment paths for this project.
4. **The repository guard is unrelated to this.** `repo-guard.sh` blocks the four prohibited
   *development* commands. `migrate deploy` is allowed and expected; the checksum gate is
   what makes it safe.

**Evidence, two layers.** `tests/unit/tooling/deploy-gate.test.ts` — 26 cases against
controlled fixtures: unchanged history passes; a mismatched checksum, an edited file, a
missing record, a missing checksum and a vanished migration each fail; a missing utility, a
crashing utility, an unreadable database and a missing `psql`/`DATABASE_URL` each refuse;
and a fake `npx` sentinel proves deployment is **not** reached in every refusing case (and
*is* reached in the passing ones).

`scripts/ci/deploy-gate-pg-check.sh` — the same decisions against a **real PostgreSQL 16
server**, on disposable databases it creates and drops itself (9 cases: matching history
passes; a modified applied migration, a vanished file, a missing checksum, a mismatched
checksum and a non-empty schema without history are each refused; a failed verification
does not reach the deploy command; a passing one reaches it with forwarded arguments; an
empty database is determined and then deployed). The deploy positive control uses a fake
`npx`, so nothing is applied by the deploy step and no Prisma client is needed. Run it
yourself against a throwaway cluster:

```bash
PG_ADMIN_URL='postgresql://postgres@/postgres' bash scripts/ci/deploy-gate-pg-check.sh
```

It runs in CI in the V-4/V-5 integration job. **It must never be pointed at production** —
every case creates databases on the server it is given.

## The deployment-path guard

The checksum gate protects deployments that go through it. It cannot stop a *new* deploy
path being added beside it. `scripts/db/deploy-path-guard.py` is that control, and it runs
in CI next to the repository guard:

```bash
python3 scripts/db/deploy-path-guard.py        # exit 0 clean, 1 violation, 2 cannot verify
```

**What it checks.** Every non-comment, non-string occurrence of `migrate deploy` in an
executed surface — npm script values, files under `scripts/`, files under
`docs/database/g1-spike/`, and `.github/workflows/*` — must be either the approved gate or a
narrowly excepted harness. It also asserts the gate is still *wired and verifying*:
`db:deploy` must still call it, the gate must invoke `guard.py … history`, that call must
come **before** the deploy invocation, and the gate may contain at most two deploy lines.

**Exceptions are exact and counted.** Each entry is one exact repository path with the exact
number of invocations it may contain — no globs, no directory exemptions. So adding an
invocation to an excepted file fails, copying one to a new path fails, adding a new harness
fails until it is listed in review, and a listed file that no longer exists fails (a stale
entry would silently cover a future file). Adding a deploy line to a G-1/G-3 harness is
therefore a deliberate, reviewed act.

**What counts as an invocation, and what does not.** A mention inside a comment, a quoted
string or a human-readable heredoc is not an invocation — usage text, log messages and
`echo`/`fail` prose are ignored. Three forms *are* counted, because they execute: a match
inside a `eval` / `bash -c` / `sh -c` string, a Python `shell=True` / `os.system(...)`
string, and a heredoc that is fed to a shell or written into a `.sh`/`.py`/`.js` file.

### Limits of the deployment-path guard — stated, not glossed

1. **A person typing a command in a terminal is not prevented by a repository text guard.**
2. **An argv-array form is not detected.** `subprocess.run(["prisma", "migrate", "deploy"])`
   never contains the adjacent words the textual pattern looks for. This is pinned as a
   documented limitation in `tests/unit/tooling/repo-guard.test.ts`, in the same way for
   both guards.
3. **Raw-SQL paths are out of scope.** `psql -f migration.sql` creates no Prisma history, so
   the checksum gate does not apply to it and this guard must not be described as covering
   it.
4. **A dynamically composed command** (`prisma migrate "$OX"`) is not detected.

**Evidence.** `tests/unit/tooling/deploy-path-guard.test.ts` — 25 cases across throwaway
repositories: the real tree passes; a direct npm script, a `scripts/` file, a workflow step,
a wrapper chain and a Python shell-out each fail; removing the `db:deploy` wiring, removing
the verification, reordering it after the deploy, or multiplying invocations each fail; every
exception is exercised for over-use, copying and staleness; prose is ignored while
`eval`/`bash -c`/generated-script heredocs are counted; and the guard exits 2 rather than
reporting success when it cannot parse the npm surface.

## Rules

- **No destructive commands** against shared or production databases. Schema changes that drop or rewrite data require an explicit, reviewed data-migration plan.
- **One logical change per migration.** Keep migrations small, named descriptively, and reversible where the approved design requires it.
- **Constraints are a second line of defense.** Database constraints back up service-level authorization and validation; they never replace them (see [database-design.md](../database/database-design.md)).
- **Never edit applied migrations.** Correct a mistake with a new migration.
- **Domain services own writes.** Migrations must not introduce triggers or stored procedures that bypass the service layer in `server/`. (The `audit_events` append-only trigger only *refuses* writes; it never makes one.)

## Access boundaries

- Route handlers, Server Components and Server Actions authenticate → validate (Zod, `lib/validation/`) → authorize → delegate to a domain service in `server/`.
- Services access PostgreSQL only through `lib/db.ts`. The `server-only` import in `lib/db.ts` makes client-side imports a build-time error.
- Answer keys, evaluation snapshots and service credentials never leave the server boundary.

## Still-open decisions that affect future migrations

[OD-08–OD-13, OD-18–OD-21, OD-28–OD-29](../architecture/technology-decisions.md#open-decision-register) govern the source model, result lifecycle, retention, imports/exports and AI privacy. Migration 0001 exists because the Phase 04A schema was approved; those decisions still govern **future** migrations.

Specifically deferred and **not** to be designed around in a migration yet: negative marking and its configuration (G‑2 deferred / OD‑21 / OD‑NM‑1 — the column was removed in Revision 13, not scheduled), examination tables (Phase 05), RLS policies (OD‑16, deferred — identity and roles landed in 0002), and moderation states beyond the three approved values (OD‑27).
