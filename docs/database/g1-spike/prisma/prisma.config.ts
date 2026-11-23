// G-1 spike — Prisma configuration for the drift experiment.
//
// This file exists so the spike never inherits the repository's
// `prisma.config.ts` (which points at prisma/schema.prisma and may carry a
// datasource URL from DATABASE_URL). Every Prisma invocation in run.sh passes
// `--config` explicitly, so the spike's schema and migrations directory are
// unambiguous wherever the script is started from.
//
// No `datasource` block on purpose: the connection URL is always supplied per
// command with `--url`, so no credential is baked into a file.

import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'schema.prisma',
  migrations: {
    path: 'migrations',
  },
});
