// apps/desktop/src/renderer/components/settings/providers/OpenRouterProviderForm.tsx

import { useState } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import type { ConnectedProvider, OpenRouterCredentials } from '@accomplish/shared';
import { PROVIDER_META } from '@accomplish/shared';
import {
  ModelSelector,
  ConnectButton,
  ConnectedControls,
} from '../shared';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';

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
  const [apiKey, setApiKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string }>>([]);

  const meta = PROVIDER_META.openrouter;
  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const handleConnect = async () => {
    if (!apiKey.trim()) {
      setError('Please enter an API key');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();

      // Validate key
      const validation = await accomplish.validateApiKeyForProvider('openrouter', apiKey.trim());
      if (!validation.valid) {
        setError(validation.error || 'Invalid API key');
        setConnecting(false);
        return;
      }

      // Save key
      await accomplish.addApiKey('openrouter', apiKey.trim());

      // Fetch models
      const result = await accomplish.fetchOpenRouterModels();
      if (!result.success) {
        setError(result.error || 'Failed to fetch models');
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
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const models = connectedProvider?.availableModels || availableModels;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          Provider settings
        </CardTitle>
        <CardDescription>
          Connect and select provider model
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Field>
          <FieldLabel className="justify-between">
            API Key
            {meta.helpUrl && (
              <a
                href={meta.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground"
              >
                How can I find it?
              </a>
            )}
          </FieldLabel>

          {!isConnected ? (
            <Field>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-..."
                disabled={connecting}
                data-testid="api-key-input"
              />

              <FieldError>{error}</FieldError>
              <ConnectButton onClick={handleConnect} connecting={connecting} disabled={!apiKey.trim()} />
            </Field>
          ) : (
            <Field>
              <Input
                type="text"
                value={(() => {
                  const creds = connectedProvider?.credentials as OpenRouterCredentials | undefined;
                  if (creds?.keyPrefix) return creds.keyPrefix;
                  return 'API key saved (reconnect to see prefix)';
                })()}
                disabled
                data-testid="api-key-display"
              />

              <ModelSelector
                models={models}
                value={connectedProvider?.selectedModelId || null}
                onChange={onModelChange}
                error={showModelError && !connectedProvider?.selectedModelId}
              />

              <ConnectedControls onDisconnect={onDisconnect} />
            </Field>
          )}
        </Field>
      </CardContent>
    </Card>
  );
}
