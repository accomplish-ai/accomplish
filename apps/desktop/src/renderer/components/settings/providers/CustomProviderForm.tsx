// apps/desktop/src/renderer/components/settings/providers/CustomProviderForm.tsx

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ConnectedProvider, CustomCredentials } from '@accomplish_ai/agent-core/common';
import {
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
} from '../shared';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { getAccomplish } from '@/lib/accomplish';

// Import custom logo
import customLogo from '/assets/ai-logos/custom.svg';

interface CustomProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void; // Unused - model is set during connection
  showModelError: boolean;
}

export function CustomProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  showModelError,
}: CustomProviderFormProps) {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const handleConnect = async () => {
    // Validate inputs
    if (!baseUrl.trim()) {
      setError('Base URL is required');
      return;
    }

    // Check for common URL mistakes
    const trimmedUrl = baseUrl.trim();
    if (trimmedUrl.includes('/chat/completions')) {
      setError('Base URL should not include /chat/completions (it is added automatically)');
      return;
    }
    if (trimmedUrl.includes('/completions')) {
      setError('Base URL should end with /v1, not /completions');
      return;
    }

    if (!modelName.trim()) {
      setError('Model name is required');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();
      const trimmedKey = apiKey.trim() || undefined;

      // Test connection to the endpoint
      const result = await accomplish.testCustomConnection(baseUrl.trim(), trimmedKey);
      if (!result.success) {
        setError(result.error || 'Connection failed');
        setConnecting(false);
        return;
      }

      // Save or remove API key based on user input
      if (trimmedKey) {
        await accomplish.addApiKey('custom', trimmedKey);
      } else {
        // Remove any previously stored key when connecting without one
        await accomplish.removeApiKey('local-custom');
      }

      // Create the model with the custom/ prefix
      const fullModelId = `custom/${modelName.trim()}`;

      const provider: ConnectedProvider = {
        providerId: 'custom',
        connectionStatus: 'connected',
        selectedModelId: fullModelId,
        credentials: {
          type: 'custom',
          baseUrl: baseUrl.trim(),
          modelName: modelName.trim(),
          hasApiKey: !!trimmedKey,
          keyPrefix: trimmedKey ? trimmedKey.substring(0, 10) + '...' : undefined,
        } as CustomCredentials,
        lastConnectedAt: new Date().toISOString(),
        availableModels: [{ id: fullModelId, name: modelName.trim() }],
      };

      onConnect(provider);
      setApiKey('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="provider-settings-panel">
      <ProviderFormHeader logoSrc={customLogo} providerName="Custom Endpoint" />

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
                <label className="mb-2 block text-sm font-medium text-foreground">Base URL</label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  data-testid="custom-base-url"
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Base URL ending in /v1 (the SDK appends /chat/completions)
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  API Key <span className="text-muted-foreground">(Optional)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Optional API key"
                    data-testid="custom-api-key"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm"
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

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Model Name</label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="gpt-4, llama-3, etc."
                  data-testid="custom-model-name"
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Model ID as expected by the endpoint (e.g., gpt-4, openai/gpt-5.2-codex)
                </p>
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
                  <label className="mb-2 block text-sm font-medium text-foreground">Base URL</label>
                  <input
                    type="text"
                    value={(connectedProvider?.credentials as CustomCredentials)?.baseUrl || ''}
                    disabled
                    className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                  />
                </div>
                {(connectedProvider?.credentials as CustomCredentials)?.hasApiKey && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">API Key</label>
                    <input
                      type="text"
                      value={(connectedProvider?.credentials as CustomCredentials)?.keyPrefix || 'API key saved'}
                      disabled
                      className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                    />
                  </div>
                )}
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">Model</label>
                  <input
                    type="text"
                    value={(connectedProvider?.credentials as CustomCredentials)?.modelName || ''}
                    disabled
                    className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                  />
                </div>
              </div>

              <ConnectedControls onDisconnect={onDisconnect} />

              {/* Show error if no model selected (shouldn't happen for custom since we auto-select) */}
              {showModelError && !connectedProvider?.selectedModelId && (
                <p className="text-sm text-destructive">Please reconnect to set a model</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
