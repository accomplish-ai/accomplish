const INSTALL_ERROR_PATTERNS = [
  'package manager failed',
  'failed to install',
  'opencode-darwin',
  'opencode-linux',
  'opencode-win32',
  'manually installing',
  // Windows-specific: CLI binary must be an .exe path
  'windows cli command',
  'resolve to an .exe path',
];

export function isOpenCodeCliInstallError(message: string): boolean {
  const lower = message.toLowerCase();
  return INSTALL_ERROR_PATTERNS.some((p) => lower.includes(p));
}

export const INSTALL_ERROR_MESSAGE =
  'OpenCode CLI installation issue detected. Please try restarting the app or reinstalling from accomplish.ai';
