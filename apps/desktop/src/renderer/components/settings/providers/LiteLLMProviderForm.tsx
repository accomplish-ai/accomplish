// apps/desktop/src/renderer/components/settings/providers/LiteLLMProviderForm.tsx

import { useState } from 'react';
import type { ConnectedProvider, LiteLLMCredentials } from '@accomplish/shared';
import {
  ModelSelector,
  ConnectButton,
  ConnectedControls,
} from '../shared';
import { getAccomplish } from '@/lib/accomplish';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {Field, FieldError, FieldGroup, FieldLabel, FieldSet} from '@/components/ui/field';

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
        {!isConnected ? (
          <FieldGroup>
            <FieldSet>
              <Field>
                <FieldLabel>Server URL</FieldLabel>
                <Input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="http://localhost:4000"
                  data-testid="litellm-server-url"
                />
              </Field>

              <Field>
                <FieldLabel>
                  API Key <span className="text-muted-foreground">(Optional)</span>
                </FieldLabel>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Optional API key"
                  data-testid="litellm-api-key"
                />
              </Field>

              <Field>
              <FieldError>{error}</FieldError>
              <ConnectButton onClick={handleConnect} connecting={connecting} />
            </Field>
            </FieldSet>
          </FieldGroup>
        ) : (
          <FieldGroup>
            <FieldSet>
              <Field>
                <FieldLabel>Server URL</FieldLabel>
                <Input
                  type="text"
                  value={(connectedProvider?.credentials as LiteLLMCredentials)?.serverUrl || 'http://localhost:4000'}
                  disabled
                />
              </Field>
              {(connectedProvider?.credentials as LiteLLMCredentials)?.hasApiKey && (
                <Field>
                  <FieldLabel>API Key</FieldLabel>
                  <Input
                    type="text"
                    value={(connectedProvider?.credentials as LiteLLMCredentials)?.keyPrefix || 'API key saved'}
                    disabled
                  />
                </Field>
              )}

              <Field>
              <ModelSelector
                models={models}
                value={connectedProvider?.selectedModelId || null}
                onChange={onModelChange}
                error={showModelError && !connectedProvider?.selectedModelId}
              />
              <ConnectedControls onDisconnect={onDisconnect} />
            </Field>
            </FieldSet>
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  );
}
