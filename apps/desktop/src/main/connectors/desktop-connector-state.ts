/**
 * Desktop Connector State
 *
 * In-memory connection state for built-in connectors that use custom flows
 * instead of ConnectorAuthStore (i.e., GitHub and Google). State is initialized
 * at startup and updated as connectors connect/disconnect during the session.
 */

import path from 'path';

/** Ordered list of gh CLI binary locations to probe, covering macOS, Linux, and Windows. */
export const GH_BINARY_CANDIDATES: readonly string[] = [
  'gh',
  '/opt/homebrew/bin/gh', // Apple Silicon Homebrew (macOS)
  '/usr/local/bin/gh', // Intel Homebrew / manual install (macOS/Linux)
  '/usr/bin/gh', // system package manager (Linux)
  '/home/linuxbrew/.linuxbrew/bin/gh', // Linuxbrew
  'C:\\Program Files\\GitHub CLI\\gh.exe', // Windows winget/msi (64-bit)
  'C:\\Program Files (x86)\\GitHub CLI\\gh.exe', // Windows (32-bit)
];

/**
 * Augmented PATH for spawning gh subprocesses.
 * Adds Homebrew and common install dirs that Electron's minimal PATH omits.
 */
export function buildGhAugmentedPath(): string {
  const base = process.env.PATH ?? process.env.Path ?? '';
  const extra =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\GitHub CLI',
          'C:\\Program Files (x86)\\GitHub CLI',
          'C:\\Program Files\\Git\\bin',
        ]
      : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
  return [base, ...extra].join(path.delimiter);
}

const connectedProviders = new Set<string>();

export function setDesktopConnectorConnected(providerId: string, connected: boolean): void {
  if (connected) {
    connectedProviders.add(providerId);
  } else {
    connectedProviders.delete(providerId);
  }
}

export function isDesktopConnectorConnected(providerId: string): boolean {
  return connectedProviders.has(providerId);
}
