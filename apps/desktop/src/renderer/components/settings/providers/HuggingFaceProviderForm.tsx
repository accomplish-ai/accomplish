// apps/desktop/src/renderer/components/settings/providers/HuggingFaceProviderForm.tsx

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAccomplish } from '@/lib/accomplish';
import type { ConnectedProvider, HuggingFaceCredentials } from '@accomplish/shared';
import { PROVIDER_META } from '@accomplish/shared';
import {
  ModelSelector,
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
} from '../shared';
import { settingsVariants, settingsTransitions } from '@/lib/animations';

// Import HuggingFace logo
import huggingfaceLogo from '/assets/ai-logos/huggingface.svg';

interface HuggingFaceProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

const OTHER_MODEL_ID = '__other__';

export function HuggingFaceProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: HuggingFaceProviderFormProps) {
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string }>>([]);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customModelId, setCustomModelId] = useState('');

  const meta = PROVIDER_META.huggingface;
  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const handleConnect = async () => {
    if (!token.trim()) {
      setError('Please enter a token');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();

      // Validate token
      const validation = await accomplish.validateHuggingFaceToken(token.trim());
      if (!validation.valid) {
        setError(validation.error || 'Invalid token');
        setConnecting(false);
        return;
      }

      // Save token
      await accomplish.addApiKey('huggingface', token.trim());

      // Fetch models
      const result = await accomplish.fetchHuggingFaceModels();
      if (!result.success) {
        setError(result.error || 'Failed to fetch models');
        setConnecting(false);
        return;
      }

      const models = result.models?.map(m => ({
        id: `huggingface/${m.id}`,
        name: m.name,
      })) || [];
      setAvailableModels(models);

      // Store token prefix for display
      const trimmedToken = token.trim();
      const provider: ConnectedProvider = {
        providerId: 'huggingface',
        connectionStatus: 'connected',
        selectedModelId: null,
        credentials: {
          type: 'huggingface',
          keyPrefix: trimmedToken.length > 20
            ? trimmedToken.substring(0, 20) + '...'
            : trimmedToken.substring(0, Math.min(trimmedToken.length, 10)) + '...',
        } as HuggingFaceCredentials,
        lastConnectedAt: new Date().toISOString(),
        availableModels: models,
      };

      onConnect(provider);
      setToken('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const baseModels = connectedProvider?.availableModels || availableModels;
  // Add "Other" option at the end
  const models = [...baseModels, { id: OTHER_MODEL_ID, name: 'Other (enter model ID)' }];

  // Check if current model is a custom one (not in the list)
  const selectedModelId = connectedProvider?.selectedModelId;
  const isCustomModel = selectedModelId && !baseModels.some(m => m.id === selectedModelId);

  // Initialize custom input state based on whether current model is custom
  useEffect(() => {
    if (isCustomModel && selectedModelId) {
      setShowCustomInput(true);
      // Extract model ID without the 'huggingface/' prefix
      const modelIdWithoutPrefix = selectedModelId.replace(/^huggingface\//, '');
      setCustomModelId(modelIdWithoutPrefix);
    }
  }, [isCustomModel, selectedModelId]);

  const handleModelSelect = (modelId: string) => {
    if (modelId === OTHER_MODEL_ID) {
      setShowCustomInput(true);
      setCustomModelId('');
    } else {
      setShowCustomInput(false);
      onModelChange(modelId);
    }
  };

  const handleCustomModelSubmit = () => {
    if (customModelId.trim()) {
      const fullModelId = `huggingface/${customModelId.trim()}`;
      onModelChange(fullModelId);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="provider-settings-panel">
      <ProviderFormHeader logoSrc={huggingfaceLogo} providerName="HuggingFace" />

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
              {/* Token Section */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Access Token</label>
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

              {/* Token input with trash */}
              <div className="flex gap-2">
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="hf_..."
                  disabled={connecting}
                  data-testid="api-key-input"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm disabled:opacity-50"
                />
                <button
                  onClick={() => setToken('')}
                  className="rounded-md border border-border p-2.5 text-muted-foreground hover:text-foreground transition-colors"
                  type="button"
                  disabled={!token}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              <FormError error={error} />
              <ConnectButton onClick={handleConnect} connecting={connecting} disabled={!token.trim()} />
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
              {/* Connected: Show masked token + Connected button + Model */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Access Token</label>
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

              <input
                type="text"
                value={(() => {
                  const creds = connectedProvider?.credentials as HuggingFaceCredentials | undefined;
                  if (creds?.keyPrefix) return creds.keyPrefix;
                  return 'Token saved (reconnect to see prefix)';
                })()}
                disabled
                data-testid="api-key-display"
                className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
              />

              <ConnectedControls onDisconnect={onDisconnect} />

              {/* Model Selector */}
              <ModelSelector
                models={models}
                value={showCustomInput ? OTHER_MODEL_ID : (connectedProvider?.selectedModelId || null)}
                onChange={handleModelSelect}
                error={showModelError && !connectedProvider?.selectedModelId && !showCustomInput}
              />

              {/* Custom Model Input */}
              {showCustomInput && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Custom Model ID</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customModelId}
                      onChange={(e) => setCustomModelId(e.target.value)}
                      placeholder="org/model-name (e.g., Qwen/Qwen3-32B)"
                      className="flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                    />
                    <button
                      onClick={handleCustomModelSubmit}
                      disabled={!customModelId.trim()}
                      className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      type="button"
                    >
                      Use
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Enter the HuggingFace model ID from huggingface.co/models
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
