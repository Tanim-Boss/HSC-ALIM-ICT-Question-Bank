/**
 * Regression suite for the mandatory migration-history checksum gate.
 *
 * WHY THIS FILE EXISTS
 *
 * `guard.py history` has always existed, but it ran only inside the V-3
 * backup/restore drill — a test, not a gate. Meanwhile `npm run db:deploy`
 * invoked `prisma migrate deploy` with no history verification at all, and
 * Prisma was MEASURED not to detect an edited applied migration (both
 * `migrate deploy` and `migrate status` exited 0 after the file was rewritten).
 *
 * `scripts/db/deploy-gate.sh` closes that hole. This suite pins both halves of
 * the claim:
 *
 *   1. the verification itself rejects every tampered/missing/absent state;
 *   2. deployment cannot run before verification succeeds.
 *
 * (2) is proven structurally rather than by reading the script's text: a fake
 * `npx` is placed on PATH that records whether it was invoked. If a refused
 * case ever reaches `prisma migrate deploy`, the marker file appears and the
 * assertion fails. A source-text assertion would not survive a refactor.
 *
 * NO DATABASE IS USED. Two controlled fixtures stand in for PostgreSQL: a
 * `psql` stub that answers the three queries the gate issues, and history JSON
 * files. The real-psql path is exercised in CI by the V-3 drill and the
 * integration suites; what is proven here is the gate's own logic and its
 * fail-closed behaviour.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();
const GATE = join(REPO_ROOT, 'scripts/db/deploy-gate.sh');
const MIGRATION_NAME = '0001_phase04a_question_bank';
const MIGRATION_SQL = join(REPO_ROOT, 'prisma/migrations', MIGRATION_NAME, 'migration.sql');

/** The checksum Prisma would have recorded for the committed migration. */
const COMMITTED_CHECKSUM = createHash('sha256').update(readFileSync(MIGRATION_SQL)).digest('hex');

const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  created.push(dir);
  return dir;
}

interface RunResult {
  readonly status: number | null;
  readonly output: string;
  /** True when the fake `npx` recorded an invocation — i.e. a deploy happened. */
  readonly deployed: boolean;
}

interface RunOptions {
  readonly args: readonly string[];
  readonly env?: Record<string, string>;
  /** Extra executables to place on PATH (name -> script body). */
  readonly bins?: Record<string, string>;
  /** Gate script to run; defaults to the real one. */
  readonly gatePath?: string;
}

function runGate(options: RunOptions): RunResult {
  const binDir = tempDir('deploy-gate-bin-');
  const marker = join(binDir, 'deploy-ran.marker');

  // The deployment sentinel. Any call to `npx prisma migrate deploy` reaches
  // this and is recorded, so "did it deploy?" is observable.
  writeExecutable(
    join(binDir, 'npx'),
    `#!/usr/bin/env bash\ntouch ${JSON.stringify(marker)}\nprintf 'STUB-NPX %s\\n' "$*"\nexit 0\n`,
  );
  for (const [name, body] of Object.entries(options.bins ?? {})) {
    writeExecutable(join(binDir, name), body);
  }

  const result = spawnSync('bash', [options.gatePath ?? GATE, ...options.args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env['PATH'] ?? ''}`,
      ...options.env,
    },
  });

  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    deployed: existsSync(marker),
  };
}

function writeExecutable(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, 'utf8');
  chmodSync(path, 0o755);
}

/** Writes a history JSON fixture and returns its path. */
function historyFile(rows: unknown): string {
  const dir = tempDir('deploy-gate-history-');
  const path = join(dir, 'history.json');
  writeFileSync(path, JSON.stringify(rows), 'utf8');
  return path;
}

/**
 * A `psql` stub answering the three queries the gate issues. `history` absent
 * means the history table does not exist.
 */
function psqlStub(opts: {
  readonly historyExists: boolean;
  readonly history?: unknown;
  readonly tableCount?: number;
  readonly exitWith?: number;
}): string {
  const histFile = tempDir('deploy-gate-psql-');
  const histPath = join(histFile, 'history.json');
  writeFileSync(histPath, JSON.stringify(opts.history ?? []), 'utf8');

  return `#!/usr/bin/env bash
set -u
sql=""
while [ $# -gt 0 ]; do
  if [ "$1" = "-c" ]; then sql="$2"; shift 2; continue; fi
  shift
done
${opts.exitWith !== undefined ? `exit ${opts.exitWith}` : ''}
case "$sql" in
  *to_regclass*) printf '%s\\n' ${opts.historyExists ? 't' : 'f'} ; exit 0 ;;
  *pg_tables*)   printf '%s\\n' ${opts.tableCount ?? 0} ; exit 0 ;;
  *_prisma_migrations*) cat ${JSON.stringify(histPath)} ; exit 0 ;;
esac
exit 0
`;
}

// ---------------------------------------------------------------------
// The verification itself — fixtures, no database
// ---------------------------------------------------------------------
describe('checksum verification of the recorded history', () => {
  it('passes when an applied migration is unchanged', () => {
    const history = historyFile([{ migration_name: MIGRATION_NAME, checksum: COMMITTED_CHECKSUM }]);
    const result = runGate({ args: ['verify', '--history-json', history] });

    expect(result.output).toBeTruthy();
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('VERIFIED');
  });

  it('fails when the recorded checksum does not match the file', () => {
    const history = historyFile([{ migration_name: MIGRATION_NAME, checksum: 'a'.repeat(64) }]);
    const result = runGate({ args: ['verify', '--history-json', history] });

    expect(result.status).toBe(1);
    expect(result.output).toMatch(/MODIFIED|REJECT/);
  });

  it('fails when an applied migration file was edited after it was applied', () => {
    // The real-world case: a COPY of the migration tree is edited, while the
    // recorded checksum still reflects the committed bytes. This is exactly the
    // situation Prisma was measured to miss.
    const migrationsDir = tempDir('deploy-gate-migrations-');
    const dir = join(migrationsDir, MIGRATION_NAME);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'migration.sql'), '-- edited after apply\n', 'utf8');

    const history = historyFile([{ migration_name: MIGRATION_NAME, checksum: COMMITTED_CHECKSUM }]);
    const result = runGate({
      args: ['verify', '--history-json', history, '--migrations-dir', migrationsDir],
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain('MODIFIED');
  });

  it('fails when a required history record is missing entirely', () => {
    const history = historyFile([]);
    const result = runGate({ args: ['verify', '--history-json', history] });

    expect(result.status).toBe(1);
    expect(result.output).toMatch(/nothing to verify|no applied migrations/);
  });

  it('fails when a history record carries no checksum', () => {
    const history = historyFile([{ migration_name: MIGRATION_NAME, checksum: '' }]);
    const result = runGate({ args: ['verify', '--history-json', history] });

    expect(result.status).toBe(1);
    expect(result.output).toMatch(/no checksum recorded/);
  });

  it('fails when a migration recorded as applied has no file on disk', () => {
    const history = historyFile([{ migration_name: '9999_vanished', checksum: 'b'.repeat(64) }]);
    const result = runGate({ args: ['verify', '--history-json', history] });

    expect(result.status).toBe(1);
    expect(result.output).toMatch(/does not exist/);
  });

  it('fails when the history file itself is absent', () => {
    const result = runGate({ args: ['verify', '--history-json', '/nonexistent/history.json'] });

    expect(result.status).toBe(1);
    expect(result.output).toMatch(/history file not found/);
  });
});

// ---------------------------------------------------------------------
// Fail-closed on a broken or absent verification utility
// ---------------------------------------------------------------------
describe('the gate fails closed when verification cannot run', () => {
  /** A throwaway "repo" holding a copy of the gate but no guard.py. */
  function repoWithoutGuard(): string {
    const root = tempDir('deploy-gate-noguard-');
    const gateCopy = join(root, 'scripts/db/deploy-gate.sh');
    mkdirSync(dirname(gateCopy), { recursive: true });
    writeFileSync(gateCopy, readFileSync(GATE, 'utf8'), 'utf8');
    mkdirSync(join(root, 'prisma/migrations'), { recursive: true });
    return gateCopy;
  }

  it('refuses when the authoritative checksum utility is missing', () => {
    const history = historyFile([{ migration_name: MIGRATION_NAME, checksum: COMMITTED_CHECKSUM }]);
    const result = runGate({
      args: ['verify', '--history-json', history],
      gatePath: repoWithoutGuard(),
    });

    expect(result.status).toBe(1);
    expect(result.output).toMatch(/authoritative checksum utility missing/);
  });

  it('refuses and refuses to deploy when the utility itself fails', () => {
    // A utility that crashes is not a utility that passed. The gate must treat
    // a non-zero exit as a refusal, and must not reach the deploy step.
    const root = tempDir('deploy-gate-broken-');
    const gateCopy = join(root, 'scripts/db/deploy-gate.sh');
    mkdirSync(dirname(gateCopy), { recursive: true });
    writeFileSync(gateCopy, readFileSync(GATE, 'utf8'), 'utf8');

    const guard = join(root, 'docs/database/g1-spike/option-c/guard.py');
    mkdirSync(dirname(guard), { recursive: true });
    writeFileSync(guard, 'import sys\nprint("boom")\nsys.exit(3)\n', 'utf8');

    // A migrations dir with the real migration so the failure can only come
    // from the utility, not from a missing file.
    const mig = join(root, 'prisma/migrations', MIGRATION_NAME);
    mkdirSync(mig, { recursive: true });
    writeFileSync(join(mig, 'migration.sql'), readFileSync(MIGRATION_SQL));

    const result = runGate({
      args: ['verify'],
      env: { DATABASE_URL: 'postgres://stub/db' },
      gatePath: gateCopy,
      bins: {
        psql: psqlStub({
          historyExists: true,
          history: [{ migration_name: MIGRATION_NAME, checksum: COMMITTED_CHECKSUM }],
        }),
      },
    });

    expect(result.status).toBe(1);
    expect(result.output).toMatch(/verification FAILED \(guard\.py exit 3\)/);
    expect(result.deployed).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Database-sourced verification, via a controlled psql fixture
// ---------------------------------------------------------------------
describe('verification against a database-sourced history', () => {
  it('passes when the database history matches the files', () => {
    const result = runGate({
      args: ['verify'],
      env: { DATABASE_URL: 'postgres://stub/db' },
      bins: {
        psql: psqlStub({
          historyExists: true,
          history: [{ migration_name: MIGRATION_NAME, checksum: COMMITTED_CHECKSUM }],
        }),
      },
    });

    expect(result.output).toBeTruthy();
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('database (_prisma_migrations)');
  });

  it('fails when the database history is mismatched', () => {
    const result = runGate({
      args: ['verify'],
      env: { DATABASE_URL: 'postgres://stub/db' },
      bins: {
        psql: psqlStub({
          historyExists: true,
          history: [{ migration_name: MIGRATION_NAME, checksum: 'f'.repeat(64) }],
        }),
      },
    });

    expect(result.status).toBe(1);
  });

  it('treats an empty database as a determined first deployment, loudly', () => {
    // No history table and zero public tables: nothing applied, so nothing can
    // have been edited. This must be REPORTED, not silently skipped.
    const result = runGate({
      args: ['verify'],
      env: { DATABASE_URL: 'postgres://stub/db' },
      bins: { psql: psqlStub({ historyExists: false, tableCount: 0 }) },
    });

    expect(result.output).toBeTruthy();
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('DETERMINED');
    expect(result.output).toContain('not a skipped check');
  });

  it('refuses when there is no history table but the schema is NOT empty', () => {
    const result = runGate({
      args: ['verify'],
      env: { DATABASE_URL: 'postgres://stub/db' },
      bins: { psql: psqlStub({ historyExists: false, tableCount: 7 }) },
    });

    expect(result.status).toBe(1);
    expect(result.output).toMatch(/inconsistent or tampered/);
  });

  it('refuses when the history query errors', () => {
    const result = runGate({
      args: ['verify'],
      env: { DATABASE_URL: 'postgres://stub/db' },
      bins: { psql: psqlStub({ historyExists: true, exitWith: 1 }) },
    });

    expect(result.status).toBe(1);
    expect(result.output).toMatch(/could not query|could not read/);
  });

  it('refuses when DATABASE_URL is absent', () => {
    const result = runGate({ args: ['verify'], env: { DATABASE_URL: '' } });

    expect(result.status).toBe(1);
    expect(result.output).toMatch(/DATABASE_URL is not set/);
  });

  it('refuses when psql is unavailable', () => {
    // A PATH that has everything normally available EXCEPT psql, so the only
    // reason the gate can refuse is the missing client — not a missing shell or
    // a missing python3.
    const binDir = tempDir('deploy-gate-no-psql-');
    for (const source of ['/usr/local/bin', '/usr/bin', '/bin']) {
      if (!existsSync(source)) continue;
      for (const entry of readdirSync(source)) {
        if (entry === 'psql') continue;
        const target = join(binDir, entry);
        if (existsSync(target)) continue;
        try {
          symlinkSync(join(source, entry), target);
        } catch {
          // Unlinkable entries (dirs, EPERM) are irrelevant to this test.
        }
      }
    }
    expect(existsSync(join(binDir, 'bash'))).toBe(true);
    expect(existsSync(join(binDir, 'psql'))).toBe(false);

    const result = spawnSync('/bin/bash', [GATE, 'verify'], {
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: 'postgres://stub/db', PATH: binDir },
    });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

    expect(result.status).toBe(1);
    expect(output).toMatch(/psql is unavailable/);
  });
});

// ---------------------------------------------------------------------
// Deployment must not be reachable before verification succeeds
// ---------------------------------------------------------------------
describe('deployment is gated on successful verification', () => {
  it('deploys after a passing verification', () => {
    const result = runGate({
      args: ['deploy'],
      env: { DATABASE_URL: 'postgres://stub/db' },
      bins: {
        psql: psqlStub({
          historyExists: true,
          history: [{ migration_name: MIGRATION_NAME, checksum: COMMITTED_CHECKSUM }],
        }),
      },
    });

    expect(result.output).toBeTruthy();
    expect(result.status, result.output).toBe(0);
    // The positive control for every "did not deploy" assertion below.
    expect(result.deployed).toBe(true);
    expect(result.output).toContain('STUB-NPX prisma migrate deploy');
  });

  it('does NOT deploy when the history is tampered with', () => {
    const result = runGate({
      args: ['deploy'],
      env: { DATABASE_URL: 'postgres://stub/db' },
      bins: {
        psql: psqlStub({
          historyExists: true,
          history: [{ migration_name: MIGRATION_NAME, checksum: 'c'.repeat(64) }],
        }),
      },
    });

    expect(result.status).toBe(1);
    expect(result.deployed).toBe(false);
    expect(result.output).toContain('Nothing was deployed');
  });

  it('does NOT deploy when the database cannot be read', () => {
    const result = runGate({
      args: ['deploy'],
      env: { DATABASE_URL: 'postgres://stub/db' },
      bins: { psql: psqlStub({ historyExists: true, exitWith: 1 }) },
    });

    expect(result.status).toBe(1);
    expect(result.deployed).toBe(false);
  });

  it('does NOT deploy when there is no DATABASE_URL', () => {
    const result = runGate({ args: ['deploy'], env: { DATABASE_URL: '' } });

    expect(result.status).toBe(1);
    expect(result.deployed).toBe(false);
  });

  it('refuses a caller-supplied history file in deploy mode', () => {
    // Otherwise a caller could hand over a fabricated history and pass the gate
    // without touching a database.
    const history = historyFile([{ migration_name: MIGRATION_NAME, checksum: COMMITTED_CHECKSUM }]);
    const result = runGate({
      args: ['deploy', '--history-json', history],
      env: { DATABASE_URL: 'postgres://stub/db' },
    });

    expect(result.status).toBe(2);
    expect(result.deployed).toBe(false);
    expect(result.output).toMatch(/not accepted in deploy mode/);
  });

  it('DOES deploy on a genuinely empty database — first deployment must be possible', () => {
    // The empty-database case is a determination that passes, so it must fall
    // through to the deploy step. Exiting there would make the very first
    // deployment impossible.
    const result = runGate({
      args: ['deploy'],
      env: { DATABASE_URL: 'postgres://stub/db' },
      bins: { psql: psqlStub({ historyExists: false, tableCount: 0 }) },
    });

    expect(result.output).toBeTruthy();
    expect(result.status, result.output).toBe(0);
    expect(result.deployed).toBe(true);
    expect(result.output).toContain('DETERMINED');
  });

  it('forwards prisma arguments so a config-using deploy still goes through the gate', () => {
    // Without forwarding, a caller that needs `--config` would bypass the gate
    // and call prisma directly. Deploying around the gate must be unnecessary.
    const result = runGate({
      args: ['deploy', '--', '--config', 'prisma.config.ts'],
      env: { DATABASE_URL: 'postgres://stub/db' },
      bins: {
        psql: psqlStub({
          historyExists: true,
          history: [{ migration_name: MIGRATION_NAME, checksum: COMMITTED_CHECKSUM }],
        }),
      },
    });

    expect(result.status, result.output).toBe(0);
    expect(result.deployed).toBe(true);
    expect(result.output).toContain('STUB-NPX prisma migrate deploy --config prisma.config.ts');
  });

  it('still refuses a history file when prisma arguments are forwarded', () => {
    const history = historyFile([{ migration_name: MIGRATION_NAME, checksum: COMMITTED_CHECKSUM }]);
    const result = runGate({
      args: ['deploy', '--history-json', history, '--', '--config', 'x.ts'],
      env: { DATABASE_URL: 'postgres://stub/db' },
    });

    expect(result.status).toBe(2);
    expect(result.deployed).toBe(false);
  });

  it('does not deploy when the empty-database determination fails', () => {
    const result = runGate({
      args: ['deploy'],
      env: { DATABASE_URL: 'postgres://stub/db' },
      bins: { psql: psqlStub({ historyExists: false, tableCount: 3 }) },
    });

    expect(result.status).toBe(1);
    expect(result.deployed).toBe(false);
  });
});

// ---------------------------------------------------------------------
// The repository's own deployment path must be the gated one
// ---------------------------------------------------------------------
describe('the package.json deployment path', () => {
  it('routes db:deploy through the gate rather than straight to prisma', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts['db:deploy']).toBe('bash scripts/db/deploy-gate.sh deploy');
    expect(pkg.scripts['db:deploy']).not.toMatch(/prisma\s+migrate\s+deploy/);
    expect(pkg.scripts['db:verify-history']).toBe('bash scripts/db/deploy-gate.sh verify');
  });
});
