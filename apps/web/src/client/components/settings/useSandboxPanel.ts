import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccomplish } from '@/lib/accomplish';
import { createLogger } from '@/lib/logger';
import type { SandboxConfig } from '@accomplish_ai/agent-core';

const logger = createLogger('SandboxPanel');
const DEFAULT_NETWORK_POLICY = { allowOutbound: true };

export const DEFAULT_CONFIG: SandboxConfig = {
  mode: 'disabled',
  allowedPaths: [],
  networkRestricted: false,
  allowedHosts: [],
  networkPolicy: DEFAULT_NETWORK_POLICY,
};

/** Regex for validating Docker image references (SaaiAravindhRaja, PR #612) */
export const DOCKER_IMAGE_REGEX = /^[\w.-]+(\/[\w.-]+)*(:[\w.-]+)?$/;

export interface UseSandboxPanelResult {
  config: SandboxConfig;
  isLoaded: boolean;
  saving: boolean;
  configError: string | null;
  loadError: string | null;
  saveError: string | null;
  dockerImageRef: React.RefObject<HTMLInputElement | null>;
  hostsRef: React.RefObject<HTMLTextAreaElement | null>;
  pathsRef: React.RefObject<HTMLTextAreaElement | null>;
  handleModeChange: (mode: SandboxConfig['mode']) => Promise<void>;
  handleNetworkToggle: () => Promise<void>;
  handleAllowedHostsBlur: () => void;
  handleAllowedPathsBlur: () => void;
  handleDockerImageBlur: () => void;
}

export function useSandboxPanel(): UseSandboxPanelResult {
  const [config, setConfig] = useState<SandboxConfig>(DEFAULT_CONFIG);
  const [isLoaded, setIsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dockerImageRef = useRef<HTMLInputElement>(null);
  const hostsRef = useRef<HTMLTextAreaElement>(null);
  const pathsRef = useRef<HTMLTextAreaElement>(null);
  const configRef = useRef<SandboxConfig>(DEFAULT_CONFIG);
  const accomplish = useAccomplish();

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    accomplish
      .getSandboxConfig()
      .then((c) => {
        const mergedConfig: SandboxConfig = {
          ...DEFAULT_CONFIG,
          ...(c ?? {}),
          networkPolicy: {
            allowOutbound: c?.networkPolicy?.allowOutbound ?? DEFAULT_NETWORK_POLICY.allowOutbound,
            ...(c?.networkPolicy ?? {}),
          },
        };
        setConfig(mergedConfig);
        setLoadError(null);
        setIsLoaded(true);
      })
      .catch((err) => {
        setLoadError('Failed to load sandbox configuration');
        logger.error('Failed to load sandbox config:', err);
      });
  }, [accomplish]);

  const saveConfig = useCallback(
    async (patch: Partial<SandboxConfig>) => {
      if (!isLoaded || loadError) {
        return;
      }
      setSaving(true);
      setSaveError(null);
      const merged: SandboxConfig = {
        ...DEFAULT_CONFIG,
        ...configRef.current,
        ...patch,
        networkPolicy: {
          allowOutbound:
            patch.networkPolicy?.allowOutbound ??
            configRef.current.networkPolicy?.allowOutbound ??
            DEFAULT_NETWORK_POLICY.allowOutbound,
          ...(configRef.current.networkPolicy ?? {}),
          ...(patch.networkPolicy ?? {}),
        },
      };
      configRef.current = merged;
      setConfig(merged);
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
    [accomplish, isLoaded, loadError],
  );

  const handleModeChange = useCallback(
    async (mode: SandboxConfig['mode']) => {
      await saveConfig({ mode });
    },
    [saveConfig],
  );

  const handleNetworkToggle = useCallback(async () => {
    const currentPolicy = config.networkPolicy ?? { allowOutbound: !config.networkRestricted };
    const newAllowOutbound = !currentPolicy.allowOutbound;
    await saveConfig({
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
      saveConfig({ allowedPaths: pathList });
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
      saveConfig({ dockerImage: trimmed });
    }
  }, [config, saveConfig]);

  return {
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
  };
}
