import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import path from 'path';

// Desktop app with local React UI
// No longer uses remote UI from Vercel

// Multi-agent support: calculate port offset from AGENT_ID env var
const agentId = parseInt(process.env.AGENT_ID || '1', 10);
const portOffset = (agentId - 1) * 10;

export default defineConfig(() => ({
  server: {
    port: 5173 + portOffset,
  },
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
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['electron', 'electron-store', 'keytar', 'node-pty'],
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
      '@shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  // Build the React renderer
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}));
