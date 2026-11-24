#!/usr/bin/env bash
# =====================================================================
# `npm run db:migrate` — DISABLED BY DESIGN.
#
#   Exit code: always 1. This script never touches a database.
#
# WHY
# ---
# This npm script used to invoke the Prisma migration-development command
# directly. Option C prohibits that command for this schema, because it diffs
# the DESIRED DATAMODEL against the LIVE CATALOG. The catalog contains five
# composite foreign keys (C-1..C-5) that Prisma cannot represent, so Prisma
# reads them as drift and generates a migration that DROPs them.
#
# That is not a theory. Gate G-1 measured it twice against real
# PostgreSQL 16.2 + Prisma 7.10.1, and both runs FAILED. G-1 remains FAILED
# and is not re-scored by G-3's pass. See:
#   docs/database/phase-04a-question-bank-physical-schema-proposal.md §11.3
#
# The command was left reachable as `npm run db:migrate` even after it was
# documented as prohibited, which made the documented prohibition weaker than
# it read: the repository guard scanned `scripts/` and `.github/workflows/`
# only, so the entry point in package.json was outside every control. It is
# now replaced by this stub and the guard scans package.json as well.
#
# WHAT TO USE INSTEAD
# -------------------
#   npm run db:deploy      the approved deployment (applies pending migrations)
#   npm run db:validate    validate the datamodel
#   npm run db:generate    regenerate the Prisma client
#   A schema-to-schema diff for authoring a NEW migration:
#       prisma migrate diff --from-schema <prev>.prisma \
#                           --to-schema   <next>.prisma --script
#
# Do NOT reach for migrate reset or db push either; they are prohibited for the
# same reason (db push reads the live catalog; reset destroys history).
# =====================================================================
set -Eeuo pipefail

cat >&2 <<'MSG'
db:migrate is DISABLED.

This project uses Option C (the controlled migration workflow). The Prisma
migration-development command is prohibited for this schema: it reads the live
catalog, cannot see the five composite foreign keys C-1..C-5, and generates a
migration that DROPs them. Gate G-1 proved this and remains FAILED.

Use one of the approved commands instead:

  npm run db:deploy      apply pending migrations (the approved deploy path)
  npm run db:validate    validate the datamodel
  npm run db:generate    regenerate the Prisma client

To AUTHOR a new migration, generate it from a schema-to-schema diff:

  prisma migrate diff --from-schema <prev>.prisma \
                      --to-schema   <next>.prisma --script

and review the SQL before committing it. See
docs/development/database-migrations.md for the full procedure.

Nothing was changed in any database.
MSG

exit 1
