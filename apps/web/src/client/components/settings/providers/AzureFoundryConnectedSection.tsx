import { useTranslation } from 'react-i18next';
import type { ConnectedProvider, AzureFoundryCredentials } from '@accomplish_ai/agent-core/common';
import { ModelSelector, ConnectedControls } from '../shared';

interface AzureFoundryConnectedSectionProps {
  connectedProvider: ConnectedProvider;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function AzureFoundryConnectedSection({
  connectedProvider,
  onDisconnect,
  onModelChange,
  showModelError,
}: AzureFoundryConnectedSectionProps) {
  const { t } = useTranslation('settings');
  const models = connectedProvider.availableModels || [];

  return (
    <>
      {/* Display saved credentials info */}
      <div className="space-y-3">
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            {t('azure.endpointLabel')}
          </label>
          <input
            type="text"
            value={(connectedProvider.credentials as AzureFoundryCredentials)?.endpoint || ''}
            disabled
            className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            {t('azure.deploymentLabel')}
          </label>
          <input
            type="text"
            value={(connectedProvider.credentials as AzureFoundryCredentials)?.deploymentName || ''}
            disabled
            className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            {t('azure.authentication')}
          </label>
          <input
            type="text"
            value={
              (connectedProvider.credentials as AzureFoundryCredentials)?.authMethod === 'entra-id'
                ? t('azure.entraIdDisplay')
                : t('azure.apiKey')
            }
            disabled
            className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
          />
        </div>
      </div>

      <ConnectedControls onDisconnect={onDisconnect} />

      {/* Model Selector */}
      <ModelSelector
        models={models}
        value={connectedProvider.selectedModelId || null}
        onChange={onModelChange}
        error={showModelError && !connectedProvider.selectedModelId}
      />
    </>
  );
}
