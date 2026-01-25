import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@accomplish/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  test: {
    name: 'unit',
    globals: true,
    root: __dirname,
    exclude: ['**/node_modules/**', '**/dist/**', '**/dist-electron/**', '**/release/**'],
    setupFiles: ['__tests__/setup.ts'],
    projects: [
      {
        test: {
          environment: 'node',
          include: ['__tests__/**/*.unit.test.{ts,tsx}'],
          exclude: [
            '__tests__/**/*.renderer.*.unit.test.{ts,tsx}',
            '__tests__/**/renderer/**/*.unit.test.{ts,tsx}',
          ],
        },
      },
      {
        test: {
          environment: 'jsdom',
          include: [
            '__tests__/**/*.renderer.*.unit.test.{ts,tsx}',
            '__tests__/**/renderer/**/*.unit.test.{ts,tsx}',
          ],
        },
      },
    ],
    testTimeout: 5000,
    hookTimeout: 10000,
  },
});
