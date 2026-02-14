import { memo, useState, useEffect, useCallback } from 'react';
import type { CloudBrowserProvider, CloudBrowserStatus } from '@/types/cloud-browser-types';
import { Input } from '@/components/ui/input';

interface CloudBrowserCardProps {
    provider: CloudBrowserProvider;
    onUpdate: (id: string, updates: Partial<CloudBrowserProvider>) => void;
    onDelete: (id: string) => void;
    onToggleEnabled: (id: string) => void;
    onTestConnection: (id: string) => Promise<{ success: boolean; error?: string }>;
}

const statusConfig: Record<CloudBrowserStatus, { label: string; dotClass: string; textClass: string }> = {
    connected: { label: 'Connected', dotClass: 'bg-green-500', textClass: 'text-green-600' },
    disconnected: { label: 'Not tested', dotClass: 'bg-muted-foreground', textClass: 'text-muted-foreground' },
    connecting: { label: 'Testing...', dotClass: 'bg-yellow-500 animate-pulse', textClass: 'text-yellow-600' },
    error: { label: 'Error', dotClass: 'bg-destructive', textClass: 'text-destructive' },
};

export const CloudBrowserCard = memo(function CloudBrowserCard({
    provider,
    onUpdate,
    onDelete,
    onToggleEnabled,
    onTestConnection,
}: CloudBrowserCardProps) {
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [apiKey, setApiKey] = useState(provider.apiKey);
    const [projectId, setProjectId] = useState(provider.projectId);
    const [testing, setTesting] = useState(false);
    const [expanded, setExpanded] = useState(!provider.apiKey);

    // Auto-cancel delete confirmation after 3 seconds
    useEffect(() => {
        if (!confirmDelete) return;
        const timer = setTimeout(() => setConfirmDelete(false), 3000);
        return () => clearTimeout(timer);
    }, [confirmDelete]);

    const handleSave = useCallback(() => {
        onUpdate(provider.id, {
            apiKey: apiKey.trim(),
            projectId: projectId.trim(),
            status: 'disconnected',
        });
    }, [provider.id, apiKey, projectId, onUpdate]);

    const handleTest = useCallback(async () => {
        // Save first
        onUpdate(provider.id, {
            apiKey: apiKey.trim(),
            projectId: projectId.trim(),
        });
        setTesting(true);
        try {
            await onTestConnection(provider.id);
        } finally {
            setTesting(false);
        }
    }, [provider.id, apiKey, projectId, onUpdate, onTestConnection]);

    const status = statusConfig[provider.status];
    const hasCredentials = apiKey.trim() && projectId.trim();

    return (
        <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
                {/* Left: Name + Status */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        {/* Browserbase icon */}
                        <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10">
                            <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                                <path d="M8 21h8M12 17v4" />
                            </svg>
                        </div>
                        <h3 className="truncate text-sm font-medium text-foreground">
                            {provider.name}
                        </h3>
                        {/* Status badge */}
                        <span className={`flex items-center gap-1 text-[11px] ${status.textClass}`}>
                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${status.dotClass}`} />
                            {status.label}
                        </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Cloud browser infrastructure for AI agents
                    </p>
                </div>

                {/* Right: Toggle + Expand + Delete */}
                <div className="flex items-center gap-2">
                    {/* Enable/Disable toggle */}
                    <button
                        onClick={() => onToggleEnabled(provider.id)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${provider.isEnabled ? 'bg-primary' : 'bg-muted'
                            }`}
                        title={provider.isEnabled ? 'Disable' : 'Enable'}
                    >
                        <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${provider.isEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                                }`}
                        />
                    </button>

                    {/* Expand/Collapse */}
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title={expanded ? 'Collapse' : 'Configure'}
                    >
                        <svg
                            className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </button>

                    {/* Delete button */}
                    <button
                        onClick={() => {
                            if (confirmDelete) {
                                onDelete(provider.id);
                                setConfirmDelete(false);
                            } else {
                                setConfirmDelete(true);
                            }
                        }}
                        className={`rounded p-1 transition-colors ${confirmDelete
                                ? 'text-destructive hover:bg-destructive/10'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                            }`}
                        title={confirmDelete ? 'Click again to confirm' : 'Delete'}
                    >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Expandable config section */}
            {expanded && (
                <div className="mt-4 space-y-3 border-t border-border pt-4">
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-foreground">API Key</label>
                        <Input
                            type="password"
                            placeholder="bb_live_..."
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="text-sm"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-foreground">Project ID</label>
                        <Input
                            type="text"
                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                            value={projectId}
                            onChange={(e) => setProjectId(e.target.value)}
                            className="text-sm"
                        />
                    </div>

                    {/* Error message */}
                    {provider.lastError && (
                        <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            {provider.lastError}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                        <button
                            onClick={handleSave}
                            disabled={!hasCredentials}
                            className="rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/80 disabled:opacity-50"
                        >
                            Save
                        </button>
                        <button
                            onClick={handleTest}
                            disabled={!hasCredentials || testing}
                            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        >
                            {testing ? (
                                <>
                                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    Testing...
                                </>
                            ) : (
                                'Test Connection'
                            )}
                        </button>
                    </div>

                    {/* Help link */}
                    <p className="text-[11px] text-muted-foreground">
                        Get your API key and Project ID from{' '}
                        <a
                            href="https://www.browserbase.com/settings"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline hover:text-primary/80"
                            onClick={(e) => {
                                e.preventDefault();
                                window.accomplish?.openExternal?.('https://www.browserbase.com/settings');
                            }}
                        >
                            browserbase.com/settings
                        </a>
                    </p>
                </div>
            )}
        </div>
    );
});
