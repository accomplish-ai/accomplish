/**
 * SandboxPanel — Docker sandbox configuration UI.
 *
 * Contributed by SaaiAravindhRaja (PR #612):
 *   - Docker image selection with format validation
 *   - Network access toggle + allowed-hosts textarea
 *   - Filesystem path mounting textarea
 *   - Save error / config error display
 *   - Status indicator pill
 */
import { useSandboxPanel } from './useSandboxPanel';
import { SandboxModeSelector } from './SandboxModeSelector';

export function SandboxPanel() {
  const {
    config,
    isLoaded,
    saving,
    configError,
    loadError,
    saveError,
    dockerImageRef,
    hostsRef,
    pathsRef,
    handleModeChange,
    handleNetworkToggle,
    handleAllowedHostsBlur,
    handleAllowedPathsBlur,
    handleDockerImageBlur,
  } = useSandboxPanel();

  const netPolicy = config.networkPolicy ?? { allowOutbound: !config.networkRestricted };
  const isDockerMode = config.mode === 'docker';
  const isInteractionDisabled = !isLoaded || !!loadError || saving;

  return (
    <div className="space-y-4">
      <SandboxModeSelector
        mode={config.mode}
        onModeChange={handleModeChange}
        disabled={isInteractionDisabled}
      />

      {loadError && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-3" role="alert">
          <p className="text-sm text-destructive">{loadError}</p>
        </div>
      )}

      {isDockerMode && (
        <>
          {/* Docker image */}
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="font-medium text-foreground">Docker Image</div>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              Custom Docker image to use for the sandbox. Leave empty to use the default image.
            </p>
            <input
              ref={dockerImageRef}
              type="text"
              placeholder="node:20-slim (default)"
              defaultValue={config.dockerImage ?? ''}
              onBlur={handleDockerImageBlur}
              disabled={isInteractionDisabled}
              className={`mt-3 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                configError ? 'border-destructive' : 'border-border'
              }`}
            />
            {configError && <p className="mt-1.5 text-sm text-destructive">{configError}</p>}
          </div>

          {/* Network access */}
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-foreground">Network Access</div>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  Control whether the sandboxed agent can make outbound network requests.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={netPolicy.allowOutbound}
                aria-label="Toggle network access"
                onClick={handleNetworkToggle}
                disabled={isInteractionDisabled}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 disabled:cursor-not-allowed ${
                  netPolicy.allowOutbound ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    netPolicy.allowOutbound ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {netPolicy.allowOutbound && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-foreground mb-1">
                  Allowed Hosts (optional)
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Restrict outbound access to specific hosts. One per line. Leave empty to allow
                  all.
                </p>
                <textarea
                  ref={hostsRef}
                  placeholder={'api.openai.com\napi.anthropic.com\ngithub.com'}
                  defaultValue={netPolicy.allowedHosts?.join('\n') ?? ''}
                  onBlur={handleAllowedHostsBlur}
                  disabled={isInteractionDisabled}
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 font-mono"
                />
              </div>
            )}

            {!netPolicy.allowOutbound && (
              <div className="mt-3 rounded-lg bg-warning/10 p-3" role="alert">
                <p className="text-sm text-warning">
                  Network access is disabled. The agent will not be able to reach external APIs,
                  which may prevent it from completing tasks that require network access.
                </p>
              </div>
            )}
          </div>

          {/* Filesystem access */}
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="font-medium text-foreground">Filesystem Access</div>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              Specify which host directories the sandboxed agent can access. These paths will be
              mounted as volumes in the Docker container.
            </p>
            <textarea
              ref={pathsRef}
              placeholder={'/Users/you/projects\n/tmp/accomplish-workspace'}
              defaultValue={config.allowedPaths?.join('\n') ?? ''}
              onBlur={handleAllowedPathsBlur}
              disabled={isInteractionDisabled}
              rows={3}
              className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 font-mono"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              One path per line. The agent&apos;s working directory is always mounted.
            </p>
          </div>
        </>
      )}

      {saveError && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-3" role="alert">
          <p className="text-sm text-destructive">{saveError}</p>
        </div>
      )}

      {/* Status indicator (SaaiAravindhRaja, PR #612) */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${
              config.mode !== 'disabled' ? 'bg-green-500' : 'bg-muted-foreground'
            }`}
          />
          <span className="text-muted-foreground">
            {config.mode === 'disabled'
              ? 'Sandbox is disabled — agent runs with full system access'
              : config.mode === 'native'
                ? 'Native OS sandbox enabled — agent runs with restricted access'
                : 'Docker sandbox enabled — agent runs in an isolated container'}
          </span>
        </div>
      </div>
    </div>
  );
}
