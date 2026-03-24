// apps/desktop/src/renderer/components/settings/providers/LiteLLMProviderForm.tsx

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import type { ConnectedProvider, LiteLLMCredentials } from '@accomplish_ai/agent-core/common';
import {
  ModelSelector,
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
} from '../shared';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { getAccomplish } from '@/lib/accomplish';

// Import LiteLLM logo
import litellmLogo from '/assets/ai-logos/litellm.svg';

interface LiteLLMProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function LiteLLMProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: LiteLLMProviderFormProps) {
  const { t } = useTranslation('settings');
  const [serverUrl, setServerUrl] = useState('http://localhost:4000');
  const [apiKey, setApiKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();
      const trimmedKey = apiKey.trim() || undefined;

      // Test connection and fetch models
      const result = await accomplish.testLiteLLMConnection(serverUrl, trimmedKey);
      if (!result.success) {
        setError(result.error || t('status.connectionFailed'));
        setConnecting(false);
        return;
      }

      // Save or remove API key based on user input
      if (trimmedKey) {
        await accomplish.addApiKey('litellm', trimmedKey);
      } else {
        // Remove any previously stored key when connecting without one
        await accomplish.removeApiKey('litellm');
      }

      // Map models to the expected format
      const models =
        result.models?.map((m) => ({
          id: m.id,
          name: m.name,
        })) || [];

      const provider: ConnectedProvider = {
        providerId: 'litellm',
        connectionStatus: 'connected',
        selectedModelId: null,
        credentials: {
          type: 'litellm',
          serverUrl,
          hasApiKey: !!trimmedKey,
          keyPrefix: trimmedKey ? trimmedKey.substring(0, 10) + '...' : undefined,
        } as LiteLLMCredentials,
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

  const models = connectedProvider?.availableModels || [];

  return (
    <div
      className="rounded-xl border border-border bg-card p-5"
      data-testid="provider-settings-panel"
    >
      <ProviderFormHeader logoSrc={litellmLogo} providerName={t('providers.litellm')} />

      <div className="space-y-3">
        <AnimatePresence mode="wait">
          {!isConnected ? (
            <motion.div
              key="disconnected"
              variants={settingsVariants.fadeSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.enter}
              className="space-y-3"
            >
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  {t('litellm.serverUrl')}
                </label>
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="http://localhost:4000"
                  data-testid="litellm-server-url"
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  {t('apiKey.title')}{' '}
                  <span className="text-muted-foreground">({t('common.optional')})</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={t('litellm.optionalApiKey')}
                    data-testid="litellm-api-key"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                  />
                  <button
                    onClick={() => setApiKey('')}
                    className="rounded-md border border-border p-2.5 text-muted-foreground hover:text-foreground transition-colors"
                    type="button"
                    disabled={!apiKey}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <FormError error={error} />
              <ConnectButton onClick={handleConnect} connecting={connecting} />
            </motion.div>
          ) : (
            <motion.div
              key="connected"
              variants={settingsVariants.fadeSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.enter}
              className="space-y-3"
            >
              {/* Display saved connection details */}
              <div className="space-y-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    {t('litellm.serverUrl')}
                  </label>
                  <input
                    type="text"
                    value={
                      (connectedProvider?.credentials as LiteLLMCredentials)?.serverUrl ||
                      'http://localhost:4000'
                    }
                    disabled
                    className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                  />
                </div>
                {(connectedProvider?.credentials as LiteLLMCredentials)?.hasApiKey && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      {t('apiKey.title')}
                    </label>
                    <input
                      type="text"
                      value={
                        (connectedProvider?.credentials as LiteLLMCredentials)?.keyPrefix ||
                        t('apiKey.saved')
                      }
                      disabled
                      className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                    />
                  </div>
                )}
              </div>

              <ConnectedControls onDisconnect={onDisconnect} />

              {/* Model Selector */}
              <ModelSelector
                models={models}
                value={connectedProvider?.selectedModelId || null}
                onChange={onModelChange}
                error={showModelError && !connectedProvider?.selectedModelId}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
