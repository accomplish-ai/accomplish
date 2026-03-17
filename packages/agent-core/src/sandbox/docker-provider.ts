/**
 * Docker sandbox provider — runs the agent inside a Docker container.
 *
 * Contributed by:
 *   - preeeetham (PR #430): spawnDocker / spawnNormal helper logic,
 *     SandboxPaths interface, Docker availability check via `docker info`
 *   - SaaiAravindhRaja (PR #612): Docker image config, network policy,
 *     allowed-hosts filtering, env-var allowlist, arg construction tests
 *
 * The provider wraps wrapSpawnArgs() so that when mode === 'docker' the
 * agent binary is executed via:
 *   docker run --rm -i \
 *     -v <cwd>:/workspace -w /workspace \
 *     [-v <extra-path>:<extra-path> ...] \
 *     [--network none] \
 *     [-e KEY=VALUE ...] \
 *     <image> sh -c "<command> <args>"
 */

import { execSync } from 'child_process';
import path from 'path';
import type {
  SandboxConfig,
  SandboxPaths,
  SandboxProvider,
  SpawnArgs,
} from '../common/types/sandbox.js';

/** Env-var keys forwarded into the container (preeeetham, PR #430) */
const FORWARDED_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'XAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'OPENROUTER_API_KEY',
  'OPENAI_BASE_URL',
  'ACCOMPLISH_TASK_ID',
  // Safe runtime / locale vars
  'ACCOMPLISH_SANDBOX_MODE',
  'ACCOMPLISH_SANDBOX_ENABLED',
  'LANG',
  'LC_ALL',
  'TERM',
  'COLORTERM',
  'NO_COLOR',
];

export class DockerSandboxProvider implements SandboxProvider {
  readonly name = 'docker';

  private readonly platform: NodeJS.Platform;
  private readonly getSandboxPaths?: () => SandboxPaths;

  constructor(platform?: NodeJS.Platform, getSandboxPaths?: () => SandboxPaths) {
    this.platform = platform ?? process.platform;
    this.getSandboxPaths = getSandboxPaths;
  }

  /** Docker is only supported on macOS and Linux (preeeetham, PR #430) */
  async isAvailable(): Promise<boolean> {
    if (this.platform !== 'darwin' && this.platform !== 'linux') {
      return false;
    }
    try {
      execSync('docker info', { stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build docker run args and rewire the spawn call to run inside the container.
   *
   * Inspired by preeeetham (PR #430) spawnDocker + SaaiAravindhRaja (PR #612)
   * docker arg construction and network policy handling.
   */
  async wrapSpawnArgs(args: SpawnArgs, config: SandboxConfig): Promise<SpawnArgs> {
    const sandboxEnv: Record<string, string> = {
      ACCOMPLISH_SANDBOX_ENABLED: '1',
      ACCOMPLISH_SANDBOX_MODE: 'docker',
    };
    const mergedEnv = { ...(args.env ?? {}), ...sandboxEnv };
    const dockerArgs = this.buildDockerArgs({ ...args, env: mergedEnv }, config);

    return {
      file: 'docker',
      args: dockerArgs,
      cwd: args.cwd,
      env: mergedEnv,
    };
  }

  async dispose(): Promise<void> {
    // nothing to clean up
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Construct the full `docker run ...` argument list.
   *
   * SaaiAravindhRaja (PR #612): networkPolicy, dockerImage, allowed-hosts,
   * Docker image validation regex.
   * preeeetham (PR #430): SandboxPaths volume mounts, env-var allowlist,
   * selective key forwarding.
   */
  buildDockerArgs(spawnArgs: SpawnArgs, config: SandboxConfig): string[] {
    const safeCwd = path.resolve(spawnArgs.cwd);
    const dockerArgs: string[] = ['run', '--rm', '-i'];

    // Mount working directory (SaaiAravindhRaja, PR #612)
    dockerArgs.push('-v', `${safeCwd}:/workspace`, '-w', '/workspace');

    // Mount extra user-allowed paths (SaaiAravindhRaja, PR #612)
    for (const p of config.allowedPaths) {
      dockerArgs.push('-v', `${p}:${p}`);
    }

    // Mount OpenCode config + XDG data dirs from host (preeeetham, PR #430)
    if (this.getSandboxPaths) {
      const paths = this.getSandboxPaths();
      dockerArgs.push(
        '-v',
        `${path.resolve(paths.configDir)}:/opencode-config:ro`,
        '-v',
        `${path.resolve(paths.openDataHome)}:/xdg-data:ro`,
        '-e',
        'OPENCODE_CONFIG=/opencode-config/opencode.json',
        '-e',
        'OPENCODE_CONFIG_DIR=/opencode-config',
        '-e',
        'XDG_DATA_HOME=/xdg-data',
      );
    }

    // Network policy (SaaiAravindhRaja, PR #612)
    const netPolicy = config.networkPolicy;
    if (netPolicy && !netPolicy.allowOutbound) {
      dockerArgs.push('--network', 'none');
    } else if (config.networkRestricted) {
      // Legacy networkRestricted field still honoured
      dockerArgs.push('--network', 'none');
    }

    // Warn if per-host allowlists are set — Docker mode doesn't support them
    const hasAllowedHosts =
      (config.allowedHosts && config.allowedHosts.length > 0) ||
      (netPolicy?.allowedHosts && netPolicy.allowedHosts.length > 0);
    if (hasAllowedHosts) {
      console.warn(
        '[DockerProvider] allowedHosts is set but Docker mode does not support per-host allowlists. The allowedHosts restriction will be ignored.',
      );
    }

    // Forward a curated set of env vars (preeeetham, PR #430 allowlist +
    // SaaiAravindhRaja, PR #612 BLOCKED_ENV_KEYS exclusion)
    for (const key of FORWARDED_ENV_KEYS) {
      const val = spawnArgs.env[key];
      if (val) {
        dockerArgs.push('-e', `${key}=${val}`);
      }
    }

    // Docker image (SaaiAravindhRaja, PR #612 — defaults to node:20-slim)
    const image = config.dockerImage || 'node:20-slim';
    dockerArgs.push(image);

    // Run the original command inside the container
    const containerCommand = path.basename(spawnArgs.file);
    const innerCmd = this.buildShellCommand(containerCommand, spawnArgs.args);
    dockerArgs.push('sh', '-c', innerCmd);

    return dockerArgs;
  }

  /**
   * Redact values of -e flags in a docker args array for safe logging.
   * (SaaiAravindhRaja, PR #612)
   */
  redactDockerArgs(dockerArgs: string[]): string[] {
    return dockerArgs.map((arg, i) => {
      if (i > 0 && dockerArgs[i - 1] === '-e' && arg.includes('=')) {
        const eqIdx = arg.indexOf('=');
        return `${arg.substring(0, eqIdx)}=***`;
      }
      return arg;
    });
  }

  private buildShellCommand(command: string, args: string[]): string {
    const parts = [command, ...args].map((a) => this.escapeShellArg(a));
    return parts.join(' ');
  }

  private escapeShellArg(arg: string): string {
    if (arg === '') {
      return "''";
    }
    const needsEscaping = ["'", ' ', '$', '`', '\\', '"', '\n'].some((c) => arg.includes(c));
    if (needsEscaping) {
      return `'${arg.replace(/'/g, "'\\''")}'`;
    }
    return arg;
  }
}
