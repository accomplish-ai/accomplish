import { defineConfig } from 'vitest/config';

// Tests that import undici 8.x (directly or transitively) will throw at module-load
// time on Node.js < 22 because webidl.util.markAsUncloneable was added in Node 22.
// Exclude them at config level so they don't crash the test runner entirely.
const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
const node22RequiredTests =
  nodeMajor < 22
    ? [
        'tests/unit/providers/ollama.test.ts',
        'tests/unit/providers/tool-support-testing.test.ts',
        'tests/unit/providers/validation.test.ts',
        'tests/unit/utils/fetch.test.ts',
      ]
    : [];

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: ['./tests/globalSetup.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: node22RequiredTests,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/index.ts'],
    },
  },
});
