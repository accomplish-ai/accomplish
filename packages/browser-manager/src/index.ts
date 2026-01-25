export type {
  BrowserMode,
  BrowserState,
  BrowserStatus,
  AcquireOptions,
  HealthCheck,
  HealthResult,
  PortPair,
  StateSubscriber,
  BrowserManagerConfig,
} from './types.js';

export { DEFAULT_CONFIG } from './types.js';

export { findAvailablePorts, checkPortStatus, PortExhaustedError } from './port-finder.js';
export type { PortStatus } from './port-finder.js';

export { evaluateHealth, performHealthCheck } from './health.js';

export { getPlatformDataDir, getProfileDir, ensureProfileDir } from './profile.js';

export { detectPackageManager, isChromiumInstalled, installChromium } from './installer.js';
export type { PackageManager } from './installer.js';

export { LaunchModeLauncher } from './launcher.js';
export type { Launcher, LaunchOptions, LaunchResult } from './launcher.js';

export { BrowserManager } from './manager.js';
