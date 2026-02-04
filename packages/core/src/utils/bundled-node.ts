import * as path from 'path';
import * as fs from 'fs';
import type { PlatformConfig, BundledNodePaths } from '../types.js';

export interface BundledNodePathsExtended extends BundledNodePaths {
  nodeDir: string;
}

export function getBundledNodePaths(config: PlatformConfig): BundledNodePathsExtended | null {
  if (!config.isPackaged) {
    return null;
  }

  if (!config.resourcesPath) {
    return null;
  }

  const isWindows = config.platform === 'win32';
  const ext = isWindows ? '.exe' : '';
  const scriptExt = isWindows ? '.cmd' : '';

  const nodeDir = path.join(config.resourcesPath, 'nodejs', config.arch);
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
  if (config.isPackaged) {
    console.warn('[Bundled Node] WARNING: Bundled Node.js not found, falling back to system node');
  }
  return 'node';
}

export function getNpmPath(config: PlatformConfig): string {
  const bundled = getBundledNodePaths(config);
  if (bundled && fs.existsSync(bundled.npmPath)) {
    return bundled.npmPath;
  }
  if (config.isPackaged) {
    console.warn('[Bundled Node] WARNING: Bundled npm not found, falling back to system npm');
  }
  return 'npm';
}

export function getNpxPath(config: PlatformConfig): string {
  const bundled = getBundledNodePaths(config);
  if (bundled && fs.existsSync(bundled.npxPath)) {
    return bundled.npxPath;
  }
  if (config.isPackaged) {
    console.warn('[Bundled Node] WARNING: Bundled npx not found, falling back to system npx');
  }
  return 'npx';
}

export function logBundledNodeInfo(config: PlatformConfig): void {
  const paths = getBundledNodePaths(config);

  if (!paths) {
    console.log('[Bundled Node] Development mode - using system Node.js');
    return;
  }

  console.log('[Bundled Node] Configuration:');
  console.log(`  Platform: ${config.platform}`);
  console.log(`  Architecture: ${config.arch}`);
  console.log(`  Node directory: ${paths.nodeDir}`);
  console.log(`  Node path: ${paths.nodePath}`);
  console.log(`  Available: ${fs.existsSync(paths.nodePath)}`);
}
