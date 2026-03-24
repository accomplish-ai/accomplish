import { useState, useEffect } from 'react';
import { useAccomplish } from '@/lib/accomplish';
import { Switch } from '@/components/ui/switch';

export function DaemonPanel() {
  const [runInBackground, setRunInBackground] = useState(false);
  const [socketPath, setSocketPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const accomplish = useAccomplish();

  useEffect(() => {
    accomplish
      .getRunInBackground()
      .then(setRunInBackground)
      .catch((err) => console.error('[DaemonPanel] Failed to load runInBackground setting:', err));
    accomplish
      .getDaemonSocketPath()
      .then(setSocketPath)
      .catch((err) => console.error('[DaemonPanel] Failed to load daemon socket path:', err));
  }, [accomplish]);

  const handleToggle = async () => {
    const next = !runInBackground;
    setSaving(true);
    try {
      await accomplish.setRunInBackground(next);
      setRunInBackground(next);
    } catch (err) {
      console.error('[DaemonPanel] Failed to save setting:', err);
      // keep local state unchanged on failure
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 overflow-hidden">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-foreground">Run in Background</div>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              Keep Accomplish running in the system tray when the window is closed. Tasks continue
              running and the app can receive requests from external sources.
            </p>
          </div>
          <Switch
            checked={runInBackground}
            onCheckedChange={handleToggle}
            disabled={saving}
            ariaLabel="Toggle background mode"
          />
        </div>

        {runInBackground && (
          <div className="mt-3 rounded-lg bg-primary/5 p-3">
            <p className="text-sm text-muted-foreground">
              Accomplish will stay active in the system tray when the window is closed. Use the tray
              icon to show the window or quit the app.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="font-medium text-foreground">Daemon Socket</div>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
          External clients (CLI tools, integrations, scheduled jobs) can send tasks to Accomplish
          via the local daemon socket using JSON-RPC 2.0.
        </p>

        {socketPath ? (
          <div className="mt-3">
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Socket Path
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 rounded-md bg-muted px-3 py-2 text-xs font-mono text-foreground break-all overflow-hidden text-ellipsis">
                {socketPath}
              </code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(socketPath).catch(() => {});
                }}
                className="flex-shrink-0 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Copy to clipboard"
              >
                Copy
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground italic">Socket path unavailable.</p>
        )}

        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Example: Send a task via CLI</p>
          <pre className="overflow-x-auto max-w-full rounded-md bg-muted px-3 py-2 text-xs font-mono text-foreground whitespace-pre-wrap break-all">
            {navigator.platform?.startsWith('Win')
              ? `echo {"jsonrpc":"2.0","id":1,"method":"task.start","params":{"prompt":"List files"}} | npx json-rpc-pipe "\\\\.\\pipe\\accomplish-daemon"`
              : `echo '{"jsonrpc":"2.0","id":1,"method":"task.start","params":{"prompt":"List files in /tmp"}}' | nc -U "${socketPath ?? '/path/to/daemon.sock'}"`}
          </pre>
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Example: Schedule a recurring task
          </p>
          <pre className="overflow-x-auto max-w-full rounded-md bg-muted px-3 py-2 text-xs font-mono text-foreground whitespace-pre-wrap break-all">
            {navigator.platform?.startsWith('Win')
              ? `echo {"jsonrpc":"2.0","id":1,"method":"task.schedule","params":{"cron":"0 9 * * 1-5","prompt":"Check email and summarize"}} | npx json-rpc-pipe "\\\\.\\pipe\\accomplish-daemon"`
              : `echo '{"jsonrpc":"2.0","id":1,"method":"task.schedule","params":{"cron":"0 9 * * 1-5","prompt":"Check email and summarize"}}' | nc -U "${socketPath ?? '/path/to/daemon.sock'}"`}
          </pre>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="font-medium text-foreground">Architecture</div>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
          The daemon architecture separates the always-on task execution engine from the UI,
          enabling background processing and external integrations.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-3">
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="text-xs font-semibold text-foreground mb-1">System Tray</div>
            <p className="text-xs text-muted-foreground">
              Runs in the background, accessible from the menu bar even when the window is hidden.
            </p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="text-xs font-semibold text-foreground mb-1">Socket API</div>
            <p className="text-xs text-muted-foreground">
              JSON-RPC 2.0 over a local Unix socket. Allows CLI tools and other apps to dispatch
              tasks.
            </p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="text-xs font-semibold text-foreground mb-1">Task Scheduler</div>
            <p className="text-xs text-muted-foreground">
              Schedule recurring tasks with cron expressions. Tasks fire automatically even when the
              UI is closed.
            </p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="text-xs font-semibold text-foreground mb-1">Always On</div>
            <p className="text-xs text-muted-foreground">
              Tasks continue running when the UI is closed. Results are available when you reopen.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
