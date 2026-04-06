/**
 * Docker argument construction helpers for the DockerSandboxProvider.
 *
 * Extracted from docker-provider.ts to keep file sizes under 200 lines.
 * Handles building the `docker run ...` args array and shell escaping.
 */

import path from 'path';
import type { SandboxConfig, SandboxPaths, SpawnArgs } from '../common/types/sandbox.js';
import { createConsoleLogger } from '../utils/logging.js';

const log = createConsoleLogger({ prefix: 'DockerProvider' });

/** Env-var keys forwarded into the container (preeeetham, PR #430) */
export const FORWARDED_ENV_KEYS = [
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

/**
 * Construct the full `docker run ...` argument list.
 *
 * SaaiAravindhRaja (PR #612): networkPolicy, dockerImage, allowed-hosts,
 * Docker image validation regex.
 * preeeetham (PR #430): SandboxPaths volume mounts, env-var allowlist,
 * selective key forwarding.
 */
export function buildDockerArgs(
  spawnArgs: SpawnArgs,
  config: SandboxConfig,
  getSandboxPaths?: () => SandboxPaths,
): string[] {
  const safeCwd = path.resolve(spawnArgs.cwd);
  const dockerArgs: string[] = ['run', '--rm', '-i'];

  // Mount working directory (SaaiAravindhRaja, PR #612)
  dockerArgs.push('-v', `${safeCwd}:/workspace`, '-w', '/workspace');

  // Mount extra user-allowed paths (SaaiAravindhRaja, PR #612)
  for (const p of config.allowedPaths) {
    dockerArgs.push('-v', `${p}:${p}`);
  }

  // Mount OpenCode config + XDG data dirs from host (preeeetham, PR #430)
  if (getSandboxPaths) {
    const paths = getSandboxPaths();
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
    log.warn(
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
  const innerCmd = buildShellCommand(containerCommand, spawnArgs.args);
  dockerArgs.push('sh', '-c', innerCmd);

  return dockerArgs;
}

/**
 * Redact values of -e flags in a docker args array for safe logging.
 * (SaaiAravindhRaja, PR #612)
 */
export function redactDockerArgs(dockerArgs: string[]): string[] {
  return dockerArgs.map((arg, i) => {
    if (i > 0 && dockerArgs[i - 1] === '-e' && arg.includes('=')) {
      const eqIdx = arg.indexOf('=');
      return `${arg.substring(0, eqIdx)}=***`;
    }
    return arg;
  });
}

function buildShellCommand(command: string, args: string[]): string {
  const parts = [command, ...args].map((a) => escapeShellArg(a));
  return parts.join(' ');
}

function escapeShellArg(arg: string): string {
  if (arg === '') {
    return "''";
  }
  const needsEscaping = ["'", ' ', '$', '`', '\\', '"', '\n'].some((c) => arg.includes(c));
  if (needsEscaping) {
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }
  return arg;
}
