// apps/desktop/src/renderer/components/settings/providers/AzureFoundryProviderForm.tsx

import { useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
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
  const { t } = useTranslation('settings');
  const [authType, setAuthType] = useState<'api-key' | 'entra-id'>('api-key');
  const [endpoint, setEndpoint] = useState('');
  const [deploymentName, setDeploymentName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const handleConnect = async () => {
    if (!endpoint.trim() || !deploymentName.trim()) {
      setError(t('azureFoundry.endpointRequired'));
      return;
    }

    if (authType === 'api-key' && !apiKey.trim()) {
      setError(t('azureFoundry.apiKeyRequired'));
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
      <ProviderFormHeader logoSrc={azureLogo} providerName={t('providers.azureFoundry')} />

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
                {t('azureFoundry.authApiKey')}
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
                {t('azureFoundry.authEntraId')}
              </button>
            </div>

            {authType === 'entra-id' && (
              <p className="text-xs text-muted-foreground">
                <Trans i18nKey="azureFoundry.entraIdHint" ns="settings">
                  Uses your Azure CLI credentials. Run <code className="bg-muted px-1 rounded">az login</code> first.
                </Trans>
              </p>
            )}

            {/* Endpoint URL */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                {t('azureFoundry.endpointLabel')}
              </label>
              <input
                type="text"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder={t('azureFoundry.endpointPlaceholder')}
                data-testid="azure-foundry-endpoint"
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
              />
            </div>

            {/* Deployment Name */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                {t('azureFoundry.deploymentLabel')}
              </label>
              <input
                type="text"
                value={deploymentName}
                onChange={(e) => setDeploymentName(e.target.value)}
                placeholder={t('azureFoundry.deploymentPlaceholder')}
                data-testid="azure-foundry-deployment"
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
              />
            </div>

            {/* API Key - only for API key auth */}
            {authType === 'api-key' && (
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  {t('azureFoundry.apiKeyLabel')}
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t('azureFoundry.apiKeyPlaceholder')}
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
                <label className="mb-2 block text-sm font-medium text-foreground">{t('azureFoundry.endpointDisplayLabel')}</label>
                <input
                  type="text"
                  value={(connectedProvider?.credentials as AzureFoundryCredentials)?.endpoint || ''}
                  disabled
                  className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">{t('azureFoundry.deploymentDisplayLabel')}</label>
                <input
                  type="text"
                  value={(connectedProvider?.credentials as AzureFoundryCredentials)?.deploymentName || ''}
                  disabled
                  className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">{t('azureFoundry.authDisplayLabel')}</label>
                <input
                  type="text"
                  value={(connectedProvider?.credentials as AzureFoundryCredentials)?.authMethod === 'entra-id' ? t('azureFoundry.entraIdDisplay') : t('azureFoundry.apiKeyDisplay')}
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
