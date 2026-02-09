import { app } from 'electron';
import {
  getBundledNodePaths as coreGetBundledNodePaths,
  isBundledNodeAvailable as coreIsBundledNodeAvailable,
  getNodePath as coreGetNodePath,
  getNpmPath as coreGetNpmPath,
  getNpxPath as coreGetNpxPath,
  logBundledNodeInfo as coreLogBundledNodeInfo,
  type BundledNodePathsExtended,
} from '@accomplish_ai/agent-core';
import type { PlatformConfig } from '@accomplish_ai/agent-core';

export type { BundledNodePathsExtended as BundledNodePaths };

function getElectronPlatformConfig(): PlatformConfig {
  return {
    userDataPath: app.getPath('userData'),
    tempPath: app.getPath('temp'),
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    platform: process.platform,
    arch: process.arch,
  };
}

export function getBundledNodePaths(): BundledNodePathsExtended | null {
  return coreGetBundledNodePaths(getElectronPlatformConfig());
}

export function isBundledNodeAvailable(): boolean {
  return coreIsBundledNodeAvailable(getElectronPlatformConfig());
}

export function getNodePath(): string {
  return coreGetNodePath(getElectronPlatformConfig());
}

export function getNpmPath(): string {
  return coreGetNpmPath(getElectronPlatformConfig());
}

export function getNpxPath(): string {
  return coreGetNpxPath(getElectronPlatformConfig());
}

export function logBundledNodeInfo(): void {
  coreLogBundledNodeInfo(getElectronPlatformConfig());
}
