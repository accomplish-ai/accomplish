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
import type { IpcMainInvokeEvent } from 'electron';
import type { GoogleAccount } from '@accomplish_ai/agent-core/desktop-main';
import type { startGoogleOAuth, cancelGoogleOAuth } from '../../google-accounts/google-auth.js';
import { handle } from './utils.js';
import { getDaemonClient } from '../../daemon-bootstrap';

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
              } catch {
                // Storage error — silently ignore (matches pre-M4).
              }
            }
            // Any other error path (label collision, storage failure) —
            // also silently ignored to preserve pre-M4 behavior.
          }
        })
        .catch(() => {
          /* OAuth timed out or user cancelled */
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
