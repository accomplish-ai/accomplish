import type { HealthCheckResult } from '@accomplish_ai/agent-core';

export const VERSION = '0.1.0';
const startTime = Date.now();

export class HealthService {
  private _activeTaskCount = 0;

  setActiveTaskCount(count: number): void {
    this._activeTaskCount = count;
  }

  getStatus(): HealthCheckResult {
    return {
      version: VERSION,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      activeTasks: this._activeTaskCount,
      memoryUsage: process.memoryUsage().heapUsed,
    };
  }
}
