import type { ProviderId, ConnectedProvider } from '@accomplish_ai/agent-core';
import { useApiKeyConnect } from './useApiKeyConnect';
import { useOAuthSignIn } from './useOAuthSignIn';

interface UseClassicProviderConnectOptions {
  providerId: ProviderId;
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  isOpenAI: boolean;
  hasEditableBaseUrl: boolean;
  defaultBaseUrl: string;
}

/** Thin orchestrator — composes useApiKeyConnect + useOAuthSignIn. */
export function useClassicProviderConnect({
  providerId,
  connectedProvider,
  onConnect,
  isOpenAI,
  hasEditableBaseUrl,
  defaultBaseUrl,
}: UseClassicProviderConnectOptions) {
  const apiKeyConnect = useApiKeyConnect({
    providerId,
    connectedProvider,
    onConnect,
    isOpenAI,
    hasEditableBaseUrl,
    defaultBaseUrl,
  });

  const { signingIn, handleChatGptSignIn } = useOAuthSignIn({
    providerId,
    onConnect,
    setError: apiKeyConnect.setError,
  });

  return {
    apiKey: apiKeyConnect.apiKey,
    setApiKey: apiKeyConnect.setApiKey,
    connecting: apiKeyConnect.connecting,
    error: apiKeyConnect.error,
    openAiBaseUrl: apiKeyConnect.openAiBaseUrl,
    setOpenAiBaseUrl: apiKeyConnect.setOpenAiBaseUrl,
    customBaseUrl: apiKeyConnect.customBaseUrl,
    setCustomBaseUrl: apiKeyConnect.setCustomBaseUrl,
    signingIn,
    fetchedModels: apiKeyConnect.fetchedModels,
    isConnected: apiKeyConnect.isConnected,
    handleConnect: apiKeyConnect.handleConnect,
    handleChatGptSignIn,
  };
}
