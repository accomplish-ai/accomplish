import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ConnectedProvider, CustomCredentials } from '@accomplish_ai/agent-core';
import { ProviderFormHeader } from '../shared';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { getAccomplish } from '@/lib/accomplish';
import { CustomProviderConnectedSection } from './CustomProviderConnectedSection';
import { CustomProviderInputs } from './CustomProviderInputs';

import customLogo from '/assets/ai-logos/custom.svg';

interface CustomProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void; // Unused - model is set during connection
  showModelError: boolean;
}

export function CustomProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange: _onModelChange,
  showModelError,
}: CustomProviderFormProps) {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const handleConnect = async () => {
    // Validate inputs
    if (!baseUrl.trim()) {
      setError('Base URL is required');
      return;
    }

    // Check for common URL mistakes
    const trimmedUrl = baseUrl.trim();
    if (trimmedUrl.includes('/chat/completions')) {
      setError('Base URL should not include /chat/completions (it is added automatically)');
      return;
    }
    if (trimmedUrl.includes('/completions')) {
      setError('Base URL should end with /v1, not /completions');
      return;
    }

    if (!modelName.trim()) {
      setError('Model name is required');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();
      const trimmedKey = apiKey.trim() || undefined;

      // Test connection to the endpoint
      const result = await accomplish.testCustomConnection(baseUrl.trim(), trimmedKey);
      if (!result.success) {
        setError(result.error || 'Connection failed');
        setConnecting(false);
        return;
      }

      // Save or remove API key based on user input
      if (trimmedKey) {
        await accomplish.addApiKey('custom', trimmedKey);
      } else {
        // Remove any previously stored key when connecting without one
        await accomplish.removeApiKey('custom');
      }

      // Create the model with the custom/ prefix
      const fullModelId = `custom/${modelName.trim()}`;

      const provider: ConnectedProvider = {
        providerId: 'custom',
        connectionStatus: 'connected',
        selectedModelId: fullModelId,
        credentials: {
          type: 'custom',
          baseUrl: baseUrl.trim(),
          modelName: modelName.trim(),
          hasApiKey: !!trimmedKey,
          keyPrefix: trimmedKey ? '••••' + trimmedKey.slice(-4) : undefined,
        } as CustomCredentials,
        lastConnectedAt: new Date().toISOString(),
        availableModels: [{ id: fullModelId, name: modelName.trim() }],
      };

      onConnect(provider);
      setApiKey('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div
      className="rounded-xl border border-border bg-card p-5"
      data-testid="provider-settings-panel"
    >
      <ProviderFormHeader logoSrc={customLogo} providerName="Custom Endpoint" />

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
              <CustomProviderInputs
                baseUrl={baseUrl}
                apiKey={apiKey}
                modelName={modelName}
                connecting={connecting}
                error={error}
                onBaseUrlChange={setBaseUrl}
                onApiKeyChange={setApiKey}
                onModelNameChange={setModelName}
                onConnect={handleConnect}
              />
            </motion.div>
          ) : (
            <CustomProviderConnectedSection
              connectedProvider={connectedProvider!}
              onDisconnect={onDisconnect}
              showModelError={showModelError}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
