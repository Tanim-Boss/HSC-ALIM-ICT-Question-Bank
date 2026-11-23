# Database migrations

**Purpose and scope.** Define how PostgreSQL schema changes are made for ICT Atlas with Prisma 7. This document covers workflow and safety rules only; it does not approve any domain model. The logical design lives in [database-design.md](../database/database-design.md); the physical schema remains open until the relevant decisions in the [open-decision register](../architecture/technology-decisions.md#open-decision-register) are approved.

## Current state

- `prisma/schema.prisma` now defines the **Phase 04A Question Bank** schema: 18 tables, 7 enums, 21 single-column foreign keys, 47 `CHECK` constraints and 6 hand-written partial/expression indexes. It is transcribed from — and subordinate to — the approved physical schema proposal (`docs/database/phase-04a-question-bank-physical-schema-proposal.md`, §3 is normative; §11.9 records the audit findings).
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

## Workflow — Option C (the approved workflow for this project)

`npm run db:migrate` (`prisma migrate dev`) **must not be used**. Use snapshot-to-snapshot
diffs instead; they never read the database catalog, so they never see — and can never
propose removing — the five composite foreign keys.

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
5. **Deploy** with `npm run db:deploy` (`prisma migrate deploy`), then assert the catalog:
   the protected constraints must still exist with `ON UPDATE CASCADE ON DELETE RESTRICT`.

### Prohibited commands

| Command | Why |
|---|---|
| `prisma migrate dev` / `npm run db:migrate` | proposes `DROP CONSTRAINT` for all five composite FKs |
| `prisma migrate reset` | replays history; unsafe combined with the above |
| `prisma db push` | forces the database to match the datamodel, discarding the hand-written layer |
| `prisma migrate diff --from-migrations` | replays history into a shadow database and reports the five FKs as drift |

The G-3 gates (`docs/database/g1-spike/option-c/g3/` for the prototype,
`docs/database/g1-spike/option-c/g3-full/` for the real 18-table schema) test that these
rules actually hold.
3. **Validate and regenerate the client:**
   ```bash
   npm run db:validate
   npm run db:generate
   ```
4. **Test against an isolated database.** Integration tests (`tests/integration/`) run against a throwaway PostgreSQL instance, never the development or production database. No destructive commands (`db push --force-reset`, manual `DROP`, truncating production tables) are permitted outside a disposable environment.
5. **Deploy** with `npm run db:deploy` (applies pending migrations without creating new ones). Deployment applies migrations before the new application code that depends on them is released.

## Rules

- **No destructive commands** against shared or production databases. Schema changes that drop or rewrite data require an explicit, reviewed data-migration plan.
- **One logical change per migration.** Keep migrations small, named descriptively, and reversible where the approved design requires it.
- **Constraints are a second line of defense.** Database constraints back up service-level authorization and validation; they never replace them (see [database-design.md](../database/database-design.md)).
- **Never edit applied migrations.** Correct a mistake with a new migration.
- **Domain services own writes.** Migrations must not introduce triggers or stored procedures that bypass the service layer in `server/`.

## Access boundaries

- Route handlers, Server Components and Server Actions authenticate → validate (Zod, `lib/validation/`) → authorize → delegate to a domain service in `server/`.
- Services access PostgreSQL only through `lib/db.ts`. The `server-only` import in `lib/db.ts` makes client-side imports a build-time error.
- Answer keys, evaluation snapshots and service credentials never leave the server boundary.

## Still-open decisions that affect future migrations

[OD-08–OD-13, OD-18–OD-21, OD-28–OD-29](../architecture/technology-decisions.md#open-decision-register) govern the source model, result lifecycle, retention, imports/exports and AI privacy. Migration 0001 exists because the Phase 04A schema was approved; those decisions still govern **future** migrations.

Specifically deferred and **not** to be designed around in a migration yet: negative marking and its configuration (G‑2 deferred / OD‑21 / OD‑NM‑1 — the column was removed in Revision 13, not scheduled), examination tables (Phase 05), users and RLS (OD‑15/OD‑16), and moderation states beyond the three approved values (OD‑27).
