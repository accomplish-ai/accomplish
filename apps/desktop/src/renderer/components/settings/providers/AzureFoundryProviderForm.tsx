// apps/desktop/src/renderer/components/settings/providers/AzureFoundryProviderForm.tsx

import { useState } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import type { ConnectedProvider, AzureFoundryCredentials } from '@accomplish/shared';
import {
  ModelSelector,
  ConnectButton,
  ConnectedControls,
} from '../shared';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel, FieldSet,
  FieldTitle
} from '@/components/ui/field';
import {RadioGroup, RadioGroupItem} from "@/components/ui/radio-group";

interface AzureFoundryProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function AzureFoundryProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: AzureFoundryProviderFormProps) {
  const [authType, setAuthType] = useState<'api-key' | 'entra-id'>('api-key');
  const [endpoint, setEndpoint] = useState('');
  const [deploymentName, setDeploymentName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const handleConnect = async () => {
    if (!endpoint.trim() || !deploymentName.trim()) {
      setError('Endpoint URL and Deployment Name are required');
      return;
    }

    if (authType === 'api-key' && !apiKey.trim()) {
      setError('API Key is required for API Key authentication');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();

      // Validate connection
      const validation = await accomplish.testAzureFoundryConnection({
        endpoint: endpoint.trim(),
        deploymentName: deploymentName.trim(),
        authType,
        apiKey: authType === 'api-key' ? apiKey.trim() : undefined,
      });

      if (!validation.success) {
        setError(validation.error || 'Connection failed');
        setConnecting(false);
        return;
      }

      // Save credentials
      await accomplish.saveAzureFoundryConfig({
        endpoint: endpoint.trim(),
        deploymentName: deploymentName.trim(),
        authType,
        apiKey: authType === 'api-key' ? apiKey.trim() : undefined,
      });

      // Build the model entry - Azure Foundry uses deployment name as model
      const modelId = `azure-foundry/${deploymentName.trim()}`;
      const models = [{ id: modelId, name: deploymentName.trim() }];

      const provider: ConnectedProvider = {
        providerId: 'azure-foundry',
        connectionStatus: 'connected',
        selectedModelId: modelId, // Auto-select the deployment as model
        credentials: {
          type: 'azure-foundry',
          authMethod: authType,
          endpoint: endpoint.trim(),
          deploymentName: deploymentName.trim(),
          ...(authType === 'api-key' && apiKey ? { keyPrefix: apiKey.substring(0, 8) + '...' } : {}),
        } as AzureFoundryCredentials,
        lastConnectedAt: new Date().toISOString(),
        availableModels: models,
      };

      onConnect(provider);
      setApiKey(''); // Clear sensitive data
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
              <FieldLabel>
                Authentication
              </FieldLabel>
              <RadioGroup defaultValue={authType} className="flex" onValueChange={(value) => setAuthType(value)}>
                <FieldLabel htmlFor="api-key">
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>
                        API Key
                      </FieldTitle>
                    </FieldContent>
                    <RadioGroupItem value="api-key" id="api-key" />
                  </Field>
                </FieldLabel>
                <FieldLabel htmlFor="entra-id">
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>Entra ID</FieldTitle>
                    </FieldContent>
                    <RadioGroupItem value="entra-id" id="entra-id" />
                  </Field>
                </FieldLabel>
              </RadioGroup>
            </Field>

            <Field>
              <FieldLabel>Azure OpenAI Endpoint</FieldLabel>
              <Input
                type="text"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://your-resource.openai.azure.com"
                data-testid="azure-foundry-endpoint"
              />
            </Field>

            <Field>
              <FieldLabel>Deployment Name</FieldLabel>
              <Input
                type="text"
                value={deploymentName}
                onChange={(e) => setDeploymentName(e.target.value)}
                placeholder="e.g., gpt-4o, gpt-5"
                data-testid="azure-foundry-deployment"
              />
            </Field>

            {authType === 'api-key' && (
              <Field>
                <FieldLabel>API Key</FieldLabel>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Azure API key"
                  data-testid="azure-foundry-api-key"
                />
              </Field>
            )}

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
                <FieldLabel>Endpoint</FieldLabel>
                <Input
                  type="text"
                  value={(connectedProvider?.credentials as AzureFoundryCredentials)?.endpoint || ''}
                  disabled
                />
              </Field>

              <Field>
                <FieldLabel>Deployment</FieldLabel>
                <Input
                  type="text"
                  value={(connectedProvider?.credentials as AzureFoundryCredentials)?.deploymentName || ''}
                  disabled
                />
              </Field>

              <Field>
                <FieldLabel>Authentication</FieldLabel>
                <Input
                  type="text"
                  value={(connectedProvider?.credentials as AzureFoundryCredentials)?.authMethod === 'entra-id' ? 'Entra ID (Azure CLI)' : 'API Key'}
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
