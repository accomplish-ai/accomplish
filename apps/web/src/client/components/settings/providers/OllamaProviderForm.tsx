import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type {
  ConnectedProvider,
  OllamaCredentials,
  ToolSupportStatus,
} from '@accomplish_ai/agent-core';
import {
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
  ModelSelector,
  ToolSupportBadge,
} from '../shared';
import { useOllamaProviderConnect } from './useOllamaProviderConnect';
import type { OllamaModel } from './ollama-types';

import ollamaLogo from '/assets/ai-logos/ollama.svg';

interface OllamaProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onUpdateProvider?: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

function OllamaModelSelector({
  models,
  value,
  onChange,
  error,
}: {
  models: OllamaModel[];
  value: string | null;
  onChange: (modelId: string) => void;
  error: boolean;
}) {
  const { t } = useTranslation('settings');
  const sortedModels = [...models].sort((a, b) => {
    const order: Record<ToolSupportStatus, number> = { supported: 0, unknown: 1, unsupported: 2 };
    const aOrder = order[a.toolSupport || 'unknown'];
    const bOrder = order[b.toolSupport || 'unknown'];
    return aOrder - bOrder;
  });

  const toolIconMap: Record<ToolSupportStatus | 'unknown', string> = {
    supported: '✓',
    unsupported: '✗',
    unknown: '?',
  };

  const selectorModels = sortedModels.map((model) => {
    const toolSupport = model.toolSupport || 'unknown';
    const toolIcon = toolIconMap[toolSupport];
    return { id: model.id, name: `${model.name} ${toolIcon}` };
  });

  const selectedModel = models.find((m) => m.id === value);
  const hasUnsupportedSelected = selectedModel?.toolSupport === 'unsupported';
  const hasUnknownSelected = selectedModel?.toolSupport === 'unknown';

  return (
    <div>
      <ModelSelector models={selectorModels} value={value} onChange={onChange} error={error} />
      {hasUnsupportedSelected && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <svg
            className="h-5 w-5 flex-shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            <p className="font-medium">{t('common.toolUnsupported')}</p>
            <p className="text-red-400/80 mt-1">{t('common.toolUnsupportedDetail')}</p>
          </div>
        </div>
      )}
      {hasUnknownSelected && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-400">
          <svg
            className="h-5 w-5 flex-shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <p className="font-medium">{t('common.toolUnknown')}</p>
            <p className="text-yellow-400/80 mt-1">{t('common.toolUnknownDetail')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function OllamaProviderForm({
  connectedProvider,
  onConnect,
  onUpdateProvider,
  onDisconnect,
  onModelChange,
  showModelError,
}: OllamaProviderFormProps) {
  const { t } = useTranslation('settings');
  const {
    serverUrl,
    setServerUrl,
    connecting,
    refreshing,
    error,
    models,
    handleConnect,
    handleRefresh,
  } = useOllamaProviderConnect({ connectedProvider, onConnect, onUpdateProvider });

  const isConnected = connectedProvider?.connectionStatus === 'connected';

  return (
    <div
      className="rounded-xl border border-border bg-card p-5"
      data-testid="provider-settings-panel"
    >
      <ProviderFormHeader logoSrc={ollamaLogo} providerName={t('providers.ollama')} invertInDark />
      <div className="space-y-3">
        <AnimatePresence mode="wait">
          {!isConnected ? (
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
                <label className="mb-2 block text-sm font-medium text-foreground">
                  {t('ollama.serverUrl')}
                </label>
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  data-testid="ollama-server-url"
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                />
              </div>
              <FormError error={error} />
              <ConnectButton onClick={handleConnect} connecting={connecting} />
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
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  {t('ollama.serverUrl')}
                </label>
                <input
                  type="text"
                  value={
                    (connectedProvider?.credentials as OllamaCredentials)?.serverUrl ||
                    'http://localhost:11434'
                  }
                  disabled
                  className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                />
              </div>
              <ConnectedControls onDisconnect={onDisconnect} />
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <OllamaModelSelector
                    models={models}
                    value={connectedProvider?.selectedModelId || null}
                    onChange={onModelChange}
                    error={showModelError && !connectedProvider?.selectedModelId}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  data-testid="ollama-refresh-models"
                  className="mt-6 flex-shrink-0 rounded-md border border-input bg-background px-2.5 py-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                  title={t('ollama.refreshModels')}
                  aria-label={t('ollama.refreshModels')}
                >
                  <svg
                    className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
              </div>
              <FormError error={error} />
              <div className="flex items-center gap-3 pt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <ToolSupportBadge status="supported" t={t} />
                  <span>{t('common.functionCallingVerified')}</span>
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
