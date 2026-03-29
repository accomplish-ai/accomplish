import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type { ConnectedProvider } from '@accomplish_ai/agent-core/common';
import { ConnectButton, ProviderFormHeader, FormError } from '../../shared';
import { VertexServiceAccountTab } from './VertexServiceAccountTab';
import { VertexAdcTab } from './VertexAdcTab';
import { VertexConnectedSection } from './VertexConnectedSection';
import { useVertexProviderConnect } from './useVertexProviderConnect';
import { isCuratedVertexModel } from './vertex-model-utils';
import { PROVIDER_LOGOS } from '@/lib/provider-logos';

interface VertexProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function VertexProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: VertexProviderFormProps) {
  const { t } = useTranslation('settings');
  const {
    authTab,
    setAuthTab,
    serviceAccountJson,
    setServiceAccountJson,
    projectId,
    setProjectId,
    location,
    setLocation,
    connecting,
    error,
    availableModels,
    customModelInput,
    setCustomModelInput,
    customModelError,
    setCustomModelError,
    handleConnect,
    handleAddCustomModel,
    handleRemoveCustomModel,
  } = useVertexProviderConnect({ connectedProvider, onConnect, onModelChange });

  const isConnected = connectedProvider?.connectionStatus === 'connected';
  const models = connectedProvider?.availableModels || availableModels;
  const customModels = models.filter((model) => !isCuratedVertexModel(model.id));

  return (
    <div
      className="rounded-xl border border-border bg-card p-5"
      data-testid="provider-settings-panel"
    >
      <ProviderFormHeader logoSrc={PROVIDER_LOGOS['vertex']} providerName="Vertex AI" />

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
              <div className="flex gap-2">
                <button
                  onClick={() => setAuthTab('serviceAccount')}
                  data-testid="vertex-auth-tab-sa"
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    authTab === 'serviceAccount'
                      ? 'bg-provider-accent text-white'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('vertex.serviceAccountTab')}
                </button>
                <button
                  onClick={() => setAuthTab('adc')}
                  data-testid="vertex-auth-tab-adc"
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    authTab === 'adc'
                      ? 'bg-provider-accent text-white'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('vertex.adcTab')}
                </button>
              </div>

              {authTab === 'serviceAccount' ? (
                <VertexServiceAccountTab
                  serviceAccountJson={serviceAccountJson}
                  projectId={projectId}
                  location={location}
                  onJsonChange={setServiceAccountJson}
                  onProjectIdChange={setProjectId}
                  onLocationChange={setLocation}
                />
              ) : (
                <VertexAdcTab
                  projectId={projectId}
                  location={location}
                  onProjectIdChange={setProjectId}
                  onLocationChange={setLocation}
                />
              )}

              <FormError error={error} />
              <ConnectButton onClick={handleConnect} connecting={connecting} />
            </motion.div>
          ) : (
            <VertexConnectedSection
              connectedProvider={connectedProvider!}
              onDisconnect={onDisconnect}
              onModelChange={onModelChange}
              showModelError={showModelError}
              models={models}
              customModels={customModels}
              customModelInput={customModelInput}
              setCustomModelInput={setCustomModelInput}
              customModelError={customModelError}
              setCustomModelError={setCustomModelError}
              handleAddCustomModel={handleAddCustomModel}
              handleRemoveCustomModel={handleRemoveCustomModel}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
