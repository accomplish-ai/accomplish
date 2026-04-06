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
import type {
  SandboxConfig,
  SandboxPaths,
  SandboxProvider,
  SpawnArgs,
} from '../common/types/sandbox.js';
import { buildDockerArgs, redactDockerArgs } from './docker-args.js';

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
    const dockerArgs = buildDockerArgs({ ...args, env: mergedEnv }, config, this.getSandboxPaths);

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

  buildDockerArgs(spawnArgs: SpawnArgs, config: SandboxConfig): string[] {
    return buildDockerArgs(spawnArgs, config, this.getSandboxPaths);
  }

  redactDockerArgs(dockerArgs: string[]): string[] {
    return redactDockerArgs(dockerArgs);
  }
}
