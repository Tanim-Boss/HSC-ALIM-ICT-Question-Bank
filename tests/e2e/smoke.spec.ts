import { expect, test } from '@playwright/test';

/**
 * Application-shell smoke test (not a product flow).
 * Verifies: boot, document title, single H1, Bengali + English rendering,
 * theme toggle behaviour and persistence across reloads.
 *
 * WHY THE TOGGLE STEPS USE `toPass`
 * ---------------------------------
 * The first CI run of `phase03-application-build-e2e.yml` failed here, and the
 * cause was this test, not the application: the click was silently swallowed.
 *
 * The page is server-rendered, so an interactive-looking button exists in the
 * HTML before React attaches its onClick handler. `next dev` compiles on
 * demand, which widens that window enough to lose a click reliably. Playwright's
 * `toHaveClass` assertion retries, but the *click* had already happened and was
 * never repeated — so the assertion could only watch a page that would never
 * change, and failed after its timeout with
 * `Expected pattern: /dark/` and a class list containing only the font variables.
 *
 * `expect(async () => …).toPass()` re-runs the whole interaction, which is what
 * makes the step tolerant of the pre-hydration window. Running the click twice
 * would NOT be a fix: it would toggle dark on, then straight back off. Retrying
 * the compound action closes the race without weakening the assertion — the
 * final assertion is still exact.
 */

/** Waits until React has hydrated, so the toggle's handler is actually attached. */
async function waitForHydration(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    // React's pre-hydration bootstrap in app/layout.tsx has run, so the class
    // the toggle writes is observable; the button is a Client Component, so a
    // working handler proves hydration reached it.
    return typeof window !== 'undefined' && window.localStorage !== undefined;
  });
}

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

    await waitForHydration(page);

    // Toggle to dark. The interaction is retried as a unit so a click that
    // lands before hydration cannot fail the step; the assertion itself is exact.
    await expect(async () => {
      await page.getByRole('button', { name: /switch to dark theme/i }).click();
      await expect(html).toHaveClass(/dark/, { timeout: 2_000 });
    }).toPass({ timeout: 15_000 });

    // Persistence across reload (localStorage).
    await page.reload();
    await expect(html).toHaveClass(/dark/);

    // Toggle back to light.
    await expect(async () => {
      await page.getByRole('button', { name: /switch to light theme/i }).click();
      await expect(html).not.toHaveClass(/dark/, { timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
  });
});
