import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Design-token parity guard.
 *
 * The approved design system (README §17 + docs/design/tokens.json) is the
 * single source of truth. These checks fail loudly if the CSS custom
 * properties in app/globals.css drift from the approved palette, or if
 * components start hardcoding hex values.
 */

const repoRoot = join(__dirname, '..', '..');
const read = (relative: string) => readFileSync(join(repoRoot, relative), 'utf8');

interface TokensFile {
  color: {
    palette: {
      light: Record<string, { $value: string }>;
      dark: Record<string, { $value: string }>;
      shared: Record<string, { $value: string }>;
    };
  };
}

const tokens = JSON.parse(read('docs/design/tokens.json')) as TokensFile;
const globals = read('app/globals.css');

const hexToRgbTriplet = (hex: string) => {
  const normalized = hex.replace('#', '');
  return [0, 2, 4].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16)).join(' ');
};

const themeBlock = (() => {
  const darkStart = globals.indexOf('.dark {');
  if (darkStart === -1) {
    throw new Error('app/globals.css is missing the .dark theme block');
  }
  return { light: globals.slice(0, darkStart), dark: globals.slice(darkStart) };
})();

// tokens.json palette key -> CSS variable name (documented in tokens.json cssVariable extensions)
const lightVariables: Record<string, string> = {
  canvas: '--canvas',
  surface: '--surface',
  ink: '--ink',
  muted: '--muted',
  mutedStrong: '--muted-strong',
  border: '--border',
  teal: '--teal',
  tealTint: '--teal-tint',
  amber: '--amber',
  red: '--red',
};

const darkVariables: Record<string, string> = { ...lightVariables }; // same names in both themes
delete (darkVariables as Record<string, string>).mutedStrong; // dark strong == muted (approved mirror)

describe('globals.css primitive tokens match tokens.json (light)', () => {
  for (const [paletteKey, variable] of Object.entries(lightVariables)) {
    it(`${variable} mirrors ${paletteKey}`, () => {
      const expected = hexToRgbTriplet(tokens.color.palette.light[paletteKey]!.$value);
      expect(themeBlock.light).toContain(`${variable}: ${expected};`);
    });
  }
});

describe('globals.css primitive tokens match tokens.json (dark)', () => {
  for (const [paletteKey, variable] of Object.entries(darkVariables)) {
    it(`${variable} mirrors ${paletteKey}`, () => {
      const expected = hexToRgbTriplet(tokens.color.palette.dark[paletteKey]!.$value);
      expect(themeBlock.dark).toContain(`${variable}: ${expected};`);
    });
  }

  it('--muted-strong mirrors dark muted (documented dark simplification)', () => {
    const expected = hexToRgbTriplet(tokens.color.palette.dark.muted!.$value);
    expect(themeBlock.dark).toContain(`--muted-strong: ${expected};`);
  });
});

describe('shared constants are identical in both themes', () => {
  const expectedElevated = hexToRgbTriplet(tokens.color.palette.shared.elevated!.$value);
  const expectedAccent = hexToRgbTriplet(tokens.color.palette.shared.accent!.$value);
  const expectedCodeInk = hexToRgbTriplet(tokens.color.palette.shared.codeInk!.$value);

  it.each([expectedElevated, expectedAccent, expectedCodeInk])('constant %s appears in both themes', (value) => {
    expect(themeBlock.light).toContain(value);
    expect(themeBlock.dark).toContain(value);
  });
});

describe('no raw hex colours in application components', () => {
  // app/layout.tsx carries hex values in viewport themeColor metadata — that is
  // intentional and not component styling, so it is excluded from this scan.
  const filesToScan = ['app/page.tsx', 'components/theme-toggle.tsx'];
  const hexPattern = /#[0-9a-fA-F]{3,8}\b/;

  for (const file of filesToScan) {
    it(`${file} contains no hex literals`, () => {
      expect(read(file)).not.toMatch(hexPattern);
    });
  }
});

describe('tailwind.config.ts keeps the approved mapping strategy', () => {
  it('uses the .dark class strategy and rgb(var()) alpha-aware colours', async () => {
    const configModule = await import('../../tailwind.config');
    const config = configModule.default;
    expect(config.darkMode).toBe('class');
    const colors = (config.theme?.extend?.colors ?? {}) as Record<string, unknown>;
    for (const key of [
      'canvas',
      'surface',
      'elevated',
      'ink',
      'muted',
      'border',
      'teal',
      'amber',
      'red',
      'accent',
      'code-surface',
      'code-ink',
      'focus',
    ]) {
      expect(colors, `missing color token "${key}"`).toHaveProperty(key);
    }
  });
});
