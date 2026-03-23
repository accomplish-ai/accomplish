import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import path from 'path';
import { builtinModules } from 'module';
import { fileURLToPath } from 'url';
import esbuild from 'esbuild';
import pkg from './package.json';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nodeExternals = [...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

// Externalize all node_modules — only bundle local source files.
// Vite 8 (rolldown) does not auto-convert CJS require() to ESM imports,
// so any bundled third-party package that internally calls require() for
// Node built-ins will fail at runtime in an ESM context.
// Workspace packages (@accomplish_ai/*) are aliased to local source and must be bundled.
const externalizeNodeModules = (id: string) => {
  if (id.startsWith('@accomplish_ai/') || id.startsWith('@main/')) {
    return false;
  }
  return !id.startsWith('.') && !id.startsWith('/') && !id.includes('\0') && !path.isAbsolute(id);
};

/**
 * Compile theme-core.ts → public/theme-init.js for the desktop renderer dev server.
 * Mirrors the same plugin in apps/web/vite.config.ts.
 */
function buildThemeInit(): import('vite').Plugin {
  const outfile = path.resolve(__dirname, 'public/theme-init.js');

  async function generate() {
    await esbuild.build({
      stdin: {
        contents: `import { initEarlyTheme } from '../web/src/client/lib/theme-core.ts'; initEarlyTheme();`,
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
    async buildStart() {
      await generate();
    },
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

/**
 * Compile daemon/entry.ts → out/main/daemon/entry.cjs as CJS.
 * The daemon is fork()ed by the Electron main process as a plain Node.js child process.
 * It must be CJS and use a .cjs extension because apps/desktop has "type":"module" in package.json.
 */
function buildDaemonEntry(): import('vite').Plugin {
  const outfile = path.resolve(__dirname, 'out/main/daemon/entry.cjs');
  const agentCoreSrc = path.resolve(__dirname, '../../packages/agent-core/src/index.ts');

  async function generate() {
    await esbuild.build({
      entryPoints: [path.resolve(__dirname, 'src/main/daemon/entry.ts')],
      bundle: true,
      format: 'cjs',
      outfile,
      platform: 'node',
      target: 'node20',
      sourcemap: true,
      plugins: [
        {
          name: 'externalize-node-modules',
          setup(build) {
            // Bundle @accomplish_ai workspace packages; externalize everything else.
            build.onResolve({ filter: /^[^./]/ }, (args) => {
              if (args.path.startsWith('@accomplish_ai/')) {
                return null; // let esbuild resolve and bundle
              }
              return { path: args.path, external: true };
            });
          },
        },
      ],
      alias: {
        '@accomplish_ai/agent-core': agentCoreSrc,
      },
    });
  }

  return {
    name: 'build-daemon-entry',
    async buildStart() {
      await generate();
    },
  };
}

export default defineConfig(() => ({
  plugins: [
    buildThemeInit(),
    buildDaemonEntry(),
    electron([
      {
        entry: 'src/main/index.ts',
        onstart({ startup }) {
          const inspectArg = process.env.ELECTRON_DEBUG
            ? `--inspect=${process.env.ELECTRON_DEBUG_PORT || '9229'}`
            : undefined;
          const argv = ['.', '--no-sandbox', ...(inspectArg ? [inspectArg] : [])];
          startup(argv);
        },
        vite: {
          resolve: {
            alias: {
              '@main': path.resolve(__dirname, 'src/main'),
              '@accomplish_ai/agent-core': path.resolve(__dirname, '../../packages/agent-core/src'),
            },
          },
          build: {
            sourcemap: true,
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: externalizeNodeModules,
            },
          },
        },
      },
      {
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
              entry: 'src/preload/index.ts',
              formats: ['cjs'],
              fileName: (format, entryName) =>
                format === 'cjs' ? `${entryName}.cjs` : `${entryName}.mjs`,
            },
            rollupOptions: {
              external: ['electron', ...nodeExternals],
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
      '@main': path.resolve(__dirname, 'src/main'),
      '@accomplish_ai/agent-core/common': path.resolve(
        __dirname,
        '../../packages/agent-core/src/common',
      ),
      '@accomplish_ai/agent-core': path.resolve(__dirname, '../../packages/agent-core/src'),
    },
  },
}));
