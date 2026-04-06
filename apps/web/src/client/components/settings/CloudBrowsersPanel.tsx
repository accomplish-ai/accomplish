import { useState, useEffect, useCallback } from 'react';
import { useAccomplish } from '@/lib/accomplish';
import type {
  CloudBrowserConfig,
  CloudBrowserProvider,
  CloudBrowserProviderConfig,
} from '@accomplish_ai/agent-core/common';
import { CloudBrowserProviderRow } from './CloudBrowserProviderRow';

const PROVIDERS: {
  id: CloudBrowserProvider;
  name: string;
  description: string;
  fields: { key: string; label: string; placeholder: string; required: boolean }[];
}[] = [
  {
    id: 'browserbase',
    name: 'Browserbase',
    description: 'Cloud browser infrastructure with CDP support',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'bb_live_...', required: true },
      { key: 'projectId', label: 'Project ID', placeholder: 'Your project ID', required: true },
    ],
  },
  {
    id: 'steel',
    name: 'Steel',
    description: 'Managed browser sessions for AI agents',
    fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'steel_...', required: true }],
  },
  {
    id: 'aws-agentcore',
    name: 'AWS AgentCore',
    description: 'Amazon Bedrock browser tool integration',
    fields: [
      { key: 'endpoint', label: 'Endpoint URL', placeholder: 'https://...', required: true },
      { key: 'apiKey', label: 'API Key', placeholder: 'Your API key', required: false },
    ],
  },
];

const DEFAULT_CONFIG: CloudBrowserConfig = {
  activeProvider: null,
  providers: {},
};

export function CloudBrowsersPanel() {
  const [config, setConfig] = useState<CloudBrowserConfig>(DEFAULT_CONFIG);
  const [expandedProvider, setExpandedProvider] = useState<CloudBrowserProvider | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const accomplish = useAccomplish();

  useEffect(() => {
    accomplish
      .getCloudBrowserConfig()
      .then((c) => {
        if (c) {
          setConfig(c);
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to load configuration';
        setSaveError(message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- accomplish is a stable singleton
  }, []);

  const saveConfig = useCallback(
    async (newConfig: CloudBrowserConfig) => {
      setSaving(true);
      setSaveError(null);
      try {
        await accomplish.setCloudBrowserConfig(newConfig);
        setConfig(newConfig);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save configuration';
        setSaveError(message);
      } finally {
        setSaving(false);
      }
    },
    [accomplish],
  );

  const handleToggleActive = useCallback(
    async (providerId: CloudBrowserProvider) => {
      const newConfig = { ...config };
      if (newConfig.activeProvider === providerId) {
        newConfig.activeProvider = null;
      } else {
        newConfig.activeProvider = providerId;
      }
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const handleSaveProvider = useCallback(
    async (providerId: CloudBrowserProvider, providerConfig: CloudBrowserProviderConfig) => {
      const newConfig = {
        ...config,
        providers: {
          ...config.providers,
          [providerId]: providerConfig,
        },
      };
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const handleRemoveProvider = useCallback(
    async (providerId: CloudBrowserProvider) => {
      const newConfig = {
        ...config,
        providers: { ...config.providers },
      };
      delete newConfig.providers[providerId];
      if (newConfig.activeProvider === providerId) {
        newConfig.activeProvider = null;
      }
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const activeProviderLabel =
    config.activeProvider === null
      ? 'Using local browser (default)'
      : `Using ${PROVIDERS.find((p) => p.id === config.activeProvider)?.name ?? config.activeProvider}`;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="font-medium text-foreground">Browser Mode</div>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
          Choose between the built-in local browser or a cloud browser provider for agent tasks.
        </p>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span
            className={
              config.activeProvider === null
                ? 'font-medium text-foreground'
                : 'text-muted-foreground'
            }
          >
            {activeProviderLabel}
          </span>
        </div>
      </div>

      {saveError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-start justify-between"
        >
          <span>{saveError}</span>
          <button
            type="button"
            onClick={() => setSaveError(null)}
            className="ml-2 shrink-0 hover:opacity-70"
            aria-label="Dismiss error"
          >
            &times;
          </button>
        </div>
      )}

      {PROVIDERS.map((provider) => (
        <CloudBrowserProviderRow
          key={provider.id}
          provider={provider}
          providerConfig={config.providers[provider.id]}
          isActive={config.activeProvider === provider.id}
          isExpanded={expandedProvider === provider.id}
          saving={saving}
          onToggleExpand={() =>
            setExpandedProvider(expandedProvider === provider.id ? null : provider.id)
          }
          onSave={(c) => handleSaveProvider(provider.id, c)}
          onToggleActive={() => handleToggleActive(provider.id)}
          onRemove={() => handleRemoveProvider(provider.id)}
        />
      ))}
    </div>
  );
}
