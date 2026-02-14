#!/usr/bin/env node

/**
 * Download Prebuilt Binaries for Native Modules
 * 
 * This script attempts to download prebuilt binaries for native modules
 * (better-sqlite3, node-pty) to avoid compilation issues during installation.
 * 
 * Usage:
 *   node scripts/download-prebuilt-binaries.cjs
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const NATIVE_MODULES = ['better-sqlite3', 'node-pty'];

function log(message) {
  console.log(`[Prebuilt Binaries] ${message}`);
}

function error(message) {
  console.error(`[Prebuilt Binaries Error] ${message}`);
}

/**
 * Get system information for binary matching
 */
function getSystemInfo() {
  return {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.versions.node,
    electronVersion: getElectronVersion(),
  };
}

/**
 * Get Electron version from package.json
 */
function getElectronVersion() {
  try {
    const pkgPath = path.join(__dirname, '../apps/desktop/package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const electronDep = pkg.dependencies?.electron || pkg.devDependencies?.electron;
    return electronDep ? electronDep.replace(/[\^~]/, '') : null;
  } catch (err) {
    return null;
  }
}

/**
 * Check if a module has prebuilt binaries available
 */
function checkPrebuiltAvailability(moduleName, systemInfo) {
  log(`Checking prebuilt availability for ${moduleName}...`);
  
  // For better-sqlite3, check if binaries exist
  if (moduleName === 'better-sqlite3') {
    try {
      const modulePath = path.join(__dirname, '../node_modules', moduleName);
      if (fs.existsSync(modulePath)) {
        log(`${moduleName} is already installed`);
        return true;
      }
    } catch (err) {
      return false;
    }
  }
  
  return false;
}

/**
 * Rebuild native modules using electron-rebuild
 */
function rebuildNativeModules() {
  log('Rebuilding native modules for Electron...');
  
  try {
    execSync('npx electron-rebuild -f', {
      stdio: 'inherit',
      cwd: path.join(__dirname, '../apps/desktop'),
    });
    log('Successfully rebuilt native modules');
    return true;
  } catch (err) {
    error('Failed to rebuild native modules');
    error(err.message);
    return false;
  }
}

/**
 * Verify native module installation
 */
function verifyModule(moduleName) {
  try {
    const modulePath = path.join(__dirname, '../node_modules', moduleName);
    if (fs.existsSync(modulePath)) {
      log(`✓ ${moduleName} is installed`);
      return true;
    } else {
      log(`✗ ${moduleName} is not installed`);
      return false;
    }
  } catch (err) {
    error(`Failed to verify ${moduleName}: ${err.message}`);
    return false;
  }
}

/**
 * Main execution
 */
function main() {
  log('Starting prebuilt binaries check...');
  
  const systemInfo = getSystemInfo();
  log(`Platform: ${systemInfo.platform}`);
  log(`Architecture: ${systemInfo.arch}`);
  log(`Node version: ${systemInfo.nodeVersion}`);
  log(`Electron version: ${systemInfo.electronVersion || 'Not found'}`);
  
  let allModulesReady = true;
  
  // Check each native module
  for (const moduleName of NATIVE_MODULES) {
    const isReady = checkPrebuiltAvailability(moduleName, systemInfo);
    if (!isReady) {
      allModulesReady = false;
    }
  }
  
  // If modules aren't ready, try to rebuild
  if (!allModulesReady) {
    log('Some modules need rebuilding...');
    const rebuilt = rebuildNativeModules();
    
    if (!rebuilt) {
      error('Failed to rebuild modules. You may need to install build tools:');
      error('  macOS: xcode-select --install');
      error('  Linux: sudo apt install build-essential python3');
      error('  Windows: Install Visual Studio Build Tools with C++ workload');
      process.exit(1);
    }
  }
  
  // Verify all modules
  log('Verifying native modules...');
  let allVerified = true;
  for (const moduleName of NATIVE_MODULES) {
    if (!verifyModule(moduleName)) {
      allVerified = false;
    }
  }
  
  if (allVerified) {
    log('✓ All native modules are ready');
  } else {
    error('Some modules failed verification. See above for details.');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };
