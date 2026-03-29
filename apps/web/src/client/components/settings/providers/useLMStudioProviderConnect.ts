import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccomplish } from '@/lib/accomplish';
import type {
  ConnectedProvider,
  LMStudioCredentials,
  ToolSupportStatus,
} from '@accomplish_ai/agent-core/common';

export interface LMStudioModel {
  id: string;
  name: string;
  toolSupport: ToolSupportStatus;
}

interface UseLMStudioProviderConnectOptions {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onUpdateProvider?: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
}

export interface UseLMStudioProviderConnectReturn {
  serverUrl: string;
  setServerUrl: (url: string) => void;
  connecting: boolean;
  refreshing: boolean;
  error: string | null;
  models: LMStudioModel[];
  handleConnect: () => Promise<void>;
  handleRefresh: () => Promise<void>;
}

export function useLMStudioProviderConnect({
  connectedProvider,
  onConnect,
  onUpdateProvider,
}: UseLMStudioProviderConnectOptions): UseLMStudioProviderConnectReturn {
  const { t } = useTranslation('settings');
  const [serverUrl, setServerUrl] = useState('http://localhost:1234');
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<LMStudioModel[]>([]);

  const latestProviderRef = useRef(connectedProvider);
  const refreshRequestIdRef = useRef(0);

  useEffect(() => {
    latestProviderRef.current = connectedProvider;
  }, [connectedProvider]);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();
      const result = await accomplish.testLMStudioConnection(serverUrl);

      if (!result.success) {
        setError(result.error || t('status.connectionFailed'));
        setConnecting(false);
        return;
      }

      const models = (result.models || []) as LMStudioModel[];
      setAvailableModels(models);

      const provider: ConnectedProvider = {
        providerId: 'lmstudio',
        connectionStatus: 'connected',
        selectedModelId: null,
        credentials: {
          type: 'lmstudio',
          serverUrl,
        } as LMStudioCredentials,
        lastConnectedAt: new Date().toISOString(),
        availableModels: models.map((m) => ({
          id: `lmstudio/${m.id}`,
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
        (baseProvider.credentials as LMStudioCredentials)?.serverUrl || 'http://localhost:1234';
      const result = await accomplish.testLMStudioConnection(currentUrl);

      if (!result.success) {
        setError(result.error || t('status.connectionFailed'));
        return;
      }

      if (requestId !== refreshRequestIdRef.current) {
        return;
      }
      const latestProvider = latestProviderRef.current;
      if (!latestProvider || latestProvider.connectionStatus !== 'connected') {
        return;
      }

      const freshModels = (result.models || []) as LMStudioModel[];
      setAvailableModels(freshModels);

      const freshModelIds = new Set(freshModels.map((m) => `lmstudio/${m.id}`));
      const keepSelectedModel =
        latestProvider.selectedModelId && freshModelIds.has(latestProvider.selectedModelId)
          ? latestProvider.selectedModelId
          : null;

      const updatedProvider: ConnectedProvider = {
        ...latestProvider,
        selectedModelId: keepSelectedModel,
        availableModels: freshModels.map((m) => ({
          id: `lmstudio/${m.id}`,
          name: m.name,
          toolSupport: m.toolSupport,
        })),
      };

      (onUpdateProvider || onConnect)(updatedProvider);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('status.connectionFailed'));
    } finally {
      setRefreshing(false);
    }
  };

  const models: LMStudioModel[] = (connectedProvider?.availableModels || availableModels).map(
    (m) => {
      const id = m.id.replace(/^lmstudio\//, '');
      return {
        id,
        name: m.name,
        toolSupport: (m as { toolSupport?: ToolSupportStatus }).toolSupport || 'unknown',
      };
    },
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
