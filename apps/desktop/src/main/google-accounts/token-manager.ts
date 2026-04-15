/**
 * Per-account background token refresh scheduler for Google accounts.
 */
import type { BrowserWindow } from 'electron';
import type { GoogleAccount } from '@accomplish_ai/agent-core/common';
import type { StorageAPI } from '@accomplish_ai/agent-core';
import type { Database } from 'better-sqlite3';
import { TOKEN_REFRESH_MARGIN_MS, GOOGLE_TOKEN_ENDPOINT, gwsTokenKey } from './constants.js';
import { getLogCollector } from '../logging/index.js';

const TRANSIENT_RETRY_DELAY_MS = 60 * 1000;

export class TokenManager {
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly storage: StorageAPI,
    private readonly db: Database,
    private mainWindow: BrowserWindow | null,
  ) {}

  setWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  scheduleRefresh(accountId: string, expiresAt: number): void {
    this.cancelRefresh(accountId);
    const delay = Math.max(expiresAt - Date.now() - TOKEN_REFRESH_MARGIN_MS, 0);
    const timer = setTimeout(() => this.refreshToken(accountId), delay);
    this.timers.set(accountId, timer);
  }

  async refreshToken(accountId: string): Promise<void> {
    const raw = this.storage.get(gwsTokenKey(accountId));
    if (!raw) {
      getLogCollector().log('WARN', 'main', 'Token refresh: no token found', { accountId });
      return;
    }

    let parsed: { refreshToken: string; expiresAt: number; scopes: string[] };
    try {
      parsed = JSON.parse(raw) as { refreshToken: string; expiresAt: number; scopes: string[] };
    } catch {
      getLogCollector().log('ERROR', 'main', 'Token refresh: failed to parse stored token', {
        accountId,
      });
      return;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID ?? '';

    try {
      const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          refresh_token: parsed.refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
      });

      if (res.status === 401 || res.status === 403) {
        await this.handlePermanentFailure(accountId);
        return;
      }

      const data = (await res.json()) as {
        access_token?: string;
        expires_in?: number;
        error?: string;
      };

      if (!res.ok || data.error === 'invalid_grant' || !data.access_token) {
        if (data.error === 'invalid_grant') {
          await this.handlePermanentFailure(accountId);
          return;
        }
        // Transient error — retry in 60s
        getLogCollector().log('WARN', 'main', 'Token refresh transient error, will retry', {
          accountId,
          error: data.error,
        });
        const timer = setTimeout(() => this.refreshToken(accountId), TRANSIENT_RETRY_DELAY_MS);
        this.timers.set(accountId, timer);
        return;
      }

      const newExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
      const newToken = {
        accessToken: data.access_token,
        refreshToken: parsed.refreshToken,
        expiresAt: newExpiresAt,
        scopes: parsed.scopes,
      };

      // Guard: abort if the stored token changed while the network call was in flight
      // (e.g. user removed the account or reconnected with a fresh token)
      const currentRaw = this.storage.get(gwsTokenKey(accountId));
      if (!currentRaw || currentRaw !== raw) {
        getLogCollector().log(
          'WARN',
          'main',
          'Token refresh: stored token changed during refresh, aborting write',
          { accountId },
        );
        return;
      }

      this.storage.set(gwsTokenKey(accountId), JSON.stringify(newToken));
      this.db
        .prepare('UPDATE google_accounts SET last_refreshed_at = ? WHERE google_account_id = ?')
        .run(new Date().toISOString(), accountId);

      this.scheduleRefresh(accountId, newExpiresAt);

      getLogCollector().log('INFO', 'main', 'Google account token refreshed', { accountId });
    } catch (err) {
      // Network/transient error — retry in 60s
      getLogCollector().log('WARN', 'main', 'Token refresh network error, will retry', {
        accountId,
        error: String(err),
      });
      const timer = setTimeout(() => this.refreshToken(accountId), TRANSIENT_RETRY_DELAY_MS);
      this.timers.set(accountId, timer);
    }
  }

  cancelRefresh(accountId: string): void {
    const timer = this.timers.get(accountId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(accountId);
    }
  }

  startAllTimers(accounts: GoogleAccount[]): void {
    for (const account of accounts) {
      if (account.status !== 'connected') {
        continue;
      }
      const raw = this.storage.get(gwsTokenKey(account.googleAccountId));
      if (!raw) {
        continue;
      }
      try {
        const token = JSON.parse(raw) as { expiresAt: number };
        this.scheduleRefresh(account.googleAccountId, token.expiresAt);
      } catch {
        getLogCollector().log('WARN', 'main', 'startAllTimers: failed to parse token', {
          accountId: account.googleAccountId,
        });
      }
    }
  }

  private async handlePermanentFailure(accountId: string): Promise<void> {
    this.cancelRefresh(accountId);
    this.db
      .prepare("UPDATE google_accounts SET status = 'expired' WHERE google_account_id = ?")
      .run(accountId);

    if (
      this.mainWindow &&
      !this.mainWindow.isDestroyed() &&
      !this.mainWindow.webContents.isDestroyed()
    ) {
      this.mainWindow.webContents.send('gws:account:status-changed', accountId, 'expired');
    }

    getLogCollector().log('ERROR', 'main', 'Google account token permanently failed', {
      accountId,
      event: 'token-refresh-permanent-failure',
    });
  }
}
