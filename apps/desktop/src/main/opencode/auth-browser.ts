import * as pty from 'node-pty';
import { app, shell } from 'electron';
import { getOpenCodeCliPath } from './electron-options';
import { generateOpenCodeConfig } from './config-generator';
import { isOpenCodeCliInstallError, INSTALL_ERROR_MESSAGE } from './cli-error-utils';
import { getLogCollector } from '../logging';
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

interface OpenCodeCommandContext {
  command: string;
  baseArgs: string[];
  env: Record<string, string>;
  safeCwd: string;
}

export class OAuthBrowserFlow {
  private activePty: pty.IPty | null = null;
  private isDisposed = false;

  isInProgress(): boolean {
    return this.activePty !== null && !this.isDisposed;
  }

  async start(): Promise<LoginResult> {
    if (this.isInProgress()) {
      try {
        const l = getLogCollector();
        if (l?.log) {
          l.log(
            'INFO',
            'opencode',
            '[OAuthBrowserFlow] Cancelling previous flow before starting new one',
          );
        }
      } catch (_e) {
        /* best-effort logging */
      }
      await this.cancel();
      try {
        await waitForPortRelease(1455, 2000);
        try {
          const l = getLogCollector();
          if (l?.log) {
            l.log('INFO', 'opencode', '[OAuthBrowserFlow] Port 1455 released');
          }
        } catch (_e) {
          /* best-effort logging */
        }
      } catch {
        try {
          const l = getLogCollector();
          if (l?.log) {
            l.log('WARN', 'opencode', '[OAuthBrowserFlow] Port 1455 still in use after 2000ms');
          }
        } catch (_e) {
          /* best-effort logging */
        }
      }
    }

    const { command, baseArgs, env, safeCwd } = await getOpenCodeCommandContext();
    const allArgs = [...baseArgs, 'auth', 'login'];

    const quoted = [command, ...allArgs].map((arg) => quoteForShell(arg)).join(' ');

    const fullCommand = quoted;
    const shellCmd = getPlatformShell(app.isPackaged);
    const shellArgs = getShellArgs(fullCommand);

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
          // intentionally empty
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

        // Detect known CLI installation error patterns and surface a friendly message
        if (isOpenCodeCliInstallError(buffer)) {
          getLogCollector().logEnv('WARN', '[Auth] CLI install error detected', {
            // Redact URLs and potential tokens before logging
            tail: buffer
              .slice(-200)
              .replace(/https?:\/\/\S+/gi, '[URL]')
              .replace(/[A-Za-z0-9_-]{30,}/g, '[REDACTED]'),
          });
          reject(new Error(INSTALL_ERROR_MESSAGE));
          return;
        }

        const tail = buffer.trim().split('\n').slice(-15).join('\n');
        const redacted = tail
          .replace(/https?:\/\/\S+/g, '[url]')
          .replace(/sk-(?:ant-|or-)?[A-Za-z0-9_-]+/g, 'sk-[redacted]');
        reject(
          new Error(
            `OpenCode auth login failed (exit ${exitCode}, signal ${signal ?? 'none'})` +
              (redacted ? `\n\nOutput:\n${redacted}` : ''),
          ),
        );
      });
    });
  }

  async cancel(): Promise<void> {
    if (!this.activePty) {
      try {
        const l = getLogCollector();
        if (l?.log) {
          l.log('INFO', 'opencode', '[OAuthBrowserFlow] No active flow to cancel');
        }
      } catch (_e) {
        /* best-effort logging */
      }
      return;
    }

    try {
      const l = getLogCollector();
      if (l?.log) {
        l.log('INFO', 'opencode', '[OAuthBrowserFlow] Cancelling active OAuth flow');
      }
    } catch (_e) {
      /* best-effort logging */
    }

    const ptyProcess = this.activePty;

    ptyProcess.write('\x03');

    if (process.platform === 'win32') {
      await this.delay(100);
      ptyProcess.write('Y\n');
    }

    const gracefulExited = await this.waitForExit(ptyProcess, 1000);

    if (!gracefulExited && this.activePty === ptyProcess) {
      try {
        const l = getLogCollector();
        if (l?.log) {
          l.log('INFO', 'opencode', '[OAuthBrowserFlow] Force killing after graceful timeout');
        }
      } catch (_e) {
        /* best-effort logging */
      }
      try {
        ptyProcess.kill();
      } catch (err) {
        try {
          const l = getLogCollector();
          if (l?.log) {
            l.log('WARN', 'opencode', '[OAuthBrowserFlow] Error during force kill', {
              err: String(err),
            });
          }
        } catch (_e) {
          /* best-effort logging */
        }
      }
    }

    this.activePty = null;
  }

  dispose(): void {
    if (this.isDisposed) return;

    try {
      const l = getLogCollector();
      if (l?.log) {
        l.log('INFO', 'opencode', '[OAuthBrowserFlow] Disposing');
      }
    } catch (_e) {
      /* best-effort logging */
    }
    this.isDisposed = true;

    if (this.activePty) {
      try {
        this.activePty.kill();
      } catch (err) {
        try {
          const l = getLogCollector();
          if (l?.log) {
            l.log('WARN', 'opencode', '[OAuthBrowserFlow] Error killing PTY during dispose', {
              err: String(err),
            });
          }
        } catch (_e) {
          /* best-effort logging */
        }
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

async function getOpenCodeCommandContext(): Promise<OpenCodeCommandContext> {
  await generateOpenCodeConfig();

  const { command, args: baseArgs } = getOpenCodeCliPath();
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }

  return {
    command,
    baseArgs,
    env,
    safeCwd: app.getPath('temp'),
  };
}

export async function loginOpenAiWithChatGpt(): Promise<LoginResult> {
  return oauthBrowserFlow.start();
}

export { AuthLoginError } from './auth-login-error';
export { SlackMcpOAuthFlow, slackMcpOAuthFlow, loginSlackMcp, logoutSlackMcp } from './slack-auth';
