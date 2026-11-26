import { expect, test } from '@playwright/test';

/**
 * TEMPORARY DIAGNOSTIC — deleted before this PR is proposed for merge.
 *
 * The smoke suite's theme-toggle step fails consistently in CI. Rather than
 * guess further, this test collects the facts that distinguish the candidate
 * causes and surfaces them through the failure message, which the workflow's
 * annotation step republishes (job logs are not reachable from every
 * environment). It asserts nothing about the product.
 */
test('diagnose the theme toggle', async ({ page }) => {
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (m) => consoleMessages.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const before = await page.evaluate(() => document.documentElement.className);

  // Is React listening at all? A capture-phase listener on document sees the
  // click regardless of which handler is responsible.
  const clickSeen = await page.evaluate(() => {
    return new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve('no click observed'), 3000);
      document.addEventListener(
        'click',
        () => {
          clearTimeout(timer);
          resolve('click observed at document');
        },
        { capture: true, once: true },
      );
    });
  });

  const button = page.getByRole('button', { name: /switch to dark theme/i });
  const buttonCount = await button.count();
  await button.first().click();

  const immediatelyAfter = await page.evaluate(() => document.documentElement.className);
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => document.documentElement.className);
  const stored = await page.evaluate(() => window.localStorage.getItem('ict-atlas-theme'));
  const darkRule = await page.evaluate(() => {
    // Does a `.dark` selector rule actually exist in the loaded stylesheets?
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          if (rule instanceof CSSRule && String(rule.cssText).startsWith('.dark')) return 'yes';
        }
      } catch {
        /* cross-origin sheet — ignore */
      }
    }
    return 'no .dark rule found';
  });

  const diagnostics = {
    before,
    clickSeen,
    buttonCount,
    immediatelyAfter,
    after,
    stored,
    darkRule,
    pageErrors,
    console: consoleMessages.slice(0, 8),
  };

  // Deliberately fail so the values reach the annotation. JSON on one line so
  // the annotation step captures it whole.
  expect(JSON.stringify(diagnostics)).toBe('DIAGNOSTIC-ONLY');
});
