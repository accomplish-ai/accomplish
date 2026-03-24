import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, 'src/main'),
      '@accomplish_ai/agent-core/common': path.resolve(
        __dirname,
        '../../packages/agent-core/src/common',
      ),
      '@accomplish_ai/agent-core': path.resolve(__dirname, '../../packages/agent-core/src'),
    },
  },
  test: {
    name: 'unit',
    globals: true,
    root: __dirname,
    include: ['__tests__/**/*.unit.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/dist-electron/**', '**/release/**'],
    setupFiles: ['__tests__/setup.ts'],
    environment: 'node',
    testTimeout: 5000,
    hookTimeout: 10000,
  },
});
