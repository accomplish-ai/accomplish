/**
 * CLI path resolution utilities
 *
 * Platform detection and path helpers for locating the OpenCode CLI binary.
 * Extracted from cli-resolver.ts to keep file sizes under 200 lines.
 */

import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';
import { createConsoleLogger } from '../utils/logging.js';
import type { ResolvedCliPaths } from '../types.js';

const log = createConsoleLogger({ prefix: 'CLIResolver' });

const WINDOWS_OPENCODE_X64_PACKAGE = 'opencode-windows-x64';
const WINDOWS_OPENCODE_X64_BASELINE_PACKAGE = 'opencode-windows-x64-baseline';
const LINUX_OPENCODE_X64_PACKAGE = 'opencode-linux-x64';
const LINUX_OPENCODE_X64_BASELINE_PACKAGE = 'opencode-linux-x64-baseline';
const LINUX_OPENCODE_X64_MUSL_PACKAGE = 'opencode-linux-x64-musl';
const LINUX_OPENCODE_X64_BASELINE_MUSL_PACKAGE = 'opencode-linux-x64-baseline-musl';
const LINUX_OPENCODE_ARM64_PACKAGE = 'opencode-linux-arm64';
const LINUX_OPENCODE_ARM64_MUSL_PACKAGE = 'opencode-linux-arm64-musl';
export const OPENCODE_LAUNCHER_PACKAGE = 'opencode-ai';

let cachedWindowsPackageNames: string[] | null = null;

export function detectWindowsAvx2Support(): boolean {
  const checkCommand =
    '(Add-Type -MemberDefinition "[DllImport(""kernel32.dll"")] public static extern bool IsProcessorFeaturePresent(int ProcessorFeature);" -Name Kernel32 -Namespace Win32 -PassThru)::IsProcessorFeaturePresent(40)';

  for (const shell of ['powershell.exe', 'pwsh.exe', 'pwsh', 'powershell']) {
    try {
      const result = spawnSync(shell, ['-NoProfile', '-NonInteractive', '-Command', checkCommand], {
        encoding: 'utf-8',
        timeout: 3000,
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      });
      if (result.status !== 0) {
        continue;
      }

      const output = (result.stdout ?? '').trim().toLowerCase();
      if (output === 'true' || output === '1') {
        return true;
      }
      if (output === 'false' || output === '0') {
        return false;
      }
    } catch {
      continue;
    }
  }

  return false;
}

export function getWindowsPackageNames(): string[] {
  if (cachedWindowsPackageNames) {
    return cachedWindowsPackageNames;
  }

  const preferAvx2Binary = detectWindowsAvx2Support();
  cachedWindowsPackageNames = preferAvx2Binary
    ? [WINDOWS_OPENCODE_X64_PACKAGE, WINDOWS_OPENCODE_X64_BASELINE_PACKAGE]
    : [WINDOWS_OPENCODE_X64_BASELINE_PACKAGE, WINDOWS_OPENCODE_X64_PACKAGE];

  return cachedWindowsPackageNames;
}

export function getLinuxPackageNames(): string[] {
  if (process.arch === 'arm64') {
    return [LINUX_OPENCODE_ARM64_PACKAGE, LINUX_OPENCODE_ARM64_MUSL_PACKAGE];
  }
  return [
    LINUX_OPENCODE_X64_PACKAGE,
    LINUX_OPENCODE_X64_BASELINE_PACKAGE,
    LINUX_OPENCODE_X64_MUSL_PACKAGE,
    LINUX_OPENCODE_X64_BASELINE_MUSL_PACKAGE,
  ];
}

export function getOpenCodePlatformInfo(): { packageNames: string[]; binaryName: string } {
  if (process.platform === 'win32') {
    return { packageNames: getWindowsPackageNames(), binaryName: 'opencode.exe' };
  }
  if (process.platform === 'linux') {
    return { packageNames: getLinuxPackageNames(), binaryName: 'opencode' };
  }
  return { packageNames: ['opencode-ai'], binaryName: 'opencode' };
}

export function getCandidateAppRoots(appPath?: string): string[] {
  const roots: string[] = [];

  if (process.env.APP_ROOT) {
    roots.push(path.resolve(process.env.APP_ROOT));
  }

  if (appPath) {
    const resolvedAppPath = path.resolve(appPath);
    roots.push(resolvedAppPath);
    roots.push(path.resolve(resolvedAppPath, '..'));
    roots.push(path.resolve(resolvedAppPath, '..', '..'));
  }

  return [...new Set(roots)];
}

export function resolveWindowsCliFromLauncher(
  nodeModulesRoot: string,
  packageNames: string[],
): ResolvedCliPaths | null {
  const launcherPackagePath = path.join(nodeModulesRoot, OPENCODE_LAUNCHER_PACKAGE);
  if (!fs.existsSync(launcherPackagePath)) {
    return null;
  }

  const candidateModuleRoots = new Set<string>([nodeModulesRoot]);
  try {
    const realLauncherPackagePath = fs.realpathSync(launcherPackagePath);
    candidateModuleRoots.add(path.dirname(realLauncherPackagePath));
  } catch {
    // Ignore realpath failures and continue with known roots.
  }

  for (const moduleRoot of candidateModuleRoots) {
    for (const packageName of packageNames) {
      const cliPath = path.join(moduleRoot, packageName, 'bin', 'opencode.exe');
      if (fs.existsSync(cliPath)) {
        log.info(`[CLI Resolver] Using OpenCode CLI executable via launcher package: ${cliPath}`);
        return {
          cliPath,
          cliDir: path.dirname(cliPath),
          source: 'local',
        };
      }
    }
  }

  return null;
}
