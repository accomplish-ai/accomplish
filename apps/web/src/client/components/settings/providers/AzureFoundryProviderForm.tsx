import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccomplish } from '@/lib/accomplish';
import type { ConnectedProvider, AzureFoundryCredentials } from '@accomplish_ai/agent-core/common';
import { ProviderFormHeader } from '../shared';
import { AzureFoundryConnectedSection } from './AzureFoundryConnectedSection';
import { AzureFoundryDisconnectedForm } from './AzureFoundryDisconnectedForm';

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
  const { t } = useTranslation('settings');

  const handleConnect = async () => {
    if (!endpoint.trim() || !deploymentName.trim()) {
      setError(t('azure.endpointAndDeploymentRequired'));
      return;
    }

    if (authType === 'api-key' && !apiKey.trim()) {
      setError(t('azure.apiKeyRequired'));
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
        setError(validation.error || t('status.connectionFailed'));
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
          ...(authType === 'api-key' && apiKey
            ? { keyPrefix: apiKey.substring(0, 8) + '...' }
            : {}),
        } as AzureFoundryCredentials,
        lastConnectedAt: new Date().toISOString(),
        availableModels: models,
      };

      onConnect(provider);
      setApiKey(''); // Clear sensitive data
    } catch (err) {
      setError(err instanceof Error ? err.message : t('status.connectionFailed'));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div
      className="rounded-xl border border-border bg-card p-5"
      data-testid="provider-settings-panel"
    >
      <ProviderFormHeader logoSrc={azureLogo} providerName="Azure AI Foundry" />

      <div className="space-y-3">
        {!isConnected ? (
          <AzureFoundryDisconnectedForm
            authType={authType}
            endpoint={endpoint}
            deploymentName={deploymentName}
            apiKey={apiKey}
            connecting={connecting}
            error={error}
            onAuthTypeChange={setAuthType}
            onEndpointChange={setEndpoint}
            onDeploymentNameChange={setDeploymentName}
            onApiKeyChange={setApiKey}
            onConnect={handleConnect}
          />
        ) : (
          <AzureFoundryConnectedSection
            connectedProvider={connectedProvider!}
            onDisconnect={onDisconnect}
            onModelChange={onModelChange}
            showModelError={showModelError}
          />
        )}
      </div>
    </div>
  );
}
