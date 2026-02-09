import * as pty from 'node-pty';
import { app, shell } from 'electron';
import { getOpenCodeCliPath } from './electron-options';
import { generateOpenCodeConfig } from './config-generator';
import {
  stripAnsi,
  quoteForShell,
  getPlatformShell,
  getShellArgs,
  waitForPortRelease,
} from '@accomplish_ai/agent-core';

interface LoginResult {
  openedUrl?: string;
}

export class OAuthBrowserFlow {
  private activePty: pty.IPty | null = null;
  private isDisposed = false;

  isInProgress(): boolean {
    return this.activePty !== null && !this.isDisposed;
  }

  async start(): Promise<LoginResult> {
    if (this.isInProgress()) {
      console.log('[OAuthBrowserFlow] Cancelling previous flow before starting new one');
      await this.cancel();
      try {
        await waitForPortRelease(1455, 2000);
        console.log('[OAuthBrowserFlow] Port 1455 released');
      } catch {
        console.warn('[OAuthBrowserFlow] Port 1455 still in use after 2000ms');
      }
    }

    await generateOpenCodeConfig();

    const { command, args: baseArgs } = getOpenCodeCliPath();
    const allArgs = [...baseArgs, 'auth', 'login'];

    const fullCommand = [command, ...allArgs].map(quoteForShell).join(' ');
    const shellCmd = getPlatformShell(app.isPackaged);
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
        }
      };

      proc.onData((data) => {
        const clean = stripAnsi(data);
        buffer += clean;
        if (buffer.length > 20_000) buffer = buffer.slice(-20_000);

        if (!hasSelectedProvider && buffer.includes('Select provider')) {
          hasSelectedProvider = true;
          proc.write('OpenAI');
          proc.write('\r');
        }

        if (hasSelectedProvider && !hasSelectedLoginMethod && buffer.includes('Login method')) {
          hasSelectedLoginMethod = true;
          proc.write('\r');
        }

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

  async cancel(): Promise<void> {
    if (!this.activePty) {
      console.log('[OAuthBrowserFlow] No active flow to cancel');
      return;
    }

    console.log('[OAuthBrowserFlow] Cancelling active OAuth flow');

    const ptyProcess = this.activePty;

    ptyProcess.write('\x03');

    if (process.platform === 'win32') {
      await this.delay(100);
      ptyProcess.write('Y\n');
    }

    const gracefulExited = await this.waitForExit(ptyProcess, 1000);

    if (!gracefulExited && this.activePty === ptyProcess) {
      console.log('[OAuthBrowserFlow] Force killing after graceful timeout');
      try {
        ptyProcess.kill();
      } catch (err) {
        console.warn('[OAuthBrowserFlow] Error during force kill:', err);
      }
    }

    this.activePty = null;
  }

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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const oauthBrowserFlow = new OAuthBrowserFlow();

export async function loginOpenAiWithChatGpt(): Promise<LoginResult> {
  return oauthBrowserFlow.start();
}
