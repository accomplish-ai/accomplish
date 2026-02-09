import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import path from 'path';
import pkg from './package.json';

// Desktop app with local React UI
// No longer uses remote UI from Vercel

export default defineConfig(() => ({
  plugins: [
    react(),
    electron([
      {
        // Main process entry
        entry: 'src/main/index.ts',
        onstart({ startup }) {
          startup();
        },
        vite: {
          resolve: {
            alias: {
              '@accomplish_ai/agent-core': path.resolve(__dirname, '../../packages/agent-core/src'),
            },
          },
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['electron', 'electron-store', 'keytar', 'node-pty', 'better-sqlite3'],
            },
          },
        },
      },
      {
        // Preload script for local renderer
        entry: 'src/preload/index.ts',
        onstart({ reload }) {
          reload();
        },
        vite: {
          define: {
            'process.env.npm_package_version': JSON.stringify(pkg.version),
          },
          build: {
            outDir: 'dist-electron/preload',
            lib: {
              formats: ['cjs'],
              fileName: (format, entryName) =>
                format === 'cjs' ? `${entryName}.cjs` : `${entryName}.mjs`,
            },
            rollupOptions: {
              external: ['electron'],
              output: {
                inlineDynamicImports: true,
              },
            },
          },
        },
      },
    ]),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@accomplish_ai/agent-core/common': path.resolve(__dirname, '../../packages/agent-core/src/common'),
      '@accomplish_ai/agent-core': path.resolve(__dirname, '../../packages/agent-core/src'),
    },
  },
  // Build the React renderer
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: ['electron', 'electron-store', 'keytar', 'node-pty', 'better-sqlite3'],
    },
  },
  optimizeDeps: {
    exclude: ['electron', 'electron-store', 'keytar', 'node-pty', 'better-sqlite3'],
    // Force exclude in development
    esbuildOptions: {
      external: ['electron', 'electron-store', 'keytar', 'node-pty', 'better-sqlite3'],
    },
  },
}));
