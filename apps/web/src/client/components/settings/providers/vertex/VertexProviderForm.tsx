import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { getAccomplish } from '@/lib/accomplish';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type {
  ConnectedProvider,
  VertexProviderCredentials,
} from '@accomplish_ai/agent-core/common';
import {
  ModelSelector,
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
} from '../../shared';
import { VertexServiceAccountTab } from './VertexServiceAccountTab';
import { VertexAdcTab } from './VertexAdcTab';

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
  const [authTab, setAuthTab] = useState<'serviceAccount' | 'adc'>('serviceAccount');
  const [serviceAccountJson, setServiceAccountJson] = useState('');
  const [projectId, setProjectId] = useState('');
  const [location, setLocation] = useState('global');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string }>>([]);
  const [customModelInput, setCustomModelInput] = useState('');
  const [customModelError, setCustomModelError] = useState<string | null>(null);

  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();

      const credentials =
        authTab === 'serviceAccount'
          ? {
              authType: 'serviceAccount' as const,
              serviceAccountJson,
              projectId: projectId.trim(),
              location,
            }
          : {
              authType: 'adc' as const,
              projectId: projectId.trim(),
              location,
            };

      const validation = await accomplish.validateVertexCredentials(credentials);

      if (!validation.valid) {
        setError(validation.error || t('vertex.invalidCredentials'));
        setConnecting(false);
        return;
      }

      // Save credentials
      await accomplish.saveVertexCredentials(credentials);

      // Fetch available models
      const credentialsJson = JSON.stringify(credentials);
      const modelsResult = await accomplish.fetchVertexModels(credentialsJson);
      const fetchedModels = modelsResult.success ? modelsResult.models : [];
      setAvailableModels(fetchedModels);

      // Try to find a reasonable default model
      const preferredDefault = 'vertex/google/gemini-2.5-pro';
      const hasPreferred = fetchedModels.some((m) => m.id === preferredDefault);

      const provider: ConnectedProvider = {
        providerId: 'vertex',
        connectionStatus: 'connected',
        selectedModelId: hasPreferred ? preferredDefault : null,
        credentials: {
          type: 'vertex',
          authMethod: authTab,
          projectId: projectId.trim(),
          location,
          ...(authTab === 'serviceAccount'
            ? (() => {
                try {
                  const parsed = JSON.parse(serviceAccountJson);
                  return { serviceAccountEmail: parsed.client_email };
                } catch {
                  return {};
                }
              })()
            : {}),
        } as VertexProviderCredentials,
        lastConnectedAt: new Date().toISOString(),
        availableModels: fetchedModels,
      };

      onConnect(provider);
      setServiceAccountJson('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('vertex.connectionFailed'));
    } finally {
      setConnecting(false);
    }
  };

  const handleAddCustomModel = useCallback(() => {
    const input = customModelInput.trim();
    if (!input) {
      return;
    }

    // Expect format: publisher/model-id (e.g. anthropic/claude-sonnet-4-5)
    const parts = input.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      setCustomModelError(t('vertex.formatError'));
      return;
    }

    const [publisher, modelId] = parts;
    const fullId = `vertex/${publisher}/${modelId}`;

    // Check for duplicates
    const currentModels = connectedProvider?.availableModels || availableModels;
    if (currentModels.some((m) => m.id === fullId)) {
      setCustomModelError(t('vertex.modelAlreadyExists'));
      return;
    }

    const newModel = { id: fullId, name: `${modelId} (${publisher})` };
    const updatedModels = [...currentModels, newModel];

    // Persist via onConnect (upserts the ConnectedProvider)
    if (connectedProvider) {
      onConnect({
        ...connectedProvider,
        availableModels: updatedModels,
        selectedModelId: fullId,
      });
    }
    onModelChange(fullId);

    setCustomModelInput('');
    setCustomModelError(null);
  }, [customModelInput, connectedProvider, availableModels, onConnect, onModelChange, t]);

  const handleRemoveCustomModel = useCallback(
    (modelId: string) => {
      const currentModels = connectedProvider?.availableModels || availableModels;

      // Don't allow removing curated models (they have known publishers)
      const curatedPrefixes = ['vertex/google/', 'vertex/anthropic/', 'vertex/mistralai/'];
      if (curatedPrefixes.some((p) => modelId.startsWith(p))) {
        return;
      }

      const updatedModels = currentModels.filter((m) => m.id !== modelId);

      if (connectedProvider) {
        const newSelectedId =
          connectedProvider.selectedModelId === modelId ? null : connectedProvider.selectedModelId;
        onConnect({
          ...connectedProvider,
          availableModels: updatedModels,
          selectedModelId: newSelectedId,
        });
      }
    },
    [connectedProvider, availableModels, onConnect],
  );

  const models = connectedProvider?.availableModels || availableModels;

  // Identify custom (non-curated) models for the remove buttons
  const curatedPrefixes = ['vertex/google/', 'vertex/anthropic/', 'vertex/mistralai/'];
  const customModels = models.filter((m) => !curatedPrefixes.some((p) => m.id.startsWith(p)));

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
              {/* Auth tabs */}
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
            <motion.div
              key="connected"
              variants={settingsVariants.fadeSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.enter}
              className="space-y-3"
            >
              {/* Display saved credentials info */}
              <div className="space-y-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    {t('vertex.authMethod')}
                  </label>
                  <input
                    type="text"
                    value={
                      (connectedProvider?.credentials as VertexProviderCredentials)?.authMethod ===
                      'serviceAccount'
                        ? t('vertex.serviceAccountDisplay')
                        : t('vertex.adcDisplay')
                    }
                    disabled
                    className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                  />
                </div>
                {(connectedProvider?.credentials as VertexProviderCredentials)
                  ?.serviceAccountEmail && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      {t('vertex.serviceAccountLabel')}
                    </label>
                    <input
                      type="text"
                      value={
                        (connectedProvider?.credentials as VertexProviderCredentials)
                          ?.serviceAccountEmail || ''
                      }
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
                    value={
                      (connectedProvider?.credentials as VertexProviderCredentials)?.projectId || ''
                    }
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
                    value={
                      (connectedProvider?.credentials as VertexProviderCredentials)?.location || ''
                    }
                    disabled
                    className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                  />
                </div>
              </div>

              <ConnectedControls onDisconnect={onDisconnect} />

              {/* Model Selector */}
              <ModelSelector
                models={models}
                value={connectedProvider?.selectedModelId || null}
                onChange={onModelChange}
                error={showModelError && !connectedProvider?.selectedModelId}
              />

              {/* Custom model input */}
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
                {customModelError && (
                  <p className="mt-1 text-xs text-destructive">{customModelError}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">{t('vertex.customModelHint')}</p>
              </div>

              {/* Custom models list with remove buttons */}
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
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
