// apps/desktop/src/renderer/components/settings/providers/ClassicProviderForm.tsx

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAccomplish } from '@/lib/accomplish';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type { ProviderId, ConnectedProvider, ApiKeyCredentials, OAuthCredentials } from '@accomplish/shared';
import { PROVIDER_META, DEFAULT_PROVIDERS, getDefaultModelForProvider } from '@accomplish/shared';
import {
  ModelSelector,
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
} from '../shared';

// Import provider logos
import anthropicLogo from '/assets/ai-logos/anthropic.svg';
import openaiLogo from '/assets/ai-logos/openai.svg';
import googleLogo from '/assets/ai-logos/google.svg';
import xaiLogo from '/assets/ai-logos/xai.svg';
import deepseekLogo from '/assets/ai-logos/deepseek.svg';
import zaiLogo from '/assets/ai-logos/zai.svg';
import minimaxLogo from '/assets/ai-logos/minimax.svg';

const PROVIDER_LOGOS: Record<string, string> = {
  anthropic: anthropicLogo,
  openai: openaiLogo,
  google: googleLogo,
  xai: xaiLogo,
  deepseek: deepseekLogo,
  zai: zaiLogo,
  minimax: minimaxLogo,
};

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

  // OpenAI-specific state
  const [openAiBaseUrl, setOpenAiBaseUrl] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  const meta = PROVIDER_META[providerId];
  const providerConfig = DEFAULT_PROVIDERS.find(p => p.id === providerId);
  const models = providerConfig?.models.map(m => ({ id: m.fullId, name: m.displayName })) || [];
  const isConnected = connectedProvider?.connectionStatus === 'connected';
  const logoSrc = PROVIDER_LOGOS[providerId];
  const isOpenAI = providerId === 'openai';

  // Fetch OpenAI-specific settings
  useEffect(() => {
    if (!isOpenAI) return;

    const accomplish = getAccomplish();
    accomplish.getOpenAiBaseUrl().then(setOpenAiBaseUrl).catch(console.error);
  }, [isOpenAI]);

  const handleConnect = async () => {
    if (!apiKey.trim()) {
      setError('Please enter an API key');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();

      // Save base URL for OpenAI before validating
      if (isOpenAI) {
        await accomplish.setOpenAiBaseUrl(openAiBaseUrl.trim());
      }

      const validation = await accomplish.validateApiKeyForProvider(providerId, apiKey.trim());

      if (!validation.valid) {
        setError(validation.error || 'Invalid API key');
        setConnecting(false);
        return;
      }

      // Save the API key
      await accomplish.addApiKey(providerId as any, apiKey.trim());

      // Get default model for this provider (if one exists)
      const defaultModel = getDefaultModelForProvider(providerId);

      // Create connected provider - store longer key prefix for display
      const trimmedKey = apiKey.trim();
      const provider: ConnectedProvider = {
        providerId,
        connectionStatus: 'connected',
        selectedModelId: defaultModel, // Auto-select default model for main providers
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
        // Create connected provider with OAuth credentials
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
      <ProviderFormHeader logoSrc={logoSrc} providerName={meta.name} />

      {/* OpenAI: Linear OAuth + API Key interface */}
      {isOpenAI && !isConnected && (
        <div className="space-y-4">
          {/* OAuth login button */}
          <button
            type="button"
            onClick={handleChatGptSignIn}
            disabled={signingIn}
            data-testid="openai-oauth-signin"
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
          >
            <img src={openaiLogo} alt="" className="h-5 w-5" />
            {signingIn ? 'Signing in...' : 'Login with OpenAI'}
          </button>

          {/* Divider with "or" */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-sm text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* API Key section */}
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

          {/* Base URL section */}
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

      {/* Non-OpenAI providers: Standard API Key interface */}
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

      {/* Connected state for OpenAI */}
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
