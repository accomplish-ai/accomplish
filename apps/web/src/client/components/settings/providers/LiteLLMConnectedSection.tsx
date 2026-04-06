import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { ConnectedProvider, LiteLLMCredentials } from '@accomplish_ai/agent-core/common';
import { ModelSelector, ConnectedControls } from '../shared';
import { settingsVariants, settingsTransitions } from '@/lib/animations';

interface LiteLLMConnectedSectionProps {
  connectedProvider: ConnectedProvider;
  models: Array<{ id: string; name: string }>;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function LiteLLMConnectedSection({
  connectedProvider,
  models,
  onDisconnect,
  onModelChange,
  showModelError,
}: LiteLLMConnectedSectionProps) {
  const { t } = useTranslation('settings');
  const credentials = connectedProvider?.credentials as LiteLLMCredentials;

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
      {/* Display saved connection details */}
      <div className="space-y-3">
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            {t('litellm.serverUrl')}
          </label>
          <input
            type="text"
            value={credentials?.serverUrl || 'http://localhost:4000'}
            disabled
            className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
          />
        </div>
        {credentials?.hasApiKey && (
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              {t('apiKey.title')}
            </label>
            <input
              type="text"
              value={credentials?.keyPrefix || t('apiKey.saved')}
              disabled
              className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
            />
          </div>
        )}
      </div>

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
