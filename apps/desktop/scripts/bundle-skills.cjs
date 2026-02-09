#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');
const { execSync } = require('child_process');

const skillsDir = path.join(__dirname, '..', '..', '..', 'packages', 'agent-core', 'mcp-tools');

// Skills that have runtime dependencies (playwright) that cannot be bundled
const SKILLS_WITH_RUNTIME_DEPS = ['dev-browser', 'dev-browser-mcp'];

// Skills that are fully bundled (no runtime node_modules needed)
const SKILLS_FULLY_BUNDLED = ['ask-user-question', 'file-permission', 'complete-task', 'start-task'];

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
    name: 'start-task',
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
    nodePaths: [
      path.join(skillDir, 'node_modules'),
      path.join(__dirname, '..', '..', '..', 'node_modules'),
    ],
  });
}

/**
 * For packaged builds, reinstall only production dependencies.
 * - Skills with runtime deps (playwright): npm install --omit=dev
 * - Fully bundled skills: remove node_modules entirely
 */
function reinstallProductionDepsForBundledBuild() {
  for (const skillName of SKILLS_WITH_RUNTIME_DEPS) {
    const skillPath = path.join(skillsDir, skillName);
    const nodeModulesPath = path.join(skillPath, 'node_modules');
    const packageJsonPath = path.join(skillPath, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      console.log(`[bundle-skills] Skipping ${skillName}: no package.json`);
      continue;
    }

    if (fs.existsSync(nodeModulesPath)) {
      fs.rmSync(nodeModulesPath, { recursive: true, force: true });
      console.log(`[bundle-skills] Removed ${nodeModulesPath}`);
    }

    // Note: We don't use --ignore-scripts because playwright needs its postinstall
    // script to download browser binaries
    console.log(`[bundle-skills] Installing production deps for ${skillName}...`);
    try {
      execSync('npm install --omit=dev', {
        cwd: skillPath,
        stdio: 'inherit',
      });
      console.log(`[bundle-skills] Installed production deps for ${skillName}`);
    } catch (error) {
      console.error(`[bundle-skills] Failed to install deps for ${skillName}:`, error.message);
      throw error;
    }
  }

  for (const skillName of SKILLS_FULLY_BUNDLED) {
    const skillPath = path.join(skillsDir, skillName);
    const nodeModulesPath = path.join(skillPath, 'node_modules');

    if (fs.existsSync(nodeModulesPath)) {
      fs.rmSync(nodeModulesPath, { recursive: true, force: true });
      console.log(`[bundle-skills] Removed ${nodeModulesPath} (fully bundled)`);
    }
  }
}

async function main() {
  console.log('[bundle-skills] Starting skill bundling...');
  for (const bundle of bundles) {
    await bundleSkill(bundle);
  }

  const shouldOptimize = process.env.CI === 'true' || process.env.ACCOMPLISH_BUNDLED_MCP === '1';
  if (shouldOptimize) {
    console.log('[bundle-skills] Optimizing skill dependencies for packaged build...');
    reinstallProductionDepsForBundledBuild();
  }

  console.log('[bundle-skills] Done');
}

main().catch((error) => {
  console.error('[bundle-skills] Failed:', error);
  process.exit(1);
});
