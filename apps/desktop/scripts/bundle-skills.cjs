#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const skillsDir = path.join(__dirname, '..', 'skills');

const bundles = [
  {
    name: 'ask-user-question',
    entry: 'src/index.ts',
    outfile: 'dist/index.mjs',
  },
  {
    name: 'file-permission',
    entry: 'src/index.ts',
    outfile: 'dist/index.mjs',
  },
  {
    name: 'complete-task',
    entry: 'src/index.ts',
    outfile: 'dist/index.mjs',
  },
  {
    name: 'dev-browser-mcp',
    entry: 'src/index.ts',
    outfile: 'dist/index.mjs',
    external: ['playwright'],
  },
  {
    name: 'dev-browser',
    entry: 'scripts/start-server.ts',
    outfile: 'dist/start-server.mjs',
    external: ['playwright'],
    banner: true,
  },
  {
    name: 'dev-browser',
    entry: 'scripts/start-relay.ts',
    outfile: 'dist/start-relay.mjs',
    external: ['playwright'],
    banner: true,
  },
];

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function bundleSkill({ name, entry, outfile, external = [], banner: needsBanner }) {
  const skillDir = path.join(skillsDir, name);
  const absEntry = path.join(skillDir, entry);
  const absOutfile = path.join(skillDir, outfile);
  const tsconfigPath = path.join(skillDir, 'tsconfig.json');

  ensureDir(path.dirname(absOutfile));

  if (!fs.existsSync(absEntry)) {
    throw new Error(`Entry not found for ${name}: ${absEntry}`);
  }

  console.log(`[bundle-skills] Bundling ${name}: ${entry} -> ${outfile}`);

  await esbuild.build({
    entryPoints: [absEntry],
    outfile: absOutfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    ...(needsBanner && {
      banner: {
        js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
    }),
    target: 'node20',
    sourcemap: false,
    logLevel: 'info',
    external,
    absWorkingDir: skillDir,
    tsconfig: fs.existsSync(tsconfigPath) ? tsconfigPath : undefined,
  });
}

function prunePerSkillNodeModules() {
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(skillsDir, entry.name);
    const nodeModulesPath = path.join(skillPath, 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
      fs.rmSync(nodeModulesPath, { recursive: true, force: true });
      console.log(`[bundle-skills] Removed ${nodeModulesPath}`);
    }
  }
}

async function main() {
  console.log('[bundle-skills] Starting skill bundling...');
  for (const bundle of bundles) {
    await bundleSkill(bundle);
  }

  const shouldPrune = process.env.CI === 'true' || process.env.OPENWORK_BUNDLED_SKILLS === '1';
  if (shouldPrune) {
    console.log('[bundle-skills] Pruning per-skill node_modules for packaged build');
    prunePerSkillNodeModules();
  }

  console.log('[bundle-skills] Done');
}

main().catch((error) => {
  console.error('[bundle-skills] Failed:', error);
  process.exit(1);
});
