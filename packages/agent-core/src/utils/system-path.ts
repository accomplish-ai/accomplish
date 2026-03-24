import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

function getNvmNodePaths(): string[] {
  const home = process.env.HOME || '';
  const nvmVersionsDir = path.join(home, '.nvm', 'versions', 'node');

  if (!fs.existsSync(nvmVersionsDir)) {
    return [];
  }

  try {
    const versions = fs
      .readdirSync(nvmVersionsDir)
      .filter((name) => name.startsWith('v'))
      .sort((a, b) => {
        const parseVersion = (v: string) => {
          const parts = v.replace('v', '').split('.').map(Number);
          return parts[0] * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
        };
        return parseVersion(b) - parseVersion(a);
      });

    return versions.map((v) => path.join(nvmVersionsDir, v, 'bin'));
  } catch {
    return [];
  }
}

function getFnmNodePaths(): string[] {
  const home = process.env.HOME || '';
  const fnmVersionsDir = path.join(home, '.fnm', 'node-versions');

  if (!fs.existsSync(fnmVersionsDir)) {
    return [];
  }

  try {
    const versions = fs
      .readdirSync(fnmVersionsDir)
      .filter((name) => name.startsWith('v'))
      .sort((a, b) => {
        const parseVersion = (v: string) => {
          const parts = v.replace('v', '').split('.').map(Number);
          return parts[0] * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
        };
        return parseVersion(b) - parseVersion(a);
      });

    return versions.map((v) => path.join(fnmVersionsDir, v, 'installation', 'bin'));
  } catch {
    return [];
  }
}

function getCommonNodePaths(): string[] {
  const home = process.env.HOME || '';
  const nvmPaths = getNvmNodePaths();
  const fnmPaths = getFnmNodePaths();

  return [
    ...nvmPaths,
    ...fnmPaths,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    `${home}/.nvm/current/bin`,
    `${home}/.volta/bin`,
    `${home}/.asdf/shims`,
    `${home}/.fnm/current/bin`,
    `${home}/.nodenv/shims`,
    '/usr/local/opt/node/bin',
    '/opt/local/bin',
    `${home}/.local/bin`,
  ].filter((p) => p && !p.includes('undefined'));
}

function getSystemPathFromPathHelper(): string | null {
  if (process.platform !== 'darwin') {
    return null;
  }

  try {
    const output = execSync('/usr/libexec/path_helper -s', {
      encoding: 'utf-8',
      timeout: 5000,
    });

    const match = output.match(/PATH="([^"]+)"/);
    if (match && match[1]) {
      return match[1];
    }
  } catch (err) {
    console.warn('[SystemPath] path_helper failed:', err);
  }

  return null;
}

export function getExtendedNodePath(basePath?: string): string {
  const base = basePath || process.env.PATH || '';

  if (process.platform !== 'darwin') {
    return base;
  }

  const nodePaths = getCommonNodePaths();
  const systemPath = getSystemPathFromPathHelper();
  const pathParts: string[] = [];

  for (const p of nodePaths) {
    if (fs.existsSync(p) && !pathParts.includes(p)) {
      pathParts.push(p);
    }
  }

  if (systemPath) {
    for (const p of systemPath.split(':')) {
      if (p && !pathParts.includes(p)) {
        pathParts.push(p);
      }
    }
  }

  for (const p of base.split(':')) {
    if (p && !pathParts.includes(p)) {
      pathParts.push(p);
    }
  }

  return pathParts.join(':');
}

export function findCommandInPath(command: string, searchPath: string): string | null {
  const delimiter = process.platform === 'win32' ? ';' : ':';

  for (const dir of searchPath.split(delimiter)) {
    if (!dir) continue;

    const fullPath = path.join(dir, command);
    try {
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        if (stats.isFile()) {
          if (process.platform !== 'win32') {
            try {
              fs.accessSync(fullPath, fs.constants.X_OK);
              return fullPath;
            } catch {
              // intentionally empty
            }
          } else {
            return fullPath;
          }
        }
      }
    } catch {
      // intentionally empty
    }
  }

  return null;
}
