# Database migrations

**Purpose and scope.** Define how PostgreSQL schema changes are made for ICT Atlas with Prisma 7. This document covers workflow and safety rules only; it does not approve any domain model. The logical design lives in [database-design.md](../database/database-design.md); the physical schema remains open until the relevant decisions in the [open-decision register](../architecture/technology-decisions.md#open-decision-register) are approved.

## Current state

- `prisma/schema.prisma` intentionally defines **no domain models**. The approved documents leave cardinalities, nullability, snapshot/versioning strategy, the source model, result lifecycle and retention open (OD-08–OD-13, OD-18–OD-21, OD-28–OD-29). Defining models now would mean inventing those decisions.
- The generated Prisma client lives in `lib/generated/prisma/` (git-ignored; regenerate with `npm run db:generate`).
- Runtime access goes through the singleton in `lib/db.ts` (Prisma 7 driver adapter `@prisma/adapter-pg`, connection string from `DATABASE_URL`). No other module constructs a Prisma client.
- No migration has been created yet, because there is no approved schema to migrate to. Do not create a placeholder migration.

## Environment

| Variable | Use | Notes |
|---|---|---|
| `DATABASE_URL` | Application runtime (pooled) | Server-only. Validated by `lib/env.ts`; never prefixed `NEXT_PUBLIC_`. |
| `DIRECT_URL` | Migrations / direct connections | Server-only. Used by `prisma migrate` tooling. |

Copy `.env.example` to `.env.local` for development. Never commit real credentials.

## Workflow (once a schema is approved)

1. **Edit the schema.** Change `prisma/schema.prisma` only; never edit a migration that has been applied anywhere.
2. **Create the migration locally** against a disposable development database:
   ```bash
   npm run db:migrate -- --name <descriptive-name>
   ```
   Review the generated SQL in `prisma/migrations/` before committing. Migrations are reviewed like code.
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

## OPEN DECISION

[OD-08–OD-13, OD-18–OD-21, OD-28–OD-29](../architecture/technology-decisions.md#open-decision-register) govern the physical schema, source model, versioning/snapshot strategy, result lifecycle, retention, imports/exports and AI privacy. The first migration may only be created once the relevant decisions are approved.
