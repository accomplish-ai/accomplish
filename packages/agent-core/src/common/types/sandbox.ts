/**
 * Sandbox configuration types for restricting agent FS/Network access.
 *
 * Used by the SandboxProvider abstraction in packages/agent-core/src/sandbox/.
 */

/** Sandbox enforcement mode */
export type SandboxMode = 'disabled' | 'native' | 'docker';

// ---------------------------------------------------------------------------
// Docker-specific types (contributed by SaaiAravindhRaja, PR #612)
// ---------------------------------------------------------------------------

/** Network policy for the Docker sandbox */
export interface SandboxNetworkPolicy {
  /** Whether the container can make outbound network requests */
  allowOutbound: boolean;
  /** Optional allowlist of hosts. If absent, all hosts are allowed when allowOutbound is true. */
  allowedHosts?: string[];
}

// ---------------------------------------------------------------------------
// Sandbox paths type (contributed by preeeetham, PR #430)
// ---------------------------------------------------------------------------

/**
 * Host filesystem paths needed to mount OpenCode config/data into the Docker
 * container so the agent can find its config and auth tokens.
 */
export interface SandboxPaths {
  /** Directory containing opencode.json config file */
  configDir: string;
  /** XDG data home directory (opencode stores auth tokens here) */
  openDataHome: string;
}

/** User-configurable sandbox settings */
export interface SandboxConfig {
  /** Which sandbox backend to use */
  mode: SandboxMode;
  /** Allowed filesystem paths the agent may read/write */
  allowedPaths: string[];
  /** Whether outbound network access is restricted */
  networkRestricted: boolean;
  /** Hosts exempt from network restriction (e.g. API endpoints) */
  allowedHosts: string[];
  // Docker-mode specific fields (SaaiAravindhRaja, PR #612)
  /** Custom Docker image to use when mode is 'docker'. Defaults to 'node:20-slim'. */
  dockerImage?: string;
  /** Network policy for docker mode. Defaults to allowOutbound: true. */
  networkPolicy?: SandboxNetworkPolicy;
}

/** Default (disabled) sandbox configuration */
export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  mode: 'disabled',
  allowedPaths: [],
  networkRestricted: false,
  allowedHosts: [],
  dockerImage: undefined,
  networkPolicy: { allowOutbound: true },
};

/** Arguments passed through the sandbox provider spawn wrapper */
export interface SpawnArgs {
  file: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

/**
 * Pluggable sandbox provider interface.
 *
 * Implementations wrap the pty.spawn() call to enforce FS/network policies.
 */
export interface SandboxProvider {
  /** Human-readable name of this sandbox backend */
  readonly name: string;

  /** Check whether this sandbox backend is available on the current platform */
  isAvailable(): Promise<boolean>;

  /**
   * Wrap spawn arguments to apply sandbox restrictions.
   *
   * Implementations must include any sandbox-specific environment variables
   * in the returned SpawnArgs.env — there is no separate hook for env-building.
   *
   * - Native provider: injects env vars and/or wraps command with OS sandbox
   * - Disabled provider: returns args unchanged (passthrough)
   */
  wrapSpawnArgs(args: SpawnArgs, config: SandboxConfig): Promise<SpawnArgs>;

  /** Cleanup resources on disposal */
  dispose(): Promise<void>;
}
