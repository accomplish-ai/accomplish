import { memo, useState, useEffect } from 'react';
import type { McpConnector, ConnectorStatus } from '@accomplish_ai/agent-core/common';

interface ConnectorCardProps {
  connector: McpConnector;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onToggleEnabled: (id: string) => void;
  onDelete: (id: string) => void;
}

const statusConfig: Record<ConnectorStatus, { label: string; dotClass: string; textClass: string }> = {
  connected: { label: 'Connected', dotClass: 'bg-green-500', textClass: 'text-green-600' },
  disconnected: { label: 'Disconnected', dotClass: 'bg-muted-foreground', textClass: 'text-muted-foreground' },
  connecting: { label: 'Connecting...', dotClass: 'bg-yellow-500 animate-pulse', textClass: 'text-yellow-600' },
  error: { label: 'Error', dotClass: 'bg-destructive', textClass: 'text-destructive' },
};

export const ConnectorCard = memo(function ConnectorCard({
  connector,
  onConnect,
  onDisconnect,
  onToggleEnabled,
  onDelete,
}: ConnectorCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Auto-cancel delete confirmation after 3 seconds, cleanup on unmount
  useEffect(() => {
    if (!confirmDelete) return;
    const timer = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmDelete]);

  const status = statusConfig[connector.status];

  const hostname = (() => {
    try {
      return new URL(connector.url).hostname;
    } catch {
      return connector.url;
    }
  })();

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        {/* Left: Name, URL, Status */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-medium text-foreground">
              {connector.name}
            </h3>
            {/* Status badge */}
            <span className={`flex items-center gap-1 text-[11px] ${status.textClass}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${status.dotClass}`} />
              {status.label}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={connector.url}>
            {hostname}
          </p>
        </div>

        {/* Right: Toggle + Delete */}
        <div className="flex items-center gap-2">
          {/* Enable/Disable toggle */}
          <button
            onClick={() => onToggleEnabled(connector.id)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
              connector.isEnabled ? 'bg-primary' : 'bg-muted'
            }`}
            title={connector.isEnabled ? 'Disable' : 'Enable'}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                connector.isEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
              }`}
            />
          </button>

          {/* Delete button */}
          <button
            onClick={() => {
              if (confirmDelete) {
                onDelete(connector.id);
                setConfirmDelete(false);
              } else {
                setConfirmDelete(true);
              }
            }}
            className={`rounded p-1 transition-colors ${
              confirmDelete
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

      {/* Action button */}
      <div className="mt-3">
        {connector.status === 'connected' ? (
          <button
            onClick={() => onDisconnect(connector.id)}
            className="w-full rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
          >
            Disconnect
          </button>
        ) : connector.status === 'connecting' ? (
          <button
            disabled
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground"
          >
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Connecting...
          </button>
        ) : (
          <button
            onClick={() => onConnect(connector.id)}
            className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Connect
          </button>
        )}
      </div>
    </div>
  );
});
