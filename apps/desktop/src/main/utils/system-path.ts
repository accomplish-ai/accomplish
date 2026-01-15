/**
 * System PATH utilities for packaged apps
 *
 * GUI apps on all platforms may not inherit the user's terminal PATH.
 * This module provides utilities to build a proper PATH without loading shell profiles.
 *
 * Platform-specific approaches:
 * - macOS: /usr/libexec/path_helper + common Node.js paths
 * - Windows: Common Node.js installation paths (nvm-windows, AppData, etc.)
 * - Linux: Common Node.js paths (/usr/local/bin, nvm, fnm, etc.)
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Get NVM Node.js version paths.
 * Unix: ~/.nvm/versions/node/vX.X.X/bin/
 * Windows (nvm-windows): %APPDATA%\nvm\vX.X.X\
 * Returns paths sorted by version (newest first).
 */
function getNvmNodePaths(): string[] {
  const home = os.homedir();
  const paths: string[] = [];

  // Unix NVM
  const nvmVersionsDir = path.join(home, '.nvm', 'versions', 'node');
  if (fs.existsSync(nvmVersionsDir)) {
    try {
      const versions = fs.readdirSync(nvmVersionsDir)
        .filter(name => name.startsWith('v'))
        .sort((a, b) => {
          const parseVersion = (v: string) => {
            const parts = v.replace('v', '').split('.').map(Number);
            return parts[0] * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
          };
          return parseVersion(b) - parseVersion(a);
        });

      paths.push(...versions.map(v => path.join(nvmVersionsDir, v, 'bin')));
    } catch {
      // Ignore errors
    }
  }

  // Windows nvm-windows
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const nvmWindowsDir = path.join(appData, 'nvm');
    if (fs.existsSync(nvmWindowsDir)) {
      try {
        const versions = fs.readdirSync(nvmWindowsDir)
          .filter(name => name.startsWith('v'))
          .sort((a, b) => {
            const parseVersion = (v: string) => {
              const parts = v.replace('v', '').split('.').map(Number);
              return parts[0] * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
            };
            return parseVersion(b) - parseVersion(a);
          });

        paths.push(...versions.map(v => path.join(nvmWindowsDir, v)));
      } catch {
        // Ignore errors
      }
    }
  }

  return paths;
}

/**
 * Get fnm Node.js version paths.
 * Unix: ~/.fnm/node-versions/vX.X.X/installation/bin/
 * Windows: %LOCALAPPDATA%\fnm_multishells\... or %USERPROFILE%\.fnm\node-versions\
 */
function getFnmNodePaths(): string[] {
  const home = os.homedir();
  const paths: string[] = [];

  // Unix fnm
  const fnmVersionsDir = path.join(home, '.fnm', 'node-versions');
  if (fs.existsSync(fnmVersionsDir)) {
    try {
      const versions = fs.readdirSync(fnmVersionsDir)
        .filter(name => name.startsWith('v'))
        .sort((a, b) => {
          const parseVersion = (v: string) => {
            const parts = v.replace('v', '').split('.').map(Number);
            return parts[0] * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
          };
          return parseVersion(b) - parseVersion(a);
        });

      // fnm on Windows uses 'installation' subdirectory without 'bin'
      if (process.platform === 'win32') {
        paths.push(...versions.map(v => path.join(fnmVersionsDir, v, 'installation')));
      } else {
        paths.push(...versions.map(v => path.join(fnmVersionsDir, v, 'installation', 'bin')));
      }
    } catch {
      // Ignore errors
    }
  }

  return paths;
}

/**
 * Common Node.js installation paths.
 * These are checked in order of preference per platform.
 */
function getCommonNodePaths(): string[] {
  const home = os.homedir();

  // Get dynamic paths from version managers
  const nvmPaths = getNvmNodePaths();
  const fnmPaths = getFnmNodePaths();

  const paths: string[] = [
    // Version managers (dynamic - most specific, checked first)
    ...nvmPaths,
    ...fnmPaths,
  ];

  if (process.platform === 'darwin') {
    // macOS paths
    paths.push(
      '/opt/homebrew/bin',              // Apple Silicon Homebrew
      '/usr/local/bin',                 // Intel Mac / Homebrew
      path.join(home, '.nvm', 'current', 'bin'),       // NVM current symlink
      path.join(home, '.volta', 'bin'),                // Volta
      path.join(home, '.asdf', 'shims'),               // asdf
      path.join(home, '.fnm', 'current', 'bin'),       // fnm current symlink
      path.join(home, '.nodenv', 'shims'),             // nodenv
      '/usr/local/opt/node/bin',        // Homebrew node formula
      '/opt/local/bin',                 // MacPorts
      path.join(home, '.local', 'bin'), // pip/pipx style installations
    );
  } else if (process.platform === 'win32') {
    // Windows paths
    const programFiles = process.env['PROGRAMFILES'] || 'C:\\Program Files';
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');

    paths.push(
      path.join(programFiles, 'nodejs'),           // Official Node.js installer
      path.join(appData, 'npm'),                   // npm global packages
      path.join(localAppData, 'Volta', 'bin'),     // Volta on Windows
      path.join(home, '.volta', 'bin'),            // Volta alternative
      path.join(appData, 'nvm'),                   // nvm-windows
      path.join(home, 'scoop', 'apps', 'nodejs', 'current'), // Scoop
      path.join(home, 'scoop', 'shims'),           // Scoop shims
    );
  } else {
    // Linux paths
    paths.push(
      '/usr/local/bin',                            // Common location
      '/usr/bin',                                  // System location
      path.join(home, '.nvm', 'current', 'bin'),  // NVM current symlink
      path.join(home, '.volta', 'bin'),           // Volta
      path.join(home, '.asdf', 'shims'),          // asdf
      path.join(home, '.fnm', 'current', 'bin'), // fnm current symlink
      path.join(home, '.nodenv', 'shims'),        // nodenv
      path.join(home, '.local', 'bin'),           // User local bin
      '/snap/bin',                                 // Snap packages
      '/opt/node/bin',                            // Manual installations
    );
  }

  return paths.filter(p => p && !p.includes('undefined'));
}

/**
 * Get system PATH using macOS path_helper utility.
 * This reads from /etc/paths and /etc/paths.d without loading user shell profiles.
 *
 * @returns The system PATH or null if path_helper fails
 */
function getSystemPathFromPathHelper(): string | null {
  if (process.platform !== 'darwin') {
    return null;
  }

  try {
    // path_helper outputs: PATH="..."; export PATH;
    // We need to extract just the path value
    const output = execSync('/usr/libexec/path_helper -s', {
      encoding: 'utf-8',
      timeout: 5000,
    });

    // Parse the output: PATH="/usr/local/bin:/usr/bin:..."; export PATH;
    const match = output.match(/PATH="([^"]+)"/);
    if (match && match[1]) {
      return match[1];
    }
  } catch (err) {
    console.warn('[SystemPath] path_helper failed:', err);
  }

  return null;
}

/**
 * Build an extended PATH for finding Node.js tools (node, npm, npx) in packaged apps.
 *
 * This function:
 * 1. On macOS: Gets the system PATH from path_helper (includes Homebrew if in /etc/paths.d)
 * 2. On all platforms: Prepends common Node.js installation paths
 * 3. Does NOT load user shell profiles (avoids permission prompts)
 *
 * @param basePath - The base PATH to extend (defaults to process.env.PATH)
 * @returns Extended PATH string
 */
export function getExtendedNodePath(basePath?: string): string {
  const base = basePath || process.env.PATH || '';

  // Start with common Node.js paths for the current platform
  const nodePaths = getCommonNodePaths();

  // Try to get system PATH from path_helper (macOS only)
  const systemPath = getSystemPathFromPathHelper();

  // Build the final PATH:
  // 1. Common Node.js paths (highest priority - finds user's preferred Node)
  // 2. System PATH from path_helper (includes /etc/paths.d entries)
  // 3. Base PATH (fallback)
  const pathParts: string[] = [];

  // Add common Node.js paths
  for (const p of nodePaths) {
    if (fs.existsSync(p) && !pathParts.includes(p)) {
      pathParts.push(p);
    }
  }

  // Add system PATH from path_helper
  if (systemPath) {
    for (const p of systemPath.split(path.delimiter)) {
      if (p && !pathParts.includes(p)) {
        pathParts.push(p);
      }
    }
  }

  // Add base PATH entries
  for (const p of base.split(path.delimiter)) {
    if (p && !pathParts.includes(p)) {
      pathParts.push(p);
    }
  }

  return pathParts.join(path.delimiter);
}

/**
 * Check if a command exists in the given PATH.
 *
 * @param command - The command to find (e.g., 'npx', 'node')
 * @param searchPath - The PATH to search in
 * @returns The full path to the command if found, null otherwise
 */
export function findCommandInPath(command: string, searchPath: string): string | null {
  for (const dir of searchPath.split(path.delimiter)) {
    if (!dir) continue;

    const fullPath = path.join(dir, command);
    try {
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        if (stats.isFile()) {
          // On Windows, we don't check X_OK as it doesn't apply
          if (process.platform === 'win32') {
            return fullPath;
          }
          // Check if executable on Unix
          try {
            fs.accessSync(fullPath, fs.constants.X_OK);
            return fullPath;
          } catch {
            // Not executable, continue searching
          }
        }
      }
    } catch {
      // Directory doesn't exist or other error, continue
    }
  }

  return null;
}
