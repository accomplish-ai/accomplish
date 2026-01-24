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
              <button
                onClick={() => setAuthType('api-key')}
                data-testid="azure-foundry-auth-api-key"
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  authType === 'api-key'
                    ? 'bg-[#0078D4] text-white'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                API Key
              </button>
              <button
                onClick={() => setAuthType('entra-id')}
                data-testid="azure-foundry-auth-entra-id"
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  authType === 'entra-id'
                    ? 'bg-[#0078D4] text-white'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                Entra ID
              </button>
            </div>

            {authType === 'entra-id' && (
              <p className="text-xs text-muted-foreground">
                Uses your Azure CLI credentials. Run <code className="bg-muted px-1 rounded">az login</code> first.
              </p>
            )}

            {/* Endpoint URL */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Azure OpenAI Endpoint
              </label>
              <input
                type="text"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://your-resource.openai.azure.com"
                data-testid="azure-foundry-endpoint"
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
              />
            </div>

            {/* Deployment Name */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Deployment Name
              </label>
              <input
                type="text"
                value={deploymentName}
                onChange={(e) => setDeploymentName(e.target.value)}
                placeholder="e.g., gpt-4o, gpt-5"
                data-testid="azure-foundry-deployment"
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
              />
            </div>

            {/* API Key - only for API key auth */}
            {authType === 'api-key' && (
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Azure API key"
                  data-testid="azure-foundry-api-key"
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
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
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Endpoint</label>
                <input
                  type="text"
                  value={(connectedProvider?.credentials as AzureFoundryCredentials)?.endpoint || ''}
                  disabled
                  className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Deployment</label>
                <input
                  type="text"
                  value={(connectedProvider?.credentials as AzureFoundryCredentials)?.deploymentName || ''}
                  disabled
                  className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Authentication</label>
                <input
                  type="text"
                  value={(connectedProvider?.credentials as AzureFoundryCredentials)?.authMethod === 'entra-id' ? 'Entra ID (Azure CLI)' : 'API Key'}
                  disabled
                  className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
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
