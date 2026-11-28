/**
 * Regression suite for the G-1 step 3b omission invariant.
 *
 * WHY THIS FILE EXISTS
 *
 * G-1 step 3b checks that the spike datamodel describes the spike SQL. The
 * datamodel deliberately omits eight objects (the G-1 question — G-1 is FAILED
 * and is not re-scored, owner decision B1a condition 2), so the live-database
 * diff must be EXACTLY those eight statements. The first version of 3b only
 * rejected statements that were not omissions; it accepted an empty diff, a
 * partial set, a duplicate, and an FK dropped from the wrong table. Any of
 * those could let 3b pass on a datamodel that had stopped describing the
 * omissions — and, with an empty diff, let G-1 turn green unintentionally.
 *
 * HOW IT RUNS
 *
 * Every case writes a fixture into a throwaway directory and runs the REAL
 * `docs/database/g1-spike/check-omissions.sh` — the same file run.sh calls in
 * step 3b. Nothing is mocked and no database is needed.
 *
 * Contract under test: exit 0 = exactly the eight statements, each once;
 * exit 1 = invariant violated (MISSING / DUPLICATE / UNEXPECTED / MALFORMED /
 * EMPTY, each named); exit 2 = usage error or unreadable artifact.
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();
const CHECK = join(REPO_ROOT, 'docs/database/g1-spike/check-omissions.sh');
const RUN_SH = join(REPO_ROOT, 'docs/database/g1-spike/run.sh');

/** The eight documented omissions, pinned here independently of the script. */
const EXPECTED = [
  'ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_level_subject";',
  'ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_chapter_subject";',
  'ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_topic_chapter";',
  'ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_subtopic_topic";',
  'ALTER TABLE "answer_keys" DROP CONSTRAINT "fk_answer_keys_options_of_version";',
  'DROP INDEX "uq_chapters_id_subject";',
  'DROP INDEX "uq_topics_id_chapter";',
  'DROP INDEX "uq_subtopics_id_topic";',
] as const;

/**
 * Prisma 7.10.1's actual `migrate diff --script` output for the spike, as step
 * 3b produces it on PostgreSQL 16 (statement order, comments and blank lines
 * verbatim).
 */
const PRISMA_EXACT = `-- DropForeignKey
ALTER TABLE "answer_keys" DROP CONSTRAINT "fk_answer_keys_options_of_version";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_chapter_subject";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_level_subject";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_subtopic_topic";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "fk_questions_topic_chapter";

-- DropIndex
DROP INDEX "uq_chapters_id_subject";

-- DropIndex
DROP INDEX "uq_subtopics_id_topic";

-- DropIndex
DROP INDEX "uq_topics_id_chapter";

`;

const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'g1-omissions-'));
  created.push(dir);
  return dir;
}

interface Result {
  readonly status: number | null;
  readonly output: string;
}

function runCheck(args: readonly string[]): Result {
  const result = spawnSync('bash', [CHECK, ...args], { encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/** Writes `content` to a fresh file and runs the real check on it. */
function check(content: string | Buffer): Result {
  const file = join(scratch(), 'diff.sql');
  writeFileSync(file, content);
  return runCheck([file]);
}

/** A Prisma-shaped script (comment + statement + blank line) from statements. */
function script(statements: readonly string[]): string {
  return statements.map((statement) => `-- Drop\n${statement}\n\n`).join('');
}

function expectFail(result: Result, ...mustMention: string[]): void {
  expect(result.status, result.output).toBe(1);
  expect(result.output).toMatch(/RESULT: FAIL/);
  expect(result.output).not.toMatch(/RESULT: PASS/);
  for (const text of mustMention) expect(result.output).toContain(text);
}

describe('the expected omission set', () => {
  it('is exactly the eight documented statements, in the order pinned above', () => {
    const result = runCheck(['--print-expected']);
    expect(result.status).toBe(0);
    expect(result.output.trimEnd().split('\n')).toEqual([...EXPECTED]);
  });

  it('PRISMA_EXACT contains each expected statement exactly once and nothing else', () => {
    const lines = PRISMA_EXACT.split('\n').filter((l) => l !== '' && !l.startsWith('--'));
    expect([...lines].sort()).toEqual([...EXPECTED].sort());
  });
});

describe('PASS — and only for the exact set', () => {
  it("passes on Prisma's real output for the spike", () => {
    const result = check(PRISMA_EXACT);
    expect(result.status, result.output).toBe(0);
    expect(result.output).toMatch(/RESULT: PASS — all 8 expected omissions present exactly once/);
  });

  it('passes on the same eight statements in another order, without comments', () => {
    const result = check(`${[...EXPECTED].reverse().join('\n')}\n`);
    expect(result.status, result.output).toBe(0);
  });

  it('tolerates trailing whitespace and a missing final newline', () => {
    const result = check(EXPECTED.map((s) => `${s}  \t`).join('\n'));
    expect(result.status, result.output).toBe(0);
  });
});

describe('FAIL — a missing expected omission', () => {
  it.each(EXPECTED.map((s) => [s]))('removing %s fails and names it MISSING', (removed) => {
    const result = check(script(EXPECTED.filter((s) => s !== removed)));
    expectFail(result, `MISSING: ${removed}`, 'found 7 statement(s) of which 7 matched');
  });

  it('zero omissions (a diff that only drops something else) fails with all eight MISSING', () => {
    const result = check(script(['DROP INDEX "uq_boards_code";']));
    expectFail(result, 'UNEXPECTED: DROP INDEX "uq_boards_code";');
    for (const statement of EXPECTED) expect(result.output).toContain(`MISSING: ${statement}`);
  });
});

describe('FAIL — a duplicate expected omission', () => {
  it.each(EXPECTED.map((s) => [s]))('duplicating %s fails and names it DUPLICATE', (dup) => {
    const result = check(script([...EXPECTED, dup]));
    expectFail(result, `DUPLICATE (2x): ${dup}`, 'found 9 statement(s) of which 9 matched');
  });

  it('a triplicate is reported with its count', () => {
    const result = check(script([...EXPECTED, EXPECTED[5], EXPECTED[5]]));
    expectFail(result, `DUPLICATE (3x): ${EXPECTED[5]}`);
  });
});

describe('FAIL — anything unexpected', () => {
  it.each([
    [
      'an unrelated FK drop',
      'ALTER TABLE "questions" DROP CONSTRAINT "questions_subject_id_fkey";',
    ],
    ['a table drop', 'DROP TABLE "questions";'],
    ['an unrelated index drop', 'DROP INDEX "uq_topics_chapter_order";'],
    [
      'an index rename',
      'ALTER INDEX "uq_answer_keys_version" RENAME TO "answer_keys_version_id_key";',
    ],
    ['an added column', 'ALTER TABLE "subtopics" ADD COLUMN "probeMarker" TEXT;'],
  ])('nine statements — the exact set plus %s — fails', (_label, extra) => {
    const result = check(script([...EXPECTED, extra]));
    expectFail(result, `UNEXPECTED: ${extra}`);
  });

  it.each([
    ['fk_questions_level_subject', 'answer_keys'],
    ['fk_questions_chapter_subject', 'answer_keys'],
    ['fk_questions_topic_chapter', 'answer_keys'],
    ['fk_questions_subtopic_topic', 'answer_keys'],
    ['fk_answer_keys_options_of_version', 'questions'],
  ])('%s dropped from the wrong table (%s) fails', (fk, wrongTable) => {
    const statements = EXPECTED.map((s) =>
      s.includes(`"${fk}"`) ? `ALTER TABLE "${wrongTable}" DROP CONSTRAINT "${fk}";` : s,
    );
    const result = check(script(statements));
    expectFail(
      result,
      `UNEXPECTED: ALTER TABLE "${wrongTable}" DROP CONSTRAINT "${fk}";`,
      'MISSING:',
    );
  });

  it.each([
    ['lower-case keywords', 'drop index "uq_chapters_id_subject";'],
    ['unquoted name', 'DROP INDEX uq_chapters_id_subject;'],
    ['a double space', 'DROP INDEX  "uq_chapters_id_subject";'],
    ['IF EXISTS', 'DROP INDEX IF EXISTS "uq_chapters_id_subject";'],
    ['CASCADE', 'DROP INDEX "uq_chapters_id_subject" CASCADE;'],
    ['a schema-qualified name', 'DROP INDEX "public"."uq_chapters_id_subject";'],
  ])('a near-miss spelling (%s) is not accepted as the expected statement', (_label, variant) => {
    const statements = EXPECTED.map((s) =>
      s === 'DROP INDEX "uq_chapters_id_subject";' ? variant : s,
    );
    const result = check(script(statements));
    expectFail(result, `UNEXPECTED: ${variant}`, 'MISSING: DROP INDEX "uq_chapters_id_subject";');
  });

  it('a second statement smuggled onto the same line as an expected one fails', () => {
    const smuggled = 'DROP INDEX "uq_chapters_id_subject"; DROP TABLE "questions";';
    const statements = EXPECTED.map((s) =>
      s === 'DROP INDEX "uq_chapters_id_subject";' ? smuggled : s,
    );
    expectFail(check(script(statements)), `UNEXPECTED: ${smuggled}`);
  });

  it('an expected statement split over two lines is not accepted', () => {
    const body = EXPECTED.filter((s) => s !== 'DROP INDEX "uq_chapters_id_subject";').join('\n');
    const result = check(`${body}\nDROP INDEX\n"uq_chapters_id_subject";\n`);
    expectFail(
      result,
      'UNEXPECTED: DROP INDEX "uq_chapters_id_subject";',
      'MISSING: DROP INDEX "uq_chapters_id_subject";',
    );
  });
});

describe('FAIL — empty or malformed artifacts', () => {
  it.each([
    ['a zero-byte file', ''],
    ['whitespace only', '  \n\t\n\n'],
    ["Prisma's empty-migration marker", '-- This is an empty migration.\n'],
    ['comments only', '-- DropForeignKey\n-- DropIndex\n'],
  ])('%s fails as EMPTY with all eight MISSING', (_label, content) => {
    const result = check(content);
    expectFail(result, 'EMPTY:');
    for (const statement of EXPECTED) expect(result.output).toContain(`MISSING: ${statement}`);
  });

  it('an unterminated final statement fails as MALFORMED', () => {
    const result = check(
      `${EXPECTED.slice(0, 7).join('\n')}\nDROP INDEX "uq_subtopics_id_topic"\n`,
    );
    expectFail(result, 'MALFORMED:', 'MISSING: DROP INDEX "uq_subtopics_id_topic";');
  });

  it('binary garbage fails (never passes)', () => {
    const garbage = Buffer.from([0x00, 0xff, 0xfe, 0x3b, 0x0a, 0x89, 0x50, 0x4e, 0x47, 0x3b, 0x0a]);
    const result = check(garbage);
    expect(result.status).toBe(1);
    expect(result.output).not.toMatch(/RESULT: PASS/);
  });
});

describe('exit 2 — usage errors and unreadable artifacts', () => {
  it('a path that does not exist', () => {
    const result = runCheck([join(scratch(), 'missing.sql')]);
    expect(result.status).toBe(2);
    expect(result.output).toMatch(/UNREADABLE: .* does not exist/);
  });

  it('a directory instead of a file', () => {
    const result = runCheck([scratch()]);
    expect(result.status).toBe(2);
    expect(result.output).toMatch(/UNREADABLE: .* is not a regular file/);
  });

  it.skipIf(process.getuid?.() === 0)('a file without read permission', () => {
    const file = join(scratch(), 'locked.sql');
    writeFileSync(file, PRISMA_EXACT);
    chmodSync(file, 0o000);
    const result = runCheck([file]);
    expect(result.status).toBe(2);
    expect(result.output).toMatch(/UNREADABLE: .* is not readable/);
  });

  it.each([
    ['no argument', []],
    ['two arguments', ['a.sql', 'b.sql']],
    ['an empty argument', ['']],
  ])('%s is a usage error', (_label, args) => {
    const result = runCheck(args);
    expect(result.status).toBe(2);
    expect(result.output).not.toMatch(/RESULT: PASS/);
  });
});

describe('run.sh enforces the invariant (the tests above exercise the code it runs)', () => {
  const runSh = readFileSync(RUN_SH, 'utf8');

  it('step 3b calls check-omissions.sh on the live fidelity diff and on the probe', () => {
    expect(runSh).toContain('OMISSIONS_CHECK="$SPIKE_DIR/check-omissions.sh"');
    expect(runSh).toContain('omission_check "$OUT_DIR/03b-fidelity.sql"');
    expect(runSh).toContain('omission_check "$OUT_DIR/03b-probe.sql"');
  });

  it('step 3b fails unless the fidelity diff passes the invariant', () => {
    expect(runSh).toMatch(
      /omission_check "\$OUT_DIR\/03b-fidelity\.sql"\nif \[ "\$oc_rc" -ne 0 \]; then[\s\S]*?fail "the database\/datamodel diff is not exactly the eight documented omissions/,
    );
  });

  it('the old permissive classifier is gone', () => {
    expect(runSh).not.toContain('unattributed_statements');
    expect(runSh).not.toContain('OMITTED_STATEMENT_RE');
  });
});
