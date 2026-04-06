import { motion } from 'framer-motion';
import type { ConnectedProvider, CustomCredentials } from '@accomplish_ai/agent-core';
import { ConnectedControls } from '../shared';
import { settingsVariants, settingsTransitions } from '@/lib/animations';

interface CustomProviderConnectedSectionProps {
  connectedProvider: ConnectedProvider;
  onDisconnect: () => void;
  showModelError: boolean;
}

export function CustomProviderConnectedSection({
  connectedProvider,
  onDisconnect,
  showModelError,
}: CustomProviderConnectedSectionProps) {
  const customCredentials = connectedProvider.credentials as CustomCredentials | undefined;

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
            htmlFor="connected-base-url"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Base URL
          </label>
          <input
            id="connected-base-url"
            type="text"
            value={customCredentials?.baseUrl || ''}
            disabled
            className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
          />
        </div>
        {customCredentials?.hasApiKey && (
          <div>
            <label
              htmlFor="connected-api-key"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              API Key
            </label>
            <input
              id="connected-api-key"
              type="text"
              value={customCredentials?.keyPrefix || 'API key saved'}
              disabled
              className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
            />
          </div>
        )}
        <div>
          <label
            htmlFor="connected-model-name"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Model
          </label>
          <input
            id="connected-model-name"
            type="text"
            value={customCredentials?.modelName || ''}
            disabled
            className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
          />
        </div>
      </div>

      <ConnectedControls onDisconnect={onDisconnect} />

      {showModelError && !connectedProvider.selectedModelId && (
        <p className="text-sm text-destructive">Please reconnect to set a model</p>
      )}
    </motion.div>
  );
}
