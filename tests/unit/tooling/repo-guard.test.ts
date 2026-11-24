/**
 * Regression suite for the Option C repository guard.
 *
 * WHY THIS FILE EXISTS
 *
 * A guard is a security control, and an untested control is a claim. The
 * post-merge audit found two live bypasses in `repo-guard.sh`:
 *
 *   1. it scanned `scripts/` and `.github/workflows/` only, so
 *      `package.json` — which exposed `db:migrate` → the prohibited
 *      migration-development command — was outside every control;
 *   2. its pattern matched `migrate dev`, `migrate reset` and `db push`, but
 *      not `migrate diff --from-migrations`.
 *
 * Both are now closed. These tests pin the closures AND pin the boundaries, so
 * a future edit that widens the guard into false positives (breaking legitimate
 * deployments) or narrows it back into a bypass fails loudly.
 *
 * WHAT IS ASSERTED, AND WHY EACH CASE IS HERE
 *
 *   · approved commands pass        — a guard that blocks `migrate deploy` gets
 *                                     removed, and then it protects nothing.
 *   · every prohibited command fails— including the --from-migrations form.
 *   · npm indirection fails         — the exact defect the audit found.
 *   · wrapper indirection fails     — "move it into a script" must not work,
 *                                     including a wrapper calling a wrapper.
 *   · comments and prose pass       — documentation about a rule is not an
 *                                     invocation of it.
 *   · the real repository passes    — the tree we ship must satisfy its own rule.
 *
 * HOW IT RUNS
 *
 * Each case materialises a small throwaway repository in the OS temp directory
 * and runs the real `repo-guard.sh` against it, exactly as CI does. Nothing is
 * mocked and no database is touched.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();
const GUARD = join(REPO_ROOT, 'docs/database/g1-spike/option-c/repo-guard.sh');

const created: string[] = [];

afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

/** Materialises a throwaway repository from a {relativePath: content} map. */
function makeRepo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'repo-guard-'));
  created.push(dir);
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(dir, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf8');
  }
  return dir;
}

interface GuardResult {
  readonly status: number | null;
  readonly output: string;
}

function runGuard(repo: string): GuardResult {
  const result = spawnSync('bash', [GUARD, repo], { encoding: 'utf8' });
  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

/** A shell script body, so each fixture reads as what it actually is. */
function script(...lines: readonly string[]): string {
  return `#!/usr/bin/env bash\nset -euo pipefail\n${lines.join('\n')}\n`;
}

function pkg(scripts: Record<string, string>): string {
  return `${JSON.stringify({ name: 'fixture', private: true, scripts }, null, 2)}\n`;
}

// ---------------------------------------------------------------------
// 3.1.5 — no false positives: the approved commands must be accepted
// ---------------------------------------------------------------------
describe('the guard accepts the approved Option C commands', () => {
  it('accepts migrate deploy, migrate status and the schema-to-schema diff', () => {
    // This is the exact GOODREPO fixture the G-3 harness uses, so a change here
    // and a change there cannot drift apart.
    const repo = makeRepo({
      'scripts/deploy.sh': script(
        'prisma migrate deploy --config prisma.config.ts',
        'prisma migrate status --config prisma.config.ts',
        'prisma migrate diff --from-schema snapshots/prev.prisma --to-schema prisma/schema.prisma --script',
      ),
    });

    expect(runGuard(repo).status).toBe(0);
  });

  it('accepts the other approved diff sources', () => {
    const repo = makeRepo({
      'scripts/diff.sh': script(
        'prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script',
        'prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel next.prisma',
      ),
    });

    expect(runGuard(repo).status).toBe(0);
  });

  it('accepts validate, generate and studio', () => {
    const repo = makeRepo({
      'scripts/tools.sh': script('prisma validate', 'prisma generate', 'prisma studio'),
    });

    expect(runGuard(repo).status).toBe(0);
  });

  it('does not treat a comment about a prohibited command as an invocation', () => {
    // Prose about a rule is not a violation of it. Without this, the guard could
    // not be documented inside the very scripts it governs.
    const repo = makeRepo({
      'scripts/deploy.sh': script(
        '# NEVER run prisma migrate dev here: it drops C-1..C-5.',
        '# Also forbidden: npx prisma migrate reset, prisma db push.',
        '# And so is prisma migrate diff --from-migrations.',
        'prisma migrate deploy',
      ),
    });

    expect(runGuard(repo).status).toBe(0);
  });

  it('does not treat JS/TS comment lines as invocations', () => {
    // Application source may document the rule. `//` and block-comment `*`
    // lines are skipped just like `#`, or prose in code would fail the build.
    const repo = makeRepo({
      'scripts/note.ts': [
        '// never run prisma migrate dev in a deploy script',
        ' * prisma migrate reset would destroy history',
        'export const approved = "prisma migrate deploy";',
        '',
      ].join('\n'),
    });

    expect(runGuard(repo).status).toBe(0);
  });

  it('does not flag a package.json script KEY that merely names migrate', () => {
    // The audit's fix parses script VALUES. If it scanned raw bytes it would
    // flag the key `db:migrate` itself, which is not an invocation.
    const repo = makeRepo({
      'package.json': pkg({
        'db:migrate': 'bash scripts/refuse.sh',
        'db:deploy': 'prisma migrate deploy',
      }),
      'scripts/refuse.sh': script('echo "use db:deploy instead"', 'exit 1'),
    });

    expect(runGuard(repo).status).toBe(0);
  });
});

// ---------------------------------------------------------------------
// Direct invocations of the three catalogue-reading commands
// ---------------------------------------------------------------------
describe('the guard scans Python under scripts/ (added after the first .py helper landed)', () => {
  // The repository now ships `scripts/db/deploy-path-guard.py`. Before the glob
  // was widened, a Python helper could have run a prohibited command and the
  // guard would have reported success having never read the file — a silent gap
  // rather than a decision.
  it('rejects a prohibited command written as a command string in Python', () => {
    const repo = makeRepo({
      'package.json': pkg({}),
      'scripts/tool.py':
        'import subprocess\nsubprocess.run("npx prisma migrate dev", shell=True)\n',
    });
    const result = runGuard(repo);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain('scripts/tool.py');
  });

  it('still accepts an approved deploy command in a Python helper', () => {
    const repo = makeRepo({
      'package.json': pkg({}),
      'scripts/tool.py':
        'import subprocess\nsubprocess.run("npx prisma migrate deploy", shell=True)\n',
    });
    expect(runGuard(repo).status).toBe(0);
  });

  it('KNOWN LIMIT: an argv-array form is not detected — the guard is textual', () => {
    // `["prisma", "migrate", "dev"]` never contains the two adjacent words the
    // textual pattern looks for. Pinned as a documented limitation rather than
    // left as an untested assumption: a future reader must not believe Python
    // helpers are covered beyond this. The same limit applies to the
    // deployment-path guard.
    const repo = makeRepo({
      'package.json': pkg({}),
      'scripts/tool.py': 'import subprocess\nsubprocess.run(["npx", "prisma", "migrate", "dev"])\n',
    });
    expect(runGuard(repo).status).toBe(0);
  });
});

describe('the guard rejects direct prohibited invocations', () => {
  const prohibited = [
    ['migrate dev', 'prisma migrate dev --name oops'],
    ['migrate reset', 'prisma migrate reset --force'],
    ['db push', 'prisma db push --skip-generate'],
  ] as const;

  it.each(prohibited)('rejects prisma %s', (_label, command) => {
    const repo = makeRepo({ 'scripts/deploy.sh': script(command) });
    const result = runGuard(repo);
    expect(result.status).toBe(1);
  });

  const runners = ['npx prisma', 'pnpm prisma', 'yarn prisma', 'bunx prisma', 'bun prisma'];

  it.each(runners)('rejects the command behind "%s"', (runner) => {
    const repo = makeRepo({ 'scripts/deploy.sh': script(`${runner} migrate dev`) });
    expect(runGuard(repo).status).toBe(1);
  });

  it('rejects a direct path to the binary in node_modules/.bin', () => {
    const repo = makeRepo({
      'scripts/deploy.sh': script('./node_modules/.bin/prisma migrate reset'),
    });
    expect(runGuard(repo).status).toBe(1);
  });

  it('rejects through shell chaining with &&, ; and |', () => {
    // Chaining is not a boundary: the whole logical line is tested.
    for (const line of [
      'echo ok && npx prisma migrate dev',
      'true; prisma migrate reset --force',
      'printf x | prisma db push',
      'false || prisma migrate dev',
    ]) {
      const repo = makeRepo({ 'scripts/deploy.sh': script(line) });
      expect(runGuard(repo).status, `expected rejection of: ${line}`).toBe(1);
    }
  });

  it('rejects across whitespace variation', () => {
    for (const line of [
      'prisma    migrate     dev',
      'prisma\tmigrate\tdev',
      'npx   prisma   migrate   reset',
    ]) {
      const repo = makeRepo({ 'scripts/deploy.sh': script(line) });
      expect(runGuard(repo).status, `expected rejection of: ${line}`).toBe(1);
    }
  });

  it('rejects a command split over a backslash continuation', () => {
    // Line-joining happens before matching, so wrapping is not an evasion.
    const repo = makeRepo({
      'scripts/deploy.sh': '#!/usr/bin/env bash\nprisma migrate \\\n  dev --name oops\n',
    });
    expect(runGuard(repo).status).toBe(1);
  });
});

// ---------------------------------------------------------------------
// 3.2 — migrate diff --from-migrations
// ---------------------------------------------------------------------
describe('the guard rejects migrate diff --from-migrations', () => {
  it('rejects the direct invocation that the old guard missed', () => {
    const repo = makeRepo({
      'scripts/deploy.sh': script(
        'prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script',
      ),
    });
    const result = runGuard(repo);
    expect(result.status).toBe(1);
    expect(result.output).toContain('--from-migrations');
  });

  it('rejects it regardless of argument order', () => {
    for (const line of [
      'prisma migrate diff --from-migrations prisma/migrations --to-schema x.prisma --script',
      'prisma migrate diff --script --from-migrations prisma/migrations --to-schema x.prisma',
      'prisma migrate diff --to-schema x.prisma --from-migrations=prisma/migrations --script',
    ]) {
      const repo = makeRepo({ 'scripts/deploy.sh': script(line) });
      expect(runGuard(repo).status, `expected rejection of: ${line}`).toBe(1);
    }
  });

  it('rejects it behind a package runner and through chaining', () => {
    const repo = makeRepo({
      'scripts/deploy.sh': script(
        'echo start && npx prisma migrate diff --from-migrations prisma/migrations --to-schema x.prisma',
      ),
    });
    expect(runGuard(repo).status).toBe(1);
  });

  it('rejects it through a local wrapper script', () => {
    const repo = makeRepo({
      'package.json': pkg({ 'db:check': 'bash scripts/drift.sh' }),
      'scripts/drift.sh': script(
        'prisma migrate diff --from-migrations prisma/migrations --to-schema x.prisma --script',
      ),
    });
    const result = runGuard(repo);
    expect(result.status).toBe(1);
    expect(result.output).toContain('drift.sh');
  });

  it('still allows the approved schema-to-schema diff on the same line shape', () => {
    // The narrow rule matters: only --from-migrations is prohibited.
    const repo = makeRepo({
      'scripts/deploy.sh': script(
        'prisma migrate diff --from-schema prev.prisma --to-schema next.prisma --script',
      ),
    });
    expect(runGuard(repo).status).toBe(0);
  });
});

// ---------------------------------------------------------------------
// 3.1.1 / 3.1.2 / 3.1.4 — the package.json surface
// ---------------------------------------------------------------------
describe('the guard inspects package.json scripts', () => {
  it('rejects the exact bypass the audit found: db:migrate → migrate dev', () => {
    const repo = makeRepo({ 'package.json': pkg({ 'db:migrate': 'prisma migrate dev' }) });
    const result = runGuard(repo);
    expect(result.status).toBe(1);
    expect(result.output).toContain('package.json');
    expect(result.output).toContain('db:migrate');
  });

  it('rejects --from-migrations invoked through an npm script', () => {
    const repo = makeRepo({
      'package.json': pkg({
        'db:check': 'prisma migrate diff --from-migrations prisma/migrations --to-schema x.prisma',
      }),
    });
    expect(runGuard(repo).status).toBe(1);
  });

  it('follows an npm script that calls another npm script', () => {
    for (const wrapper of ['npm run inner', 'pnpm run inner', 'yarn inner', 'yarn run inner']) {
      const repo = makeRepo({
        'package.json': pkg({ outer: wrapper, inner: 'prisma migrate dev' }),
      });
      expect(runGuard(repo).status, `expected rejection through: ${wrapper}`).toBe(1);
    }
  });

  it('follows a local wrapper script referenced from package.json', () => {
    const repo = makeRepo({
      'package.json': pkg({ 'db:migrate': 'bash scripts/hidden.sh' }),
      'scripts/hidden.sh': script('npx prisma migrate dev --name bypass'),
    });
    const result = runGuard(repo);
    expect(result.status).toBe(1);
    expect(result.output).toContain('hidden.sh');
  });

  it('follows a wrapper that calls a second wrapper', () => {
    // One level of indirection is not "sufficient": a chain must not hide it.
    const repo = makeRepo({
      'package.json': pkg({ 'db:deploy': 'bash scripts/one.sh' }),
      'scripts/one.sh': script('bash scripts/two.sh'),
      'scripts/two.sh': script('prisma migrate reset --force'),
    });
    expect(runGuard(repo).status).toBe(1);
  });

  it('reports the offending file, the script name and the command', () => {
    const repo = makeRepo({ 'package.json': pkg({ 'db:migrate': 'prisma db push' }) });
    const { output } = runGuard(repo);

    // 3.1.6 — a message that does not name the finding cannot be acted on.
    expect(output).toContain('package.json');
    expect(output).toMatch(/scripts\["db:migrate"\]/);
    expect(output).toContain('prisma db push');
    expect(output).toContain('migrate deploy');
  });

  it('tolerates a repository with no package.json at all', () => {
    // The G-3 harness builds bare fixture repos with only scripts/.
    const repo = makeRepo({ 'scripts/deploy.sh': script('prisma migrate deploy') });
    expect(runGuard(repo).status).toBe(0);
  });

  it('fails closed on a malformed package.json', () => {
    // Absence of evidence is not evidence of safety: if the npm surface cannot
    // be read, the guard must not report clean.
    const repo = makeRepo({ 'package.json': '{ not valid json' });
    const result = runGuard(repo);
    expect(result.status).toBe(1);
    expect(result.output).toContain('package.json');
  });
});

// ---------------------------------------------------------------------
// Workflows are scanned directly, but their references are not expanded
// ---------------------------------------------------------------------
describe('workflow files', () => {
  it('are scanned directly, so a prohibited command inside one is rejected', () => {
    const repo = makeRepo({
      '.github/workflows/deploy.yml': [
        'name: deploy',
        'jobs:',
        '  d:',
        '    steps:',
        '      - run: npx prisma migrate dev',
        '',
      ].join('\n'),
    });

    expect(runGuard(repo).status).toBe(1);
  });

  it('do not have their references expanded into the archived G-1 harnesses', () => {
    // g1-experiment-2.yml really does call experiment-2/run.sh, which really
    // does invoke the prohibited command — that is how G-1 was proven FAILED.
    // If references were expanded, the guard would fail on the evidence that
    // justifies its own existence.
    const repo = makeRepo({
      '.github/workflows/g1.yml': [
        'name: g1',
        'jobs:',
        '  g1:',
        '    steps:',
        '      - run: bash docs/database/g1-spike/experiment-2/run.sh',
        '',
      ].join('\n'),
      'docs/database/g1-spike/experiment-2/run.sh': script('npx prisma migrate dev --create-only'),
    });

    const result = runGuard(repo);
    expect(result.status, result.output).toBe(0);
  });
});

// ---------------------------------------------------------------------
// The shipped tree must satisfy its own rule
// ---------------------------------------------------------------------
describe('the real repository', () => {
  it('passes the guard, and the report shows package.json was scanned', () => {
    const result = runGuard(REPO_ROOT);
    expect(result.output).toBeTruthy();
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('package.json');
  });

  it('no longer exposes the prohibited command as an npm script', () => {
    // Belt and braces next to the guard: the audit's bypass was a package.json
    // entry, so assert the entry itself is gone rather than only that the guard
    // would notice it. A passing guard is not proof the entry was removed —
    // it is proof the guard did not find it.
    const pkgText = readFileSync(join(REPO_ROOT, 'package.json'), 'utf8');
    const parsed = JSON.parse(pkgText) as { scripts: Record<string, string> };
    const prohibitedInvocation = /(migrate\s+(dev|reset)|db\s+push)/;

    for (const [name, command] of Object.entries(parsed.scripts)) {
      expect(prohibitedInvocation.test(command), `scripts["${name}"] = ${command}`).toBe(false);
    }
    expect(parsed.scripts['db:migrate']).toBe('bash scripts/db/migrate-disabled.sh');
  });
});
