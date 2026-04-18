import * as path from 'path';
import * as fs from 'fs';
import type { PlatformConfig, BundledNodePaths } from '../types.js';
import { createConsoleLogger } from './logging.js';

const log = createConsoleLogger({ prefix: 'BundledNode' });

export interface BundledNodePathsExtended extends BundledNodePaths {
  nodeDir: string;
}

function resolveDevNodeDir(config: PlatformConfig): string | null {
  if (!config.appPath) {
    return null;
  }

  const platformArch = `${config.platform}-${config.arch}`;
  const appPath = path.resolve(config.appPath);
  const candidates = [
    process.env.APP_ROOT
      ? path.join(process.env.APP_ROOT, 'resources', 'nodejs', platformArch)
      : null,
    path.join(appPath, 'resources', 'nodejs', platformArch),
    path.join(appPath, '..', 'resources', 'nodejs', platformArch),
    path.join(appPath, '..', '..', 'resources', 'nodejs', platformArch),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const nodeBinary = config.platform === 'win32' ? 'node.exe' : path.join('bin', 'node');

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }

    const directNodePath = path.join(candidate, nodeBinary);
    if (fs.existsSync(directNodePath)) {
      return candidate;
    }

    try {
      const children = fs.readdirSync(candidate, { withFileTypes: true });
      for (const child of children) {
        if (!child.isDirectory()) {
          continue;
        }
        const nestedNodeDir = path.join(candidate, child.name);
        const nestedNodePath = path.join(nestedNodeDir, nodeBinary);
        if (fs.existsSync(nestedNodePath)) {
          return nestedNodeDir;
        }
      }
    } catch {
      // intentionally empty
    }
  }

  return null;
}

export function getBundledNodePaths(config: PlatformConfig): BundledNodePathsExtended | null {
  const isWindows = config.platform === 'win32';
  const ext = isWindows ? '.exe' : '';
  const scriptExt = isWindows ? '.cmd' : '';

  let nodeDir: string | null = null;
  if (config.isPackaged) {
    if (!config.resourcesPath) {
      return null;
    }
    // Download script outputs: resources/nodejs/{platform}-{arch}/node-v{VERSION}-{platform}-{arch}/
    // After electron-builder copies extraResources, the structure under {resourcesPath}/nodejs/ is:
    //   {platform}-{arch}/node-v{VERSION}-{platform}-{arch}/bin/node  (macOS/Linux)
    //   {platform}-{arch}/node-v{VERSION}-{platform}-{arch}/node.exe  (Windows)
    const platformArch = `${config.platform}-${config.arch}`;
    const nodejsBase = path.join(config.resourcesPath, 'nodejs', platformArch);
    const nodeBinary = isWindows ? 'node.exe' : path.join('bin', 'node');

    if (fs.existsSync(path.join(nodejsBase, nodeBinary))) {
      nodeDir = nodejsBase;
    } else {
      // Search for versioned subdirectory (e.g. node-v24.15.0-win-x64)
      try {
        const children = fs.readdirSync(nodejsBase, { withFileTypes: true });
        for (const child of children) {
          if (!child.isDirectory()) {
            continue;
          }
          const nested = path.join(nodejsBase, child.name);
          if (fs.existsSync(path.join(nested, nodeBinary))) {
            nodeDir = nested;
            break;
          }
        }
      } catch {
        // intentionally empty
      }
    }
  } else {
    nodeDir = resolveDevNodeDir(config);
  }

  if (!nodeDir) {
    return null;
  }

  const binDir = isWindows ? nodeDir : path.join(nodeDir, 'bin');

  return {
    nodePath: path.join(binDir, `node${ext}`),
    npmPath: path.join(binDir, `npm${scriptExt}`),
    npxPath: path.join(binDir, `npx${scriptExt}`),
    binDir,
    nodeDir,
  };
}

export function isBundledNodeAvailable(config: PlatformConfig): boolean {
  const paths = getBundledNodePaths(config);
  if (!paths) {
    return false;
  }
  return fs.existsSync(paths.nodePath);
}

export function getNodePath(config: PlatformConfig): string {
  const bundled = getBundledNodePaths(config);
  if (bundled && fs.existsSync(bundled.nodePath)) {
    return bundled.nodePath;
  }
  throw new Error(
    `[Bundled Node] Bundled Node.js not found at ${bundled?.nodePath ?? '(unknown path)'}. ` +
      'Run "pnpm -F @accomplish/desktop download:nodejs" and rebuild required artifacts.',
  );
}

export function getNpmPath(config: PlatformConfig): string {
  const bundled = getBundledNodePaths(config);
  if (bundled && fs.existsSync(bundled.npmPath)) {
    return bundled.npmPath;
  }
  throw new Error(
    `[Bundled Node] Bundled npm not found at ${bundled?.npmPath ?? '(unknown path)'}. ` +
      'Run "pnpm -F @accomplish/desktop download:nodejs" and rebuild required artifacts.',
  );
}

export function getNpxPath(config: PlatformConfig): string {
  const bundled = getBundledNodePaths(config);
  if (bundled && fs.existsSync(bundled.npxPath)) {
    return bundled.npxPath;
  }
  throw new Error(
    `[Bundled Node] Bundled npx not found at ${bundled?.npxPath ?? '(unknown path)'}. ` +
      'Run "pnpm -F @accomplish/desktop download:nodejs" and rebuild required artifacts.',
  );
}

export function logBundledNodeInfo(config: PlatformConfig): void {
  const paths = getBundledNodePaths(config);

  if (!paths) {
    log.warn(
      '[Bundled Node] Node.js runtime artifacts are missing. ' +
        'Run "pnpm -F @accomplish/desktop download:nodejs" to install them.',
    );
    return;
  }

  log.info('[Bundled Node] Configuration:');
  log.info(`  Platform: ${config.platform}`);
  log.info(`  Architecture: ${config.arch}`);
  log.info(`  Node directory: ${paths.nodeDir}`);
  log.info(`  Node path: ${paths.nodePath}`);
  log.info(`  Available: ${fs.existsSync(paths.nodePath)}`);
}
