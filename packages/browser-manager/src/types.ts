export type BrowserMode = 'launch' | 'extension' | 'external';

export type BrowserState =
  // Starting states
  | { status: 'idle' }
  | { status: 'checking_existing'; port: number }
  | { status: 'launching'; port: number }
  | { status: 'installing_chromium'; progress?: number }
  | { status: 'connecting'; port: number }
  // Running states
  | { status: 'healthy'; port: number; cdpPort: number; mode: BrowserMode; wsEndpoint: string }
  | { status: 'degraded'; port: number; cdpPort: number; mode: BrowserMode; wsEndpoint: string; latency: number }
  | { status: 'reconnecting'; port: number; attempt: number; maxAttempts: number }
  // Failed states
  | { status: 'failed_install'; error: string }
  | { status: 'failed_launch'; error: string }
  | { status: 'failed_port_exhausted'; triedPorts: number[] }
  | { status: 'failed_timeout'; phase: string }
  | { status: 'failed_crashed'; error: string };

export type BrowserStatus = BrowserState['status'];

export interface AcquireOptions {
  preferExisting?: boolean;
  headless?: boolean;
}

export interface HealthCheck {
  httpAlive: boolean;
  cdpAlive: boolean;
  browserAlive: boolean;
  latencyMs: number;
}

export type HealthResult =
  | { status: 'healthy'; latency: number }
  | { status: 'degraded'; latency: number }
  | { status: 'stale' }
  | { status: 'free' };

export interface PortPair {
  http: number;
  cdp: number;
}

export type StateSubscriber = (state: BrowserState) => void;

export interface BrowserManagerConfig {
  portRangeStart?: number;
  portRangeEnd?: number;
  healthCheckIntervalMs?: number;
  reconnectMaxAttempts?: number;
  reconnectBackoffMs?: number[];
  degradedThresholdMs?: number;
}

export const DEFAULT_CONFIG: Required<BrowserManagerConfig> = {
  portRangeStart: 9224,
  portRangeEnd: 9240,
  healthCheckIntervalMs: 30000,
  reconnectMaxAttempts: 3,
  reconnectBackoffMs: [1000, 2000, 4000],
  degradedThresholdMs: 500,
};
