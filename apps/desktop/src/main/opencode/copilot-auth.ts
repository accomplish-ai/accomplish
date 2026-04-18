/**
 * GitHub Copilot device OAuth flow handler for the main process.
 *
 * Runs the device-code grant entirely in Node.js (no PTY needed):
 *   1. POST /login/device/code  → get device_code + user_code
 *   2. Open browser to verification_uri
 *   3. Poll /login/oauth/access_token until authorized (background)
 *   4. Persist tokens via setCopilotOAuthTokens (writes auth.json)
 */

import { shell } from 'electron';
import {
  requestCopilotDeviceCode,
  pollCopilotDeviceToken,
  setCopilotOAuthTokens,
  clearCopilotOAuth,
  getCopilotOAuthStatus,
  type CopilotDeviceCodeResponse,
} from '@accomplish_ai/agent-core/desktop-main';
import { getLogCollector } from '../logging';

export interface CopilotLoginResult {
  ok: boolean;
  userCode?: string;
  verificationUri?: string;
  expiresIn?: number;
}

let activeLoginAbortController: AbortController | null = null;

/**
 * Initiate the GitHub Copilot device OAuth flow.
 * Opens the user's browser and returns immediately with the user_code to display in the UI.
 * Token polling continues in the background and persists tokens on success.
 */
export async function loginGithubCopilot(): Promise<CopilotLoginResult> {
  // Cancel any in-progress login
  if (activeLoginAbortController) {
    activeLoginAbortController.abort();
    activeLoginAbortController = null;
  }

  const abortController = new AbortController();
  activeLoginAbortController = abortController;

  const log = getLogCollector();

  try {
    log.log?.('INFO', 'opencode', '[CopilotAuth] Starting device code flow');

    const deviceCode: CopilotDeviceCodeResponse = await requestCopilotDeviceCode();

    log.log?.('INFO', 'opencode', '[CopilotAuth] Device code received');

    // Open the browser for the user to enter the code (non-fatal: user can open manually)
    try {
      await shell.openExternal(deviceCode.verification_uri);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.log?.('WARN', 'opencode', `[CopilotAuth] Failed to open browser: ${msg}`);
    }

    // Poll for the token in the background (fire-and-forget)
    void (async () => {
      try {
        const tokenResponse = await pollCopilotDeviceToken({
          deviceCode: deviceCode.device_code,
          interval: deviceCode.interval,
          expiresIn: deviceCode.expires_in,
          onPoll: () => {
            if (abortController.signal.aborted) {
              throw new Error('Login cancelled');
            }
            log.log?.('INFO', 'opencode', '[CopilotAuth] Polling for token...');
          },
        });

        if (!tokenResponse.access_token) {
          throw new Error('No access token received from GitHub');
        }

        // Persist to OpenCode-compatible auth.json
        setCopilotOAuthTokens({
          accessToken: tokenResponse.access_token,
          expiresAt: Date.now() + 8 * 60 * 60 * 1000, // GitHub tokens typically valid 8h
        });

        log.log?.('INFO', 'opencode', '[CopilotAuth] Login successful, tokens saved');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.log?.('WARN', 'opencode', `[CopilotAuth] Background poll failed: ${msg}`);
        // Persist the error into auth state so the renderer's getCopilotOAuthStatus poll
        // can surface it immediately instead of waiting for a generic timeout.
        try {
          clearCopilotOAuth();
          // Write a sentinel error entry so the renderer can distinguish failure from pending.
          const fs = await import('fs');
          const os = await import('os');
          const path = await import('path');
          const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
          const authPath = path.join(dataHome, 'opencode', 'auth.json');
          let auth: Record<string, unknown> = {};
          try {
            auth = JSON.parse(fs.readFileSync(authPath, 'utf8')) as Record<string, unknown>;
          } catch {
            // ignore missing/invalid file
          }
          auth['github-copilot-error'] = { message: msg, timestamp: Date.now() };
          fs.mkdirSync(path.dirname(authPath), { recursive: true });
          fs.writeFileSync(authPath, JSON.stringify(auth, null, 2), 'utf8');
        } catch {
          // best-effort; don't mask the original error
        }
      } finally {
        if (activeLoginAbortController === abortController) {
          activeLoginAbortController = null;
        }
      }
    })();

    // Return immediately so the renderer can display the user code
    return {
      ok: true,
      userCode: deviceCode.user_code,
      verificationUri: deviceCode.verification_uri,
      expiresIn: deviceCode.expires_in,
    };
  } catch (err) {
    if (activeLoginAbortController === abortController) {
      activeLoginAbortController = null;
    }
    const msg = err instanceof Error ? err.message : String(err);
    log.log?.('WARN', 'opencode', `[CopilotAuth] Login failed: ${msg}`);
    throw err;
  }
}

export function logoutGithubCopilot(): void {
  clearCopilotOAuth();
}

export { getCopilotOAuthStatus };
