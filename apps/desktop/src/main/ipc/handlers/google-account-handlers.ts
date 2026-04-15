/**
 * IPC handlers for Google Workspace multi-account management.
 */
import type { IpcMainInvokeEvent } from 'electron';
import type { GoogleAccount } from '@accomplish_ai/agent-core/common';
import type { AccountManager } from '../../google-accounts/account-manager.js';
import type { TokenManager } from '../../google-accounts/token-manager.js';
import type { startGoogleOAuth, cancelGoogleOAuth } from '../../google-accounts/google-auth.js';
import { handle } from './utils.js';

type GoogleAuthFn = typeof startGoogleOAuth;
type CancelGoogleOAuthFn = typeof cancelGoogleOAuth;

export function registerGoogleAccountHandlers(
  accountManager: AccountManager,
  tokenManager: TokenManager,
  googleAuth: GoogleAuthFn,
  cancelGoogleOAuthFn: CancelGoogleOAuthFn,
): void {
  handle('gws:accounts:list', async (): Promise<GoogleAccount[]> => {
    return accountManager.listAccounts();
  });

  handle(
    'gws:accounts:start-auth',
    async (
      _event: IpcMainInvokeEvent,
      label: string,
    ): Promise<{ state: string; authUrl: string }> => {
      const { state, authUrl, waitForCallback } = await googleAuth(label);

      // Wait for the OAuth callback in the background and register the account when resolved
      waitForCallback()
        .then((result) => {
          const now = new Date().toISOString();
          try {
            accountManager.addAccount(
              {
                googleAccountId: result.googleAccountId,
                email: result.email,
                displayName: result.displayName,
                pictureUrl: result.pictureUrl,
                label,
                connectedAt: now,
              },
              result.token,
            );
          } catch (err) {
            if (err instanceof Error && err.message === 'Account already connected') {
              // Reconnect: upsert the new token so the credential is refreshed
              try {
                accountManager.updateAccountToken(result.googleAccountId, result.token, now);
              } catch {
                // Storage error — silently ignore
                return;
              }
            } else {
              // Unexpected error (e.g. label collision, storage failure) — silently ignore
              return;
            }
          }
          tokenManager.scheduleRefresh(result.googleAccountId, result.token.expiresAt);
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
      // Account registration is handled automatically by the background waitForCallback()
      // started in gws:accounts:start-auth when the local HTTP server receives the callback.
      // This channel is kept for API compatibility but the normal flow does not call it.
      throw new Error(
        'This flow is handled automatically by the start-auth callback. No action needed.',
      );
    },
  );

  handle('gws:accounts:remove', async (_event: IpcMainInvokeEvent, id: string): Promise<void> => {
    accountManager.removeAccount(id);
    tokenManager.cancelRefresh(id);
  });

  handle(
    'gws:accounts:update-label',
    async (_event: IpcMainInvokeEvent, id: string, label: string): Promise<void> => {
      accountManager.updateAccountLabel(id, label);
    },
  );

  handle(
    'gws:accounts:cancel-auth',
    async (_event: IpcMainInvokeEvent, state: string): Promise<void> => {
      cancelGoogleOAuthFn(state);
    },
  );
}
