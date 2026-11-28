import { defineConfig } from 'prisma/config';

// Prisma 7 configuration. This datasource is used ONLY by the Prisma CLI
// (`migrate deploy`, `migrate status`, `migrate diff`, `studio`); the running
// application connects through lib/db.ts with DATABASE_URL.
//
// On Supabase, DATABASE_URL is the transaction pooler (port 6543), which
// migrations must not go through, and DIRECT_URL is the direct/session
// connection (port 5432). Migrations therefore use DIRECT_URL, falling back to
// DATABASE_URL where only one database URL exists (CI, local).
// scripts/db/deploy-gate.sh reads the applied history with the same precedence.
//
// The URL is read only when present so that `prisma generate` and
// `prisma validate` (which do not need a live database) can also run in CI.
//
// Never commit credentials. See .env.example for the required variable names.
const migrationUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  ...(migrationUrl ? { datasource: { url: migrationUrl } } : {}),
});
