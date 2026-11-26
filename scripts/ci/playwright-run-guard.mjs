#!/usr/bin/env node
/**
 * Assert that a Playwright JSON report proves the browser suite ACTUALLY RAN.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `npx playwright test` exits non-zero when a test fails, so a failing suite is
 * already caught. The dangerous case is the opposite one: it can exit ZERO
 * having executed nothing. If `testDir` stops matching, a `--grep`/`-t` filter
 * goes stale, a file is renamed, or every case is marked `skip`, CI reports a
 * green browser job that tested nothing. That is the same false-pass class the
 * Phase 04A work kept finding in the database suites ("a skipped suite is not a
 * pass"), applied to the browser layer.
 *
 * The e2e workflow therefore runs Playwright with the JSON reporter and calls
 * this script. Keeping the decision in a committed, unit-tested file rather
 * than inline YAML is deliberate: a guard nobody can execute locally is a guard
 * nobody can trust. `tests/unit/tooling/playwright-run-guard.test.ts` exercises
 * every branch below against synthetic reports.
 *
 * WHAT IT READS
 * -------------
 * Playwright's JSON reporter emits `stats: { expected, skipped, unexpected,
 * flaky, duration, startTime }`, aggregated per test outcome. This script uses
 * exactly those fields (verified against the installed reporter, not assumed).
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It does not judge whether the assertions are meaningful, does not re-run
 * Playwright, and does not replace the exit code of the test run itself — it is
 * an additional floor, never a substitute.
 *
 * USAGE
 *   node scripts/ci/playwright-run-guard.mjs <report.json> [--min <n>]
 *
 * Exit codes: 0 = the suite demonstrably ran, 1 = it did not, 2 = usage error.
 */

import { existsSync, readFileSync } from 'node:fs';

const USAGE = 'usage: playwright-run-guard.mjs <playwright-json-report> [--min <cases>]';

/** Outcome counters the JSON reporter always emits, defaulted to 0 when absent. */
export function readStats(report) {
  const stats = report && typeof report === 'object' ? report.stats : undefined;
  const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  return {
    expected: num(stats?.expected),
    unexpected: num(stats?.unexpected),
    flaky: num(stats?.flaky),
    skipped: num(stats?.skipped),
  };
}

/**
 * Decide whether a report proves the suite ran.
 *
 * @param {string} reportPath  Path to the Playwright JSON report.
 * @param {number} minimum     Fewest executed (non-skipped) cases required.
 * @returns {{ code: number, executed: number, skipped: number }} The exit code
 *   and the counts it was derived from, so a caller (or a test) can assert both.
 */
export function checkReport(reportPath, minimum = 1) {
  if (!existsSync(reportPath)) {
    // Not "0 cases": no report at all means Playwright never got far enough to
    // write one, which is a different failure and must be named as such.
    console.error(
      `::error title=e2e::no Playwright JSON report at ${reportPath} — the suite did not run`,
    );
    return { code: 1, executed: 0, skipped: 0 };
  }

  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(
      `::error title=e2e::the Playwright JSON report at ${reportPath} is unreadable (${reason})`,
    );
    return { code: 1, executed: 0, skipped: 0 };
  }

  const { expected, unexpected, flaky, skipped } = readStats(report);
  // `skipped` is excluded from "executed" on purpose: a skipped case proves
  // nothing, so it must never help satisfy the floor.
  const executed = expected + unexpected + flaky;

  console.log(
    `executed=${executed} skipped=${skipped} ` +
      `expected=${expected} unexpected=${unexpected} flaky=${flaky} min=${minimum}`,
  );

  if (skipped > 0) {
    console.error(
      `::error title=e2e::${skipped} browser case(s) were skipped — a skipped suite is not a pass`,
    );
    return { code: 1, executed, skipped };
  }

  if (executed < minimum) {
    console.error(
      `::error title=e2e::only ${executed} browser case(s) executed (minimum ${minimum}) — a green result would be a false pass`,
    );
    return { code: 1, executed, skipped };
  }

  console.log('OK: the browser suite executed and skipped nothing');
  return { code: 0, executed, skipped };
}

function main(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    console.error(USAGE);
    return 2;
  }

  const reportPath = args[0];
  let minimum = 1;
  const minFlag = args.indexOf('--min');
  if (minFlag !== -1) {
    const raw = args[minFlag + 1];
    if (raw === undefined || !/^\d+$/.test(raw)) {
      console.error(`playwright-run-guard: --min needs a non-negative integer\n${USAGE}`);
      return 2;
    }
    minimum = Number(raw);
  }

  return checkReport(reportPath, minimum).code;
}

process.exitCode = main(process.argv);
