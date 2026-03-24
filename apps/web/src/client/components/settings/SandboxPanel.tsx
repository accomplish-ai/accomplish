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
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccomplish } from '@/lib/accomplish';
import { createLogger } from '@/lib/logger';

const logger = createLogger('SandboxPanel');
import type { SandboxConfig } from '@accomplish_ai/agent-core';

const DEFAULT_CONFIG: SandboxConfig = {
  mode: 'disabled',
  allowedPaths: [],
  networkRestricted: false,
  allowedHosts: [],
  networkPolicy: {
    allowOutbound: true,
  },
};

/** Regex for validating Docker image references (SaaiAravindhRaja, PR #612) */
const DOCKER_IMAGE_REGEX = /^[\w.-]+(\/[\w.-]+)*(:[\w.-]+)?$/;

export function SandboxPanel() {
  const [config, setConfig] = useState<SandboxConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dockerImageRef = useRef<HTMLInputElement>(null);
  const hostsRef = useRef<HTMLTextAreaElement>(null);
  const pathsRef = useRef<HTMLTextAreaElement>(null);
  const accomplish = useAccomplish();

  useEffect(() => {
    accomplish
      .getSandboxConfig()
      .then((c) => {
        if (c) {
          setConfig(c);
        }
      })
      .catch((err) => {
        logger.error('Failed to load sandbox config:', err);
      });
  }, [accomplish]);

  const saveConfig = useCallback(
    async (newConfig: SandboxConfig) => {
      setSaving(true);
      setSaveError(null);
      let merged: SandboxConfig = DEFAULT_CONFIG;
      setConfig((prev) => {
        merged = { ...prev, ...newConfig };
        return merged;
      });
      try {
        await accomplish.setSandboxConfig(merged);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save sandbox configuration';
        setSaveError(message);
        logger.error('Failed to save sandbox config:', err);
      } finally {
        setSaving(false);
      }
    },
    [accomplish],
  );

  const handleModeChange = useCallback(
    async (mode: SandboxConfig['mode']) => {
      await saveConfig({ ...config, mode });
    },
    [config, saveConfig],
  );

  const handleNetworkToggle = useCallback(async () => {
    const currentPolicy = config.networkPolicy ?? { allowOutbound: !config.networkRestricted };
    const newAllowOutbound = !currentPolicy.allowOutbound;
    await saveConfig({
      ...config,
      networkRestricted: !newAllowOutbound,
      networkPolicy: {
        ...currentPolicy,
        allowOutbound: newAllowOutbound,
      },
    });
  }, [config, saveConfig]);

  const handleAllowedHostsBlur = useCallback(() => {
    const hosts = hostsRef.current?.value ?? '';
    const hostList = hosts
      .split('\n')
      .map((h) => h.trim())
      .filter(Boolean);
    const newHosts = hostList.length > 0 ? hostList : undefined;
    const currentPolicy = config.networkPolicy ?? { allowOutbound: !config.networkRestricted };
    if (JSON.stringify(newHosts) !== JSON.stringify(currentPolicy.allowedHosts)) {
      saveConfig({
        ...config,
        allowedHosts: newHosts ?? [],
        networkPolicy: { ...currentPolicy, allowedHosts: newHosts },
      });
    }
  }, [config, saveConfig]);

  const handleAllowedPathsBlur = useCallback(() => {
    const paths = pathsRef.current?.value ?? '';
    const pathList = paths
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);
    if (JSON.stringify(pathList) !== JSON.stringify(config.allowedPaths)) {
      saveConfig({ ...config, allowedPaths: pathList });
    }
  }, [config, saveConfig]);

  const handleDockerImageBlur = useCallback(() => {
    const value = dockerImageRef.current?.value ?? '';
    const trimmed = value.trim() || undefined;
    if (trimmed && !DOCKER_IMAGE_REGEX.test(trimmed)) {
      setConfigError('Invalid Docker image name. Use format: name[:tag] or org/name[:tag]');
      return;
    }
    setConfigError(null);
    if (trimmed !== config.dockerImage) {
      saveConfig({ ...config, dockerImage: trimmed });
    }
  }, [config, saveConfig]);

  const netPolicy = config.networkPolicy ?? { allowOutbound: !config.networkRestricted };
  const isDockerMode = config.mode === 'docker';

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="font-medium text-foreground">Sandbox Mode</div>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
          Control how the agent executes tasks. Docker mode isolates the agent in a container with
          restricted filesystem and network access.
        </p>

        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="sandbox-mode"
              checked={config.mode === 'disabled'}
              onChange={() => handleModeChange('disabled')}
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
              checked={config.mode === 'native'}
              onChange={() => handleModeChange('native')}
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
              checked={isDockerMode}
              onChange={() => handleModeChange('docker')}
              className="mt-1 h-4 w-4 rounded-full border-border text-primary focus:ring-primary/50"
            />
            <div>
              <span className="text-sm font-medium text-foreground">Docker Sandbox</span>
              <p className="text-sm text-muted-foreground">
                Agent runs inside a Docker container with isolated filesystem and configurable
                network access. Requires Docker to be installed and running.
              </p>
            </div>
          </label>
        </div>
      </div>

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
                disabled={saving}
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
