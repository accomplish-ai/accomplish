/**
 * IPC handlers for Google Workspace multi-account management.
 *
 * Milestone 4 of the daemon-only-SQLite migration
 * (plan: /Users/yanai/.claude/plans/squishy-exploring-hamster.md).
 *
 * Pre-M4 these handlers drove a desktop-side `AccountManager` + `TokenManager`
 * pair that owned the `google_accounts` table and the per-account token
 * refresh timers. Both are gone — the daemon's `GoogleAccountService`
 * handles CRUD + refresh; this file is reduced to:
 *   - launching the OAuth loopback (Electron-only),
 *   - handing the resulting account metadata + token to the daemon via
 *     `gwsAccount.add` / `gwsAccount.updateToken`,
 *   - pass-through for label updates, removal, and listing.
 */
import { BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { GoogleAccount } from '@accomplish_ai/agent-core/desktop-main';
import type { startGoogleOAuth, cancelGoogleOAuth } from '../../google-accounts/google-auth.js';
import { handle } from './utils.js';
import { getDaemonClient } from '../../daemon-bootstrap';
import { getLogCollector } from '../../logging';

/**
 * Surface a Google-account OAuth error to every live renderer window on
 * the `gws:account:auth-error` channel. Used by the background
 * `waitForCallback` consumer to break the pre-M5 silent-drop behavior
 * documented in review finding P2.3 — the user had no way to learn the
 * flow had failed (the browser callback page claimed success and the
 * renderer polled `gws:accounts:list` until timeout).
 *
 * Fan-out to every window instead of tracking a single "main" window
 * here — windows can be recreated on macOS `activate`, and the OAuth
 * flow's lifetime may span a `close`/`show` cycle.
 */
function broadcastAuthError(message: string): void {
  try {
    getLogCollector()?.log('WARN', 'main', '[GoogleAccounts] OAuth error surfaced to renderer', {
      message,
    });
  } catch {
    /* best-effort */
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) {
      continue;
    }
    try {
      win.webContents.send('gws:account:auth-error', { message });
    } catch {
      // Window torn down between check and send — safe to skip.
    }
  }
}

type GoogleAuthFn = typeof startGoogleOAuth;
type CancelGoogleOAuthFn = typeof cancelGoogleOAuth;

export function registerGoogleAccountHandlers(
  googleAuth: GoogleAuthFn,
  cancelGoogleOAuthFn: CancelGoogleOAuthFn,
): void {
  handle('gws:accounts:list', async (): Promise<GoogleAccount[]> => {
    return getDaemonClient().call('gwsAccount.list');
  });

  handle(
    'gws:accounts:start-auth',
    async (
      _event: IpcMainInvokeEvent,
      label: string,
    ): Promise<{ state: string; authUrl: string }> => {
      const { state, authUrl, waitForCallback } = await googleAuth(label);

      // Wait for the OAuth callback in the background and register the
      // account with the daemon when resolved. Pre-M4 this inserted into
      // the local DB + scheduled a refresh timer directly; now it's two
      // RPC calls (`gwsAccount.add` happy-path, fall-through to
      // `gwsAccount.updateToken` if the account already exists).
      //
      // M5 review finding P2.3: errors that don't match the
      // "Account already connected" fall-through used to be silently
      // swallowed, including the one Google returns when it omits the
      // refresh token. Any non-reconnect failure now broadcasts to the
      // renderer via `gws:account:auth-error` so the UI can show a
      // toast; timeout/user-cancel on `waitForCallback()` itself stays
      // silent (expected user behavior).
      waitForCallback()
        .then(async (result) => {
          const now = new Date().toISOString();
          const client = getDaemonClient();
          try {
            await client.call('gwsAccount.add', {
              input: {
                googleAccountId: result.googleAccountId,
                email: result.email,
                displayName: result.displayName,
                pictureUrl: result.pictureUrl,
                label,
                connectedAt: now,
                token: result.token,
              },
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('Account already connected')) {
              // Reconnect — daemon updates the stored token + status.
              try {
                await client.call('gwsAccount.updateToken', {
                  googleAccountId: result.googleAccountId,
                  token: result.token,
                  connectedAt: now,
                });
              } catch (updateErr) {
                const updateMsg =
                  updateErr instanceof Error ? updateErr.message : String(updateErr);
                broadcastAuthError(`Failed to update Google account token: ${updateMsg}`);
              }
              return;
            }
            broadcastAuthError(`Google account connection failed: ${msg}`);
          }
        })
        .catch((err: unknown) => {
          // `waitForCallback` rejects on timeout, user cancel, or —
          // post-P2.3 — a missing refresh_token detected during the
          // token exchange. The refresh-token message is targeted so the
          // renderer can show a dedicated toast; other rejections are
          // surfaced with their raw message.
          const msg = err instanceof Error ? err.message : String(err);
          if (msg === 'Google OAuth timed out') {
            return; // User closed the browser or took too long — silent.
          }
          broadcastAuthError(msg);
        });

      return { state, authUrl };
    },
  );

  handle(
    'gws:accounts:complete-auth',
    async (_event: IpcMainInvokeEvent, _state: string, _code: string): Promise<GoogleAccount> => {
      // Account registration is handled automatically by the background
      // waitForCallback() started in gws:accounts:start-auth when the
      // local HTTP server receives the callback. This channel is kept
      // for API compatibility but the normal flow does not call it.
      throw new Error(
        'This flow is handled automatically by the start-auth callback. No action needed.',
      );
    },
  );

  handle('gws:accounts:remove', async (_event: IpcMainInvokeEvent, id: string): Promise<void> => {
    await getDaemonClient().call('gwsAccount.remove', { googleAccountId: id });
  });

  handle(
    'gws:accounts:update-label',
    async (_event: IpcMainInvokeEvent, id: string, label: string): Promise<void> => {
      await getDaemonClient().call('gwsAccount.updateLabel', {
        googleAccountId: id,
        label,
      });
    },
  );

  handle(
    'gws:accounts:cancel-auth',
    async (_event: IpcMainInvokeEvent, state: string): Promise<void> => {
      cancelGoogleOAuthFn(state);
    },
  );
}
