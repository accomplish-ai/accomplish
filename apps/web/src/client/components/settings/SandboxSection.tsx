import { useState, useCallback, useEffect } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import type { SandboxConfig } from '@accomplish_ai/agent-core';

interface SandboxSectionProps {
  visible: boolean;
}

export function SandboxSection({ visible }: SandboxSectionProps) {
  const [sandboxEnabled, setSandboxEnabled] = useState(false);
  const [sandboxConfig, setSandboxConfig] = useState<SandboxConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const accomplish = getAccomplish();

  useEffect(() => {
    if (!visible) {
      return;
    }
    accomplish
      .getSandboxConfig()
      .then((config) => {
        setSandboxConfig(config);
        setSandboxEnabled(config.mode === 'native');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [visible, accomplish]);

  const handleToggle = useCallback(async () => {
    const newEnabled = !sandboxEnabled;
    const newMode = newEnabled ? 'native' : 'disabled';

    // Round-trip the full existing config, only mutating the mode, so
    // allowedPaths / allowedHosts / networkRestricted are preserved.
    const updated: SandboxConfig = {
      ...(sandboxConfig ?? { allowedPaths: [], networkRestricted: false, allowedHosts: [] }),
      mode: newMode,
    };
    await accomplish.setSandboxConfig(updated);
    setSandboxConfig(updated);
    setSandboxEnabled(newEnabled);
  }, [sandboxEnabled, sandboxConfig, accomplish]);

  if (loading || !visible) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="font-medium text-foreground flex items-center gap-2">
            Local Sandbox
            <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
              Experimental
            </span>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
            Restrict agent file system and network access using OS-level sandboxing. On macOS, the
            agent runs inside a sandbox profile. On other platforms, environment-variable
            enforcement is used.
          </p>
        </div>
        <div className="ml-4">
          <button
            type="button"
            aria-label="Local sandbox"
            aria-pressed={sandboxEnabled}
            data-testid="settings-sandbox-toggle"
            onClick={handleToggle}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-accomplish ${
              sandboxEnabled ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-accomplish ${
                sandboxEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>
      {sandboxEnabled && (
        <div className="mt-4 rounded-xl bg-warning/10 p-3.5">
          <p className="text-sm text-warning">
            Sandbox mode is active. The agent&apos;s file system access and network connectivity
            will be restricted on the next task. Restart any running task for changes to take
            effect.
          </p>
        </div>
      )}
    </div>
  );
}
