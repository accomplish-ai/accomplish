import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type {
  ConnectedProvider,
  VertexProviderCredentials,
} from '@accomplish_ai/agent-core/common';
import { ModelSelector, ConnectedControls } from '../../shared';

interface VertexConnectedSectionProps {
  connectedProvider: ConnectedProvider;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
  models: Array<{ id: string; name: string }>;
  customModels: Array<{ id: string; name: string }>;
  customModelInput: string;
  setCustomModelInput: (v: string) => void;
  customModelError: string | null;
  setCustomModelError: (e: string | null) => void;
  handleAddCustomModel: () => void;
  handleRemoveCustomModel: (id: string) => void;
}

export function VertexConnectedSection({
  connectedProvider,
  onDisconnect,
  onModelChange,
  showModelError,
  models,
  customModels,
  customModelInput,
  setCustomModelInput,
  customModelError,
  setCustomModelError,
  handleAddCustomModel,
  handleRemoveCustomModel,
}: VertexConnectedSectionProps) {
  const { t } = useTranslation('settings');
  const creds = connectedProvider.credentials as VertexProviderCredentials;

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
          <label className="mb-2 block text-sm font-medium text-foreground">
            {t('vertex.authMethod')}
          </label>
          <input
            type="text"
            value={
              creds?.authMethod === 'serviceAccount'
                ? t('vertex.serviceAccountDisplay')
                : t('vertex.adcDisplay')
            }
            disabled
            className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
          />
        </div>
        {creds?.serviceAccountEmail && (
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              {t('vertex.serviceAccountLabel')}
            </label>
            <input
              type="text"
              value={creds.serviceAccountEmail || ''}
              disabled
              className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
            />
          </div>
        )}
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            {t('vertex.project')}
          </label>
          <input
            type="text"
            value={creds?.projectId || ''}
            disabled
            className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            {t('vertex.location')}
          </label>
          <input
            type="text"
            value={creds?.location || ''}
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

      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          {t('vertex.addCustomModel')}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={customModelInput}
            onChange={(e) => {
              setCustomModelInput(e.target.value);
              setCustomModelError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAddCustomModel();
              }
            }}
            placeholder={t('vertex.publisherModelPlaceholder')}
            data-testid="vertex-custom-model-input"
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleAddCustomModel}
            data-testid="vertex-add-model-btn"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t('vertex.add')}
          </button>
        </div>
        {customModelError && <p className="mt-1 text-xs text-destructive">{customModelError}</p>}
        <p className="mt-1 text-xs text-muted-foreground">{t('vertex.customModelHint')}</p>
      </div>

      {customModels.length > 0 && (
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            {t('vertex.customModels')}
          </label>
          <div className="space-y-1">
            {customModels.map((model) => (
              <div
                key={model.id}
                className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-1.5 text-sm"
              >
                <span className="text-foreground">{model.name}</span>
                <button
                  onClick={() => handleRemoveCustomModel(model.id)}
                  className="ml-2 text-muted-foreground transition-colors hover:text-destructive"
                  title={t('vertex.removeModel')}
                  type="button"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
