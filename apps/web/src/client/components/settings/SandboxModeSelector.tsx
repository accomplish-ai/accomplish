import type { SandboxConfig } from '@accomplish_ai/agent-core';

interface SandboxModeSelectorProps {
  mode: SandboxConfig['mode'];
  onModeChange: (mode: SandboxConfig['mode']) => void;
  disabled?: boolean;
}

export function SandboxModeSelector({
  mode,
  onModeChange,
  disabled = false,
}: SandboxModeSelectorProps) {
  return (
    <fieldset className="rounded-lg border border-border bg-card p-5">
      <legend className="font-medium text-foreground">Sandbox Mode</legend>
      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
        Control how the agent executes tasks. Docker mode isolates the agent in a container with
        restricted filesystem and network access.
      </p>

      <div className="mt-4 space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="sandbox-mode"
            checked={mode === 'disabled'}
            disabled={disabled}
            onChange={() => onModeChange('disabled')}
            className="mt-1 h-4 w-4 rounded-full border-border text-primary focus:ring-primary/50"
          />
          <div>
            <div className="text-sm font-medium text-foreground">No Sandbox (Default)</div>
            <p className="text-sm text-muted-foreground">
              Agent runs directly on your system with full access. Best for trusted tasks.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="sandbox-mode"
            checked={mode === 'native'}
            disabled={disabled}
            onChange={() => onModeChange('native')}
            className="mt-1 h-4 w-4 rounded-full border-border text-primary focus:ring-primary/50"
          />
          <div>
            <div className="text-sm font-medium text-foreground">Native Sandbox</div>
            <p className="text-sm text-muted-foreground">
              Agent runs directly on your system with OS-level sandboxing restrictions applied.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="sandbox-mode"
            checked={mode === 'docker'}
            disabled={disabled}
            onChange={() => onModeChange('docker')}
            className="mt-1 h-4 w-4 rounded-full border-border text-primary focus:ring-primary/50"
          />
          <div>
            <span className="text-sm font-medium text-foreground">Docker Sandbox</span>
            <p className="text-sm text-muted-foreground">
              Agent runs inside a Docker container with isolated filesystem and configurable network
              access. Requires Docker to be installed and running.
            </p>
          </div>
        </label>
      </div>
    </fieldset>
  );
}
