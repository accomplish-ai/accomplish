import type {
  CloudBrowserProvider,
  CloudBrowserProviderConfig,
} from '@accomplish_ai/agent-core/common';
import ProviderForm from './ProviderForm';

interface CloudBrowserProviderDef {
  id: CloudBrowserProvider;
  name: string;
  description: string;
  fields: { key: string; label: string; placeholder: string; required: boolean }[];
}

interface CloudBrowserProviderRowProps {
  provider: CloudBrowserProviderDef;
  providerConfig: CloudBrowserProviderConfig | undefined;
  isActive: boolean;
  isExpanded: boolean;
  saving: boolean;
  onToggleExpand: () => void;
  onSave: (config: CloudBrowserProviderConfig) => void;
  onToggleActive: () => void;
  onRemove: () => void;
}

export function CloudBrowserProviderRow({
  provider,
  providerConfig,
  isActive,
  isExpanded,
  saving,
  onToggleExpand,
  onSave,
  onToggleActive,
  onRemove,
}: CloudBrowserProviderRowProps) {
  const isConfigured = provider.fields
    .filter((f) => f.required)
    .every((f) => {
      const key = f.key as keyof CloudBrowserProviderConfig;
      const val = providerConfig?.[key];
      return typeof val === 'string' && val.trim().length > 0;
    });

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={onToggleExpand}
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
          onSave={onSave}
          onToggleActive={onToggleActive}
          onRemove={onRemove}
        />
      )}
    </div>
  );
}
