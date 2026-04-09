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
import { ClassicProviderOpenAISection } from './ClassicProviderOpenAISection';
import { ClassicApiKeyInput } from './ClassicApiKeyInput';

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
    <ClassicApiKeyInput
      apiKey={conn.apiKey}
      onChange={conn.setApiKey}
      onClear={() => conn.setApiKey('')}
      connecting={conn.connecting}
    />
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
        <ClassicProviderOpenAISection
          apiKey={conn.apiKey}
          apiKeyInput={apiKeyInput}
          openAiBaseUrl={conn.openAiBaseUrl}
          onOpenAiBaseUrlChange={conn.setOpenAiBaseUrl}
          error={conn.error}
          connecting={conn.connecting}
          signingIn={conn.signingIn}
          helpUrl={meta.helpUrl}
          onChatGptSignIn={conn.handleChatGptSignIn}
          onConnect={conn.handleConnect}
        />
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
