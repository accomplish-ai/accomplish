#!/usr/bin/env node
/**
 * Build all skills with esbuild.
 * Bundles TypeScript to JavaScript, eliminating the tsx runtime dependency.
 * This allows skills to run in packaged Electron apps without symlink issues.
 *
 * Common errors and solutions:
 * - "entry point not found": Ensure the skill exists in apps/desktop/skills/
 * - "esbuild failed": Check for TypeScript errors in the skill's source code
 * - "output file is empty": Check for circular imports or missing exports
 */

import * as esbuild from 'esbuild';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillsDir = join(__dirname, '..', 'skills');

// Skills to bundle with their entry points
// external: packages that should NOT be bundled (native deps, large packages)
const skills = [
  { name: 'dev-browser', entry: 'scripts/start-server.ts', external: ['playwright'] },
  { name: 'dev-browser-mcp', entry: 'src/index.ts', external: ['playwright'] },
  { name: 'file-permission', entry: 'src/index.ts', external: [] },
  { name: 'ask-user-question', entry: 'src/index.ts', external: [] },
  { name: 'complete-task', entry: 'src/index.ts', external: [] },
];

console.log('Building skills with esbuild...');

let hasErrors = false;

for (const skill of skills) {
  const skillPath = join(skillsDir, skill.name);
  const entryPoint = join(skillPath, skill.entry);

  if (!fs.existsSync(entryPoint)) {
    console.error(`  ERROR: ${skill.name}: entry point not found at ${skill.entry}`);
    hasErrors = true;
    continue;
  }

  const outfile = join(skillPath, 'dist', 'index.mjs');

  try {
    await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'esm',
      outfile,
      // Don't bundle these - they have native components or are too large
      external: ['fsevents', ...skill.external],
      // Silence warnings about __dirname (we handle it in the source)
      logLevel: 'warning',
    });

    // Verify output was created and is not empty
    if (!fs.existsSync(outfile)) {
      throw new Error(`Output file not created: ${outfile}`);
    }

    const stats = fs.statSync(outfile);
    if (stats.size === 0) {
      throw new Error(`Output file is empty: ${outfile}`);
    }

    const sizeKB = (stats.size / 1024).toFixed(2);
    console.log(`  Built ${skill.name}/dist/index.mjs (${sizeKB} KB)`);

  } catch (error) {
    console.error(`  ERROR: Failed to build ${skill.name}: ${error.message}`);
    hasErrors = true;
  }
}

if (hasErrors) {
  console.error('\nBuild completed with errors.');
  process.exit(1);
}

console.log('Skills built successfully.');
