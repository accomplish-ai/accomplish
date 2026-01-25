// apps/desktop/src/renderer/components/settings/providers/OllamaProviderForm.tsx

import { useState } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import type { ConnectedProvider, OllamaCredentials } from '@accomplish/shared';
import {
  ModelSelector,
  ConnectButton,
  ConnectedControls,
} from '../shared';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {Field, FieldError, FieldGroup, FieldLabel, FieldSet} from '@/components/ui/field';

interface OllamaProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function OllamaProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: OllamaProviderFormProps) {
  const [serverUrl, setServerUrl] = useState('http://localhost:11434');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string }>>([]);

  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();
      const result = await accomplish.testOllamaConnection(serverUrl);

      if (!result.success) {
        setError(result.error || 'Connection failed');
        setConnecting(false);
        return;
      }

      const models = result.models?.map(m => ({
        id: `ollama/${m.id}`,
        name: m.displayName,
      })) || [];
      setAvailableModels(models);

      const provider: ConnectedProvider = {
        providerId: 'ollama',
        connectionStatus: 'connected',
        selectedModelId: null,
        credentials: {
          type: 'ollama',
          serverUrl,
        } as OllamaCredentials,
        lastConnectedAt: new Date().toISOString(),
        availableModels: models,
      };

      onConnect(provider);
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
        {!isConnected ? (
          <FieldGroup>
            <FieldSet>
              <Field>
                <FieldLabel>Ollama Server URL</FieldLabel>
                <Input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  data-testid="ollama-server-url"
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
                <FieldLabel>Ollama Server URL</FieldLabel>
                <Input
                  type="text"
                  value={(connectedProvider?.credentials as OllamaCredentials)?.serverUrl || 'http://localhost:11434'}
                  disabled
                />
              </Field>

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
