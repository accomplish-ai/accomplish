// apps/desktop/src/renderer/components/settings/providers/ClassicProviderForm.tsx

import { useState } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import type { ProviderId, ConnectedProvider, ApiKeyCredentials } from '@accomplish/shared';
import { PROVIDER_META, DEFAULT_PROVIDERS, getDefaultModelForProvider } from '@accomplish/shared';
import {
  ModelSelector,
  ConnectButton,
  ConnectedControls,
} from '../shared';
import { Input } from '@/components/ui/input';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Field, FieldError, FieldGroup, FieldLabel, FieldSet} from "@/components/ui/field";

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

  const meta = PROVIDER_META[providerId];
  const providerConfig = DEFAULT_PROVIDERS.find(p => p.id === providerId);
  const models = providerConfig?.models.map(m => ({ id: m.fullId, name: m.displayName })) || [];
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

  return (
      <Card>
        <CardHeader>
          <CardTitle className='text-sm'>
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
                    <FieldLabel className='justify-between'>
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
                    <Input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Enter API Key"
                        disabled={connecting}
                        data-testid="api-key-input"
                    />
                    <FieldError>{error}</FieldError>
                  </Field>

                  <ConnectButton onClick={handleConnect} connecting={connecting} disabled={!apiKey.trim()} />

                  </FieldSet>
                </FieldGroup>
            ) : (
                <FieldGroup>
                  <FieldSet>
                    <Field>
                      {/* Connected: Show masked key + Connected button + Model */}
                      <Input
                          type="text"
                          value={(() => {
                            const creds = connectedProvider?.credentials as ApiKeyCredentials | undefined;
                            if (creds?.keyPrefix) return creds.keyPrefix;
                            return 'API key saved (reconnect to see prefix)';
                          })()}
                          disabled
                          data-testid="api-key-display"
                      />
                      </Field>
                      {/* Model Selector */}
                      <ModelSelector
                          models={models}
                          value={connectedProvider?.selectedModelId || null}
                          onChange={onModelChange}
                          error={showModelError && !connectedProvider?.selectedModelId}
                      />

                      <ConnectedControls onDisconnect={onDisconnect} />
                  </FieldSet>
                </FieldGroup>

            )}
        </CardContent>
      </Card>
  );
}
