import { useState, useEffect, useCallback } from 'react';
import { useAccomplish } from '@/lib/accomplish';
import type {
  CloudBrowserConfig,
  CloudBrowserProvider,
  CloudBrowserProviderConfig,
} from '@accomplish_ai/agent-core/common';
import ProviderForm from './ProviderForm';

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

      {PROVIDERS.map((provider) => {
        const providerConfig = config.providers[provider.id];
        const isActive = config.activeProvider === provider.id;
        const isExpanded = expandedProvider === provider.id;
        const isConfigured = provider.fields
          .filter((f) => f.required)
          .every((f) => {
            const key = f.key as keyof CloudBrowserProviderConfig;
            const val = providerConfig?.[key];
            return typeof val === 'string' && val.trim().length > 0;
          });

        return (
          <div
            key={provider.id}
            className="rounded-lg border border-border bg-card overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{provider.name}</span>
                  {isConfigured && (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      Configured
                    </span>
                  )}
                  {isActive && (
                    <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                      Active
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{provider.description}</p>
              </div>
              <svg
                aria-hidden="true"
                className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isExpanded && (
              <ProviderForm
                provider={provider}
                config={providerConfig}
                isActive={isActive}
                saving={saving}
                onSave={(c) => handleSaveProvider(provider.id, c)}
                onToggleActive={() => handleToggleActive(provider.id)}
                onRemove={() => handleRemoveProvider(provider.id)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
