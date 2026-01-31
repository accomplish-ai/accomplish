// apps/desktop/src/renderer/components/settings/providers/GoogleVertexAIProviderForm.tsx

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAccomplish } from '@/lib/accomplish';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type { ConnectedProvider, GoogleVertexAICredentials } from '@accomplish/shared';
import { PROVIDER_META, DEFAULT_PROVIDERS, getDefaultModelForProvider } from '@accomplish/shared';
import {
  ModelSelector,
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
} from '../shared';

import vertexLogo from '/assets/ai-logos/vertex.svg';

// Vertex AI supported regions (grouped by geography)
const VERTEX_REGIONS = [
  // Global
  { value: 'global', label: 'Global (Worldwide)' },
  // United States
  { value: 'us-central1', label: 'US - Iowa (us-central1)' },
  { value: 'us-east1', label: 'US - South Carolina (us-east1)' },
  { value: 'us-east4', label: 'US - Virginia (us-east4)' },
  { value: 'us-east5', label: 'US - Ohio (us-east5)' },
  { value: 'us-south1', label: 'US - Texas (us-south1)' },
  { value: 'us-west1', label: 'US - Oregon (us-west1)' },
  { value: 'us-west4', label: 'US - Nevada (us-west4)' },
  // Canada
  { value: 'northamerica-northeast1', label: 'Canada - Montréal (northamerica-northeast1)' },
  // South America
  { value: 'southamerica-east1', label: 'Brazil - São Paulo (southamerica-east1)' },
  // Europe
  { value: 'europe-west1', label: 'Europe - Belgium (europe-west1)' },
  { value: 'europe-west2', label: 'Europe - London (europe-west2)' },
  { value: 'europe-west3', label: 'Europe - Frankfurt (europe-west3)' },
  { value: 'europe-west4', label: 'Europe - Netherlands (europe-west4)' },
  { value: 'europe-west6', label: 'Europe - Zürich (europe-west6)' },
  { value: 'europe-west8', label: 'Europe - Milan (europe-west8)' },
  { value: 'europe-west9', label: 'Europe - Paris (europe-west9)' },
  { value: 'europe-southwest1', label: 'Europe - Madrid (europe-southwest1)' },
  { value: 'europe-north1', label: 'Europe - Finland (europe-north1)' },
  { value: 'europe-central2', label: 'Europe - Warsaw (europe-central2)' },
  // Asia Pacific
  { value: 'asia-east1', label: 'Asia - Taiwan (asia-east1)' },
  { value: 'asia-east2', label: 'Asia - Hong Kong (asia-east2)' },
  { value: 'asia-northeast1', label: 'Asia - Tokyo (asia-northeast1)' },
  { value: 'asia-northeast3', label: 'Asia - Seoul (asia-northeast3)' },
  { value: 'asia-south1', label: 'Asia - Mumbai (asia-south1)' },
  { value: 'asia-southeast1', label: 'Asia - Singapore (asia-southeast1)' },
  { value: 'australia-southeast1', label: 'Australia - Sydney (australia-southeast1)' },
  // Middle East
  { value: 'me-central1', label: 'Middle East - Qatar (me-central1)' },
  { value: 'me-central2', label: 'Middle East - Saudi Arabia (me-central2)' },
  { value: 'me-west1', label: 'Middle East - Israel (me-west1)' },
];

interface GoogleVertexAIProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function GoogleVertexAIProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: GoogleVertexAIProviderFormProps) {
  const [apiKey, setApiKey] = useState('');
  const [projectId, setProjectId] = useState('');
  const [region, setRegion] = useState('us-central1');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = PROVIDER_META['google-vertex-ai'];
  const providerConfig = DEFAULT_PROVIDERS.find(p => p.id === 'google-vertex-ai');
  const models = providerConfig?.models.map(m => ({ id: m.fullId, name: m.displayName })) || [];
  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const handleConnect = async () => {
    if (!apiKey.trim()) {
      setError('Please enter an API key');
      return;
    }

    if (!projectId.trim()) {
      setError('Please enter a Google Cloud Project ID');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();
      const validation = await accomplish.validateApiKeyForProvider(
        'google-vertex-ai',
        apiKey.trim(),
        { projectId: projectId.trim(), region }
      );

      if (!validation.valid) {
        setError(validation.error || 'Invalid API key or project configuration');
        setConnecting(false);
        return;
      }

      await accomplish.addApiKey('google-vertex-ai', apiKey.trim());

      const defaultModel = getDefaultModelForProvider('google-vertex-ai');
      const trimmedKey = apiKey.trim();

      const provider: ConnectedProvider = {
        providerId: 'google-vertex-ai',
        connectionStatus: 'connected',
        selectedModelId: defaultModel,
        credentials: {
          type: 'google-vertex-ai',
          keyPrefix: trimmedKey.length > 40
            ? trimmedKey.substring(0, 40) + '...'
            : trimmedKey.substring(0, Math.min(trimmedKey.length, 20)) + '...',
          projectId: projectId.trim(),
          region,
        } as GoogleVertexAICredentials,
        lastConnectedAt: new Date().toISOString(),
      };

      onConnect(provider);
      setApiKey('');
      setProjectId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const storedCredentials = connectedProvider?.credentials as GoogleVertexAICredentials | undefined;

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="provider-settings-panel">
      <ProviderFormHeader logoSrc={vertexLogo} providerName={meta.name} />

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
              {/* Project ID */}
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Google Cloud Project ID
                </label>
                <input
                  type="text"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder="my-gcp-project"
                  disabled={connecting}
                  data-testid="project-id-input"
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm disabled:opacity-50"
                />
              </div>

              {/* Region Selector */}
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Region</label>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  disabled={connecting}
                  data-testid="region-select"
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm disabled:opacity-50"
                >
                  {VERTEX_REGIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* API Key Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-foreground">API Key</label>
                  {meta.helpUrl && (
                    <a
                      href={meta.helpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground hover:text-primary underline"
                    >
                      How can I find it?
                    </a>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter API Key"
                    disabled={connecting}
                    data-testid="api-key-input"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm disabled:opacity-50"
                  />
                  <button
                    onClick={() => setApiKey('')}
                    className="rounded-md border border-border p-2.5 text-muted-foreground hover:text-foreground transition-colors"
                    type="button"
                    disabled={!apiKey}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              <FormError error={error} />
              <ConnectButton
                onClick={handleConnect}
                connecting={connecting}
                disabled={!apiKey.trim() || !projectId.trim()}
              />
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
              {/* Display stored project ID */}
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Google Cloud Project ID
                </label>
                <input
                  type="text"
                  value={storedCredentials?.projectId || ''}
                  disabled
                  className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                />
              </div>

              {/* Display stored region */}
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Region</label>
                <input
                  type="text"
                  value={
                    VERTEX_REGIONS.find(r => r.value === storedCredentials?.region)?.label ||
                    storedCredentials?.region ||
                    ''
                  }
                  disabled
                  className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                />
              </div>

              {/* Display stored API key */}
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">API Key</label>
                <input
                  type="text"
                  value={storedCredentials?.keyPrefix || 'API key saved'}
                  disabled
                  data-testid="api-key-display"
                  className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                />
              </div>

              <ConnectedControls onDisconnect={onDisconnect} />

              <ModelSelector
                models={models}
                value={connectedProvider?.selectedModelId || null}
                onChange={onModelChange}
                error={showModelError && !connectedProvider?.selectedModelId}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
