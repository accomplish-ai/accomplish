import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAccomplish } from '@/lib/accomplish';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type { ProviderId, ConnectedProvider, ApiKeyCredentials, OAuthCredentials } from '@accomplish_ai/agent-core/common';
import { PROVIDER_META, DEFAULT_PROVIDERS } from '@accomplish_ai/agent-core/common';
import {
  ModelSelector,
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
} from '../shared';
import { PROVIDER_LOGOS, DARK_INVERT_PROVIDERS } from '@/lib/provider-logos';

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
  const [apiKey, setApiKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openAiBaseUrl, setOpenAiBaseUrl] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<Array<{ id: string; name: string }> | null>(null);

  const meta = PROVIDER_META[providerId];
  const providerConfig = DEFAULT_PROVIDERS.find(p => p.id === providerId);
  const staticModels = providerConfig?.models.map(m => ({ id: m.fullId, name: m.displayName })) || [];
  const models = connectedProvider?.availableModels?.length
    ? connectedProvider.availableModels.map(m => ({ id: m.id, name: m.name }))
    : fetchedModels ?? staticModels;
  const isConnected = connectedProvider?.connectionStatus === 'connected';
  const logoSrc = PROVIDER_LOGOS[providerId];
  const isOpenAI = providerId === 'openai';

  useEffect(() => {
    if (!isOpenAI) return;

    const accomplish = getAccomplish();
    accomplish.getOpenAiBaseUrl().then(setOpenAiBaseUrl).catch(console.error);
  }, [isOpenAI]);

  // Auto-fetch models for already-connected providers that don't have availableModels yet
  useEffect(() => {
    if (!isConnected) return;
    if (connectedProvider?.availableModels?.length) return;
    if (!providerConfig?.modelsEndpoint) return;

    const accomplish = getAccomplish();
    accomplish.fetchProviderModels(providerId, {
      baseUrl: isOpenAI ? openAiBaseUrl.trim() || undefined : undefined,
    }).then((result) => {
      if (result.success && result.models?.length) {
        setFetchedModels(result.models);
      }
    }).catch(console.error);
  }, [isConnected, providerId]);

  const handleConnect = async () => {
    if (!apiKey.trim()) {
      setError('Please enter an API key');
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
        setError(validation.error || 'Invalid API key');
        setConnecting(false);
        return;
      }

      await accomplish.addApiKey(providerId as any, apiKey.trim());

      // Fetch models dynamically if provider has a models endpoint
      let fetchedModels: Array<{ id: string; name: string }> | undefined;
      if (providerConfig?.modelsEndpoint) {
        const fetchResult = await accomplish.fetchProviderModels(providerId, {
          baseUrl: isOpenAI ? openAiBaseUrl.trim() || undefined : undefined,
        });
        if (fetchResult.success && fetchResult.models) {
          fetchedModels = fetchResult.models;
        }
      }

      const defaultModelId = providerConfig?.defaultModelId ?? null;

      const trimmedKey = apiKey.trim();
      const provider: ConnectedProvider = {
        providerId,
        connectionStatus: 'connected',
        selectedModelId: defaultModelId,
        credentials: {
          type: 'api_key',
          keyPrefix: trimmedKey.length > 40
            ? trimmedKey.substring(0, 40) + '...'
            : trimmedKey.substring(0, Math.min(trimmedKey.length, 20)) + '...',
        } as ApiKeyCredentials,
        lastConnectedAt: new Date().toISOString(),
        ...(fetchedModels ? { availableModels: fetchedModels } : {}),
      };

      onConnect(provider);
      setApiKey('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
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
        // Fetch models dynamically if provider has a models endpoint
        let fetchedModels: Array<{ id: string; name: string }> | undefined;
        if (providerConfig?.modelsEndpoint) {
          const fetchResult = await accomplish.fetchProviderModels(providerId, {
            baseUrl: isOpenAI ? openAiBaseUrl.trim() || undefined : undefined,
          });
          if (fetchResult.success && fetchResult.models) {
            fetchedModels = fetchResult.models;
          }
        }

        const defaultModelId = providerConfig?.defaultModelId ?? null;
        const provider: ConnectedProvider = {
          providerId,
          connectionStatus: 'connected',
          selectedModelId: defaultModelId,
          credentials: {
            type: 'oauth',
            oauthProvider: 'chatgpt',
          } as OAuthCredentials,
          lastConnectedAt: new Date().toISOString(),
          ...(fetchedModels ? { availableModels: fetchedModels } : {}),
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
      <ProviderFormHeader logoSrc={logoSrc} providerName={meta.name} invertInDark={DARK_INVERT_PROVIDERS.has(providerId)} />

      {isOpenAI && !isConnected && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={handleChatGptSignIn}
            disabled={signingIn}
            data-testid="openai-oauth-signin"
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
          >
            <img src={PROVIDER_LOGOS['openai']} alt="" className="h-5 w-5 dark:invert" />
            {signingIn ? 'Signing in...' : 'Login with OpenAI'}
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-sm text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">API Key</label>
              {meta.helpUrl && (
                <a
                  href={meta.helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-primary underline"
                >
                  How can I find it?
                </a>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter API Key"
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
            <label className="text-sm font-medium text-foreground">Base URL (optional)</label>
            <input
              type="text"
              value={openAiBaseUrl}
              onChange={(e) => setOpenAiBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank for OpenAI. Set to use an OpenAI-compatible endpoint.
            </p>
          </div>

          <FormError error={error} />
          <ConnectButton onClick={handleConnect} connecting={connecting} disabled={!apiKey.trim()} />
        </div>
      )}

      {!isOpenAI && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">API Key</label>
            {meta.helpUrl && (
              <a
                href={meta.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-primary underline"
              >
                How can I find it?
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
                    placeholder="Enter API Key"
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
                    return 'API key saved (reconnect to see prefix)';
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
