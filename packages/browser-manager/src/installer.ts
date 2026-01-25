import { execSync, spawn } from 'child_process';
import { chromium } from 'playwright';
import { existsSync } from 'fs';

export type PackageManager = 'bun' | 'pnpm' | 'npm';

/**
 * Detect available package manager
 */
export function detectPackageManager(): PackageManager | null {
  const managers: PackageManager[] = ['bun', 'pnpm', 'npm'];

  for (const pm of managers) {
    try {
      const cmd = process.platform === 'win32' ? `where ${pm}` : `which ${pm}`;
      execSync(cmd, { stdio: 'ignore' });
      return pm;
    } catch {
      // Not found, try next
    }
  }

  return null;
}

/**
 * Check if Playwright Chromium is installed
 */
export async function isChromiumInstalled(): Promise<boolean> {
  try {
    const executablePath = chromium.executablePath();
    return existsSync(executablePath);
  } catch {
    return false;
  }
}

/**
 * Install Playwright Chromium
 */
export async function installChromium(
  onProgress?: (message: string) => void
): Promise<void> {
  const pm = detectPackageManager();
  if (!pm) {
    throw new Error('No package manager found (tried bun, pnpm, npm)');
  }

  onProgress?.(`Using ${pm} to install Playwright Chromium...`);

  const commands: Record<PackageManager, { cmd: string; args: string[] }> = {
    bun: { cmd: 'bunx', args: ['playwright', 'install', 'chromium'] },
    pnpm: { cmd: 'pnpm', args: ['exec', 'playwright', 'install', 'chromium'] },
    npm: { cmd: 'npx', args: ['playwright', 'install', 'chromium'] },
  };

  const { cmd, args } = commands[pm];

  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    proc.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) onProgress?.(line);
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) onProgress?.(line);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        onProgress?.('Browser installed successfully!');
        resolve();
      } else {
        reject(new Error(`Installation failed with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}
