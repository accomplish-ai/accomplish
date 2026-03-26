import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type { ConnectedProvider } from '@accomplish_ai/agent-core';
import { COPILOT_MODELS } from '@accomplish_ai/agent-core/common';
import { ModelSelector, ConnectedControls, ProviderFormHeader, FormError } from '../shared';
import { PROVIDER_LOGOS } from '@/lib/provider-logos';
import { useCopilotConnection } from './useCopilotConnection';

interface CopilotProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function CopilotProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: CopilotProviderFormProps) {
  const { t } = useTranslation('settings');
  const isConnected = connectedProvider?.connectionStatus === 'connected';
  const logoSrc = PROVIDER_LOGOS['copilot'];

  const models = connectedProvider?.availableModels?.length
    ? connectedProvider.availableModels.map((m) => ({ id: m.id, name: m.name }))
    : COPILOT_MODELS.map((m) => ({ id: m.id, name: m.displayName }));

  const { connecting, error, userCode, verificationUri, handleConnect, handleDisconnect } =
    useCopilotConnection({ isConnected, onConnect, onDisconnect });

  return (
    <div
      className="rounded-xl border border-border bg-card p-5"
      data-testid="provider-settings-panel"
    >
      <ProviderFormHeader
        logoSrc={logoSrc}
        providerName={t('providers.copilot', { defaultValue: 'GitHub Copilot' })}
        invertInDark={false}
      />

      <AnimatePresence mode="wait">
        {!isConnected ? (
          <motion.div
            key="disconnected"
            variants={settingsVariants.fadeSlide}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={settingsTransitions.enter}
            className="space-y-4"
          >
            <p className="text-sm text-muted-foreground">
              {t('copilot.description', {
                defaultValue:
                  'Connect your GitHub Copilot subscription to use it as your AI provider. You will be redirected to GitHub to authorize access.',
              })}
            </p>

            {userCode && verificationUri && (
              <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {t('copilot.enterCode', { defaultValue: 'Enter this code on GitHub:' })}
                </p>
                <div className="flex items-center gap-3">
                  <code className="text-2xl font-mono font-bold tracking-widest text-primary">
                    {userCode}
                  </code>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('copilot.browserOpened', {
                    defaultValue:
                      'A browser window has been opened. After entering the code, return here.',
                  })}
                </p>
                <a
                  href={verificationUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary underline"
                >
                  {verificationUri}
                </a>
              </div>
            )}

            <FormError error={error} />

            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting}
              data-testid="copilot-connect-btn"
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {logoSrc && <img src={logoSrc} alt="" className="h-5 w-5" />}
              {connecting
                ? t('copilot.connecting', { defaultValue: 'Waiting for authorization…' })
                : t('copilot.connectButton', { defaultValue: 'Connect with GitHub' })}
            </button>
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
            <ConnectedControls onDisconnect={handleDisconnect} />

            <ModelSelector
              models={models}
              value={connectedProvider?.selectedModelId || null}
              onChange={onModelChange}
              error={showModelError && !connectedProvider?.selectedModelId}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
