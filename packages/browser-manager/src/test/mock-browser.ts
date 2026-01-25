import type { HealthCheck } from '../types.js';

export type MockState = 'idle' | 'healthy' | 'degraded' | 'disconnected' | 'crashed';
export type PortOccupier = 'external' | 'ours_healthy' | 'ours_stale';

export class MockBrowser {
  private state: MockState = 'idle';
  private healthCheck: HealthCheck = {
    httpAlive: false,
    cdpAlive: false,
    browserAlive: false,
    latencyMs: 0,
  };
  private occupiedPorts = new Map<number, PortOccupier>();
  private crashTimeout: ReturnType<typeof setTimeout> | null = null;
  private slowStartDelay = 0;
  private latencyOverride: number | null = null;

  // State-based methods
  getState(): MockState {
    return this.state;
  }

  setState(state: MockState): void {
    this.state = state;
  }

  setHealthCheck(check: HealthCheck): void {
    this.healthCheck = check;
  }

  getHealthCheck(): HealthCheck {
    if (this.latencyOverride !== null) {
      return { ...this.healthCheck, latencyMs: this.latencyOverride };
    }
    return this.healthCheck;
  }

  setPortOccupied(port: number, occupier: PortOccupier): void {
    this.occupiedPorts.set(port, occupier);
  }

  isPortOccupied(port: number): boolean {
    return this.occupiedPorts.has(port);
  }

  getPortOccupier(port: number): PortOccupier | undefined {
    return this.occupiedPorts.get(port);
  }

  clearPort(port: number): void {
    this.occupiedPorts.delete(port);
  }

  // Behavior-based methods
  simulateCrashAfter(ms: number): void {
    if (this.crashTimeout) {
      clearTimeout(this.crashTimeout);
    }
    this.crashTimeout = setTimeout(() => {
      this.state = 'crashed';
    }, ms);
  }

  simulateSlowStart(ms: number): void {
    this.slowStartDelay = ms;
  }

  getSlowStartDelay(): number {
    return this.slowStartDelay;
  }

  simulateHighLatency(ms: number): void {
    this.latencyOverride = ms;
  }

  simulateIntermittentDisconnect(probability: number): void {
    (this as unknown as { disconnectProbability: number }).disconnectProbability = probability;
  }

  requireInstallation(): void {
    (this as unknown as { needsInstallation: boolean }).needsInstallation = true;
  }

  needsInstallation(): boolean {
    return (this as unknown as { needsInstallation?: boolean }).needsInstallation ?? false;
  }

  reset(): void {
    this.state = 'idle';
    this.healthCheck = {
      httpAlive: false,
      cdpAlive: false,
      browserAlive: false,
      latencyMs: 0,
    };
    this.occupiedPorts.clear();
    if (this.crashTimeout) {
      clearTimeout(this.crashTimeout);
      this.crashTimeout = null;
    }
    this.slowStartDelay = 0;
    this.latencyOverride = null;
  }
}
