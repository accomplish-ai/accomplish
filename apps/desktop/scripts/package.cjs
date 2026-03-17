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
const accomplishPath = path.join(nodeModulesPath, '@accomplish_ai');

// Save symlink targets for restoration
const workspacePackages = ['agent-core'];
const symlinkTargets = {};

// pnpm symlinks to resolve: these are regular dependencies that pnpm stores
// as symlinks to its content-addressable store, which electron-builder can't follow.
// We temporarily replace them with real copies of the resolved target.
const pnpmSymlinksToResolve = [
  'opencode-ai',
  'opencode-darwin-arm64',
  'opencode-darwin-x64',
  'opencode-darwin-x64-baseline',
  'opencode-linux-arm64',
  'opencode-linux-arm64-musl',
  'opencode-linux-x64',
  'opencode-linux-x64-baseline',
  'opencode-linux-x64-musl',
  'opencode-linux-x64-baseline-musl',
  'opencode-windows-x64',
  'opencode-windows-x64-baseline',
];
const resolvedSymlinks = {};

try {
  // Check and remove workspace symlinks
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

  // Remove empty @accomplish_ai directory if it exists
  if (Object.keys(symlinkTargets).length > 0) {
    try {
      fs.rmdirSync(accomplishPath);
    } catch {
      // Directory not empty or doesn't exist, ignore
    }
  }

  // Replace pnpm store symlinks with real copies so electron-builder can pack them
  for (const pkg of pnpmSymlinksToResolve) {
    const pkgPath = path.join(nodeModulesPath, pkg);
    if (fs.existsSync(pkgPath)) {
      const stats = fs.lstatSync(pkgPath);
      if (stats.isSymbolicLink()) {
        const linkTarget = fs.readlinkSync(pkgPath);
        const realPath = fs.realpathSync(pkgPath);
        resolvedSymlinks[pkg] = { linkTarget, pkgPath };
        console.log('Replacing pnpm symlink with copy:', pkgPath);
        fs.unlinkSync(pkgPath);
        fs.cpSync(realPath, pkgPath, { recursive: true });
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
  // Restore pnpm store symlinks
  for (const [pkg, { linkTarget, pkgPath }] of Object.entries(resolvedSymlinks)) {
    console.log('Restoring pnpm symlink:', pkgPath);
    if (fs.existsSync(pkgPath)) {
      fs.rmSync(pkgPath, { recursive: true, force: true });
    }
    if (isWindows) {
      const absoluteTarget = path.isAbsolute(linkTarget)
        ? linkTarget
        : path.resolve(path.dirname(pkgPath), linkTarget);
      fs.symlinkSync(absoluteTarget, pkgPath, 'junction');
    } else {
      fs.symlinkSync(linkTarget, pkgPath);
    }
  }

  // Restore the symlinks
  const packagesToRestore = Object.keys(symlinkTargets);
  if (packagesToRestore.length > 0) {
    console.log('Restoring workspace symlinks');

    // Recreate @accomplish_ai directory if needed
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
