import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAccomplish } from '@/lib/accomplish';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type { ConnectedProvider, NimCredentials, ToolSupportStatus } from '@accomplish/agent-core';
import {
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
  ModelSelector,
} from '../shared';

import nimLogo from '/assets/ai-logos/nim.svg';

interface NimModel {
  id: string;
  name: string;
  maxModelLen?: number;
  toolSupport?: ToolSupportStatus;
}

interface NimProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function NimProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: NimProviderFormProps) {
  const [serverUrl, setServerUrl] = useState('https://integrate.api.nvidia.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<NimModel[]>([]);
  const [testingToolSupport, setTestingToolSupport] = useState(false);
  const [selectedModelToolSupport, setSelectedModelToolSupport] = useState<ToolSupportStatus | null>(null);
  const [selectedModelContextLength, setSelectedModelContextLength] = useState<number | null>(null);

  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const handleConnect = async () => {
    if (!serverUrl.trim()) {
      setError('Server URL is required');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();
      // Normalize URL - just remove trailing slashes, keep /v1 as-is
      const normalizedUrl = serverUrl.trim().replace(/\/+$/, '');
      const result = await accomplish.testNimConnection(normalizedUrl, apiKey || undefined);

      if (!result.success) {
        setError(result.error || 'Connection failed');
        setConnecting(false);
        return;
      }

      const models = (result.models || []) as NimModel[];
      setAvailableModels(models);

      // Store the API key if provided
      if (apiKey) {
        await accomplish.addApiKey('nim', apiKey, 'NVIDIA NIM');
      }

      const provider: ConnectedProvider = {
        providerId: 'nim',
        connectionStatus: 'connected',
        selectedModelId: null,
        credentials: {
          type: 'nim',
          serverUrl: normalizedUrl,
          hasApiKey: !!apiKey,
          keyPrefix: apiKey ? apiKey.substring(0, 8) : undefined,
        } as NimCredentials,
        lastConnectedAt: new Date().toISOString(),
        availableModels: models.map(m => ({
          id: `nim/${m.id}`,
          name: m.name,
          maxModelLen: m.maxModelLen,
        })),
      };

      onConnect(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleModelChange = async (modelId: string) => {
    // Reset probe state
    setSelectedModelToolSupport(null);
    setSelectedModelContextLength(null);
    setTestingToolSupport(true);

    // Call parent handler immediately so UI updates
    onModelChange(modelId);

    try {
      const accomplish = getAccomplish();
      const credentials = connectedProvider?.credentials as NimCredentials | undefined;
      const baseUrl = credentials?.serverUrl || serverUrl;

      // Extract model ID without nim/ prefix for API call
      const rawModelId = modelId.replace(/^nim\//, '');

      // API key is retrieved in the main process handler
      // Probe returns both tool support and context length
      const probeResult = await accomplish.testNimModelToolSupport(baseUrl, rawModelId);
      setSelectedModelToolSupport(probeResult.toolSupport);
      setSelectedModelContextLength(probeResult.contextLength ?? null);

      // Update the provider's available models with the discovered context length
      if (probeResult.contextLength && connectedProvider) {
        const updatedModels = connectedProvider.availableModels?.map(m => 
          m.id === modelId ? { ...m, maxModelLen: probeResult.contextLength } : m
        );
        if (updatedModels) {
          await accomplish.setConnectedProvider('nim', {
            ...connectedProvider,
            availableModels: updatedModels,
          });
        }
      }
    } catch (err) {
      console.error('Failed to probe model:', err);
      setSelectedModelToolSupport('unknown');
    } finally {
      setTestingToolSupport(false);
    }
  };

  const models: NimModel[] = (connectedProvider?.availableModels || availableModels).map(m => {
    const id = m.id.replace(/^nim\//, '');
    return {
      id,
      name: m.name,
    };
  });

  const selectorModels = models.map((model) => ({
    id: `nim/${model.id}`,
    name: model.name,
  }));

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="provider-settings-panel">
      <ProviderFormHeader logoSrc={nimLogo} providerName="NVIDIA NIM" />

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
                <label className="mb-2 block text-sm font-medium text-foreground">NIM Endpoint URL</label>
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="https://integrate.api.nvidia.com/v1"
                  data-testid="nim-server-url"
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Enter your NIM endpoint URL (cloud or self-hosted)
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="nvapi-..."
                  data-testid="nim-api-key"
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Required for NVIDIA cloud NIM, optional for self-hosted
                </p>
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
                <label className="mb-2 block text-sm font-medium text-foreground">NIM Endpoint URL</label>
                <input
                  type="text"
                  value={(connectedProvider?.credentials as NimCredentials)?.serverUrl || ''}
                  disabled
                  className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                />
              </div>

              {(connectedProvider?.credentials as NimCredentials)?.hasApiKey && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">API Key</label>
                  <input
                    type="text"
                    value={`${(connectedProvider?.credentials as NimCredentials)?.keyPrefix || ''}...`}
                    disabled
                    className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                  />
                </div>
              )}

              <ConnectedControls onDisconnect={onDisconnect} />

              <ModelSelector
                models={selectorModels}
                value={connectedProvider?.selectedModelId || null}
                onChange={handleModelChange}
                error={showModelError && !connectedProvider?.selectedModelId}
                errorMessage="Please select a model"
                placeholder="Select a model..."
              />

              {testingToolSupport && (
                <div className="flex items-center gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-400">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Testing tool support...</span>
                </div>
              )}

              {!testingToolSupport && selectedModelToolSupport === 'supported' && (
                <div className="flex items-start gap-2 rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
                  <svg className="h-5 w-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <p className="font-medium">Tool support verified</p>
                    <p className="text-green-400/80 mt-1">
                      This model supports function/tool calling.
                      {selectedModelContextLength && (
                        <> Context: {selectedModelContextLength.toLocaleString()} tokens.</>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {!testingToolSupport && selectedModelToolSupport === 'unsupported' && (
                <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                  <svg className="h-5 w-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="font-medium">This model does not support tool/function calling</p>
                    <p className="text-red-400/80 mt-1">Tasks requiring browser automation or file operations will not work correctly.</p>
                  </div>
                </div>
              )}

              {!testingToolSupport && selectedModelToolSupport === 'unknown' && (
                <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-400">
                  <svg className="h-5 w-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="font-medium">Tool support could not be verified</p>
                    <p className="text-yellow-400/80 mt-1">This model may or may not support tool/function calling. Test it to confirm.</p>
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
