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

const workspacePackages = ['agent-core'];
const symlinkTargets = {};

try {
  for (const pkg of workspacePackages) {
    const pkgPath = path.join(accomplishPath, pkg);
    if (fs.existsSync(pkgPath)) {
      const stats = fs.lstatSync(pkgPath);
      if (stats.isSymbolicLink()) {
        symlinkTargets[pkg] = fs.readlinkSync(pkgPath);
        console.log('Temporarily removing workspace symlink:', pkgPath);
        fs.unlinkSync(pkgPath);
      }
    }
  }

  if (Object.keys(symlinkTargets).length > 0) {
    try {
      fs.rmdirSync(accomplishPath);
    } catch {
      // Directory not empty or doesn't exist, ignore
    }
  }

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
  const packagesToRestore = Object.keys(symlinkTargets);
  if (packagesToRestore.length > 0) {
    console.log('Restoring workspace symlinks');

    if (!fs.existsSync(accomplishPath)) {
      fs.mkdirSync(accomplishPath, { recursive: true });
    }

    for (const pkg of packagesToRestore) {
      const pkgPath = path.join(accomplishPath, pkg);
      const target = symlinkTargets[pkg];

      // On Windows, use junction instead of symlink (doesn't require admin privileges)
      // The target needs to be an absolute path for junctions
      const absoluteTarget = path.isAbsolute(target)
        ? target
        : path.resolve(path.dirname(pkgPath), target);

      if (isWindows) {
        fs.symlinkSync(absoluteTarget, pkgPath, 'junction');
      } else {
        fs.symlinkSync(target, pkgPath);
      }
      console.log('  Restored:', pkgPath);
    }
  }
}
