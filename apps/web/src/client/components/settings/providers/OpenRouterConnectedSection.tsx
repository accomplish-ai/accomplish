import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { ConnectedProvider, OpenRouterCredentials } from '@accomplish_ai/agent-core/common';
import { PROVIDER_META } from '@accomplish_ai/agent-core/common';
import { ModelSelector, ConnectedControls } from '../shared';
import { settingsVariants, settingsTransitions } from '@/lib/animations';

interface OpenRouterConnectedSectionProps {
  connectedProvider: ConnectedProvider;
  models: Array<{ id: string; name: string }>;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function OpenRouterConnectedSection({
  connectedProvider,
  models,
  onDisconnect,
  onModelChange,
  showModelError,
}: OpenRouterConnectedSectionProps) {
  const { t } = useTranslation('settings');
  const meta = PROVIDER_META.openrouter;

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
      {/* Connected: Show masked key + Connected button + Model */}
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

      <input
        type="text"
        value={(() => {
          const creds = connectedProvider?.credentials as OpenRouterCredentials | undefined;
          if (creds?.keyPrefix) return creds.keyPrefix;
          return t('apiKey.savedReconnectToSee');
        })()}
        disabled
        data-testid="api-key-display"
        className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
      />

      <ConnectedControls onDisconnect={onDisconnect} />

      {/* Model Selector */}
      <ModelSelector
        models={models}
        value={connectedProvider?.selectedModelId || null}
        onChange={onModelChange}
        error={showModelError && !connectedProvider?.selectedModelId}
      />
    </motion.div>
  );
}
