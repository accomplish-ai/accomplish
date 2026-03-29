import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccomplish } from '@/lib/accomplish';
import type {
  ConnectedProvider,
  OllamaCredentials,
  ToolSupportStatus,
} from '@accomplish_ai/agent-core';
import type { OllamaModel } from './ollama-types';

export type { OllamaModel } from './ollama-types';

interface UseOllamaProviderConnectOptions {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onUpdateProvider?: (provider: ConnectedProvider) => void;
}

export interface UseOllamaProviderConnectReturn {
  serverUrl: string;
  setServerUrl: (url: string) => void;
  connecting: boolean;
  refreshing: boolean;
  error: string | null;
  models: OllamaModel[];
  handleConnect: () => Promise<void>;
  handleRefresh: () => Promise<void>;
}

export function useOllamaProviderConnect({
  connectedProvider,
  onConnect,
  onUpdateProvider,
}: UseOllamaProviderConnectOptions): UseOllamaProviderConnectReturn {
  const { t } = useTranslation('settings');
  const [serverUrl, setServerUrl] = useState(
    () =>
      (connectedProvider?.credentials as OllamaCredentials | undefined)?.serverUrl ||
      'http://localhost:11434',
  );
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<OllamaModel[]>([]);

  const latestProviderRef = useRef(connectedProvider);
  const refreshRequestIdRef = useRef(0);

  useEffect(() => {
    latestProviderRef.current = connectedProvider;
    const nextServerUrl = (connectedProvider?.credentials as OllamaCredentials | undefined)
      ?.serverUrl;
    if (nextServerUrl) {
      setServerUrl(nextServerUrl);
    }
  }, [connectedProvider]);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();
      const result = await accomplish.testOllamaConnection(serverUrl);

      if (!result.success) {
        setError(result.error || t('status.connectionFailed'));
        setConnecting(false);
        return;
      }

      const models: OllamaModel[] = (result.models || []).map((m) => ({
        id: `ollama/${m.id}`,
        name: m.displayName,
        toolSupport: m.toolSupport || 'unknown',
      }));
      setAvailableModels(models);

      const provider: ConnectedProvider = {
        providerId: 'ollama',
        connectionStatus: 'connected',
        selectedModelId: null,
        credentials: {
          type: 'ollama',
          serverUrl,
        } as OllamaCredentials,
        lastConnectedAt: new Date().toISOString(),
        availableModels: models.map((m) => ({
          id: m.id,
          name: m.name,
          toolSupport: m.toolSupport,
        })),
      };

      onConnect(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('status.connectionFailed'));
    } finally {
      setConnecting(false);
    }
  };

  const handleRefresh = async () => {
    const baseProvider = latestProviderRef.current;
    if (!baseProvider) {
      return;
    }
    const requestId = ++refreshRequestIdRef.current;
    setRefreshing(true);
    setError(null);

    try {
      const accomplish = getAccomplish();
      const currentUrl =
        (baseProvider.credentials as OllamaCredentials)?.serverUrl || 'http://localhost:11434';
      const result = await accomplish.testOllamaConnection(currentUrl);

      if (requestId !== refreshRequestIdRef.current) {
        return;
      }

      if (!result.success) {
        setError(result.error || t('status.connectionFailed'));
        return;
      }

      const latestProvider = latestProviderRef.current;
      if (!latestProvider || latestProvider.connectionStatus !== 'connected') {
        return;
      }

      const freshModels: OllamaModel[] = (result.models || []).map((m) => ({
        id: `ollama/${m.id}`,
        name: m.displayName,
        toolSupport: m.toolSupport || 'unknown',
      }));
      setAvailableModels(freshModels);

      const freshModelIds = new Set(freshModels.map((m) => m.id));
      const keepSelectedModel =
        latestProvider.selectedModelId && freshModelIds.has(latestProvider.selectedModelId)
          ? latestProvider.selectedModelId
          : null;

      const updatedProvider: ConnectedProvider = {
        ...latestProvider,
        selectedModelId: keepSelectedModel,
        availableModels: freshModels.map((m) => ({
          id: m.id,
          name: m.name,
          toolSupport: m.toolSupport,
        })),
      };

      (onUpdateProvider || onConnect)(updatedProvider);
    } catch (err) {
      if (requestId !== refreshRequestIdRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : t('status.connectionFailed'));
    } finally {
      if (requestId === refreshRequestIdRef.current) {
        setRefreshing(false);
      }
    }
  };

  const models: OllamaModel[] = (connectedProvider?.availableModels || availableModels).map(
    (m) => ({
      id: m.id,
      name: m.name,
      toolSupport: (m as { toolSupport?: ToolSupportStatus }).toolSupport || 'unknown',
    }),
  );

  return {
    serverUrl,
    setServerUrl,
    connecting,
    refreshing,
    error,
    models,
    handleConnect,
    handleRefresh,
  };
}
