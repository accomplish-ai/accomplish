#!/usr/bin/env node

/**
 * Custom packaging script for Electron app with pnpm workspaces.
 * Temporarily removes workspace symlinks that cause electron-builder issues.
 * On Windows, skips native module rebuild (uses prebuilt binaries).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const isWindows = process.platform === 'win32';
const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
const accomplishPath = path.join(nodeModulesPath, '@accomplish');
const skillsPath = path.join(__dirname, '..', 'skills');

// Save symlink target for restoration
let symlinkTarget = null;
const sharedPath = path.join(accomplishPath, 'shared');

function materializeSymlink(entryPath) {
  const realPath = fs.realpathSync(entryPath);
  fs.rmSync(entryPath, { recursive: true, force: true });
  fs.cpSync(realPath, entryPath, { recursive: true, dereference: true });
}

function materializeNodeModules(modulesPath) {
  if (!fs.existsSync(modulesPath)) {
    throw new Error(`Missing node_modules at ${modulesPath}. Run pnpm install before packaging.`);
  }

  const entries = fs.readdirSync(modulesPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(modulesPath, entry.name);
    if (entry.isSymbolicLink()) {
      materializeSymlink(entryPath);
      continue;
    }
    if (entry.isDirectory() && entry.name.startsWith('@')) {
      materializeNodeModules(entryPath);
    }
  }
}

function materializeSkillDependencies() {
  if (!fs.existsSync(skillsPath)) {
    return;
  }

  const skills = fs.readdirSync(skillsPath, { withFileTypes: true });
  for (const skill of skills) {
    if (!skill.isDirectory()) continue;
    const skillDir = path.join(skillsPath, skill.name);
    const packageJson = path.join(skillDir, 'package.json');
    if (!fs.existsSync(packageJson)) continue;

    const nodeModulesDir = path.join(skillDir, 'node_modules');
    console.log('Materializing skill dependencies:', path.relative(skillsPath, skillDir));
    materializeNodeModules(nodeModulesDir);
  }
}

try {
  materializeSkillDependencies();

  // Check if @accomplish/shared symlink exists
  if (fs.existsSync(sharedPath)) {
    const stats = fs.lstatSync(sharedPath);
    if (stats.isSymbolicLink()) {
      symlinkTarget = fs.readlinkSync(sharedPath);
      console.log('Temporarily removing workspace symlink:', sharedPath);
      fs.unlinkSync(sharedPath);

      // Remove empty @accomplish directory if it exists
      try {
        fs.rmdirSync(accomplishPath);
      } catch {
        // Directory not empty or doesn't exist, ignore
      }
    }
  }

  // Get command line args (everything after 'node scripts/package.js')
  const args = process.argv.slice(2).join(' ');

  // On Windows, skip native module rebuild (use prebuilt binaries)
  // This avoids issues with node-pty's winpty.gyp batch file handling
  const npmRebuildFlag = isWindows ? ' --config.npmRebuild=false' : '';

  // Use npx to run electron-builder to ensure it's found in node_modules
  const command = `npx electron-builder ${args}${npmRebuildFlag}`;

  console.log('Running:', command);
  if (isWindows) {
    console.log('(Skipping native module rebuild on Windows - using prebuilt binaries)');
  }
  execSync(command, { stdio: 'inherit', cwd: path.join(__dirname, '..') });

} finally {
  // Restore the symlink
  if (symlinkTarget) {
    console.log('Restoring workspace symlink');

    // Recreate @accomplish directory if needed
    if (!fs.existsSync(accomplishPath)) {
      fs.mkdirSync(accomplishPath, { recursive: true });
    }

    // On Windows, use junction instead of symlink (doesn't require admin privileges)
    // The target needs to be an absolute path for junctions
    const absoluteTarget = path.isAbsolute(symlinkTarget)
      ? symlinkTarget
      : path.resolve(path.dirname(sharedPath), symlinkTarget);

    if (isWindows) {
      fs.symlinkSync(absoluteTarget, sharedPath, 'junction');
    } else {
      fs.symlinkSync(symlinkTarget, sharedPath);
    }
  }
}
