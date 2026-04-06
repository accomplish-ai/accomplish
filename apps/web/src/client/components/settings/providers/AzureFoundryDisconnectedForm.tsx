import { useTranslation } from 'react-i18next';
import { ConnectButton, FormError } from '../shared';

interface AzureFoundryDisconnectedFormProps {
  authType: 'api-key' | 'entra-id';
  endpoint: string;
  deploymentName: string;
  apiKey: string;
  connecting: boolean;
  error: string | null;
  onAuthTypeChange: (type: 'api-key' | 'entra-id') => void;
  onEndpointChange: (value: string) => void;
  onDeploymentNameChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onConnect: () => void;
}

export function AzureFoundryDisconnectedForm({
  authType,
  endpoint,
  deploymentName,
  apiKey,
  connecting,
  error,
  onAuthTypeChange,
  onEndpointChange,
  onDeploymentNameChange,
  onApiKeyChange,
  onConnect,
}: AzureFoundryDisconnectedFormProps) {
  const { t } = useTranslation('settings');

  return (
    <>
      <div className="flex gap-2">
        <button
          onClick={() => onAuthTypeChange('api-key')}
          data-testid="azure-foundry-auth-api-key"
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            authType === 'api-key'
              ? 'bg-provider-accent text-white'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('azure.apiKey')}
        </button>
        <button
          onClick={() => onAuthTypeChange('entra-id')}
          data-testid="azure-foundry-auth-entra-id"
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            authType === 'entra-id'
              ? 'bg-provider-accent text-white'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('azure.entraId')}
        </button>
      </div>

      {authType === 'entra-id' && (
        <p className="text-xs text-muted-foreground">
          {t('azure.entraIdHelp')}{' '}
          <code className="bg-muted px-1 rounded">{t('azure.entraIdHelpCommand')}</code>{' '}
          {t('azure.entraIdHelpSuffix')}
        </p>
      )}

      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          {t('azure.endpoint')}
        </label>
        <input
          type="text"
          value={endpoint}
          onChange={(e) => onEndpointChange(e.target.value)}
          placeholder={t('azure.endpointPlaceholder')}
          data-testid="azure-foundry-endpoint"
          className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          {t('azure.deploymentName')}
        </label>
        <input
          type="text"
          value={deploymentName}
          onChange={(e) => onDeploymentNameChange(e.target.value)}
          placeholder={t('azure.deploymentPlaceholder')}
          data-testid="azure-foundry-deployment"
          className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
        />
      </div>

      {authType === 'api-key' && (
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            {t('azure.apiKey')}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={t('azure.apiKeyPlaceholder')}
            data-testid="azure-foundry-api-key"
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
          />
        </div>
      )}

      <FormError error={error} />
      <ConnectButton onClick={onConnect} connecting={connecting} />
    </>
  );
}
