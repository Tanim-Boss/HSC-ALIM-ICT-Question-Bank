import { defineConfig } from 'prisma/config';

// Prisma 7 configuration. The database connection URL is intentionally read
// from the environment only when it is present so that `prisma generate` and
// `prisma validate` (which do not need a live database) can also run in CI.
// Migration commands require DATABASE_URL to be set.
//
// Never commit credentials. See .env.example for the required variable names.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  ...(process.env.DATABASE_URL
    ? { datasource: { url: process.env.DATABASE_URL } }
    : {}),
});
