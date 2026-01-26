#!/usr/bin/env node

/**
 * Install dependencies for all skills that have a package.json.
 *
 * This is required before packaging because:
 * 1. Skills have their own dependencies (e.g., tsx, express, playwright)
 * 2. pnpm creates symlinks in node_modules which need to be materialized
 * 3. The packaging script (package.cjs) materializes these symlinks
 * 4. But it can only materialize what exists - dependencies must be installed first
 *
 * Run this script before `pnpm -F @accomplish/desktop package:mac` in CI.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const skillsDir = path.join(__dirname, '..', 'skills');

if (!fs.existsSync(skillsDir)) {
  console.log('No skills directory found, skipping');
  process.exit(0);
}

const skills = fs.readdirSync(skillsDir, { withFileTypes: true });
let installedCount = 0;

for (const skill of skills) {
  if (!skill.isDirectory()) continue;

  const skillPath = path.join(skillsDir, skill.name);
  const packageJsonPath = path.join(skillPath, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    console.log(`Skipping ${skill.name} (no package.json)`);
    continue;
  }

  console.log(`Installing dependencies for skill: ${skill.name}`);

  try {
    // Use pnpm install to handle workspace dependencies correctly
    execSync('pnpm install --frozen-lockfile', {
      cwd: skillPath,
      stdio: 'inherit',
    });
    installedCount++;
  } catch (error) {
    console.error(`Failed to install dependencies for ${skill.name}:`, error.message);
    process.exit(1);
  }
}

console.log(`\nInstalled dependencies for ${installedCount} skills`);
