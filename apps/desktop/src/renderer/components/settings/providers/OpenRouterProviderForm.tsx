// apps/desktop/src/renderer/components/settings/providers/OpenRouterProviderForm.tsx

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { getAccomplish } from '@/lib/accomplish';
import type { ConnectedProvider, OpenRouterCredentials } from '@accomplish/shared';
import { PROVIDER_META } from '@accomplish/shared';
import {
  ModelSelector,
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
} from '../shared';
import { settingsVariants, settingsTransitions } from '@/lib/animations';

// Import OpenRouter logo
import openrouterLogo from '/assets/ai-logos/openrouter.svg';

interface OpenRouterProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function OpenRouterProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: OpenRouterProviderFormProps) {
  const { t } = useTranslation('settings');
  const [apiKey, setApiKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string }>>([]);

  const meta = PROVIDER_META.openrouter;
  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const handleConnect = async () => {
    if (!apiKey.trim()) {
      setError(t('apiKey.enterKeyRequired'));
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();

      // Validate key
      const validation = await accomplish.validateApiKeyForProvider('openrouter', apiKey.trim());
      if (!validation.valid) {
        setError(validation.error || t('apiKey.invalidKey'));
        setConnecting(false);
        return;
      }

      // Save key
      await accomplish.addApiKey('openrouter', apiKey.trim());

      // Fetch models
      const result = await accomplish.fetchOpenRouterModels();
      if (!result.success) {
        setError(result.error || t('openrouter.fetchModelsFailed'));
        setConnecting(false);
        return;
      }

      const models = result.models?.map(m => ({
        id: `openrouter/${m.id}`,
        name: m.name,
      })) || [];
      setAvailableModels(models);

      // Store longer key prefix for display
      const trimmedKey = apiKey.trim();
      const provider: ConnectedProvider = {
        providerId: 'openrouter',
        connectionStatus: 'connected',
        selectedModelId: null,
        credentials: {
          type: 'openrouter',
          keyPrefix: trimmedKey.length > 40
            ? trimmedKey.substring(0, 40) + '...'
            : trimmedKey.substring(0, Math.min(trimmedKey.length, 20)) + '...',
        } as OpenRouterCredentials,
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

  const models = connectedProvider?.availableModels || availableModels;

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="provider-settings-panel">
      <ProviderFormHeader logoSrc={openrouterLogo} providerName={t('providers.openrouter')} />

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
              {/* API Key Section */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">{t('apiKey.title')}</label>
                {meta.helpUrl && (
                  <a
                    href={meta.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-primary underline"
                  >
                    {t('help.findApiKey')}
                  </a>
                )}
              </div>

              {/* API Key input with trash */}
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-or-..."
                  disabled={connecting}
                  data-testid="api-key-input"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm disabled:opacity-50"
                />
                <button
                  onClick={() => setApiKey('')}
                  className="rounded-md border border-border p-2.5 text-muted-foreground hover:text-foreground transition-colors"
                  type="button"
                  disabled={!apiKey}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              <FormError error={error} />
              <ConnectButton onClick={handleConnect} connecting={connecting} disabled={!apiKey.trim()} />
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
              {/* Connected: Show masked key + Connected button + Model */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">{t('apiKey.title')}</label>
                {meta.helpUrl && (
                  <a
                    href={meta.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-primary underline"
                  >
                    {t('help.findApiKey')}
                  </a>
                )}
              </div>

              <input
                type="text"
                value={(() => {
                  const creds = connectedProvider?.credentials as OpenRouterCredentials | undefined;
                  if (creds?.keyPrefix) return creds.keyPrefix;
                  return t('apiKey.savedReconnectToSee');
                })()}
                disabled
                data-testid="api-key-display"
                className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
              />

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
