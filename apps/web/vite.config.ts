import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vite plugin: compile theme-core.ts → public/theme-init.js as an IIFE.
 * Runs at the start of every build (dev + production) so the early-boot script
 * is always in sync with the TypeScript source.
 */
function buildThemeInit(): import('vite').Plugin {
  const outfile = path.resolve(__dirname, 'public/theme-init.js');

  async function generate() {
    await esbuild.build({
      stdin: {
        contents: `import { initEarlyTheme } from './src/client/lib/theme-core.ts'; initEarlyTheme();`,
        resolveDir: __dirname,
        loader: 'ts',
      },
      bundle: true,
      format: 'iife',
      outfile,
      platform: 'browser',
      minify: false,
    });
  }

  return {
    name: 'build-theme-init',
    // Production build
    async buildStart() {
      await generate();
    },
    // Dev server: generate before static middleware serves requests
    configureServer(server) {
      const pending = generate().catch((e) => {
        server.config.logger.error(`[build-theme-init] Failed to generate theme-init.js: ${e}`);
      });
      server.middlewares.use('/theme-init.js', async (_req, _res, next) => {
        await pending;
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [buildThemeInit(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/client'),
      '@accomplish_ai/agent-core/common': path.resolve(
        __dirname,
        '../../packages/agent-core/src/common',
      ),
      // IMPORTANT: In the web (browser) build, resolve the root entrypoint to
      // the browser-safe common.ts surface. The full index.ts pulls in Node-only
      // modules (node-pty, events) via OpenCodeAdapter that crash in the browser.
      // Web code should only use types from agent-core — all re-exported from common.ts.
      '@accomplish_ai/agent-core': path.resolve(__dirname, '../../packages/agent-core/src/common'),
      '@locales': path.resolve(__dirname, 'locales'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  base: './',
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    rollupOptions: {
      // AWS SDK packages are Node.js-only (main process) and must not be
      // bundled into the browser build. Rolldown >= rc.10 resolves these to
      // their browser bundles which omit Node-only exports (e.g. fromIni).
      external: [/^@aws-sdk\//],
    },
  },
});
