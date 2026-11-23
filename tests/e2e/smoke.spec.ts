import { expect, test } from '@playwright/test';

/**
 * Application-shell smoke test (not a product flow).
 * Verifies: boot, document title, single H1, Bengali + English rendering,
 * theme toggle behaviour and persistence across reloads.
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

    // Toggle to dark; choice persists across a reload (localStorage).
    await page.getByRole('button', { name: /switch to dark theme/i }).click();
    await expect(html).toHaveClass(/dark/);
    await page.reload();
    await expect(html).toHaveClass(/dark/);

    // Toggle back to light.
    await page.getByRole('button', { name: /switch to light theme/i }).click();
    await expect(html).not.toHaveClass(/dark/);
  });
});
