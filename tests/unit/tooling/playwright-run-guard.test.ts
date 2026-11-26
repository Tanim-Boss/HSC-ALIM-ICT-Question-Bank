/**
 * Regression suite for `scripts/ci/playwright-run-guard.mjs`.
 *
 * THE CONTROL THIS PINS
 *
 * `npx playwright test` already fails the job when a browser test fails, so
 * that is not the risk. The risk is a run that reports success having executed
 * nothing: a stale `testDir`, a `-t`/`--grep` filter that matches no test, a
 * renamed spec file, or every case marked `skip`. A green browser job that
 * tested nothing is the "a skipped suite is not a pass" defect, in the browser
 * layer.
 *
 * WHAT IS ASSERTED
 *
 *   · a real, non-skipped run passes, and the floor is read from the report;
 *   · `skipped > 0` fails even when other cases passed, and skipped cases never
 *     count toward the floor;
 *   · a zero-case run fails — the exact false pass this exists to prevent;
 *   · a `--min` above the executed count fails, so a suite shrinking silently
 *     is caught;
 *   · a missing or malformed report fails, and says which of the two it was;
 *   · a report with no `stats` object fails as a zero-case run rather than
 *     being treated as an absent constraint;
 *   · usage errors exit 2, so a mistake in the workflow is distinguishable from
 *     a genuine suite failure (exit 1).
 *
 * Every fixture is a throwaway JSON file in the OS temp directory. The script is
 * executed as its own process, exactly as the workflow invokes it, so the tests
 * pin the real exit codes rather than a re-implementation of them.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();
const GUARD = join(REPO_ROOT, 'scripts/ci/playwright-run-guard.mjs');

const scratch = mkdtempSync(join(tmpdir(), 'playwright-run-guard-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;

/** Writes a synthetic Playwright JSON report and returns its path. */
function writeReport(stats: Record<string, number> | undefined): string {
  const path = join(scratch, `report-${counter++}.json`);
  const body = stats === undefined ? { suites: [] } : { suites: [], stats };
  writeFileSync(path, JSON.stringify(body), 'utf8');
  return path;
}

function run(args: string[]): { code: number; out: string } {
  const result = spawnSync(process.execPath, [GUARD, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return { code: result.status ?? -1, out: `${result.stdout}${result.stderr}` };
}

describe('playwright-run-guard — the real report shapes', () => {
  it('passes a run that executed its cases and skipped none', () => {
    const report = writeReport({ expected: 1, unexpected: 0, flaky: 0, skipped: 0 });
    const { code, out } = run([report]);
    expect(code).toBe(0);
    expect(out).toContain('executed=1');
    expect(out).toContain('OK: the browser suite executed');
  });

  it('passes a run whose retries eventually succeeded (flaky counts as executed)', () => {
    const report = writeReport({ expected: 2, unexpected: 0, flaky: 1, skipped: 0 });
    expect(run([report]).code).toBe(0);
  });

  it('fails a zero-case run — the false pass this guard exists to prevent', () => {
    const report = writeReport({ expected: 0, unexpected: 0, flaky: 0, skipped: 0 });
    const { code, out } = run([report]);
    expect(code).toBe(1);
    expect(out).toContain('::error title=e2e::');
    expect(out).toContain('false pass');
  });

  it('fails a report that carries no stats object at all', () => {
    // An older or truncated report must not be read as "no constraint".
    const report = writeReport(undefined);
    const { code, out } = run([report]);
    expect(code).toBe(1);
    expect(out).toContain('false pass');
  });
});

describe('playwright-run-guard — skipped cases are not a pass', () => {
  it('fails when any case was skipped, even though another case passed', () => {
    const report = writeReport({ expected: 1, unexpected: 0, flaky: 0, skipped: 1 });
    const { code, out } = run([report]);
    expect(code).toBe(1);
    expect(out).toContain('skipped suite is not a pass');
  });

  it('does not let skipped cases satisfy the floor', () => {
    // Ten skipped cases, minimum one, zero executed: must still fail.
    const report = writeReport({ expected: 0, unexpected: 0, flaky: 0, skipped: 10 });
    const { code, out } = run([report, '--min', '1']);
    expect(code).toBe(1);
    expect(out).toContain('executed=0');
  });
});

describe('playwright-run-guard — the execution floor', () => {
  it('fails when fewer cases ran than the workflow requires', () => {
    const report = writeReport({ expected: 1, unexpected: 0, flaky: 0, skipped: 0 });
    const { code, out } = run([report, '--min', '2']);
    expect(code).toBe(1);
    expect(out).toContain('minimum 2');
  });

  it('passes exactly at the floor', () => {
    const report = writeReport({ expected: 2, unexpected: 0, flaky: 0, skipped: 0 });
    expect(run([report, '--min', '2']).code).toBe(0);
  });

  it('rejects a non-integer floor as a usage error (exit 2, not 1)', () => {
    const report = writeReport({ expected: 1, unexpected: 0, flaky: 0, skipped: 0 });
    expect(run([report, '--min', 'lots']).code).toBe(2);
  });
});

describe('playwright-run-guard — missing and broken reports', () => {
  it('fails when no report was written at all', () => {
    const { code, out } = run([join(scratch, 'does-not-exist.json')]);
    expect(code).toBe(1);
    // Named distinctly from a zero-case run: "did not run" ≠ "ran nothing".
    expect(out).toContain('did not run');
  });

  it('fails when the report is not valid JSON', () => {
    const path = join(scratch, 'garbage.json');
    writeFileSync(path, 'not json at all', 'utf8');
    const { code, out } = run([path]);
    expect(code).toBe(1);
    expect(out).toContain('unreadable');
  });

  it('exits 2 with usage text when called without arguments', () => {
    const { code, out } = run([]);
    expect(code).toBe(2);
    expect(out).toContain('usage:');
  });
});
