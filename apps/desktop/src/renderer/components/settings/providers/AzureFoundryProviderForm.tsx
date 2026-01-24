// apps/desktop/src/renderer/components/settings/providers/AzureFoundryProviderForm.tsx

import { useState } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import type { ConnectedProvider, AzureFoundryCredentials } from '@accomplish/shared';
import {
  ModelSelector,
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
} from '../shared';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// Import Azure logo
import azureLogo from '/assets/ai-logos/azure.svg';

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
    <div className="rounded-xl border border-border bg-card p-5" data-testid="provider-settings-panel">
      <ProviderFormHeader logoSrc={azureLogo} providerName="Azure AI Foundry" />

      <div className="space-y-3">
        {!isConnected ? (
          <>
            {/* Auth type tabs */}
            <div className="flex gap-2">
              <Button
                onClick={() => setAuthType('api-key')}
                data-testid="azure-foundry-auth-api-key"
                type="button"
                variant={authType === 'api-key' ? 'default' : 'secondary'}
                className={authType === 'api-key' ? 'bg-[#0078D4] text-white hover:bg-[#0078D4]/90' : ''}
              >
                API Key
              </Button>
              <Button
                onClick={() => setAuthType('entra-id')}
                data-testid="azure-foundry-auth-entra-id"
                type="button"
                variant={authType === 'entra-id' ? 'default' : 'secondary'}
                className={authType === 'entra-id' ? 'bg-[#0078D4] text-white hover:bg-[#0078D4]/90' : ''}
              >
                Entra ID
              </Button>
            </div>

            {authType === 'entra-id' && (
              <p className="text-xs text-muted-foreground">
                Uses your Azure CLI credentials. Run <code className="bg-muted px-1 rounded">az login</code> first.
              </p>
            )}

            {/* Endpoint URL */}
            <div className="grid gap-2">
              <Label>Azure OpenAI Endpoint</Label>
              <Input
                type="text"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://your-resource.openai.azure.com"
                data-testid="azure-foundry-endpoint"
              />
            </div>

            {/* Deployment Name */}
            <div className="grid gap-2">
              <Label>Deployment Name</Label>
              <Input
                type="text"
                value={deploymentName}
                onChange={(e) => setDeploymentName(e.target.value)}
                placeholder="e.g., gpt-4o, gpt-5"
                data-testid="azure-foundry-deployment"
              />
            </div>

            {/* API Key - only for API key auth */}
            {authType === 'api-key' && (
              <div className="grid gap-2">
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Azure API key"
                  data-testid="azure-foundry-api-key"
                />
              </div>
            )}

            <FormError error={error} />
            <ConnectButton onClick={handleConnect} connecting={connecting} />
          </>
        ) : (
          <>
            {/* Display saved credentials info */}
            <div className="space-y-3">
              <div className="grid gap-2">
                <Label>Endpoint</Label>
                <Input
                  type="text"
                  value={(connectedProvider?.credentials as AzureFoundryCredentials)?.endpoint || ''}
                  disabled
                />
              </div>
              <div className="grid gap-2">
                <Label>Deployment</Label>
                <Input
                  type="text"
                  value={(connectedProvider?.credentials as AzureFoundryCredentials)?.deploymentName || ''}
                  disabled
                />
              </div>
              <div className="grid gap-2">
                <Label>Authentication</Label>
                <Input
                  type="text"
                  value={(connectedProvider?.credentials as AzureFoundryCredentials)?.authMethod === 'entra-id' ? 'Entra ID (Azure CLI)' : 'API Key'}
                  disabled
                />
              </div>
            </div>

            <ConnectedControls onDisconnect={onDisconnect} />

            {/* Model Selector */}
            <ModelSelector
              models={models}
              value={connectedProvider?.selectedModelId || null}
              onChange={onModelChange}
              error={showModelError && !connectedProvider?.selectedModelId}
            />
          </>
        )}
      </div>
    </div>
  );
}
