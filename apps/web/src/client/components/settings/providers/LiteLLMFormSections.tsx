import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import type { ConnectedProvider, LiteLLMCredentials } from '@accomplish_ai/agent-core';
import { ModelSelector, ConnectedControls, FormError, ConnectButton } from '../shared';
import { settingsVariants, settingsTransitions } from '@/lib/animations';

export interface LiteLLMDisconnectedFormProps {
  serverUrl: string;
  onServerUrlChange: (url: string) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  connecting: boolean;
  error: string | null;
  onConnect: () => void;
}

export function LiteLLMDisconnectedForm({
  serverUrl,
  onServerUrlChange,
  apiKey,
  onApiKeyChange,
  connecting,
  error,
  onConnect,
}: LiteLLMDisconnectedFormProps) {
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
        <label
          htmlFor="litellm-server-url"
          className="mb-2 block text-sm font-medium text-foreground"
        >
          {t('litellm.serverUrl')}
        </label>
        <input
          id="litellm-server-url"
          type="text"
          value={serverUrl}
          onChange={(e) => onServerUrlChange(e.target.value)}
          placeholder="http://localhost:4000"
          data-testid="litellm-server-url"
          className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
        />
      </div>
      <div>
        <label htmlFor="litellm-api-key" className="mb-2 block text-sm font-medium text-foreground">
          {t('apiKey.title')}{' '}
          <span className="text-muted-foreground">({t('common.optional')})</span>
        </label>
        <div className="flex gap-2">
          <input
            id="litellm-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={t('litellm.optionalApiKey')}
            data-testid="litellm-api-key"
            className="flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm"
          />
          <button
            onClick={() => onApiKeyChange('')}
            className="rounded-md border border-border p-2.5 text-muted-foreground hover:text-foreground transition-colors"
            type="button"
            aria-label="Clear API key"
            disabled={!apiKey}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>
      <FormError error={error} />
      <ConnectButton onClick={onConnect} connecting={connecting} />
    </motion.div>
  );
}

export interface LiteLLMConnectedSectionProps {
  connectedProvider: ConnectedProvider;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function LiteLLMConnectedSection({
  connectedProvider,
  onDisconnect,
  onModelChange,
  showModelError,
}: LiteLLMConnectedSectionProps) {
  const { t } = useTranslation('settings');
  const creds = connectedProvider.credentials as LiteLLMCredentials;
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
            htmlFor="litellm-server-url-connected"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            {t('litellm.serverUrl')}
          </label>
          <input
            id="litellm-server-url-connected"
            type="text"
            value={creds?.serverUrl || 'http://localhost:4000'}
            disabled
            className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
          />
        </div>
        {creds?.hasApiKey && (
          <div>
            <label
              htmlFor="litellm-api-key-connected"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              {t('apiKey.title')}
            </label>
            <input
              id="litellm-api-key-connected"
              type="text"
              value={creds?.keyPrefix || t('apiKey.saved')}
              disabled
              className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
            />
          </div>
        )}
      </div>
      <ConnectedControls onDisconnect={onDisconnect} />
      <ModelSelector
        models={models}
        value={connectedProvider.selectedModelId}
        onChange={onModelChange}
        error={showModelError && !connectedProvider.selectedModelId}
      />
    </motion.div>
  );
}
