import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProviderId, ConnectedProvider, ApiKeyCredentials } from '@accomplish_ai/agent-core';
import { DEFAULT_PROVIDERS } from '@accomplish_ai/agent-core/common';
import { getAccomplish } from '@/lib/accomplish';
import { createLogger } from '@/lib/logger';
import { useProviderModels } from './useProviderModels';

const logger = createLogger('useApiKeyConnect');

export interface UseApiKeyConnectOptions {
  providerId: ProviderId;
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  isOpenAI: boolean;
  hasEditableBaseUrl: boolean;
  defaultBaseUrl: string;
}

export interface UseApiKeyConnectReturn {
  apiKey: string;
  setApiKey: (v: string) => void;
  connecting: boolean;
  error: string | null;
  setError: (v: string | null) => void;
  openAiBaseUrl: string;
  setOpenAiBaseUrl: (v: string) => void;
  customBaseUrl: string;
  setCustomBaseUrl: (v: string) => void;
  fetchedModels: Array<{ id: string; name: string }> | null;
  isConnected: boolean;
  handleConnect: () => Promise<void>;
}

/** Handles API key + base URL connection logic for ClassicProviderForm. */
export function useApiKeyConnect({
  providerId,
  connectedProvider,
  onConnect,
  isOpenAI,
  hasEditableBaseUrl,
  defaultBaseUrl,
}: UseApiKeyConnectOptions): UseApiKeyConnectReturn {
  const { t } = useTranslation('settings');
  const [apiKey, setApiKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openAiBaseUrl, setOpenAiBaseUrl] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');

  const providerConfig = DEFAULT_PROVIDERS.find((p) => p.id === providerId);
  const isConnected = connectedProvider?.connectionStatus === 'connected';
  const connectedProviderBaseUrl = hasEditableBaseUrl
    ? connectedProvider?.customBaseUrl || defaultBaseUrl || undefined
    : undefined;

  // Issue #2: AbortController cleanup for getOpenAiBaseUrl effect
  useEffect(() => {
    if (!isOpenAI) return;
    const controller = new AbortController();
    const accomplish = getAccomplish();
    accomplish
      .getOpenAiBaseUrl()
      .then((url) => {
        if (!controller.signal.aborted) setOpenAiBaseUrl(url);
      })
      .catch((err) => {
        if (!controller.signal.aborted) logger.error('Failed to load OpenAI base URL:', err);
      });
    return () => controller.abort();
  }, [isOpenAI]);

  useEffect(() => {
    if (!hasEditableBaseUrl) return;
    setCustomBaseUrl(connectedProvider?.customBaseUrl || '');
  }, [hasEditableBaseUrl, connectedProvider?.customBaseUrl]);

  // Issue #1: model-fetching delegated to useProviderModels hook
  const fetchedModels = useProviderModels({
    providerId,
    connectedProvider,
    isConnected,
    isOpenAI,
    openAiBaseUrl,
    connectedProviderBaseUrl,
  });

  const handleConnect = async () => {
    if (!apiKey.trim()) {
      setError(t('apiKey.enterKeyRequired'));
      return;
    }
    if (isOpenAI && openAiBaseUrl.trim()) {
      try {
        const parsed = new URL(openAiBaseUrl.trim());
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          setError(t('connectors.urlMustBeHttp'));
          return;
        }
      } catch {
        setError(t('connectors.invalidUrl'));
        return;
      }
    }
    if (hasEditableBaseUrl && customBaseUrl.trim()) {
      try {
        const parsed = new URL(customBaseUrl.trim());
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          setError(t('connectors.urlMustBeHttp'));
          return;
        }
      } catch {
        setError(t('connectors.invalidUrl'));
        return;
      }
    }
    setConnecting(true);
    setError(null);
    try {
      const accomplish = getAccomplish();
      // Issue #3: use openAiBaseUrl consistently for OpenAI resolvedBaseUrl
      let resolvedBaseUrl: string | undefined;
      if (isOpenAI) {
        resolvedBaseUrl = openAiBaseUrl.trim() || undefined;
        await accomplish.setOpenAiBaseUrl(resolvedBaseUrl ?? '');
      } else if (hasEditableBaseUrl) {
        const explicitCustomBaseUrl = customBaseUrl.trim();
        resolvedBaseUrl = explicitCustomBaseUrl || defaultBaseUrl || undefined;
      }
      const explicitCustomBaseUrl = hasEditableBaseUrl && !isOpenAI ? customBaseUrl.trim() : '';
      const validation = await accomplish.validateApiKeyForProvider(providerId, apiKey.trim(), {
        baseUrl: resolvedBaseUrl,
      });
      if (!validation.valid) {
        setError(validation.error || t('apiKey.invalidKey'));
        setConnecting(false);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await accomplish.addApiKey(providerId as any, apiKey.trim());
      let models: Array<{ id: string; name: string }> | undefined;
      if (providerConfig?.modelsEndpoint) {
        const fetchResult = await accomplish.fetchProviderModels(providerId, {
          baseUrl: resolvedBaseUrl,
        });
        if (fetchResult.success && fetchResult.models) {
          models = fetchResult.models;
        }
      }
      const defaultModelId = providerConfig?.defaultModelId ?? null;
      const resolvedModelId = models?.some((m) => m.id === defaultModelId) ? defaultModelId : null;
      const trimmedKey = apiKey.trim();
      onConnect({
        providerId,
        connectionStatus: 'connected',
        selectedModelId: resolvedModelId,
        credentials: {
          type: 'api_key',
          keyPrefix:
            trimmedKey.length > 20 ? trimmedKey.substring(0, 20) + '...' : trimmedKey,
        } as ApiKeyCredentials,
        lastConnectedAt: new Date().toISOString(),
        ...(models ? { availableModels: models } : {}),
        ...(explicitCustomBaseUrl ? { customBaseUrl: explicitCustomBaseUrl } : {}),
      });
      setApiKey('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('status.connectionFailed'));
    } finally {
      setConnecting(false);
    }
  };

  return {
    apiKey,
    setApiKey,
    connecting,
    error,
    setError,
    openAiBaseUrl,
    setOpenAiBaseUrl,
    customBaseUrl,
    setCustomBaseUrl,
    fetchedModels,
    isConnected,
    handleConnect,
  };
}
