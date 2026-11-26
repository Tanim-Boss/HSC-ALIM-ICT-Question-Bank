import { expect, test } from '@playwright/test';

/**
 * Application-shell smoke test (not a product flow).
 * Verifies: boot, document title, single H1, Bengali + English rendering,
 * theme toggle behaviour and persistence across reloads.
 *
 * WHY THIS RUNS AGAINST THE PRODUCTION BUNDLE IN CI
 * -------------------------------------------------
 * This suite once started `npm run dev` everywhere and failed in CI every time.
 * Recording the cause here, because "it passes locally" was exactly what hid it:
 *
 *   · the server-rendered content was fine — title, H1 and both Bengali
 *     fixtures asserted successfully, and a `.dark` rule was in the stylesheets;
 *   · the Client Component never hydrated, so the click did nothing:
 *     `localStorage` stayed `null` and the class never changed;
 *   · the console showed the dev client failing repeatedly —
 *     `WebSocket connection to ws://127.0.0.1:3000/_next/hmr failed:
 *      Error during WebSocket handshake: ERR_INVALID_HTTP_RESPONSE`.
 *
 * So the theme toggle was not broken; the DEV SERVER was. `playwright.config.ts`
 * now builds and serves the production bundle in CI, where no HMR client
 * exists. The assertions below are deliberately strict and unretried: an
 * interaction that needs a retry to work is a defect, and the previous
 * `toPass` workaround would have masked it.
 */
test.describe('application shell', () => {
  test('home page renders bilingual content and toggles the theme', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/ICT Atlas/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Bengali fixture from docs/design/typography.md renders as text (not rasterized).
    await expect(page.getByText(/একটি কম্পিউটার নেটওয়ার্কে/)).toBeVisible();
    // Geist Mono code surface renders the C fixture with a Bengali comment.
    await expect(page.getByText(/#include/)).toBeVisible();

    // Light is the default theme.
    const html = page.locator('html');
    await expect(html).not.toHaveClass(/dark/);

    // Toggle to dark; choice persists in localStorage.
    await page.getByRole('button', { name: /switch to dark theme/i }).click();
    await expect(html).toHaveClass(/dark/);
    expect(await page.evaluate(() => window.localStorage.getItem('ict-atlas-theme'))).toBe('dark');

    // Persistence across reload — the pre-hydration bootstrap must reapply it.
    await page.reload();
    await expect(html).toHaveClass(/dark/);

    // Toggle back to light.
    await page.getByRole('button', { name: /switch to light theme/i }).click();
    await expect(html).not.toHaveClass(/dark/);
    expect(await page.evaluate(() => window.localStorage.getItem('ict-atlas-theme'))).toBe('light');
  });
});
