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

// Save symlink target for restoration
let symlinkTarget = null;
const sharedPath = path.join(accomplishPath, 'shared');

try {
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

  // On CI Windows builds, fully disable signing to avoid hanging signtool prompts.
  const isCi = process.env.CI === 'true';
  const skipSigningFlag = isWindows && isCi
    ? ' --config.win.sign=false --config.win.signAndEditExecutable=false'
    : '';

  // Speed up NSIS packaging on CI by using zip compression.
  const nsisZipFlag = isWindows && isCi ? ' --config.nsis.useZip=true' : '';

  // Use npx to run electron-builder to ensure it's found in node_modules
  const command = `npx electron-builder ${args}${npmRebuildFlag}${skipSigningFlag}${nsisZipFlag}`;
  const builderEnv = {
    ...process.env,
    ...(isWindows && isCi ? { ELECTRON_BUILDER_LOG_LEVEL: 'debug' } : {}),
  };

  console.log('Running:', command);
  if (isWindows) {
    console.log('(Skipping native module rebuild on Windows - using prebuilt binaries)');
    if (skipSigningFlag) {
      console.log('(Skipping Windows signing on CI)');
    }
    if (nsisZipFlag) {
      console.log('(Using NSIS zip compression on CI)');
    }
  }
  const startTime = Date.now();
  console.log(`[package] electron-builder start: ${new Date(startTime).toISOString()}`);
  execSync(command, { stdio: 'inherit', cwd: path.join(__dirname, '..'), env: builderEnv });
  const endTime = Date.now();
  console.log(`[package] electron-builder end: ${new Date(endTime).toISOString()}`);
  console.log(`[package] electron-builder duration: ${Math.round((endTime - startTime) / 1000)}s`);

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
