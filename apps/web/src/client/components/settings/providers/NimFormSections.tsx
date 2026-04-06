import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import type { ConnectedProvider, NimCredentials } from '@accomplish_ai/agent-core';
import { ModelSelector, ConnectedControls, FormError, ConnectButton } from '../shared';
import { settingsVariants, settingsTransitions } from '@/lib/animations';

export const NIM_DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';

export interface DisconnectedNimFormProps {
  serverUrl: string;
  onServerUrlChange: (url: string) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  connecting: boolean;
  error: string | null;
  onConnect: () => void;
}

export function DisconnectedNimForm({
  serverUrl,
  onServerUrlChange,
  apiKey,
  onApiKeyChange,
  connecting,
  error,
  onConnect,
}: DisconnectedNimFormProps) {
  const { t } = useTranslation('settings');
  return (
    <motion.div
      key="disconnected"
      variants={settingsVariants.fadeSlide}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={settingsTransitions.enter}
      className="space-y-3"
    >
      <div>
        <label htmlFor="nim-server-url" className="mb-2 block text-sm font-medium text-foreground">
          {t('nim.serverUrl', 'Endpoint URL')}
        </label>
        <input
          id="nim-server-url"
          type="text"
          value={serverUrl}
          onChange={(e) => onServerUrlChange(e.target.value)}
          placeholder={NIM_DEFAULT_BASE_URL}
          data-testid="nim-server-url"
          className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
        />
      </div>
      <div>
        <label htmlFor="nim-api-key" className="mb-2 block text-sm font-medium text-foreground">
          {t('apiKey.title')}
          <span className="text-destructive ml-0.5">*</span>
        </label>
        <input
          id="nim-api-key"
          type="password"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          placeholder={t('nim.apiKeyPlaceholder', 'nvapi-...')}
          data-testid="nim-api-key"
          className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {t('nim.apiKeyHint', 'Get your API key from NGC: org.ngc.nvidia.com/setup/api-key')}
        </p>
      </div>
      <FormError error={error} />
      <ConnectButton onClick={onConnect} connecting={connecting} />
    </motion.div>
  );
}

export interface ConnectedNimDetailsProps {
  connectedProvider: ConnectedProvider;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function ConnectedNimDetails({
  connectedProvider,
  onDisconnect,
  onModelChange,
  showModelError,
}: ConnectedNimDetailsProps) {
  const { t } = useTranslation('settings');
  const credentials = connectedProvider.credentials as NimCredentials;
  const models = connectedProvider.availableModels || [];
  return (
    <motion.div
      key="connected"
      variants={settingsVariants.fadeSlide}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={settingsTransitions.enter}
      className="space-y-3"
    >
      <div className="space-y-3">
        <div>
          <label
            htmlFor="nim-server-url-connected"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            {t('nim.serverUrl', 'Endpoint URL')}
          </label>
          <input
            id="nim-server-url-connected"
            type="text"
            value={credentials?.serverUrl ?? NIM_DEFAULT_BASE_URL}
            disabled
            className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
          />
        </div>
        <div>
          <label
            htmlFor="nim-api-key-connected"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            {t('apiKey.title')}
          </label>
          <input
            id="nim-api-key-connected"
            type="text"
            value={credentials?.keyPrefix ?? t('apiKey.saved')}
            disabled
            className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
          />
        </div>
      </div>
      <ConnectedControls onDisconnect={onDisconnect} />
      <ModelSelector
        models={models}
        value={connectedProvider.selectedModelId || null}
        onChange={onModelChange}
        error={showModelError && !connectedProvider.selectedModelId}
      />
    </motion.div>
  );
}
