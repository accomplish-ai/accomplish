import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccomplish } from '@/lib/accomplish';
import type { ConnectedProvider, VertexProviderCredentials } from '@accomplish_ai/agent-core';
import { isCuratedVertexModel } from './vertex-model-utils';
import type {
  UseVertexProviderConnectParams,
  UseVertexProviderConnectReturn,
} from './useVertexProviderConnect.types';

export function useVertexProviderConnect({
  connectedProvider,
  onConnect,
  onModelChange,
}: UseVertexProviderConnectParams): UseVertexProviderConnectReturn {
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

      await accomplish.saveVertexCredentials(credentials);
      const credentialsJson = JSON.stringify(credentials);
      const modelsResult = await accomplish.fetchVertexModels(credentialsJson);
      const fetchedModels = modelsResult.success ? modelsResult.models : [];
      setAvailableModels(fetchedModels);
      const preferredDefault = 'vertex/google/gemini-2.5-pro';
      const hasPreferred = fetchedModels.some((m) => m.id === preferredDefault);
      let serviceAccountEmail: string | undefined;
      if (authTab === 'serviceAccount') {
        try {
          const parsed = JSON.parse(serviceAccountJson);
          serviceAccountEmail = parsed.client_email;
        } catch {
          serviceAccountEmail = undefined;
        }
      }

      const provider: ConnectedProvider = {
        providerId: 'vertex',
        connectionStatus: 'connected',
        selectedModelId: hasPreferred ? preferredDefault : null,
        credentials: {
          type: 'vertex',
          authMethod: authTab,
          projectId: projectId.trim(),
          location,
          ...(serviceAccountEmail ? { serviceAccountEmail } : {}),
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

    const parts = input.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      setCustomModelError(t('vertex.formatError'));
      return;
    }
    const [publisher, modelId] = parts;
    const fullId = `vertex/${publisher}/${modelId}`;
    const currentModels = connectedProvider?.availableModels || availableModels;
    if (currentModels.some((m) => m.id === fullId)) {
      setCustomModelError(t('vertex.modelAlreadyExists'));
      return;
    }

    const newModel = { id: fullId, name: `${modelId} (${publisher})` };
    const updatedModels = [...currentModels, newModel];
    setAvailableModels(updatedModels);
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

      if (isCuratedVertexModel(modelId)) {
        return;
      }

      const updatedModels = currentModels.filter((m) => m.id !== modelId);
      setAvailableModels(updatedModels);

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

  return {
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
  };
}
