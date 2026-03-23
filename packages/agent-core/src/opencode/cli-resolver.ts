import path from 'path';
import fs from 'fs';
import { execFileSync, spawnSync } from 'child_process';
import type { CliResolverConfig, ResolvedCliPaths } from '../types.js';

const WINDOWS_OPENCODE_X64_PACKAGE = 'opencode-windows-x64';
const WINDOWS_OPENCODE_X64_BASELINE_PACKAGE = 'opencode-windows-x64-baseline';
const LINUX_OPENCODE_X64_PACKAGE = 'opencode-linux-x64';
const LINUX_OPENCODE_X64_BASELINE_PACKAGE = 'opencode-linux-x64-baseline';
const LINUX_OPENCODE_X64_MUSL_PACKAGE = 'opencode-linux-x64-musl';
const LINUX_OPENCODE_X64_BASELINE_MUSL_PACKAGE = 'opencode-linux-x64-baseline-musl';
const LINUX_OPENCODE_ARM64_PACKAGE = 'opencode-linux-arm64';
const LINUX_OPENCODE_ARM64_MUSL_PACKAGE = 'opencode-linux-arm64-musl';
const OPENCODE_LAUNCHER_PACKAGE = 'opencode-ai';
let cachedWindowsPackageNames: string[] | null = null;

function detectWindowsAvx2Support(): boolean {
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

function getWindowsPackageNames(): string[] {
  if (cachedWindowsPackageNames) {
    return cachedWindowsPackageNames;
  }

  const preferAvx2Binary = detectWindowsAvx2Support();
  cachedWindowsPackageNames = preferAvx2Binary
    ? [WINDOWS_OPENCODE_X64_PACKAGE, WINDOWS_OPENCODE_X64_BASELINE_PACKAGE]
    : [WINDOWS_OPENCODE_X64_BASELINE_PACKAGE, WINDOWS_OPENCODE_X64_PACKAGE];

  return cachedWindowsPackageNames;
}

function getLinuxPackageNames(): string[] {
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

function getOpenCodePlatformInfo(): { packageNames: string[]; binaryName: string } {
  if (process.platform === 'win32') {
    return {
      packageNames: getWindowsPackageNames(),
      binaryName: 'opencode.exe',
    };
  }
  if (process.platform === 'linux') {
    return {
      packageNames: getLinuxPackageNames(),
      binaryName: 'opencode',
    };
  }
  return {
    packageNames: ['opencode-ai'],
    binaryName: 'opencode',
  };
}

function getCandidateAppRoots(appPath?: string): string[] {
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

function resolveBundledCliPath(resourcesPath: string): ResolvedCliPaths | null {
  const { packageNames, binaryName } = getOpenCodePlatformInfo();
  const unpackedNodeModulesRoot = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules');

  for (const packageName of packageNames) {
    const cliPath = path.join(unpackedNodeModulesRoot, packageName, 'bin', binaryName);

    if (fs.existsSync(cliPath)) {
      return {
        cliPath,
        cliDir: path.dirname(cliPath),
        source: 'bundled',
      };
    }
  }

  if (process.platform === 'win32') {
    const resolvedFromLauncher = resolveWindowsCliFromLauncher(
      unpackedNodeModulesRoot,
      packageNames,
    );
    if (resolvedFromLauncher) {
      return resolvedFromLauncher;
    }
  }

  return null;
}

function resolveLocalCliPath(appPath?: string): ResolvedCliPaths | null {
  const appRoots = getCandidateAppRoots(appPath);
  const { packageNames, binaryName } = getOpenCodePlatformInfo();

  for (const root of appRoots) {
    if (process.platform === 'win32') {
      for (const packageName of packageNames) {
        const cliPath = path.join(root, 'node_modules', packageName, 'bin', binaryName);
        if (fs.existsSync(cliPath)) {
          console.log('[CLI Resolver] Using local OpenCode CLI executable:', cliPath);
          return {
            cliPath,
            cliDir: path.dirname(cliPath),
            source: 'local',
          };
        }
      }

      const resolvedFromLauncher = resolveWindowsCliFromLauncher(
        path.join(root, 'node_modules'),
        packageNames,
      );
      if (resolvedFromLauncher) {
        return resolvedFromLauncher;
      }
      continue;
    }

    const cliPath = path.join(root, 'node_modules', '.bin', binaryName);
    if (fs.existsSync(cliPath)) {
      console.log('[CLI Resolver] Using local OpenCode CLI executable:', cliPath);
      return {
        cliPath,
        cliDir: path.dirname(cliPath),
        source: 'local',
      };
    }
  }

  return null;
}

function resolveWindowsCliFromLauncher(
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
        console.log('[CLI Resolver] Using OpenCode CLI executable via launcher package:', cliPath);
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

export function resolveCliPath(config: CliResolverConfig): ResolvedCliPaths | null {
  const { isPackaged, resourcesPath, appPath } = config;

  if (isPackaged && resourcesPath) {
    return resolveBundledCliPath(resourcesPath);
  }

  if (isPackaged) {
    return null;
  }

  return resolveLocalCliPath(appPath);
}

export function isCliAvailable(config: CliResolverConfig): boolean {
  return resolveCliPath(config) !== null;
}

export async function getCliVersion(cliPath: string): Promise<string | null> {
  try {
    if (cliPath.includes('node_modules')) {
      const { packageNames } = getOpenCodePlatformInfo();
      const packageJsonCandidates = [
        ...packageNames.map((packageName) =>
          path.join(path.dirname(path.dirname(cliPath)), packageName, 'package.json'),
        ),
        path.join(path.dirname(path.dirname(cliPath)), 'package.json'),
      ];

      for (const packageJsonPath of packageJsonCandidates) {
        if (fs.existsSync(packageJsonPath)) {
          const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
          return pkg.version;
        }
      }
    }

    // Use execFileSync (no shell) so paths that contain spaces are passed
    // directly to CreateProcess/execvp without cmd.exe quoting ambiguity.
    // See: https://github.com/accomplish-ai/accomplish/issues/596
    const output = execFileSync(cliPath, ['--version'], {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    }).trim();

    const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
    return versionMatch ? versionMatch[1] : output;
  } catch {
    return null;
  }
}
