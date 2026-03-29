import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type {
  ProviderId,
  ConnectedProvider,
  ApiKeyCredentials,
} from '@accomplish_ai/agent-core/common';
import { PROVIDER_META, DEFAULT_PROVIDERS } from '@accomplish_ai/agent-core/common';
import { ConnectButton, ProviderFormHeader, FormError } from '../shared';
import { PROVIDER_LOGOS, DARK_INVERT_PROVIDERS } from '@/lib/provider-logos';
import { ProviderModelSelect } from './ProviderModelSelect';
import { ProviderAdvancedSettings } from './ProviderAdvancedSettings';
import { useClassicProviderConnect } from './useClassicProviderConnect';

interface ClassicProviderFormProps {
  providerId: ProviderId;
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function ClassicProviderForm({
  providerId,
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: ClassicProviderFormProps) {
  const { t } = useTranslation('settings');
  const meta = PROVIDER_META[providerId];
  const providerConfig = DEFAULT_PROVIDERS.find((p) => p.id === providerId);
  const isOpenAI = providerId === 'openai';
  const hasEditableBaseUrl = providerConfig?.editableBaseUrl === true;
  const defaultBaseUrl = providerConfig?.baseUrl ?? '';

  const conn = useClassicProviderConnect({
    providerId,
    connectedProvider,
    onConnect,
    isOpenAI,
    hasEditableBaseUrl,
    defaultBaseUrl,
  });

  const staticModels =
    providerConfig?.models.map((m) => ({ id: m.fullId, name: m.displayName })) || [];
  const models = connectedProvider?.availableModels?.length
    ? connectedProvider.availableModels.map((m) => ({ id: m.id, name: m.name }))
    : (conn.fetchedModels ?? staticModels);
  const providerName = t(`providers.${providerId}`, { defaultValue: meta.name });
  const logoSrc = PROVIDER_LOGOS[providerId];

  const apiKeyInput = (
    <div className="flex gap-2">
      <input
        type="password"
        value={conn.apiKey}
        onChange={(e) => conn.setApiKey(e.target.value)}
        placeholder={t('apiKey.enterKey')}
        disabled={conn.connecting}
        data-testid="api-key-input"
        className="flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm disabled:opacity-50"
      />
      <button
        onClick={() => conn.setApiKey('')}
        className="rounded-md border border-border p-2.5 text-muted-foreground hover:text-foreground transition-colors"
        type="button"
        disabled={!conn.apiKey}
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
  );

  return (
    <div
      className="rounded-xl border border-border bg-card p-5"
      data-testid="provider-settings-panel"
    >
      <ProviderFormHeader
        logoSrc={logoSrc}
        providerName={providerName}
        invertInDark={DARK_INVERT_PROVIDERS.has(providerId)}
      />

      {isOpenAI && !conn.isConnected && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={conn.handleChatGptSignIn}
            disabled={conn.signingIn}
            data-testid="openai-oauth-signin"
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
          >
            <img src={PROVIDER_LOGOS['openai']} alt="" className="h-5 w-5 dark:invert" />
            {conn.signingIn ? t('openai.signingIn') : t('openai.loginWithOpenAI')}
          </button>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-sm text-muted-foreground">{t('common.or')}</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">{t('apiKey.title')}</label>
              {meta.helpUrl && (
                <a
                  href={meta.helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-primary underline"
                >
                  {t('help.findApiKey')}
                </a>
              )}
            </div>
            {apiKeyInput}
          </div>
          <ProviderAdvancedSettings
            fieldId={`${providerId}-openai-base-url`}
            value={conn.openAiBaseUrl}
            onChange={conn.setOpenAiBaseUrl}
            placeholder="https://api.openai.com/v1"
          />
          <FormError error={conn.error} />
          <ConnectButton
            onClick={conn.handleConnect}
            connecting={conn.connecting}
            disabled={!conn.apiKey.trim()}
          />
        </div>
      )}

      {!isOpenAI && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">{t('apiKey.title')}</label>
            {meta.helpUrl && (
              <a
                href={meta.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-primary underline"
              >
                {t('help.findApiKey')}
              </a>
            )}
          </div>
          <AnimatePresence mode="wait">
            {!conn.isConnected ? (
              <motion.div
                key="disconnected"
                variants={settingsVariants.fadeSlide}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={settingsTransitions.enter}
                className="space-y-3"
              >
                {apiKeyInput}
                {hasEditableBaseUrl && (
                  <ProviderAdvancedSettings
                    fieldId={`${providerId}-base-url-input`}
                    value={conn.customBaseUrl}
                    onChange={conn.setCustomBaseUrl}
                    placeholder={defaultBaseUrl}
                    disabled={conn.connecting}
                  />
                )}
                <FormError error={conn.error} />
                <ConnectButton
                  onClick={conn.handleConnect}
                  connecting={conn.connecting}
                  disabled={!conn.apiKey.trim()}
                />
              </motion.div>
            ) : (
              <motion.div
                key="connected"
                variants={settingsVariants.fadeSlide}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={settingsTransitions.enter}
                className="space-y-3"
              >
                <input
                  type="text"
                  value={(() => {
                    const creds = connectedProvider?.credentials as ApiKeyCredentials | undefined;
                    return creds?.keyPrefix || t('apiKey.savedReconnectToSee');
                  })()}
                  disabled
                  data-testid="api-key-display"
                  className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                />
                {hasEditableBaseUrl && connectedProvider?.customBaseUrl && (
                  <ProviderAdvancedSettings
                    fieldId={`${providerId}-base-url-display`}
                    value={connectedProvider.customBaseUrl}
                    readOnly
                  />
                )}
                <ProviderModelSelect
                  models={models}
                  selectedModelId={connectedProvider?.selectedModelId}
                  onChange={onModelChange}
                  showModelError={showModelError}
                  onDisconnect={onDisconnect}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {isOpenAI && conn.isConnected && (
        <ProviderModelSelect
          models={models}
          selectedModelId={connectedProvider?.selectedModelId}
          onChange={onModelChange}
          showModelError={showModelError}
          onDisconnect={onDisconnect}
        />
      )}
    </div>
  );
}
