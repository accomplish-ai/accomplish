import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Shared resolve configuration for all projects
const resolveConfig = {
  alias: {
    '@': path.resolve(__dirname, 'src/renderer'),
    '@main': path.resolve(__dirname, 'src/main'),
    '@renderer': path.resolve(__dirname, 'src/renderer'),
    '@shared': path.resolve(__dirname, '../../packages/shared/src'),
    '@accomplish/shared': path.resolve(__dirname, '../../packages/shared/src'),
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: resolveConfig,
  test: {
    name: 'integration',
    globals: true,
    root: __dirname,
    exclude: ['**/node_modules/**', '**/dist/**', '**/dist-electron/**', '**/release/**'],
    setupFiles: ['__tests__/setup.ts'],
    projects: [
      {
        resolve: resolveConfig,
        test: {
          environment: 'node',
          include: ['__tests__/**/*.integration.test.{ts,tsx}'],
          exclude: [
            '__tests__/**/*.renderer.*.integration.test.{ts,tsx}',
            '__tests__/**/renderer/**/*.integration.test.{ts,tsx}',
          ],
          setupFiles: ['__tests__/setup.ts'],
        },
      },
      {
        plugins: [react()],
        resolve: resolveConfig,
        test: {
          environment: 'happy-dom',
          include: [
            '__tests__/**/*.renderer.*.integration.test.{ts,tsx}',
            '__tests__/**/renderer/**/*.integration.test.{ts,tsx}',
          ],
          setupFiles: ['__tests__/setup.ts'],
        },
      },
    ],
    // Integration tests may need longer timeouts
    testTimeout: 10000,
    hookTimeout: 15000,
  },
});
