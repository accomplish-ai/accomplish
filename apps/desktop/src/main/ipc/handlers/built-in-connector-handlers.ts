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
import { OAuthProviderId, getConnectorDefinitions } from '@accomplish_ai/agent-core/common';
import type { ConnectorAuthStatus } from '@accomplish_ai/agent-core/common';
import { getConnectorAuthStore } from '../../connectors/connector-auth-store';
import { connectBuiltInConnector } from '../../connectors/connector-token-resolver';
import {
  isDesktopConnectorConnected,
  setDesktopConnectorConnected,
} from '../../connectors/desktop-connector-state';
import { handle } from './utils';

const execFileAsync = promisify(execFile);

/** Check existing gh CLI token at startup and seed in-memory state. */
async function initGitHubState(): Promise<void> {
  const candidates = [
    'gh',
    '/opt/homebrew/bin/gh',
    '/usr/local/bin/gh',
    '/usr/bin/gh',
    '/home/linuxbrew/.linuxbrew/bin/gh',
  ];
  for (const bin of candidates) {
    try {
      const { stdout } = await execFileAsync(bin, ['auth', 'token'], { timeout: 10_000 });
      if (stdout.trim()) {
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
    if (typeof url !== 'string' || !url.trim()) {
      throw new Error('Invalid Lightdash server URL');
    }
    store.setServerUrl(url.trim());
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
    if (typeof url !== 'string' || !url.trim()) {
      throw new Error('Invalid Datadog server URL');
    }
    store.setServerUrl(url.trim());
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
      if (!Object.values(OAuthProviderId).includes(providerId)) {
        throw new Error(`Unknown provider ID: ${providerId}`);
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
      if (!Object.values(OAuthProviderId).includes(providerId)) {
        throw new Error(`Unknown provider ID: ${providerId}`);
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
