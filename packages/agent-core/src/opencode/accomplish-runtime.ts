/**
 * AccomplishRuntime — adapter interface for the Accomplish AI free-tier gateway.
 *
 * OSS ships a noop implementation. The real implementation lives in the private
 * @accomplish/llm-gateway-client package and is injected at daemon startup via
 * dynamic import.
 *
 * All call sites (config-builder, daemon-routes, IPC handlers) depend on this
 * interface, never on the proxy implementation directly.
 */

import type { CreditUsage } from '../common/types/gateway.js';
import type { ProviderBuildResult } from './config-provider-context.js';

// ─── Storage dependency injection ────────────────────────────────────────────

export interface StorageDeps {
  readKey: (key: string) => string | null;
  writeKey: (key: string, value: string) => void;
  readGaClientId: () => string | null;
}

// ─── Connect result ──────────────────────────────────────────────────────────

export interface AccomplishConnectResult {
  deviceFingerprint: string;
  /**
   * Full usage with preserved totals. When exhausted, the runtime MUST populate
   * totalCredits from its own cache and set spentCredits = totalCredits,
   * remainingCredits = 0. The OSS daemon-routes layer does NOT rebuild
   * exhausted usage — it forwards the result as-is.
   */
  usage: CreditUsage | null;
  /** True when credits are exhausted (connect still succeeds for persistence). */
  exhausted?: boolean;
  /** ISO 8601 reset timestamp (present when exhausted). */
  resetsAt?: string;
}

// ─── Runtime interface ───────────────────────────────────────────────────────

export interface AccomplishRuntime {
  /** Connect to the gateway: load identity, bootstrap DPoP token. */
  connect(deps: StorageDeps): Promise<AccomplishConnectResult>;

  /** Disconnect: clear in-memory token/identity state. */
  disconnect(): void;

  /** Fetch live credit usage from the gateway. */
  getUsage(): Promise<CreditUsage>;

  /** Subscribe to real-time credit usage updates (from response headers). */
  onUsageUpdate(listener: (usage: CreditUsage) => void): () => void;

  /** Build OpenCode provider config (starts proxy if needed). */
  buildProviderConfig(deps: StorageDeps): Promise<ProviderBuildResult>;

  /** Whether the real runtime implementation is loaded (false for noop). */
  isAvailable(): boolean;
}

// ─── Noop runtime (OSS default — fails closed) ──────────────────────────────

const UNAVAILABLE_ERROR = 'accomplish_runtime_unavailable';

export const noopRuntime: AccomplishRuntime = {
  connect: async () => {
    throw new Error(UNAVAILABLE_ERROR);
  },
  disconnect: () => {},
  getUsage: async () => {
    throw new Error(UNAVAILABLE_ERROR);
  },
  onUsageUpdate: () => () => {},
  buildProviderConfig: async () => ({ configs: [], enableToAdd: [] }),
  isAvailable: () => false,
};
