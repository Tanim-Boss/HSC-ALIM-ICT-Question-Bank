import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  // Generated code and build output are not linted.
  {
    ignores: ['lib/generated/**', '.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts'],
  },
  ...nextVitals,
  ...nextTypescript,
  // Prettier owns formatting; ESLint focuses on defects.
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The `server-only` package already makes importing lib/db.ts,
      // lib/supabase/server.ts or lib/auth/session.ts from a Client Component
      // a build-time error — that boundary is enforced by Next.js, not by lint.
    },
  },
];

export default config;
