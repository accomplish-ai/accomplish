import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type {
  ConnectedProvider,
  BedrockProviderCredentials,
} from '@accomplish_ai/agent-core/common';
import { ModelSelector, ConnectedControls } from '../shared';

interface BedrockConnectedSectionProps {
  connectedProvider: ConnectedProvider;
  models: Array<{ id: string; name: string }>;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function BedrockConnectedSection({
  connectedProvider,
  models,
  onDisconnect,
  onModelChange,
  showModelError,
}: BedrockConnectedSectionProps) {
  const { t } = useTranslation('settings');
  const creds = connectedProvider.credentials as BedrockProviderCredentials;

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
        {creds?.authMethod === 'apiKey' ? (
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              {t('bedrockApiKey.label')}
            </label>
            <input
              type="text"
              value={creds?.apiKeyPrefix || '********'}
              disabled
              className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
            />
          </div>
        ) : creds?.authMethod === 'accessKey' ? (
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              {t('bedrock.accessKeyId')}
            </label>
            <input
              type="text"
              value={creds?.accessKeyIdPrefix || 'AKIA...'}
              disabled
              className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
            />
          </div>
        ) : (
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              {t('bedrock.awsProfile')}
            </label>
            <input
              type="text"
              value={creds?.profileName || 'default'}
              disabled
              className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
            />
          </div>
        )}
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            {t('bedrock.region')}
          </label>
          <input
            type="text"
            value={creds?.region || 'us-east-1'}
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
