// apps/desktop/src/renderer/components/settings/providers/CchProviderForm.tsx

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAccomplish } from '@/lib/accomplish';
import type { ConnectedProvider, CchCredentials } from '@accomplish/shared';
import {
  ModelSelector,
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
} from '../shared';
import { settingsVariants, settingsTransitions } from '@/lib/animations';

import cchLogo from '/assets/ai-logos/cch.svg';

interface CchProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function CchProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: CchProviderFormProps) {
  const [serverUrl, setServerUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string }>>([]);

  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const handleConnect = async () => {
    if (!serverUrl.trim()) {
      setError('Please enter a server URL');
      return;
    }
    if (!apiKey.trim()) {
      setError('Please enter an API key');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();
      const result = await accomplish.testCchConnection(serverUrl.trim(), apiKey.trim());
      if (!result.success) {
        setError(result.error || 'Failed to connect');
        setConnecting(false);
        return;
      }

      const models = result.models?.map((m) => ({
        id: `cch/${m.id}`,
        name: m.name,
      })) || [];
      setAvailableModels(models);

      await accomplish.addApiKey('cch', apiKey.trim());

      const trimmedKey = apiKey.trim();
      const provider: ConnectedProvider = {
        providerId: 'cch',
        connectionStatus: 'connected',
        selectedModelId: null,
        credentials: {
          type: 'cch',
          serverUrl: serverUrl.trim(),
          keyPrefix: trimmedKey.length > 40
            ? trimmedKey.substring(0, 40) + '...'
            : trimmedKey.substring(0, Math.min(trimmedKey.length, 20)) + '...',
        } as CchCredentials,
        lastConnectedAt: new Date().toISOString(),
        availableModels: models,
      };

      onConnect(provider);
      setApiKey('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const models = connectedProvider?.availableModels || availableModels;

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="provider-settings-panel">
      <ProviderFormHeader logoSrc={cchLogo} providerName="CCH" />

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
                <label className="mb-2 block text-sm font-medium text-foreground">Server URL</label>
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="https://your-cch-host"
                  data-testid="cch-server-url"
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">API Key</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter API key"
                    data-testid="api-key-input"
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

              <FormError error={error} />
              <ConnectButton
                onClick={handleConnect}
                connecting={connecting}
                disabled={!serverUrl.trim() || !apiKey.trim()}
              />
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
              <div className="space-y-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">Server URL</label>
                  <input
                    type="text"
                    value={(connectedProvider?.credentials as CchCredentials)?.serverUrl || ''}
                    disabled
                    className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">API Key</label>
                  <input
                    type="text"
                    value={(connectedProvider?.credentials as CchCredentials)?.keyPrefix || 'API key saved'}
                    disabled
                    className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                  />
                </div>
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
