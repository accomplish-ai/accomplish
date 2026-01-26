import type { HealthCheck, HealthResult } from './types.js';
import { chromium } from 'playwright';

/**
 * Evaluate health check results into a status
 */
export function evaluateHealth(check: HealthCheck, degradedThresholdMs: number): HealthResult {
  if (!check.httpAlive) {
    return { status: 'free' };
  }

  if (!check.cdpAlive || !check.browserAlive) {
    return { status: 'stale' };
  }

  if (check.latencyMs > degradedThresholdMs) {
    return { status: 'degraded', latency: check.latencyMs };
  }

  return { status: 'healthy', latency: check.latencyMs };
}

/**
 * Perform full health check on a port pair
 */
export async function performHealthCheck(httpPort: number, cdpPort: number): Promise<HealthCheck> {
  const result: HealthCheck = {
    httpAlive: false,
    cdpAlive: false,
    browserAlive: false,
    latencyMs: 0,
  };

  // 1. HTTP check
  const httpController = new AbortController();
  const httpTimeout = setTimeout(() => httpController.abort(), 1000);
  try {
    const res = await fetch(`http://localhost:${httpPort}`, { signal: httpController.signal });
    result.httpAlive = res.ok;
  } catch {
    return result; // HTTP failed, everything else is moot
  } finally {
    clearTimeout(httpTimeout);
  }

  // 2. CDP check
  const cdpController = new AbortController();
  const cdpTimeout = setTimeout(() => cdpController.abort(), 1000);
  try {
    const res = await fetch(`http://localhost:${cdpPort}/json/version`, { signal: cdpController.signal });
    result.cdpAlive = res.ok;
  } catch {
    return result; // CDP failed
  } finally {
    clearTimeout(cdpTimeout);
  }

  // 3. Browser check - connect and run simple command
  const start = Date.now();
  try {
    const browser = await chromium.connectOverCDP(`http://localhost:${cdpPort}`, {
      timeout: 2000,
    });
    try {
      await browser.version();
      result.browserAlive = true;
      result.latencyMs = Date.now() - start;
    } finally {
      await browser.close();
    }
  } catch {
    result.latencyMs = Date.now() - start;
  }

  return result;
}
