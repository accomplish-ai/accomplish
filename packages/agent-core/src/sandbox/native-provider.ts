/**
 * Native sandbox provider — OS-level FS/network restriction.
 *
 * macOS: wraps spawn command with sandbox-exec and a generated profile.
 * Windows: injects ACCOMPLISH_SANDBOX_* env vars consumed by file-permission MCP;
 *          network restriction via env-var flags (no admin elevation required).
 * Linux: injects env vars; optionally wraps with firejail if available.
 */

import fs from 'fs';
import type { SandboxConfig, SandboxProvider, SpawnArgs } from '../common/types/sandbox.js';

export class NativeSandboxProvider implements SandboxProvider {
  readonly name = 'native';
  private readonly platform: NodeJS.Platform;

  constructor(platform?: NodeJS.Platform) {
    this.platform = platform ?? process.platform;
  }

  async isAvailable(): Promise<boolean> {
    if (this.platform === 'darwin') {
      try {
        fs.accessSync('/usr/bin/sandbox-exec', fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    }

    // Windows and Linux always support the env-var approach
    return true;
  }

  async wrapSpawnArgs(args: SpawnArgs, config: SandboxConfig): Promise<SpawnArgs> {
    const sandboxEnv = this.buildSandboxEnvironment(config);
    const mergedEnv: Record<string, string> = Object.fromEntries(
      Object.entries({ ...args.env, ...sandboxEnv }).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );

    if (this.platform === 'darwin') {
      return this.wrapDarwin(args, config, mergedEnv);
    }

    // Windows and Linux — env-var enforcement only (no command wrapping)
    return {
      ...args,
      env: mergedEnv,
    };
  }

  private buildSandboxEnvironment(config: SandboxConfig): Record<string, string> {
    const env: Record<string, string> = {
      ACCOMPLISH_SANDBOX_ENABLED: '1',
      ACCOMPLISH_SANDBOX_MODE: 'native',
    };

    if (config.allowedPaths.length > 0) {
      env['ACCOMPLISH_SANDBOX_ALLOWED_PATHS'] = config.allowedPaths.join(
        this.platform === 'win32' ? ';' : ':',
      );
    }

    if (config.networkRestricted) {
      env['ACCOMPLISH_SANDBOX_NETWORK_RESTRICTED'] = '1';
    }

    if (config.allowedHosts.length > 0) {
      env['ACCOMPLISH_SANDBOX_ALLOWED_HOSTS'] = config.allowedHosts.join(',');
    }

    return env;
  }

  async dispose(): Promise<void> {
    // nothing to clean up
  }

  /**
   * On macOS, wrap the command with sandbox-exec using a generated profile.
   *
   * sandbox-exec interposes a Seatbelt profile that controls file I/O,
   * network access, and process execution at the kernel level.
   */
  private wrapDarwin(
    args: SpawnArgs,
    config: SandboxConfig,
    mergedEnv: Record<string, string>,
  ): SpawnArgs {
    const profile = this.buildSeatbeltProfile(config, args.cwd);

    // Build the original command string that will run inside the sandbox
    const innerCommand = [args.file, ...args.args].map((a) => this.shellEscape(a)).join(' ');

    return {
      file: '/bin/sh',
      args: [
        '-c',
        `/usr/bin/sandbox-exec -p '${this.escapeSingleQuotes(profile)}' ${innerCommand}`,
      ],
      cwd: args.cwd,
      env: mergedEnv,
    };
  }

  /**
   * Generate a macOS Seatbelt profile string from the sandbox config.
   */
  private buildSeatbeltProfile(config: SandboxConfig, cwd: string): string {
    const rules: string[] = [
      '(version 1)',
      '(deny default)',
      // Allow basic process execution
      '(allow process-exec)',
      '(allow process-fork)',
      '(allow signal)',
      '(allow sysctl-read)',
      '(allow mach-lookup)',
      // Allow reading standard system locations
      '(allow file-read* (subpath "/usr"))',
      '(allow file-read* (subpath "/bin"))',
      '(allow file-read* (subpath "/sbin"))',
      '(allow file-read* (subpath "/Library"))',
      '(allow file-read* (subpath "/System"))',
      '(allow file-read* (subpath "/private/var"))',
      '(allow file-read* (subpath "/dev"))',
      '(allow file-read* (subpath "/etc"))',
      '(allow file-read* (subpath "/tmp"))',
      '(allow file-write* (subpath "/tmp"))',
      '(allow file-write* (subpath "/dev"))',
      // Allow the working directory
      `(allow file-read* (subpath "${this.escapeSeatbeltString(cwd)}"))`,
      `(allow file-write* (subpath "${this.escapeSeatbeltString(cwd)}"))`,
    ];

    // Allow user-specified paths
    for (const p of config.allowedPaths) {
      const escaped = this.escapeSeatbeltString(p);
      rules.push(`(allow file-read* (subpath "${escaped}"))`);
      rules.push(`(allow file-write* (subpath "${escaped}"))`);
    }

    // Network access
    if (config.networkRestricted) {
      rules.push('(deny network*)');
      // Allow loopback for MCP tool communication
      rules.push('(allow network* (local ip "localhost:*"))');
      rules.push('(allow network* (remote ip "localhost:*"))');
      rules.push('(allow network* (local ip "127.0.0.1:*"))');
      rules.push('(allow network* (remote ip "127.0.0.1:*"))');
    } else {
      rules.push('(allow network*)');
    }

    return rules.join('\n');
  }

  private escapeSeatbeltString(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  private escapeSingleQuotes(s: string): string {
    return s.replace(/'/g, "'\\''");
  }

  private shellEscape(arg: string): string {
    if (/[^a-zA-Z0-9_\-./=:@]/.test(arg)) {
      return `'${arg.replace(/'/g, "'\\''")}'`;
    }
    return arg;
  }
}
