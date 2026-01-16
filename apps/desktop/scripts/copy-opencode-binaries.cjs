/**
 * Copy opencode binaries from pnpm store to apps/desktop/node_modules
 * This is needed because the monorepo structure puts opencode-linux-x64
 * in the pnpm store, but the AppImage build only packages apps/desktop/node_modules
 */

const fs = require('fs');
const path = require('path');

const scriptDir = __dirname;
console.log('[copy-opencode-binaries] scriptDir:', scriptDir);

// Navigate from apps/desktop/scripts to the repo root (3 levels up)
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
console.log('[copy-opencode-binaries] repoRoot:', repoRoot);

const rootNodeModules = path.join(repoRoot, 'node_modules');
const desktopNodeModules = path.join(scriptDir, '..', 'node_modules');
const pnpmStore = path.join(rootNodeModules, '.pnpm');

console.log('[copy-opencode-binaries] rootNodeModules:', rootNodeModules);
console.log('[copy-opencode-binaries] desktopNodeModules:', desktopNodeModules);
console.log('[copy-opencode-binaries] pnpmStore:', pnpmStore);

const opencodePackages = [
  'opencode-linux-x64',
  'opencode-linux-arm64',
  'opencode-darwin-x64',
  'opencode-darwin-arm64',
  'opencode-windows-x64',
];

console.log('[copy-opencode-binaries] Copying opencode binaries...');

// Check if running in pnpm store
console.log('[copy-opencode-binaries] pnpmStore exists:', fs.existsSync(pnpmStore));

if (fs.existsSync(pnpmStore)) {
  const entries = fs.readdirSync(pnpmStore);
  console.log('[copy-opencode-binaries] pnpm entries:', entries.length);
  console.log('[copy-opencode-binaries] opencode entries:', entries.filter(e => e.includes('opencode')).length);
}

function findPackageInPnpm(packageName) {
  if (!fs.existsSync(pnpmStore)) {
    console.log('[copy-opencode-binaries] pnpmStore does not exist');
    return null;
  }

  const entries = fs.readdirSync(pnpmStore);
  
  for (const entry of entries) {
    if (entry.startsWith(packageName + '@')) {
      const pkgPath = path.join(pnpmStore, entry, 'node_modules', packageName);
      if (fs.existsSync(pkgPath)) {
        return pkgPath;
      }
    }
  }
  return null;
}

function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

for (const pkg of opencodePackages) {
  // First try root node_modules (flat structure)
  let srcPath = path.join(rootNodeModules, pkg);

  // If not found, look in pnpm store (nested structure)
  if (!fs.existsSync(srcPath)) {
    srcPath = findPackageInPnpm(pkg);
  }

  const destPath = path.join(desktopNodeModules, pkg);

  if (srcPath && fs.existsSync(srcPath)) {
    // Create parent directories if needed
    const destParent = path.dirname(destPath);
    if (!fs.existsSync(destParent)) {
      fs.mkdirSync(destParent, { recursive: true });
    }

    // Copy the package
    if (fs.existsSync(destPath)) {
      console.log(`[copy-opencode-binaries] ${pkg} already exists, skipping`);
    } else {
      copyDirectory(srcPath, destPath);
      console.log(`[copy-opencode-binaries] Copied ${pkg} from ${srcPath}`);
    }

    // Also copy the binary to opencode-ai/bin/opencode for the wrapper script
    // This is where cli-path.ts expects to find it
    const opencodeAiBinPath = path.join(desktopNodeModules, 'opencode-ai', 'bin');
    const opencodeAiBinDest = path.join(opencodeAiBinPath, 'opencode');

    if (!fs.existsSync(opencodeAiBinPath)) {
      fs.mkdirSync(opencodeAiBinPath, { recursive: true });
    }

    const srcBinPath = path.join(srcPath, 'bin', 'opencode');
    if (fs.existsSync(srcBinPath)) {
      fs.copyFileSync(srcBinPath, opencodeAiBinDest);
      fs.chmodSync(opencodeAiBinDest, '755');
      console.log(`[copy-opencode-binaries] Copied opencode binary to opencode-ai/bin/opencode`);
    }
  } else {
    console.log(`[copy-opencode-binaries] ${pkg} not found, skipping`);
  }
}

console.log('[copy-opencode-binaries] Done');
