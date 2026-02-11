import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { getAccomplish } from '@/lib/accomplish';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type { ProviderId, ConnectedProvider, ApiKeyCredentials, OAuthCredentials } from '@accomplish_ai/agent-core/common';
import { PROVIDER_META, DEFAULT_PROVIDERS, getDefaultModelForProvider } from '@accomplish_ai/agent-core/common';
import {
  ModelSelector,
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
} from '../shared';
import { PROVIDER_LOGOS } from '@/lib/provider-logos';

interface ClassicProviderFormProps {
  providerId: ProviderId;
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function ClassicProviderForm({
  providerId,
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: ClassicProviderFormProps) {
  const { t } = useTranslation('settings');
  const [apiKey, setApiKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openAiBaseUrl, setOpenAiBaseUrl] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  const meta = PROVIDER_META[providerId];
  const providerConfig = DEFAULT_PROVIDERS.find(p => p.id === providerId);
  const models = providerConfig?.models.map(m => ({ id: m.fullId, name: m.displayName })) || [];
  const isConnected = connectedProvider?.connectionStatus === 'connected';
  const logoSrc = PROVIDER_LOGOS[providerId];
  const isOpenAI = providerId === 'openai';

  useEffect(() => {
    if (!isOpenAI) return;

    const accomplish = getAccomplish();
    accomplish.getOpenAiBaseUrl().then(setOpenAiBaseUrl).catch(console.error);
  }, [isOpenAI]);

  // Get translated provider name
  const providerName = t(`providers.${providerId}`, { defaultValue: meta.name });

  const handleConnect = async () => {
    if (!apiKey.trim()) {
      setError(t('apiKey.enterKeyRequired'));
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();

      if (isOpenAI) {
        await accomplish.setOpenAiBaseUrl(openAiBaseUrl.trim());
      }

      const validation = await accomplish.validateApiKeyForProvider(providerId, apiKey.trim());

      if (!validation.valid) {
        setError(validation.error || t('apiKey.invalidKey'));
        setConnecting(false);
        return;
      }

      await accomplish.addApiKey(providerId as any, apiKey.trim());

      const defaultModel = getDefaultModelForProvider(providerId);

      const trimmedKey = apiKey.trim();
      const provider: ConnectedProvider = {
        providerId,
        connectionStatus: 'connected',
        selectedModelId: defaultModel,
        credentials: {
          type: 'api_key',
          keyPrefix: trimmedKey.length > 40
            ? trimmedKey.substring(0, 40) + '...'
            : trimmedKey.substring(0, Math.min(trimmedKey.length, 20)) + '...',
        } as ApiKeyCredentials,
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

  const handleChatGptSignIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      const accomplish = getAccomplish();
      await accomplish.loginOpenAiWithChatGpt();
      const status = await accomplish.getOpenAiOauthStatus();

      if (status.connected) {
        const defaultModel = getDefaultModelForProvider(providerId);
        const provider: ConnectedProvider = {
          providerId,
          connectionStatus: 'connected',
          selectedModelId: defaultModel,
          credentials: {
            type: 'oauth',
            oauthProvider: 'chatgpt',
          } as OAuthCredentials,
          lastConnectedAt: new Date().toISOString(),
        };
        onConnect(provider);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="provider-settings-panel">
      <ProviderFormHeader logoSrc={logoSrc} providerName={providerName} />

      {isOpenAI && !isConnected && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={handleChatGptSignIn}
            disabled={signingIn}
            data-testid="openai-oauth-signin"
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
          >
            <img src={PROVIDER_LOGOS['openai']} alt="" className="h-5 w-5" />
            {signingIn ? t('openai.signingIn') : t('openai.loginWithOpenAI')}
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-sm text-muted-foreground">{t('common.or')}</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="space-y-3">
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

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">{t('openai.baseUrl')}</label>
            <input
              type="text"
              value={openAiBaseUrl}
              onChange={(e) => setOpenAiBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {t('openai.baseUrlDescription')}
            </p>
          </div>

          <FormError error={error} />
          <ConnectButton onClick={handleConnect} connecting={connecting} disabled={!apiKey.trim()} />
        </div>
      )}

      {!isOpenAI && (
        <div className="space-y-3">
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
                <input
                  type="text"
                  value={(() => {
                    const creds = connectedProvider?.credentials as ApiKeyCredentials | undefined;
                    if (creds?.keyPrefix) return creds.keyPrefix;
                    return t('apiKey.savedReconnectToSee');
                  })()}
                  disabled
                  data-testid="api-key-display"
                  className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                />

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
      )}

      {isOpenAI && isConnected && (
        <div className="space-y-3">
          <ConnectedControls onDisconnect={onDisconnect} />

          <ModelSelector
            models={models}
            value={connectedProvider?.selectedModelId || null}
            onChange={onModelChange}
            error={showModelError && !connectedProvider?.selectedModelId}
          />
        </div>
      )}
    </div>
  );
}
