import type { McpConnector, ConnectorStatus } from '@accomplish_ai/agent-core/common';
import { DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

interface ConnectorsSubmenuProps {
  connectors: McpConnector[];
  onToggle: (id: string, enabled: boolean) => void;
  onManageConnectors: () => void;
}

const statusDot: Record<ConnectorStatus, string> = {
  connected: 'bg-green-500',
  disconnected: 'bg-muted-foreground/50',
  connecting: 'bg-yellow-500 animate-pulse',
  error: 'bg-destructive',
};

export function ConnectorsSubmenu({ connectors, onToggle, onManageConnectors }: ConnectorsSubmenuProps) {
  return (
    <div className="flex flex-col">
      {/* Connectors List */}
      <div className="max-h-[300px] overflow-y-auto">
        {connectors.length === 0 ? (
          <div className="p-3 text-center text-sm text-muted-foreground">
            No connectors yet
          </div>
        ) : (
          connectors.map((connector) => {
            const hostname = (() => {
              try { return new URL(connector.url).hostname; }
              catch { return connector.url; }
            })();

            return (
              <div
                key={connector.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-accent transition-colors"
              >
                {/* Status dot */}
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot[connector.status] || statusDot.disconnected}`} />

                {/* Name + URL */}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-foreground">
                    {connector.name}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {hostname}
                  </div>
                </div>

                {/* Toggle */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={connector.isEnabled}
                  aria-label={`Toggle ${connector.name} connector`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(connector.id, !connector.isEnabled);
                  }}
                  className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200 ${
                    connector.isEnabled ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      connector.isEnabled ? 'translate-x-[14px]' : 'translate-x-[2px]'
                    }`}
                  />
                </button>
              </div>
            );
          })
        )}
      </div>

      <DropdownMenuSeparator />

      {/* Footer */}
      <div className="p-2.5">
        <button
          type="button"
          onClick={onManageConnectors}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Manage
        </button>
      </div>
    </div>
  );
}
