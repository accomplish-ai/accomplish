// apps/desktop/src/renderer/components/settings/providers/LiteLLMProviderForm.tsx

import { useState } from 'react';
import type { ConnectedProvider, LiteLLMCredentials } from '@accomplish/shared';
import {
  ModelSelector,
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
} from '../shared';
import { getAccomplish } from '@/lib/accomplish';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

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
        setError(result.error || 'Connection failed');
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
      const models = result.models?.map(m => ({
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
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const models = connectedProvider?.availableModels || [];

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="provider-settings-panel">
      <ProviderFormHeader logoSrc={litellmLogo} providerName="LiteLLM" />

      <div className="space-y-3">
        {!isConnected ? (
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label>Server URL</Label>
              <Input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://localhost:4000"
                data-testid="litellm-server-url"
              />
            </div>

            <div className="grid gap-2">
              <Label>
                API Key <span className="text-muted-foreground">(Optional)</span>
              </Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Optional API key"
                data-testid="litellm-api-key"
              />
            </div>

            <FormError error={error} />
            <ConnectButton onClick={handleConnect} connecting={connecting} />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Display saved connection details */}
            <div className="space-y-3">
              <div className="grid gap-2">
                <Label>Server URL</Label>
                <Input
                  type="text"
                  value={(connectedProvider?.credentials as LiteLLMCredentials)?.serverUrl || 'http://localhost:4000'}
                  disabled
                />
              </div>
              {(connectedProvider?.credentials as LiteLLMCredentials)?.hasApiKey && (
                <div className="grid gap-2">
                  <Label>API Key</Label>
                  <Input
                    type="text"
                    value={(connectedProvider?.credentials as LiteLLMCredentials)?.keyPrefix || 'API key saved'}
                    disabled
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
          </div>
        )}
      </div>
    </div>
  );
}
