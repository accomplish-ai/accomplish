import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/client'),
      '@accomplish_ai/agent-core/common': path.resolve(
        __dirname,
        '../../packages/agent-core/src/common',
      ),
      '@accomplish_ai/agent-core': path.resolve(__dirname, '../../packages/agent-core/src'),
      '@locales': path.resolve(__dirname, 'locales'),
    },
  },
  test: {
    name: 'integration',
    globals: true,
    root: __dirname,
    include: ['__tests__/**/*.integration.test.{ts,tsx}'],
    setupFiles: ['__tests__/setup.ts'],
    environment: 'jsdom',
    testTimeout: 10000,
    hookTimeout: 15000,
  },
});
