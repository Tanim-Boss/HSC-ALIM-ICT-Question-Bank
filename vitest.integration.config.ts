import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Integration tests — real PostgreSQL, no DOM.
 *
 * Why a separate config rather than widening `vitest.config.ts`:
 *
 *  1. The unit suite is jsdom and runs everywhere. The integration suite needs a
 *     live database and a generated Prisma client, so it must not be part of
 *     `npm test` — a developer without a database would see failures that say
 *     nothing about their change.
 *  2. The environments differ. These tests touch `pg`, `server-only` and raw
 *     SQL; a DOM environment would only add noise.
 *  3. It keeps `npm test` honest. Widening the default include would silently
 *     change what the existing, already-green suite means.
 *
 * Run with: DATABASE_URL=… npx vitest run --config vitest.integration.config.ts
 *
 * These tests FAIL rather than skip when DATABASE_URL is absent — see
 * tests/integration/setup.ts. A database suite that quietly skips reads as a
 * green light it has not earned.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['node_modules', 'lib/generated', '.next'],
    // Each file owns its own schema objects and cleans up after itself, so
    // running them in parallel would create cross-talk on shared taxonomy rows.
    fileParallelism: false,
    // Real transactions and constraint violations are slower than unit tests.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
