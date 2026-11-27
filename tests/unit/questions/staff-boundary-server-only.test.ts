/**
 * Phase 04E — `server-only` boundary enforcement for `server/questions/staff-boundary.ts`.
 *
 * Unlike `staff-boundary.test.ts`, this file does NOT mock `server-only`. In a
 * non-`react-server` bundle (jsdom / Client Component graph), importing the
 * staff application boundary must throw immediately when evaluating the module,
 * preventing accidental client-side bundling of staff queries, Prisma or auth
 * session resolution.
 *
 * It also scans every `'use client'` module in `app/`, `components/` and `lib/`
 * to verify no client module references `server/questions/staff-boundary`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === 'generated' || entry.name === 'node_modules' || entry.name === '.next') {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe('staff-boundary server-only protection', () => {
  it('throws immediately if imported outside a react-server environment (Client Component guard)', async () => {
    await expect(import('@/server/questions/staff-boundary')).rejects.toThrow(
      /cannot be imported from a Client Component module/i,
    );
  });

  it("begins with an unconditional `import 'server-only'` statement", () => {
    const source = readFileSync(join(REPO_ROOT, 'server/questions/staff-boundary.ts'), 'utf8');
    const firstNonCommentLine = source
      .split('\n')
      .map((line) => line.trim())
      .find(
        (line) =>
          line.length > 0 &&
          !line.startsWith('//') &&
          !line.startsWith('/*') &&
          !line.startsWith('*'),
      );

    expect(firstNonCommentLine).toBe("import 'server-only';");
  });

  it('is never imported by any `use client` module in the repository', () => {
    const roots = ['app', 'components', 'lib'].map((sub) => join(REPO_ROOT, sub));
    const clientFiles = roots
      .flatMap((dir) => collectSourceFiles(dir))
      .filter((file) => {
        const text = readFileSync(file, 'utf8');
        return /^\s*['"]use client['"]\s*;?/m.test(text);
      });

    // Positive control: the repository actually has at least one Client Component
    // (e.g. components/theme-toggle.tsx, lib/supabase/client.ts), so this check
    // is not vacuously empty.
    expect(clientFiles.length).toBeGreaterThan(0);

    for (const file of clientFiles) {
      const text = readFileSync(file, 'utf8');
      expect(text, `${file} must not import server/questions/staff-boundary`).not.toMatch(
        /server\/questions\/staff-boundary/,
      );
    }
  });
});
