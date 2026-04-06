import * as pty from 'node-pty';
import { waitForPortRelease, stripAnsi } from '@accomplish_ai/agent-core';
import { getLogCollector } from '../logging';
import {
  type LoginResult,
  getOpenCodeCommandContext,
  spawnOAuthPty,
  tryOpenExternal,
  buildOAuthExitError,
} from './auth-browser-pty';

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

    const ctx = await getOpenCodeCommandContext();
    const proc = spawnOAuthPty(ctx);

    return new Promise((resolve, reject) => {
      let openedUrl: string | undefined;
      let hasSelectedProvider = false;
      let hasSelectedLoginMethod = false;
      let buffer = '';

      this.activePty = proc;

      const cleanup = () => {
        this.activePty = null;
      };

      proc.onData((data) => {
        const clean = stripAnsi(data);
        buffer += clean;
        if (buffer.length > 20_000) {
          buffer = buffer.slice(-20_000);
        }

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
        if (match?.[1] && !openedUrl) {
          openedUrl = match[1];
          void tryOpenExternal(match[1], undefined);
        }
      });

      proc.onExit(({ exitCode, signal }) => {
        cleanup();
        if (exitCode === 0) {
          resolve({ openedUrl });
          return;
        }
        reject(buildOAuthExitError(buffer, exitCode, signal));
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
    if (this.isDisposed) {
      return;
    }

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

export async function loginOpenAiWithChatGpt(): Promise<LoginResult> {
  return oauthBrowserFlow.start();
}

export { AuthLoginError } from './auth-login-error';
export { SlackMcpOAuthFlow, slackMcpOAuthFlow, loginSlackMcp, logoutSlackMcp } from './slack-auth';
