import { useState, useEffect } from 'react';
import type { ProviderId, ConnectedProvider } from '@accomplish_ai/agent-core';
import { DEFAULT_PROVIDERS } from '@accomplish_ai/agent-core/common';
import { getAccomplish } from '@/lib/accomplish';
import { createLogger } from '@/lib/logger';

const logger = createLogger('useProviderModels');

interface UseProviderModelsOptions {
  providerId: ProviderId;
  connectedProvider?: ConnectedProvider;
  isConnected: boolean;
  isOpenAI: boolean;
  openAiBaseUrl: string;
  connectedProviderBaseUrl?: string;
}

/** Fetches available models for a provider whenever the connection state changes. */
export function useProviderModels({
  providerId,
  connectedProvider,
  isConnected,
  isOpenAI,
  openAiBaseUrl,
  connectedProviderBaseUrl,
}: UseProviderModelsOptions): Array<{ id: string; name: string }> | null {
  const [fetchedModels, setFetchedModels] = useState<Array<{ id: string; name: string }> | null>(
    null,
  );
  const providerConfig = DEFAULT_PROVIDERS.find((p) => p.id === providerId);

  useEffect(() => {
    if (!isConnected) return;
    const isOAuth = connectedProvider?.credentials?.type === 'oauth';
    if (!isOAuth && connectedProvider?.availableModels?.length) return;
    if (!providerConfig?.modelsEndpoint) return;

    const controller = new AbortController();
    const accomplish = getAccomplish();
    accomplish
      .fetchProviderModels(providerId, {
        baseUrl: isOpenAI ? openAiBaseUrl.trim() || undefined : connectedProviderBaseUrl,
      })
      .then((result) => {
        if (!controller.signal.aborted && result.success && result.models?.length) {
          setFetchedModels(result.models);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          logger.error('Failed to fetch provider models:', err);
        }
      });
    return () => controller.abort();
  }, [
    connectedProvider?.availableModels?.length,
    connectedProvider?.credentials?.type,
    connectedProviderBaseUrl,
    isConnected,
    isOpenAI,
    openAiBaseUrl,
    providerConfig?.modelsEndpoint,
    providerId,
  ]);

  return fetchedModels;
}
