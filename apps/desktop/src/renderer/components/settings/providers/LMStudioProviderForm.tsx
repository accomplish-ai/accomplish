// apps/desktop/src/renderer/components/settings/providers/LMStudioProviderForm.tsx

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAccomplish } from '@/lib/accomplish';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type { ConnectedProvider, LMStudioCredentials, ToolSupportStatus } from '@accomplish/shared';
import {
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
} from '../shared';

// Import LM Studio logo
import lmstudioLogo from '/assets/ai-logos/lmstudio.png';

interface LMStudioModel {
  id: string;
  name: string;
  toolSupport: ToolSupportStatus;
}

interface LMStudioProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

/**
 * Tool support badge component
 */
function ToolSupportBadge({ status }: { status: ToolSupportStatus }) {
  const config = {
    supported: {
      label: 'Tools',
      className: 'bg-green-500/20 text-green-400 border-green-500/30',
      icon: (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ),
    },
    unsupported: {
      label: 'No Tools',
      className: 'bg-red-500/20 text-red-400 border-red-500/30',
      icon: (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ),
    },
    unknown: {
      label: 'Unknown',
      className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      icon: (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
        </svg>
      ),
    },
  };

  const { label, className, icon } = config[status];

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      {icon}
      {label}
    </span>
  );
}

/**
 * Custom model selector with tool support indicators
 */
function LMStudioModelSelector({
  models,
  value,
  onChange,
  error,
}: {
  models: LMStudioModel[];
  value: string | null;
  onChange: (modelId: string) => void;
  error: boolean;
}) {
  // Sort models: supported first, then unknown, then unsupported
  const sortedModels = [...models].sort((a, b) => {
    const order: Record<ToolSupportStatus, number> = { supported: 0, unknown: 1, unsupported: 2 };
    return order[a.toolSupport] - order[b.toolSupport];
  });

  const selectedModel = models.find(m => `lmstudio/${m.id}` === value);
  const hasUnsupportedSelected = selectedModel?.toolSupport === 'unsupported';
  const hasUnknownSelected = selectedModel?.toolSupport === 'unknown';

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-foreground">Model</label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border px-3 py-2.5 text-sm bg-background ${
          error ? 'border-destructive' : 'border-input'
        }`}
      >
        <option value="">Select a model...</option>
        {sortedModels.map((model) => (
          <option key={model.id} value={`lmstudio/${model.id}`}>
            {model.name} {model.toolSupport === 'supported' ? '✓' : model.toolSupport === 'unsupported' ? '✗' : '?'}
          </option>
        ))}
      </select>

      {/* Warning for unsupported or unknown models */}
      {hasUnsupportedSelected && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <svg className="h-5 w-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="font-medium">This model does not support tool/function calling</p>
            <p className="text-red-400/80 mt-1">Tasks requiring browser automation or file operations will not work correctly.</p>
          </div>
        </div>
      )}

      {hasUnknownSelected && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-400">
          <svg className="h-5 w-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-medium">Tool support could not be verified</p>
            <p className="text-yellow-400/80 mt-1">This model may or may not support tool/function calling. Test it to confirm.</p>
          </div>
        </div>
      )}

      {error && !value && (
        <p className="mt-1 text-sm text-destructive">Please select a model</p>
      )}
    </div>
  );
}

export function LMStudioProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: LMStudioProviderFormProps) {
  const [serverUrl, setServerUrl] = useState('http://localhost:1234');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<LMStudioModel[]>([]);

  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();
      const result = await accomplish.testLMStudioConnection(serverUrl);

      if (!result.success) {
        setError(result.error || 'Connection failed');
        setConnecting(false);
        return;
      }

      const models = (result.models || []) as LMStudioModel[];
      setAvailableModels(models);

      // Check if any models support tools
      const supportedModels = models.filter(m => m.toolSupport === 'supported');
      if (supportedModels.length === 0 && models.length > 0) {
        // All models lack tool support - show warning but still allow connection
        console.warn('[LM Studio] No models with tool support detected');
      }

      const provider: ConnectedProvider = {
        providerId: 'lmstudio',
        connectionStatus: 'connected',
        selectedModelId: null,
        credentials: {
          type: 'lmstudio',
          serverUrl,
        } as LMStudioCredentials,
        lastConnectedAt: new Date().toISOString(),
        availableModels: models.map(m => ({
          id: `lmstudio/${m.id}`,
          name: m.name,
          toolSupport: m.toolSupport,
        })),
      };

      onConnect(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  // Get models from connected provider or local state
  const models: LMStudioModel[] = (connectedProvider?.availableModels || availableModels).map(m => {
    // Handle both formats: with and without 'lmstudio/' prefix
    const id = m.id.replace(/^lmstudio\//, '');
    return {
      id,
      name: m.name,
      toolSupport: (m as { toolSupport?: ToolSupportStatus }).toolSupport || 'unknown',
    };
  });

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="provider-settings-panel">
      <ProviderFormHeader logoSrc={lmstudioLogo} providerName="LM Studio" />

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
                <label className="mb-2 block text-sm font-medium text-foreground">LM Studio Server URL</label>
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="http://localhost:1234"
                  data-testid="lmstudio-server-url"
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Start LM Studio and enable the local server in Developer settings
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
              {/* Display saved server URL */}
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">LM Studio Server URL</label>
                <input
                  type="text"
                  value={(connectedProvider?.credentials as LMStudioCredentials)?.serverUrl || 'http://localhost:1234'}
                  disabled
                  className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                />
              </div>

              <ConnectedControls onDisconnect={onDisconnect} />

              {/* Model Selector with Tool Support */}
              <LMStudioModelSelector
                models={models}
                value={connectedProvider?.selectedModelId || null}
                onChange={onModelChange}
                error={showModelError && !connectedProvider?.selectedModelId}
              />

              {/* Tool support legend */}
              <div className="flex items-center gap-3 pt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <ToolSupportBadge status="supported" />
                  <span>Function calling verified</span>
                </span>
              </div>

              {/* Context length hint */}
              <div className="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-400">
                <svg className="h-5 w-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-medium">Context length requirement</p>
                  <p className="text-blue-400/80 mt-1">Ensure your model is loaded with a large enough context length (max available recommended) in LM Studio settings.</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
