// apps/desktop/src/renderer/components/settings/providers/ZaiProviderForm.tsx

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { getAccomplish } from '@/lib/accomplish';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type { ConnectedProvider, ZaiCredentials, ZaiRegion } from '@accomplish_ai/agent-core/common';
import { PROVIDER_META, DEFAULT_PROVIDERS, getDefaultModelForProvider } from '@accomplish_ai/agent-core/common';
import {
  ModelSelector,
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
} from '../shared';

import zaiLogo from '/assets/ai-logos/zai.svg';

interface ZaiProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function ZaiProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: ZaiProviderFormProps) {
  const { t } = useTranslation('settings');
  const [apiKey, setApiKey] = useState('');
  const [region, setRegion] = useState<ZaiRegion>('international');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = PROVIDER_META['zai'];
  const providerConfig = DEFAULT_PROVIDERS.find(p => p.id === 'zai');
  const models = providerConfig?.models.map(m => ({ id: m.fullId, name: m.displayName })) || [];
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
      const validation = await accomplish.validateApiKeyForProvider('zai', apiKey.trim(), { region });

      if (!validation.valid) {
        setError(validation.error || t('apiKey.invalidKey'));
        setConnecting(false);
        return;
      }

      await accomplish.addApiKey('zai', apiKey.trim());

      const defaultModel = getDefaultModelForProvider('zai');
      const trimmedKey = apiKey.trim();

      const provider: ConnectedProvider = {
        providerId: 'zai',
        connectionStatus: 'connected',
        selectedModelId: defaultModel,
        credentials: {
          type: 'zai',
          keyPrefix: trimmedKey.length > 40
            ? trimmedKey.substring(0, 40) + '...'
            : trimmedKey.substring(0, Math.min(trimmedKey.length, 20)) + '...',
          region,
        } as ZaiCredentials,
        lastConnectedAt: new Date().toISOString(),
      };

      onConnect(provider);
      setApiKey('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('status.connectionFailed'));
    } finally {
      setConnecting(false);
    }
  };

  const storedCredentials = connectedProvider?.credentials as ZaiCredentials | undefined;

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="provider-settings-panel">
      <ProviderFormHeader logoSrc={zaiLogo} providerName={meta.name} />

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
              {/* Region Selector */}
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">{t('zai.region')}</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRegion('china')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      region === 'china'
                        ? 'bg-[#4A7C59] text-white'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t('zai.china')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRegion('international')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      region === 'international'
                        ? 'bg-[#4A7C59] text-white'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t('zai.international')}
                  </button>
                </div>
              </div>

              {/* API Key Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
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
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={t('apiKey.enterKey')}
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
              {/* Display stored region */}
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">{t('zai.region')}</label>
                <input
                  type="text"
                  value={storedCredentials?.region === 'china' ? t('zai.china') : t('zai.international')}
                  disabled
                  className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                />
              </div>

              {/* Display stored API key */}
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">{t('apiKey.title')}</label>
                <input
                  type="text"
                  value={storedCredentials?.keyPrefix || t('zai.apiKeySaved')}
                  disabled
                  data-testid="api-key-display"
                  className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                />
              </div>

              <ConnectedControls onDisconnect={onDisconnect} />

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
