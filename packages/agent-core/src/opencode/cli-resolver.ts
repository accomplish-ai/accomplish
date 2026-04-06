import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import type { CliResolverConfig, ResolvedCliPaths } from '../types.js';
import { createConsoleLogger } from '../utils/logging.js';
import {
  getOpenCodePlatformInfo,
  getCandidateAppRoots,
  resolveWindowsCliFromLauncher,
} from './cli-path-utils.js';

const log = createConsoleLogger({ prefix: 'CLIResolver' });

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
          log.info(`[CLI Resolver] Using local OpenCode CLI executable: ${cliPath}`);
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
      log.info(`[CLI Resolver] Using local OpenCode CLI executable: ${cliPath}`);
      return {
        cliPath,
        cliDir: path.dirname(cliPath),
        source: 'local',
      };
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
