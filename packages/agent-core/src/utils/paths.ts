import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { PlatformConfig } from '../types.js';

export function getDefaultUserDataPath(appName: string): string {
  const platform = process.platform;
  const home = os.homedir();

  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', appName);
  }
  if (platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), appName);
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), appName);
}

export function getDefaultTempPath(): string {
  return os.tmpdir();
}

export function createDefaultPlatformConfig(
  appName: string,
  overrides?: Partial<PlatformConfig>
): PlatformConfig {
  return {
    userDataPath: getDefaultUserDataPath(appName),
    tempPath: getDefaultTempPath(),
    isPackaged: false,
    platform: process.platform,
    arch: process.arch,
    ...overrides,
  };
}

export function resolveUserDataPath(config: PlatformConfig, ...segments: string[]): string {
  return path.join(config.userDataPath, ...segments);
}

export function resolveResourcesPath(
  config: PlatformConfig,
  ...segments: string[]
): string | null {
  if (!config.resourcesPath) {
    return null;
  }
  return path.join(config.resourcesPath, ...segments);
}

export function resolveAppPath(config: PlatformConfig, ...segments: string[]): string | null {
  if (!config.appPath) {
    return null;
  }
  return path.join(config.appPath, ...segments);
}

export function getMcpToolsPath(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(currentDir, '..', '..', 'mcp-tools');
}
