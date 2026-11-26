import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E foundation. The smoke suite verifies the application shell
 * (boot, bilingual rendering, theme persistence) — not product flows, which
 * do not exist yet. Set PLAYWRIGHT_BASE_URL to target an already-running
 * instance instead of the managed server.
 *
 * WHICH SERVER RUNS — and why it is not `next dev` in CI
 * -----------------------------------------------------
 * This suite originally started `npm run dev` everywhere. In CI that made the
 * theme-toggle step fail every time, and the cause was the dev server, not the
 * application:
 *
 *   · the page was served (title, H1 and both Bengali fixtures all asserted
 *     successfully), and a `.dark` rule was present in the stylesheets;
 *   · the Client Component never hydrated, so the click did nothing —
 *     `localStorage` stayed empty, the class never changed;
 *   · the browser console showed the dev client failing repeatedly:
 *     `WebSocket connection to ws://127.0.0.1:3000/_next/hmr failed:
 *      Error during WebSocket handshake: ERR_INVALID_HTTP_RESPONSE`.
 *
 * A smoke test should exercise what ships. In CI this config now builds and
 * serves the PRODUCTION bundle (`next build` + `next start`), which has no HMR
 * client, no on-demand compilation and no dev-only runtime to break. A failure
 * there means the shipped application is broken — which is the only claim worth
 * asserting.
 *
 * Locally the dev server is still the default, because it is faster and it is
 * what developers have running. Set `PLAYWRIGHT_DEV_SERVER=1` to force it in CI
 * (or `PLAYWRIGHT_BASE_URL` to target any already-running instance).
 *
 * The `build` job of `.github/workflows/phase03-application-build-e2e.yml` runs
 * `next build` separately, so a build failure is reported as a build failure
 * rather than as a browser timeout.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

/** Production server in CI unless explicitly overridden. */
const useProductionServer =
  process.env.PLAYWRIGHT_BASE_URL === undefined &&
  (process.env.PLAYWRIGHT_DEV_SERVER !== '1' ? Boolean(process.env.CI) : false);

const webServer = {
  command: useProductionServer ? 'npm run build && npm run start' : 'npm run dev',
  url: baseURL,
  // In CI a stale server on the port would silently test the wrong build.
  reuseExistingServer: !process.env.CI,
  timeout: 180_000,
  env: {
    // `next start` exits non-zero if it cannot bind; make that explicit rather
    // than letting Playwright time out with a generic message.
    PORT: '3000',
  },
};

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : webServer,
});
