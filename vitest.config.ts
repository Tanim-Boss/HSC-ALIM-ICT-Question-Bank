import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Unit & component test foundation (Vitest + React Testing Library).
 * Integration tests against an isolated PostgreSQL database land in
 * tests/integration once a schema is approved (see docs/development/testing-strategy.md).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'lib/generated', '.next'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['lib/**/*.ts', 'components/**/*.tsx'],
      exclude: ['lib/generated/**'],
    },
  },
});
