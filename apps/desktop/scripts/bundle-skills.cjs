#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');
const { execSync } = require('child_process');

const VALID_MODES = new Set(['dev', 'package']);

function getBuildMode() {
  const cliMode = process.argv.find((arg) => arg.startsWith('--mode='))?.slice('--mode='.length);
  const envMode = process.env.BUNDLE_SKILLS_MODE;
  const mode = cliMode || envMode || 'dev';

  if (!VALID_MODES.has(mode)) {
    throw new Error(`[bundle-skills] Invalid mode "${mode}". Use --mode=dev or --mode=package.`);
  }

  return mode;
}

const buildMode = getBuildMode();

const skillsDir = path.join(
  __dirname,
  '..',
  'node_modules',
  '@accomplish_ai',
  'agent-core',
  'mcp-tools',
);

// Skills that have runtime dependencies (playwright) that cannot be bundled
const SKILLS_WITH_RUNTIME_DEPS = ['dev-browser', 'dev-browser-mcp', 'gws-mcp'];

// Skills that are fully bundled (no runtime node_modules needed)
const SKILLS_FULLY_BUNDLED = [
  'ask-user-question',
  'file-permission',
  'complete-task',
  'request-connector-auth',
  'start-task',
  'desktop-control',
  'whatsapp',
  'request-google-file-picker',
];

// Skills that need googleapis at runtime — bundle JS but mark googleapis as external
const SKILLS_WITH_GOOGLEAPIS = ['gmail-mcp', 'calendar-mcp'];

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
    name: 'request-connector-auth',
    entry: 'src/index.ts',
    outfile: 'dist/index.mjs',
  },
  {
    name: 'start-task',
    entry: 'src/index.ts',
    outfile: 'dist/index.mjs',
  },
  {
    name: 'desktop-control',
    entry: 'src/index.ts',
    outfile: 'dist/index.mjs',
  },
  {
    name: 'whatsapp',
    entry: 'src/index.ts',
    outfile: 'dist/index.mjs',
  },
  {
    // gmail-mcp uses googleapis at runtime — bundle JS but mark googleapis as external
    name: 'gmail-mcp',
    entry: 'src/index.ts',
    outfile: 'dist/index.mjs',
    external: ['googleapis'],
  },
  {
    // calendar-mcp uses googleapis at runtime — bundle JS but mark googleapis as external
    name: 'calendar-mcp',
    entry: 'src/index.ts',
    outfile: 'dist/index.mjs',
    external: ['googleapis'],
  },
  {
    name: 'request-google-file-picker',
    entry: 'src/index.ts',
    outfile: 'dist/index.mjs',
  },
  {
    // gws-mcp requires @googleworkspace/cli at runtime (native binary).
    // Bundle the JS wrapper but leave the CLI package as external.
    name: 'gws-mcp',
    entry: 'src/index.ts',
    outfile: 'dist/index.mjs',
    external: ['@googleworkspace/cli'],
  },
  {
    name: 'dev-browser-mcp',
    entry: 'src/index.ts',
    outfile: 'dist/index.mjs',
    external: ['playwright'],
  },
  {
    // Main HTTP server — output as ESM (.mjs) since start-server.ts uses top-level await
    // and import.meta.url which are incompatible with CJS format.
    // Referenced by packages/agent-core/src/browser/server.ts via hardcoded path.
    // Entry must be start-server.ts (calls serve() + keeps process alive), NOT src/index.ts
    // (which only exports serve without calling it — causes immediate exit with no listener).
    name: 'dev-browser',
    entry: 'scripts/start-server.ts',
    outfile: 'server.mjs',
    external: ['playwright'],
    banner: true,
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

function validateSkillDependencyCategories() {
  const bundledSkillNames = new Set(bundles.map((bundle) => bundle.name));
  const categorizedSkillNames = new Set([
    ...SKILLS_WITH_RUNTIME_DEPS,
    ...SKILLS_FULLY_BUNDLED,
    ...SKILLS_WITH_GOOGLEAPIS,
  ]);
  const uncategorizedSkills = [...bundledSkillNames].filter(
    (skillName) => !categorizedSkillNames.has(skillName),
  );

  if (uncategorizedSkills.length > 0) {
    throw new Error(
      `[bundle-skills] Skills missing dependency categorization: ${uncategorizedSkills.join(', ')}`,
    );
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function verifyBundleOutputs() {
  const missing = [];
  for (const { name, outfile } of bundles) {
    const outputPath = path.join(skillsDir, name, outfile);
    if (!fs.existsSync(outputPath)) {
      missing.push(outputPath);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[bundle-skills] Missing bundled outputs:\n${missing.map((p) => `  - ${p}`).join('\n')}`,
    );
  }
}

async function bundleSkill({
  name,
  entry,
  outfile,
  external = [],
  banner: needsBanner,
  format: outputFormat,
}) {
  const skillDir = path.join(skillsDir, name);
  const absEntry = path.join(skillDir, entry);
  const absOutfile = path.join(skillDir, outfile);
  const tsconfigPath = path.join(skillDir, 'tsconfig.json');

  ensureDir(path.dirname(absOutfile));

  if (!fs.existsSync(absEntry)) {
    // Source not available (e.g. using pre-built npm package) — skip if dist already exists
    if (fs.existsSync(absOutfile)) {
      console.log(
        `[bundle-skills] Skipping ${name}: source not found but dist exists at ${absOutfile}`,
      );
      return;
    }
    throw new Error(`Entry not found for ${name}: ${absEntry}`);
  }

  console.log(`[bundle-skills] Bundling ${name}: ${entry} -> ${outfile}`);

  await esbuild.build({
    entryPoints: [absEntry],
    outfile: absOutfile,
    bundle: true,
    platform: 'node',
    format: outputFormat || 'esm',
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

  // Skills with googleapis as external dep: keep production node_modules (googleapis only)
  for (const skillName of SKILLS_WITH_GOOGLEAPIS) {
    const skillPath = path.join(skillsDir, skillName);
    const packageJsonPath = path.join(skillPath, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      console.log(`[bundle-skills] Skipping ${skillName}: no package.json`);
      continue;
    }

    console.log(`[bundle-skills] Installing production deps for ${skillName} (googleapis)...`);
    try {
      execSync('npm install --omit=dev --ignore-scripts', {
        cwd: skillPath,
        stdio: 'inherit',
      });
      console.log(`[bundle-skills] Installed production deps for ${skillName}`);
    } catch (error) {
      console.error(`[bundle-skills] Failed to install deps for ${skillName}:`, error.message);
      throw error;
    }
  }
}

async function main() {
  if (!fs.existsSync(skillsDir)) {
    throw new Error(`[bundle-skills] MCP tools directory not found: ${skillsDir}`);
  }

  validateSkillDependencyCategories();

  console.log(`[bundle-skills] Starting skill bundling (mode=${buildMode})...`);
  for (const bundle of bundles) {
    await bundleSkill(bundle);
  }
  verifyBundleOutputs();

  if (buildMode === 'package') {
    console.log('[bundle-skills] Optimizing skill dependencies for package runtime...');
    reinstallProductionDepsForBundledBuild();
  } else {
    console.log('[bundle-skills] Skipping dependency optimization in dev mode.');
  }

  console.log('[bundle-skills] Done');
}

main().catch((error) => {
  console.error('[bundle-skills] Failed:', error);
  process.exit(1);
});
