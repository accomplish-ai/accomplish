import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: true,
  // Native modules must stay external — they are compiled per-platform
  // and loaded from daemon/node_modules/ in the packaged app.
  external: ['better-sqlite3', 'node-pty'],
  // gray-matter (CJS) uses require('fs') etc. — inject a CJS shim so
  // the ESM bundle can handle dynamic require() calls for Node builtins.
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
  // Bundle all JS dependencies so the packaged daemon is self-contained.
  // Only native modules (above) remain as external imports.
  // Baileys + pino are bundled for WhatsApp integration in the daemon.
  noExternal: ['@accomplish_ai/agent-core', 'zod', '@whiskeysockets/baileys', 'pino'],
});
