import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      '@accomplish_ai/agent-core': resolve(__dirname, '../../packages/agent-core/src'),
    },
  },
  test: {
    globals: true,
    root: __dirname,
    include: ['__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    testTimeout: 5000,
    hookTimeout: 10000,
  },
});
