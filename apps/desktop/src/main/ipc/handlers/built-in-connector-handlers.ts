/**
 * Built-in Connector IPC Handlers
 *
 * URL setter/getter handlers for connectors with stored server URLs (Lightdash, Datadog).
 * Auth status handler for all 8 built-in connectors.
 * All handlers delegate to ConnectorAuthStore instances.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import type { IpcMainInvokeEvent } from 'electron';
import {
  OAuthProviderId,
  getConnectorDefinitions,
  isOAuthProviderId,
} from '@accomplish_ai/agent-core/common';
import type { ConnectorAuthStatus } from '@accomplish_ai/agent-core/common';
import { getConnectorAuthStore } from '../../connectors/connector-auth-registry';
import { connectBuiltInConnector } from '../../connectors/connector-token-resolver';
import {
  isDesktopConnectorConnected,
  setDesktopConnectorConnected,
  GH_BINARY_CANDIDATES,
  buildGhAugmentedPath,
} from '../../connectors/desktop-connector-state';
import { handle } from './utils';

const execFileAsync = promisify(execFile);

/** Validate and return a trimmed server URL, or throw with a connector-specific message. */
function validateServerUrl(url: unknown, connectorName: string): string {
  const trimmed = typeof url === 'string' ? url.trim() : '';
  if (!trimmed) {
    throw new Error(`Invalid ${connectorName} server URL`);
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('URL must use http or https');
    }
  } catch {
    throw new Error(`Invalid ${connectorName} server URL`);
  }
  return trimmed;
}

/** Check existing gh CLI token at startup and seed in-memory state. */
async function initGitHubState(): Promise<void> {
  const augmentedEnv = { ...process.env, PATH: buildGhAugmentedPath() };
  for (const bin of GH_BINARY_CANDIDATES) {
    try {
      const { stdout } = await execFileAsync(bin, ['auth', 'token'], {
        timeout: 10_000,
        env: augmentedEnv,
      });
      const token = stdout.trim();
      if (token) {
        const ghStore = getConnectorAuthStore(OAuthProviderId.GitHub);
        ghStore?.setTokens({ accessToken: token, tokenType: 'bearer' }, Date.now());
        setDesktopConnectorConnected(OAuthProviderId.GitHub, true);
        return;
      }
    } catch {
      // try next candidate
    }
  }
}

export function registerBuiltInConnectorHandlers(): void {
  // Initialize GitHub state from existing gh CLI session (fire-and-forget)
  void initGitHubState();
  // Lightdash instance URL
  handle('lightdash:get-server-url', async (_event: IpcMainInvokeEvent) => {
    const store = getConnectorAuthStore(OAuthProviderId.Lightdash);
    return store?.getServerUrl() ?? null;
  });

  handle('lightdash:set-server-url', async (_event: IpcMainInvokeEvent, url: string) => {
    const store = getConnectorAuthStore(OAuthProviderId.Lightdash);
    if (!store) {
      throw new Error('Lightdash connector not configured');
    }
    store.setServerUrl(validateServerUrl(url, 'Lightdash'));
  });

  // Datadog site URL
  handle('datadog:get-server-url', async (_event: IpcMainInvokeEvent) => {
    const store = getConnectorAuthStore(OAuthProviderId.Datadog);
    return store?.getServerUrl() ?? null;
  });

  handle('datadog:set-server-url', async (_event: IpcMainInvokeEvent, url: string) => {
    const store = getConnectorAuthStore(OAuthProviderId.Datadog);
    if (!store) {
      throw new Error('Datadog connector not configured');
    }
    store.setServerUrl(validateServerUrl(url, 'Datadog'));
  });

  // Auth status for all built-in connectors
  handle('connectors:get-built-in-auth-status', async (_event: IpcMainInvokeEvent) => {
    const defs = getConnectorDefinitions();
    const statuses: ConnectorAuthStatus[] = defs.map((def) => {
      const store = getConnectorAuthStore(def.id);
      if (!store) {
        // GitHub and Google use custom flows — check in-memory state
        return {
          providerId: def.id,
          connected: isDesktopConnectorConnected(def.id),
          pendingAuthorization: false,
        };
      }
      const status = store.getOAuthStatus();
      return {
        providerId: def.id,
        connected: status.connected,
        pendingAuthorization: status.pendingAuthorization,
        lastValidatedAt: status.lastValidatedAt,
      };
    });
    return statuses;
  });

  // Authenticate a built-in connector
  handle(
    'connectors:built-in-login',
    async (_event: IpcMainInvokeEvent, providerId: OAuthProviderId) => {
      if (!isOAuthProviderId(providerId)) {
        throw new Error(`Unknown provider ID: ${String(providerId)}`);
      }
      const result = await connectBuiltInConnector(providerId);
      if (!result.ok) {
        throw new Error(
          result.message ?? `Authentication failed for ${providerId}: ${result.error}`,
        );
      }
      return { ok: true };
    },
  );

  // Disconnect a built-in connector
  handle(
    'connectors:built-in-logout',
    async (_event: IpcMainInvokeEvent, providerId: OAuthProviderId) => {
      if (!isOAuthProviderId(providerId)) {
        throw new Error(`Unknown provider ID: ${String(providerId)}`);
      }
      const store = getConnectorAuthStore(providerId);
      if (store) {
        store.clearTokens();
      } else {
        // GitHub / Google — clear in-memory state
        setDesktopConnectorConnected(providerId, false);
      }
    },
  );
}
