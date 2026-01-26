#!/usr/bin/env node
/**
 * Prepare skills for packaging using pnpm deploy.
 *
 * This script creates standalone, symlink-free copies of each skill
 * using pnpm's official deployment feature. This is the industry-standard
 * way to package pnpm workspace packages for distribution.
 *
 * Run this BEFORE electron-builder to ensure skills have proper node_modules.
 *
 * Common errors and solutions:
 * - "pnpm is not installed": Install pnpm globally with `npm install -g pnpm`
 * - "entry point not found": Run `pnpm install` in the skill directory first
 * - "Failed to deploy": Ensure skill's package.json has a valid "name" field
 * - "No dist/ found": Run `build-skills.mjs` before `prepare-skills.cjs`
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// On Windows, spawnSync needs shell:true to find executables in PATH
// This is because Windows doesn't have the same PATH resolution as Unix
const isWindows = process.platform === 'win32';
const spawnOptions = { encoding: 'utf-8', shell: isWindows };

// Hardcoded list of skills to deploy
// These names must match directory names in apps/desktop/skills/
const skills = [
  'dev-browser',
  'dev-browser-mcp',
  'file-permission',
  'ask-user-question',
  'complete-task'
];

// Valid npm package name pattern (simplified)
const VALID_PACKAGE_NAME_REGEX = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

const desktopDir = path.join(__dirname, '..');
const skillsSourceDir = path.join(desktopDir, 'skills');
const outputDir = path.join(desktopDir, 'build', 'skills');
const monorepoRoot = path.resolve(desktopDir, '..', '..');

/**
 * Validate that a path doesn't escape its parent directory
 */
function validatePathWithinDir(filePath, parentDir, description) {
  const resolvedPath = path.resolve(filePath);
  const resolvedParent = path.resolve(parentDir);
  if (!resolvedPath.startsWith(resolvedParent + path.sep) && resolvedPath !== resolvedParent) {
    throw new Error(`${description} escapes parent directory: ${filePath}`);
  }
}

/**
 * Validate skill name doesn't contain path traversal characters
 */
function validateSkillName(skill) {
  if (skill.includes('/') || skill.includes('\\') || skill.includes('..') || skill.includes('\0')) {
    throw new Error(`Invalid skill name (contains path characters): ${skill}`);
  }
}

// Verify pnpm is available
console.log('Checking pnpm availability...');
const pnpmCheck = spawnSync('pnpm', ['--version'], spawnOptions);
if (pnpmCheck.error || pnpmCheck.status !== 0) {
  console.error('ERROR: pnpm is not installed or not in PATH.');
  console.error('Please install pnpm: npm install -g pnpm');
  process.exit(1);
}
console.log(`  pnpm version: ${pnpmCheck.stdout.trim()}`);

console.log('\nPreparing skills for packaging with pnpm deploy...');
console.log(`  Source: ${skillsSourceDir}`);
console.log(`  Output: ${outputDir}`);
console.log(`  Monorepo root: ${monorepoRoot}`);

// Clean and create output directory
if (fs.existsSync(outputDir)) {
  try {
    fs.rmSync(outputDir, { recursive: true, force: true });
  } catch (error) {
    console.error(`Failed to clean output directory: ${error.message}`);
    process.exit(1);
  }
}

try {
  fs.mkdirSync(outputDir, { recursive: true });
} catch (error) {
  console.error(`Failed to create output directory: ${error.message}`);
  process.exit(1);
}

for (const skill of skills) {
  // Validate skill name for path safety
  validateSkillName(skill);

  const skillOutput = path.join(outputDir, skill);
  const skillSource = path.join(skillsSourceDir, skill);

  // Validate paths don't escape their parent directories
  validatePathWithinDir(skillOutput, outputDir, 'Skill output path');
  validatePathWithinDir(skillSource, skillsSourceDir, 'Skill source path');

  console.log(`\nDeploying ${skill}...`);

  // Check if skill has a package.json (required for pnpm deploy)
  const packageJsonPath = path.join(skillSource, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Skill ${skill} is missing package.json at ${packageJsonPath}`);
  }

  // Read and validate the skill's package.json
  let packageJson;
  try {
    const content = fs.readFileSync(packageJsonPath, 'utf-8');
    packageJson = JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to read/parse package.json for ${skill}: ${error.message}`);
  }

  if (!packageJson.name || typeof packageJson.name !== 'string') {
    throw new Error(`Invalid or missing "name" field in package.json for ${skill}`);
  }

  const packageName = packageJson.name;

  // Validate package name format to prevent command injection
  if (!VALID_PACKAGE_NAME_REGEX.test(packageName)) {
    throw new Error(`Invalid package name format: ${packageName}`);
  }

  try {
    // Run pnpm deploy from monorepo root using spawnSync (safer than execSync with string template)
    // --prod: only install production dependencies
    // shell: isWindows is needed for Windows to find pnpm in PATH
    const result = spawnSync('pnpm', ['deploy', `--filter=${packageName}`, '--prod', skillOutput], {
      cwd: monorepoRoot,
      stdio: 'inherit',
      encoding: 'utf-8',
      shell: isWindows
    });

    if (result.error) {
      throw new Error(`Failed to spawn pnpm: ${result.error.message}`);
    }

    // On Windows, pnpm deploy may fail with EPERM (4294963248) when creating bin stubs
    // but the actual deployment succeeds. Check if critical files exist before failing.
    if (result.status !== 0) {
      const nodeModulesExists = fs.existsSync(path.join(skillOutput, 'node_modules'));
      const packageJsonExists = fs.existsSync(path.join(skillOutput, 'package.json'));

      if (isWindows && nodeModulesExists && packageJsonExists) {
        console.log(`  WARNING: pnpm deploy exited with code ${result.status} but deployment appears successful`);
        console.log(`  (This is a known Windows CI issue with bin stub creation - continuing anyway)`);
      } else {
        throw new Error(`pnpm deploy exited with code ${result.status}`);
      }
    }

    // Copy the pre-built dist/ directory (esbuild output)
    const distSrc = path.join(skillSource, 'dist');
    const distDest = path.join(skillOutput, 'dist');
    if (fs.existsSync(distSrc)) {
      console.log(`  Copying dist/ for ${skill}...`);
      fs.cpSync(distSrc, distDest, { recursive: true });

      // Verify the bundled file exists
      const bundledFile = path.join(distDest, 'index.mjs');
      if (!fs.existsSync(bundledFile)) {
        throw new Error(`Bundled file not found after copy: ${bundledFile}`);
      }
    } else {
      throw new Error(`No dist/ found for ${skill}. Run build-skills.mjs first.`);
    }

    // Copy server.cjs for dev-browser (the launcher script)
    if (skill === 'dev-browser') {
      const serverSrc = path.join(skillSource, 'server.cjs');
      const serverDest = path.join(skillOutput, 'server.cjs');
      if (fs.existsSync(serverSrc)) {
        console.log(`  Copying server.cjs for ${skill}...`);
        fs.copyFileSync(serverSrc, serverDest);
        if (!fs.existsSync(serverDest)) {
          throw new Error(`Failed to copy server.cjs - destination doesn't exist`);
        }
      } else {
        throw new Error(`server.cjs not found for dev-browser at ${serverSrc}`);
      }
    }

    // Copy SKILL.md if it exists (OpenCode skill definition)
    const skillMdSrc = path.join(skillSource, 'SKILL.md');
    const skillMdDest = path.join(skillOutput, 'SKILL.md');
    if (fs.existsSync(skillMdSrc)) {
      console.log(`  Copying SKILL.md for ${skill}...`);
      fs.copyFileSync(skillMdSrc, skillMdDest);
    }

    console.log(`  Successfully deployed ${skill}`);

  } catch (error) {
    console.error(`  Failed to deploy ${skill}:`, error.message);
    throw error;
  }
}

console.log('\nSkills prepared successfully.');
console.log(`Output directory: ${outputDir}`);
