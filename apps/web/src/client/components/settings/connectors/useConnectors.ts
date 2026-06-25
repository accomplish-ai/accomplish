import { useState, useCallback, useEffect } from 'react';
import type { McpConnector } from '@accomplish_ai/agent-core/common';
import type { ConnectorAuthStatus, OAuthProviderId } from '@accomplish_ai/agent-core/common';
import { getAccomplish } from '@/lib/accomplish';
import { createLogger } from '@/lib/logger';

const logger = createLogger('useConnectors');

export interface SlackMcpAuthState {
  connected: boolean;
  pendingAuthorization: boolean;
}

export function useConnectors() {
  const [connectors, setConnectors] = useState<McpConnector[]>([]);
  const [slackAuth, setSlackAuth] = useState<SlackMcpAuthState>({
    connected: false,
    pendingAuthorization: false,
  });
  const [builtInAuthStates, setBuiltInAuthStates] = useState<Record<string, ConnectorAuthStatus>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConnectors = useCallback(async () => {
    const accomplish = getAccomplish();
    try {
      const [connectorsResult, slackStatusResult, builtInStatusResult] = await Promise.allSettled([
        accomplish.getConnectors(),
        accomplish.getSlackMcpOauthStatus(),
        accomplish.getBuiltInConnectorAuthStatus(),
      ]);

      if (connectorsResult.status === 'fulfilled') {
        setConnectors(connectorsResult.value);
      }

      if (slackStatusResult.status === 'fulfilled') {
        setSlackAuth(slackStatusResult.value);
      }

      if (builtInStatusResult.status === 'fulfilled') {
        const statusMap: Record<string, ConnectorAuthStatus> = {};
        for (const status of builtInStatusResult.value) {
          statusMap[status.providerId] = status;
        }
        setBuiltInAuthStates(statusMap);
      }

      if (
        connectorsResult.status === 'rejected' &&
        slackStatusResult.status === 'rejected' &&
        builtInStatusResult.status === 'rejected'
      ) {
        throw connectorsResult.reason;
      }

      setError(null);
    } catch (err) {
      logger.error('Failed to load connectors:', err);
      setError(err instanceof Error ? err.message : 'Failed to load connectors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnectors();
  }, [fetchConnectors]);

  const addConnector = useCallback(async (name: string, url: string) => {
    const accomplish = getAccomplish();
    const connector = await accomplish.addConnector(name, url);
    setConnectors((prev) => [connector, ...prev]);
    return connector;
  }, []);

  const deleteConnector = useCallback(async (id: string) => {
    const accomplish = getAccomplish();
    await accomplish.deleteConnector(id);
    setConnectors((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const toggleEnabled = useCallback(
    async (id: string) => {
      const connector = connectors.find((c) => c.id === id);
      if (!connector) {
        return;
      }

      const accomplish = getAccomplish();
      await accomplish.setConnectorEnabled(id, !connector.isEnabled);
      setConnectors((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isEnabled: !c.isEnabled } : c)),
      );
    },
    [connectors],
  );

  const startOAuth = useCallback(async (connectorId: string) => {
    setConnectors((prev) =>
      prev.map((c) => (c.id === connectorId ? { ...c, status: 'connecting' as const } : c)),
    );

    try {
      const accomplish = getAccomplish();
      const result = await accomplish.startConnectorOAuth(connectorId);
      if (result && 'connector' in result) {
        setConnectors((prev) =>
          prev.map((c) => (c.id === result.connector.id ? result.connector : c)),
        );
      }
      return result;
    } catch (err) {
      setConnectors((prev) =>
        prev.map((c) => (c.id === connectorId ? { ...c, status: 'error' as const } : c)),
      );
      throw err;
    }
  }, []);

  const completeOAuth = useCallback(async (state: string, code: string) => {
    const accomplish = getAccomplish();
    const updated = await accomplish.completeConnectorOAuth(state, code);
    if (updated) {
      setConnectors((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    }
    return updated;
  }, []);

  const disconnect = useCallback(async (connectorId: string) => {
    const accomplish = getAccomplish();
    await accomplish.disconnectConnector(connectorId);
    setConnectors((prev) =>
      prev.map((c) => (c.id === connectorId ? { ...c, status: 'disconnected' as const } : c)),
    );
  }, []);

  // Built-in connector actions
  const authenticateBuiltIn = useCallback(
    async (providerId: OAuthProviderId) => {
      setBuiltInAuthStates((prev) => ({
        ...prev,
        [providerId]: {
          ...(prev[providerId] ?? { providerId, connected: false, pendingAuthorization: false }),
          pendingAuthorization: true,
        },
      }));

      try {
        const accomplish = getAccomplish();
        await accomplish.loginBuiltInConnector(providerId);
        await fetchConnectors();
      } catch (err) {
        setBuiltInAuthStates((prev) => ({
          ...prev,
          [providerId]: {
            ...(prev[providerId] ?? { providerId, connected: false, pendingAuthorization: false }),
            pendingAuthorization: false,
          },
        }));
        throw err;
      }
    },
    [fetchConnectors],
  );

  const disconnectBuiltIn = useCallback(async (providerId: OAuthProviderId) => {
    const accomplish = getAccomplish();
    await accomplish.logoutBuiltInConnector(providerId);
    setBuiltInAuthStates((prev) => ({
      ...prev,
      [providerId]: {
        providerId,
        connected: false,
        pendingAuthorization: false,
      },
    }));
  }, []);

  const authenticateSlack = useCallback(async () => {
    const accomplish = getAccomplish();

    setSlackAuth(() => ({
      connected: false,
      pendingAuthorization: true,
    }));

    try {
      if (slackAuth.pendingAuthorization) {
        await accomplish.logoutSlackMcp();
      }

      await accomplish.loginSlackMcp();
      const status = await accomplish.getSlackMcpOauthStatus();
      setSlackAuth(status);
      return status;
    } catch (err) {
      try {
        const status = await accomplish.getSlackMcpOauthStatus();
        setSlackAuth(status);
      } catch {
        setSlackAuth({ connected: false, pendingAuthorization: false });
      }
      throw err;
    }
  }, [slackAuth.pendingAuthorization]);

  const disconnectSlack = useCallback(async () => {
    const accomplish = getAccomplish();
    await accomplish.logoutSlackMcp();
    setSlackAuth({ connected: false, pendingAuthorization: false });
  }, []);

  return {
    connectors,
    slackAuth,
    builtInAuthStates,
    loading,
    error,
    addConnector,
    deleteConnector,
    toggleEnabled,
    startOAuth,
    completeOAuth,
    disconnect,
    authenticateBuiltIn,
    disconnectBuiltIn,
    authenticateSlack,
    disconnectSlack,
    refetch: fetchConnectors,
  };
}
