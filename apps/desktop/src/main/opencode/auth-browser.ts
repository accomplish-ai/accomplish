import * as net from 'net';
import * as fs from 'fs';
import * as pty from 'node-pty';
import { app, shell } from 'electron';
import { getOpenCodeCliPath } from './cli-path';
import { generateOpenCodeConfig } from './config-generator';

interface LoginResult {
  openedUrl?: string;
}

function stripAnsi(input: string): string {
  return input.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

function quoteForShell(arg: string): string {
  if (process.platform === 'win32') {
    if (arg.includes(' ') || arg.includes('"')) {
      return `"${arg.replace(/"/g, '\\"')}"`;
    }
    return arg;
  }
  if (arg.includes("'") || arg.includes(' ') || arg.includes('"')) {
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }
  return arg;
}

function getPlatformShell(): string {
  if (process.platform === 'win32') {
    return 'powershell.exe';
  }
  if (app.isPackaged && process.platform === 'darwin') {
    return '/bin/sh';
  }
  const userShell = process.env.SHELL;
  if (userShell) return userShell;
  if (fs.existsSync('/bin/bash')) return '/bin/bash';
  if (fs.existsSync('/bin/zsh')) return '/bin/zsh';
  return '/bin/sh';
}

function getShellArgs(command: string): string[] {
  if (process.platform === 'win32') {
    return ['-NoProfile', '-Command', command];
  }
  return ['-c', command];
}

/**
 * Manages OAuth browser-based authentication flows with process tracking
 * and graceful cancellation support.
 *
 * Solves the port conflict issue where the OpenCode CLI starts a local
 * OAuth callback server on port 1455. If the user closes the browser
 * without completing auth, the server isn't cleaned up, and retrying
 * fails with "port 1455 in use".
 */
export class OAuthBrowserFlow {
  private activePty: pty.IPty | null = null;
  private isDisposed = false;

  /**
   * Check if an OAuth flow is currently in progress
   */
  isInProgress(): boolean {
    return this.activePty !== null && !this.isDisposed;
  }

  /**
   * Start OpenAI OAuth login via ChatGPT Plus/Pro.
   *
   * If a flow is already in progress, it will be cancelled first.
   * This prevents port conflicts from stale processes.
   *
   * @returns Promise resolving with the OAuth URL that was opened (if any)
   */
  async start(): Promise<LoginResult> {
    // Auto-cancel any existing flow to prevent port conflicts
    if (this.isInProgress()) {
      console.log('[OAuthBrowserFlow] Cancelling previous flow before starting new one');
      await this.cancel();
      // Wait for port to be released (OS may take time to reclaim)
      await this.waitForPortRelease(1455, 2000);
    }

    await generateOpenCodeConfig();

    const { command, args: baseArgs } = getOpenCodeCliPath();
    const allArgs = [...baseArgs, 'auth', 'login'];

    const fullCommand = [command, ...allArgs].map(quoteForShell).join(' ');
    const shellCmd = getPlatformShell();
    const shellArgs = getShellArgs(fullCommand);

    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string') env[key] = value;
    }
    if (process.env.OPENCODE_CONFIG) {
      env.OPENCODE_CONFIG = process.env.OPENCODE_CONFIG;
    }

    const safeCwd = app.getPath('temp');

    return new Promise((resolve, reject) => {
      let openedUrl: string | undefined;
      let hasSelectedProvider = false;
      let hasSelectedLoginMethod = false;
      let buffer = '';

      const proc = pty.spawn(shellCmd, shellArgs, {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: safeCwd,
        env,
      });

      this.activePty = proc;

      const cleanup = () => {
        this.activePty = null;
      };

      const tryOpenExternal = async (url: string) => {
        if (openedUrl) return;
        try {
          const parsed = new URL(url);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
          openedUrl = url;
          await shell.openExternal(url);
        } catch {
          // Ignore invalid URLs; opencode will show errors if any.
        }
      };

      proc.onData((data) => {
        const clean = stripAnsi(data);
        buffer += clean;
        if (buffer.length > 20_000) buffer = buffer.slice(-20_000);

        // Provider selection (type-to-search)
        if (!hasSelectedProvider && buffer.includes('Select provider')) {
          hasSelectedProvider = true;
          // Filter and select OpenAI.
          proc.write('OpenAI');
          proc.write('\r');
        }

        // Login method selection: default is ChatGPT Pro/Plus (first entry)
        if (hasSelectedProvider && !hasSelectedLoginMethod && buffer.includes('Login method')) {
          hasSelectedLoginMethod = true;
          proc.write('\r');
        }

        // Extract the OAuth URL and open it automatically.
        const match = clean.match(/Go to:\s*(https?:\/\/\S+)/);
        if (match?.[1]) {
          void tryOpenExternal(match[1]);
        }
      });

      proc.onExit(({ exitCode, signal }) => {
        cleanup();

        if (exitCode === 0) {
          resolve({ openedUrl });
          return;
        }

        const tail = buffer.trim().split('\n').slice(-15).join('\n');
        const redacted = tail
          .replace(/https?:\/\/\S+/g, '[url]')
          .replace(/sk-(?:ant-|or-)?[A-Za-z0-9_-]+/g, 'sk-[redacted]');
        reject(
          new Error(
            `OpenCode auth login failed (exit ${exitCode}, signal ${signal ?? 'none'})` +
              (redacted ? `\n\nOutput:\n${redacted}` : '')
          )
        );
      });
    });
  }

  /**
   * Cancel any active OAuth flow.
   *
   * Sends graceful Ctrl+C first, then force kills if needed.
   * Returns immediately if no flow is active.
   *
   * @returns Promise that resolves when cancellation is complete
   */
  async cancel(): Promise<void> {
    if (!this.activePty) {
      console.log('[OAuthBrowserFlow] No active flow to cancel');
      return;
    }

    console.log('[OAuthBrowserFlow] Cancelling active OAuth flow');

    const ptyProcess = this.activePty;

    // Send Ctrl+C for graceful shutdown
    ptyProcess.write('\x03');

    // On Windows, batch files prompt for confirmation
    if (process.platform === 'win32') {
      await this.delay(100);
      ptyProcess.write('Y\n');
    }

    // Wait for graceful exit with timeout
    const gracefulExited = await this.waitForExit(ptyProcess, 1000);

    if (!gracefulExited && this.activePty === ptyProcess) {
      console.log('[OAuthBrowserFlow] Force killing after graceful timeout');
      try {
        ptyProcess.kill();
      } catch (err) {
        console.warn('[OAuthBrowserFlow] Error during force kill:', err);
      }
    }

    // Ensure cleanup
    this.activePty = null;
  }

  /**
   * Dispose resources. Called on app shutdown.
   */
  dispose(): void {
    if (this.isDisposed) return;

    console.log('[OAuthBrowserFlow] Disposing');
    this.isDisposed = true;

    if (this.activePty) {
      try {
        this.activePty.kill();
      } catch (err) {
        console.warn('[OAuthBrowserFlow] Error killing PTY during dispose:', err);
      }
      this.activePty = null;
    }
  }

  private async waitForExit(proc: pty.IPty, timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let resolved = false;

      const onExit = () => {
        if (!resolved) {
          resolved = true;
          resolve(true);
        }
      };

      proc.onExit(onExit);

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      }, timeoutMs);
    });
  }

  private async waitForPortRelease(port: number, timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 100;

    while (Date.now() - startTime < timeoutMs) {
      const inUse = await this.isPortInUse(port);
      if (!inUse) {
        console.log(`[OAuthBrowserFlow] Port ${port} released`);
        return;
      }
      await this.delay(pollInterval);
    }

    console.warn(`[OAuthBrowserFlow] Port ${port} still in use after ${timeoutMs}ms`);
  }

  private isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.once('error', (err: NodeJS.ErrnoException) => {
        resolve(err.code === 'EADDRINUSE');
      });

      server.once('listening', () => {
        server.close();
        resolve(false);
      });

      server.listen(port, '127.0.0.1');
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance for app usage
export const oauthBrowserFlow = new OAuthBrowserFlow();

export async function loginOpenAiWithChatGpt(): Promise<LoginResult> {
  return oauthBrowserFlow.start();
}
