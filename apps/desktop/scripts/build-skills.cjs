#!/usr/bin/env node

/**
 * Build all skills to JavaScript bundles for production.
 *
 * This eliminates the runtime dependency on tsx/esbuild by pre-compiling
 * TypeScript to JavaScript. Required for packaged Electron apps where
 * pnpm's hoisted dependencies may not be available.
 *
 * Output: Each skill gets a dist/index.cjs file that can be run with node directly.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const skillsDir = path.join(__dirname, '..', 'skills');
const desktopDir = path.join(__dirname, '..');

// Skills that need to be built (have TypeScript entry points used at runtime)
// format: 'cjs' for most skills, 'esm' for skills with top-level await
const SKILLS_TO_BUILD = [
  { name: 'file-permission', entry: 'src/index.ts', format: 'cjs' },
  { name: 'ask-user-question', entry: 'src/index.ts', format: 'cjs' },
  { name: 'dev-browser-mcp', entry: 'src/index.ts', format: 'cjs' },
  { name: 'complete-task', entry: 'src/index.ts', format: 'cjs' },
  // dev-browser uses scripts/start-server.ts which has top-level await, requires ESM
  { name: 'dev-browser', entry: 'scripts/start-server.ts', format: 'esm' },
];

// Packages that should be external (not bundled) - native modules and large deps
const EXTERNAL_PACKAGES = [
  'playwright',
  'rebrowser-playwright',
  '@playwright/test',
];

// Additional externals for ESM builds to avoid CommonJS interop issues
const ESM_EXTERNAL_PACKAGES = [
  ...EXTERNAL_PACKAGES,
  // Express and its dependencies use CommonJS with dynamic require
  // Externalize them to avoid "Dynamic require of 'path' is not supported" errors
  'express',
  'body-parser',
  'depd',
  'http-errors',
  'content-disposition',
  'etag',
  'fresh',
  'merge-descriptors',
  'methods',
  'on-finished',
  'parseurl',
  'path-to-regexp',
  'range-parser',
  'raw-body',
  'send',
  'serve-static',
  'utils-merge',
  'vary',
  'cookie',
  'cookie-signature',
  'debug',
  'destroy',
  'mime',
  'ms',
  'safe-buffer',
  'safer-buffer',
];

async function buildSkill(skill) {
  const skillPath = path.join(skillsDir, skill.name);
  const entryPath = path.join(skillPath, skill.entry);
  const format = skill.format || 'cjs';
  const ext = format === 'esm' ? 'mjs' : 'cjs';
  const outPath = path.join(skillPath, 'dist', `index.${ext}`);
  const outDir = path.dirname(outPath);

  if (!fs.existsSync(entryPath)) {
    console.log(`Skipping ${skill.name} (entry not found: ${skill.entry})`);
    return false;
  }

  // Ensure output directory exists
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log(`Building ${skill.name} (${format})...`);

  // Build with esbuild
  // - platform: node (for Node.js built-ins)
  // - format: cjs or esm depending on skill requirements
  // - bundle: true (include dependencies)
  // - external: native modules that can't be bundled
  const externalList = format === 'esm' ? ESM_EXTERNAL_PACKAGES : EXTERNAL_PACKAGES;
  const externals = externalList.map(p => `--external:${p}`).join(' ');

  try {
    const cmd = `npx esbuild "${entryPath}" --bundle --platform=node --format=${format} --outfile="${outPath}" ${externals} --sourcemap`;
    execSync(cmd, {
      cwd: desktopDir,
      stdio: 'inherit',
    });
    console.log(`  -> ${path.relative(skillsDir, outPath)}`);
    return true;
  } catch (error) {
    console.error(`Failed to build ${skill.name}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('Building skills for production...\n');

  let successCount = 0;
  let failCount = 0;

  for (const skill of SKILLS_TO_BUILD) {
    const success = await buildSkill(skill);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log(`\nBuild complete: ${successCount} succeeded, ${failCount} failed`);

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
