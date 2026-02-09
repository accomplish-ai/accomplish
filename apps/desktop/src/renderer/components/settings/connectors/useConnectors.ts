import { useState, useCallback, useEffect } from 'react';
import type { McpConnector } from '@accomplish_ai/agent-core/common';
import { getAccomplish } from '@/lib/accomplish';

export function useConnectors() {
  const [connectors, setConnectors] = useState<McpConnector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConnectors = useCallback(async () => {
    try {
      const accomplish = getAccomplish();
      const data = await accomplish.getConnectors();
      setConnectors(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load connectors:', err);
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

  const toggleEnabled = useCallback(async (id: string) => {
    const connector = connectors.find((c) => c.id === id);
    if (!connector) return;

    const accomplish = getAccomplish();
    await accomplish.setConnectorEnabled(id, !connector.isEnabled);
    setConnectors((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isEnabled: !c.isEnabled } : c))
    );
  }, [connectors]);

  const startOAuth = useCallback(async (connectorId: string) => {
    setConnectors((prev) =>
      prev.map((c) => (c.id === connectorId ? { ...c, status: 'connecting' as const } : c))
    );

    try {
      const accomplish = getAccomplish();
      return await accomplish.startConnectorOAuth(connectorId);
    } catch (err) {
      setConnectors((prev) =>
        prev.map((c) => (c.id === connectorId ? { ...c, status: 'error' as const } : c))
      );
      throw err;
    }
  }, []);

  const completeOAuth = useCallback(async (state: string, code: string) => {
    const accomplish = getAccomplish();
    const updated = await accomplish.completeConnectorOAuth(state, code);
    if (updated) {
      setConnectors((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      );
    }
    return updated;
  }, []);

  const disconnect = useCallback(async (connectorId: string) => {
    const accomplish = getAccomplish();
    await accomplish.disconnectConnector(connectorId);
    setConnectors((prev) =>
      prev.map((c) =>
        c.id === connectorId ? { ...c, status: 'disconnected' as const } : c
      )
    );
  }, []);

  return {
    connectors,
    loading,
    error,
    addConnector,
    deleteConnector,
    toggleEnabled,
    startOAuth,
    completeOAuth,
    disconnect,
    refetch: fetchConnectors,
  };
}
