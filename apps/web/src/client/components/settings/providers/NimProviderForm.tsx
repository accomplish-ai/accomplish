import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence } from 'framer-motion';
import type { ConnectedProvider, NimCredentials } from '@accomplish_ai/agent-core/common';
import { ProviderFormHeader } from '../shared';
import { getAccomplish } from '@/lib/accomplish';
import { DisconnectedNimForm, ConnectedNimDetails, NIM_DEFAULT_BASE_URL } from './NimFormSections';

import nimLogo from '/assets/ai-logos/nim.svg';

interface NimProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function NimProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: NimProviderFormProps) {
  const { t } = useTranslation('settings');
  const [serverUrl, setServerUrl] = useState(NIM_DEFAULT_BASE_URL);
  const [apiKey, setApiKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();
      const trimmedKey = apiKey.trim();

      if (!trimmedKey) {
        setError(t('nim.apiKeyRequired', 'NVIDIA API key is required'));
        setConnecting(false);
        return;
      }

      const trimmedUrl = serverUrl.trim() || NIM_DEFAULT_BASE_URL;

      const result = await accomplish.testNimConnection(trimmedUrl, trimmedKey);
      if (!result.success) {
        setError(result.error || t('status.connectionFailed'));
        setConnecting(false);
        return;
      }

      await accomplish.addApiKey('nim', trimmedKey);

      const models = result.models?.map((m) => ({ ...m })) || [];

      const provider: ConnectedProvider = {
        providerId: 'nim',
        connectionStatus: 'connected',
        selectedModelId: null,
        credentials: {
          type: 'nim',
          serverUrl: trimmedUrl,
          keyPrefix: trimmedKey.substring(0, 10) + '...',
        } as NimCredentials,
        lastConnectedAt: new Date().toISOString(),
        availableModels: models,
      };

      onConnect(provider);
      setApiKey('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('status.connectionFailed'));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div
      className="rounded-xl border border-border bg-card p-5"
      data-testid="provider-settings-panel"
    >
      <ProviderFormHeader logoSrc={nimLogo} providerName="NVIDIA NIM" />
      <div className="space-y-3">
        <AnimatePresence mode="wait">
          {!isConnected ? (
            <DisconnectedNimForm
              serverUrl={serverUrl}
              onServerUrlChange={setServerUrl}
              apiKey={apiKey}
              onApiKeyChange={setApiKey}
              connecting={connecting}
              error={error}
              onConnect={handleConnect}
            />
          ) : (
            <ConnectedNimDetails
              connectedProvider={connectedProvider}
              onDisconnect={onDisconnect}
              onModelChange={onModelChange}
              showModelError={showModelError}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
