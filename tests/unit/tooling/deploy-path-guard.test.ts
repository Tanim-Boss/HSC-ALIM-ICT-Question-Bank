/**
 * Regression suite for `scripts/db/deploy-path-guard.py`.
 *
 * THE CONTROL THIS PINS
 *
 * The checksum gate (`scripts/db/deploy-gate.sh`) only protects deployments that
 * go through it. A new package script, wrapper, workflow step or harness that
 * called `prisma migrate deploy` directly would deploy without verification, and
 * every existing test would stay green. This guard fails the build instead.
 *
 * WHAT IS ASSERTED
 *
 *   · the real repository passes;
 *   · a direct invocation anywhere — npm script, file under `scripts/`, workflow
 *     step, wrapper chain — fails;
 *   · the approved gate must stay wired (`db:deploy`), must still invoke the
 *     authoritative `guard.py … history` check, and must run it BEFORE deploying;
 *   · every exception is narrow: exact path, exact count. Copying an excepted
 *     harness to a new path fails; adding an invocation to it fails; a stale
 *     entry fails; and each exception's allowance equals its real usage, so no
 *     entry is slack;
 *   · prose cannot be used either way: a mention inside a comment, a quoted
 *     string or a human-readable heredoc is not flagged, while an `eval`/
 *     `bash -c` form and a heredoc that writes an executable script ARE.
 *
 * Fixtures are throwaway repositories; the guard is invoked with an explicit root,
 * so no fixture can affect the real tree.
 */

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();
const GUARD = join(REPO_ROOT, 'scripts/db/deploy-path-guard.py');

const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

interface Result {
  readonly status: number | null;
  readonly out: string;
}

function runGuard(root: string): Result {
  const result = spawnSync('python3', [GUARD, root], { encoding: 'utf8' });
  return {
    status: result.status,
    out: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

/** The real exception set, read from the guard so there is no second copy. */
function exceptions(): Record<string, number> {
  const result = spawnSync('python3', [GUARD, '--print-exceptions'], { encoding: 'utf8' });
  return JSON.parse(result.stdout) as Record<string, number>;
}

/** A minimal, valid gate: verification first, deploy second. */
const APPROVED_GATE = `#!/usr/bin/env bash
set -Eeuo pipefail
python3 docs/database/g1-spike/option-c/guard.py history /tmp/history.json prisma/migrations
exec npx prisma migrate deploy
`;

interface FixtureOptions {
  readonly scripts?: Record<string, string>;
  readonly gate?: string;
  readonly packageJson?: string;
  /** path -> file body, relative to the fixture root. */
  readonly files?: Record<string, string>;
  /** Omit the exception harness files to exercise stale-entry handling. */
  readonly withExceptions?: boolean;
}

/**
 * Builds a throwaway repository that passes by default, so each test can change
 * exactly one thing.
 */
function fixture(options: FixtureOptions = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'deploy-path-guard-'));
  created.push(root);

  const write = (relative: string, body: string) => {
    const target = join(root, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body, 'utf8');
  };

  write(
    'package.json',
    options.packageJson ??
      JSON.stringify(
        {
          name: 'fixture',
          scripts: {
            'db:deploy': 'bash scripts/db/deploy-gate.sh deploy',
            'db:verify-history': 'bash scripts/db/deploy-gate.sh verify',
            ...options.scripts,
          },
        },
        null,
        2,
      ),
  );
  write('scripts/db/deploy-gate.sh', options.gate ?? APPROVED_GATE);

  if (options.withExceptions !== false) {
    for (const [relative, count] of Object.entries(exceptions())) {
      // A harness whose deploy count is exactly what its exception allows.
      const body = `#!/usr/bin/env bash\n${Array.from(
        { length: count },
        (_, index) => `prisma run ${String(index)} migrate deploy --config x.ts\n`,
      ).join('')}`;
      write(relative, body);
    }
  }

  for (const [relative, body] of Object.entries(options.files ?? {})) write(relative, body);
  return root;
}

describe('the real repository', () => {
  it('passes and reports the approved gate', () => {
    const result = runGuard(REPO_ROOT);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('goes through the checksum gate');
    expect(result.out).toContain('approved gate: 2 deploy invocation(s)');
  });

  it('states what it does not cover rather than implying complete coverage', () => {
    const result = runGuard(REPO_ROOT);
    expect(result.out).toContain('a human typing a deploy in a terminal');
    expect(result.out).toContain('raw-SQL paths without Prisma history');
  });

  it('sizes every exception to its real usage — no slack, no stale entry', () => {
    const allowed = exceptions();
    expect(Object.keys(allowed).length).toBeGreaterThan(0);
    // The guard fails on a stale entry and on an over-used one; this asserts the
    // third case, an allowance larger than actual use, by comparing the count it
    // reports with the sum of the allowances.
    const result = runGuard(REPO_ROOT);
    const reported =
      /explicit counted exceptions: (\d+) harness file\(s\), (\d+) invocation\(s\)/.exec(
        result.out,
      );
    expect(reported).not.toBeNull();
    const totalAllowed = Object.values(allowed).reduce((sum, n) => sum + n, 0);
    expect(Number(reported?.[2])).toBe(totalAllowed);
  });
});

describe('direct deployment paths are refused', () => {
  it('refuses a new npm script that deploys directly', () => {
    const root = fixture({ scripts: { 'db:deploy-fast': 'prisma migrate deploy' } });
    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.out).toContain('db:deploy-fast');
  });

  it('refuses npx/prisma binary forms in an npm script', () => {
    const root = fixture({
      scripts: { ship: 'npx prisma migrate deploy --config prisma.config.ts' },
    });
    expect(runGuard(root).status).toBe(1);
  });

  it('refuses a file under scripts/ that deploys directly', () => {
    const root = fixture({
      files: { 'scripts/deploy.sh': '#!/usr/bin/env bash\nprisma migrate deploy\n' },
    });
    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.out).toContain('scripts/deploy.sh');
  });

  it('refuses a workflow step that deploys directly', () => {
    const root = fixture({
      files: {
        '.github/workflows/deploy.yml':
          'name: deploy\njobs:\n  d:\n    steps:\n      - run: node_modules/.bin/prisma migrate deploy\n',
      },
    });
    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.out).toContain('.github/workflows/deploy.yml');
  });

  it('refuses a wrapper chain: a.sh calls b.sh which deploys', () => {
    const root = fixture({
      files: {
        'scripts/a.sh': '#!/usr/bin/env bash\nbash scripts/b.sh\n',
        'scripts/b.sh': '#!/usr/bin/env bash\n"$PRISMA_BIN" migrate deploy\n',
      },
    });
    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.out).toContain('scripts/b.sh');
  });

  it('refuses a Python caller that shells out', () => {
    const root = fixture({
      files: {
        'scripts/ship.py':
          'import subprocess\nsubprocess.run("prisma migrate deploy", shell=True)\n',
      },
    });
    // A shelled-out command is a string, but `shell=True` is the evaluated form.
    expect(runGuard(root).status).toBe(1);
  });
});

describe('the approved gate must stay wired and must verify first', () => {
  it('refuses when db:deploy no longer routes through the gate', () => {
    const root = fixture({ scripts: { 'db:deploy': 'prisma migrate deploy' } });
    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.out).toContain('db:deploy');
  });

  it('refuses when db:verify-history is removed', () => {
    const root = fixture();
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    delete pkg.scripts['db:verify-history'];
    writeFileSync(join(root, 'package.json'), JSON.stringify(pkg), 'utf8');
    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.out).toContain('db:verify-history');
  });

  it('refuses a gate that stopped invoking the authoritative utility', () => {
    const root = fixture({ gate: '#!/usr/bin/env bash\nexec npx prisma migrate deploy\n' });
    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.out).toContain('guard.py');
  });

  it('refuses a gate that deploys before it verifies', () => {
    const root = fixture({
      gate: '#!/usr/bin/env bash\nexec npx prisma migrate deploy\npython3 docs/database/g1-spike/option-c/guard.py history /tmp/h.json prisma/migrations\n',
    });
    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.out).toContain('comes after the deploy invocation');
  });

  it('refuses a gate that multiplies deploy invocations', () => {
    const root = fixture({
      gate:
        '#!/usr/bin/env bash\npython3 docs/database/g1-spike/option-c/guard.py history /tmp/h.json prisma/migrations\n' +
        'npx prisma migrate deploy\nnpx prisma migrate deploy\nnpx prisma migrate deploy\n',
    });
    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.out).toContain('deploy invocations');
  });
});

describe('exceptions are narrow and cannot become a general bypass', () => {
  it('allows a harness at exactly its excepted path', () => {
    expect(runGuard(fixture()).status).toBe(0);
  });

  it('refuses the same harness content at a new path', () => {
    const allowed = exceptions();
    const [relative, count] = Object.entries(allowed)[0] as [string, number];
    const body = Array.from({ length: count }, () => 'prisma migrate deploy --config x.ts\n').join(
      '',
    );
    const root = fixture({ files: { 'scripts/copy-of-harness.sh': body } });
    // Sanity: the original path is the exempt one, the copy is not.
    expect(existsSync(join(root, relative))).toBe(true);
    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.out).toContain('scripts/copy-of-harness.sh');
  });

  it('refuses one extra invocation inside an excepted harness', () => {
    const allowed = exceptions();
    const [relative, count] = Object.entries(allowed)[0] as [string, number];
    const root = fixture({
      files: {
        [relative]: Array.from({ length: count + 1 }, () => 'prisma migrate deploy\n').join(''),
      },
    });
    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.out).toContain('A wider exception must be reviewed');
  });

  it('refuses a stale exception entry', () => {
    const root = fixture({ withExceptions: false });
    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.out).toContain('stale entry');
  });
});

describe('prose is not an invocation, but evaluated text is', () => {
  it('ignores comments, quoted strings and human-readable heredocs', () => {
    const root = fixture({
      files: {
        'scripts/prose.sh': [
          '#!/usr/bin/env bash',
          '# prisma migrate deploy is what the gate runs',
          'echo "the gate runs prisma migrate deploy"',
          'fail "prisma migrate deploy failed"',
          "cat >&2 <<'USAGE'",
          'usage: this gate runs prisma migrate deploy',
          'USAGE',
          '',
        ].join('\n'),
      },
    });
    expect(runGuard(root).status).toBe(0);
  });

  it('counts a match hidden behind eval or bash -c', () => {
    const root = fixture({
      files: {
        'scripts/eval.sh': '#!/usr/bin/env bash\neval "prisma migrate deploy"\n',
        'scripts/bashc.sh': '#!/usr/bin/env bash\nbash -c "prisma migrate deploy"\n',
      },
    });
    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.out).toContain('scripts/eval.sh');
    expect(result.out).toContain('scripts/bashc.sh');
  });

  it('counts a heredoc that writes an executable script', () => {
    const root = fixture({
      files: {
        'scripts/generate.sh':
          '#!/usr/bin/env bash\ncat > scripts/generated.sh <<\u0027EOF\u0027\nprisma migrate deploy\nEOF\n',
      },
    });
    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.out).toContain('scripts/generate.sh');
  });
});

describe('the guard fails closed when it cannot decide', () => {
  it('exits 2 on an unparsable package.json', () => {
    const root = fixture({ packageJson: '{ not json' });
    const result = runGuard(root);
    expect(result.status).toBe(2);
    expect(result.out).toContain('UNVERIFIABLE');
  });

  it('exits 2 when the approved gate file is missing', () => {
    const root = fixture();
    rmSync(join(root, 'scripts/db/deploy-gate.sh'));
    const result = runGuard(root);
    expect(result.status).toBe(2);
    expect(result.out).toContain('approved gate');
  });

  it('exits 2 when package.json is missing', () => {
    const root = fixture();
    rmSync(join(root, 'package.json'));
    expect(runGuard(root).status).toBe(2);
  });
});

// Keep the file executable bit meaningful for humans running it directly.
describe('the guard script itself', () => {
  it('is executable', () => {
    chmodSync(GUARD, 0o755);
    expect(existsSync(GUARD)).toBe(true);
  });
});
