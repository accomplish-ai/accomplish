/**
 * PTY lifecycle helpers for OAuthBrowserFlow.
 * Extracted to keep auth-browser.ts under 200 lines.
 */
import * as pty from 'node-pty';
import { getLogCollector } from '../logging';

function tryLog(level: 'INFO' | 'WARN', msg: string, data?: Record<string, string>): void {
  try {
    const l = getLogCollector();
    if (l?.log) {
      l.log(level, 'opencode', msg, data);
    }
  } catch (_e) {
    /* best-effort logging */
  }
}

export async function waitForPtyExit(proc: pty.IPty, timeoutMs: number): Promise<boolean> {
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

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function cancelPtyProcess(
  ptyProcess: pty.IPty,
  activePtyRef: { current: pty.IPty | null },
): Promise<void> {
  tryLog('INFO', '[OAuthBrowserFlow] Cancelling active OAuth flow');

  ptyProcess.write('\x03');

  if (process.platform === 'win32') {
    await delay(100);
    ptyProcess.write('Y\n');
  }

  const gracefulExited = await waitForPtyExit(ptyProcess, 1000);

  if (!gracefulExited && activePtyRef.current === ptyProcess) {
    tryLog('INFO', '[OAuthBrowserFlow] Force killing after graceful timeout');
    try {
      ptyProcess.kill();
    } catch (err) {
      tryLog('WARN', '[OAuthBrowserFlow] Error during force kill', { err: String(err) });
    }
  }

  activePtyRef.current = null;
}

export function disposePtyProcess(
  activePty: pty.IPty | null,
  setActivePty: (v: null) => void,
): void {
  tryLog('INFO', '[OAuthBrowserFlow] Disposing');

  if (activePty) {
    try {
      activePty.kill();
    } catch (err) {
      tryLog('WARN', '[OAuthBrowserFlow] Error killing PTY during dispose', { err: String(err) });
    }
    setActivePty(null);
  }
}
