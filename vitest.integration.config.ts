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
 * BEHAVIOUR WITHOUT A DATABASE — stated correctly, because an earlier version of
 * this comment was wrong (it claimed the suites fail rather than skip, and cited
 * a `tests/integration/setup.ts` that does not exist):
 *
 *   · each suite computes `hasDatabase` from DATABASE_URL and uses
 *     `describe.skip` when it is absent, so a developer without a database can
 *     still run the file without a false failure;
 *   · the skip is LOUD (`console.warn(... SKIPPED ...)`), and the CI job greps
 *     its log for `SKIPPED|Tests .*skipped` and fails on a match, then asserts a
 *     floor of 47 executed cases;
 *   · consequence: a skipped run can never be reported green by CI, which is the
 *     property that matters. Locally it can be skipped, and that is a known and
 *     documented limit rather than a silent pass.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/integration/**/*.test.ts'],
    // `server/questions/publish/gate.ts` begins with `import 'server-only'`,
    // which throws by default and is only a no-op when resolved under the
    // `react-server` condition. Without this alias the integration suite could
    // not import the real publish service at all — which is precisely how the
    // service went untested (defect D3). The marker still does its job in the
    // Next.js build, where the real condition applies.
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      'server-only': fileURLToPath(
        new URL('./tests/integration/server-only-stub.ts', import.meta.url),
      ),
    },
    exclude: ['node_modules', 'lib/generated', '.next'],
    // Each file owns its own schema objects and cleans up after itself, so
    // running them in parallel would create cross-talk on shared taxonomy rows.
    fileParallelism: false,
    // Real transactions and constraint violations are slower than unit tests.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
