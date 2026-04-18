/**
 * GoogleAccountService — owns the `google_accounts` table and per-account
 * OAuth token lifecycle (refresh timers, secure-storage token blobs).
 *
 * Milestone 4 of the daemon-only-SQLite migration
 * (plan: /Users/yanai/.claude/plans/squishy-exploring-hamster.md).
 *
 * Ports `AccountManager` + `TokenManager` from
 * `apps/desktop/src/main/google-accounts/*.ts` verbatim. The OAuth
 * loopback itself stays in Electron main (it needs `shell.openExternal`
 * and a local HTTP server bound to `127.0.0.1`), so:
 *
 *   - Main drives the browser flow, fetches userinfo + token.
 *   - On success main calls `gwsAccount.add` — the daemon writes the DB
 *     row, stores the token under `gws:token:<id>`, and schedules the
 *     refresh timer.
 *   - Every status transition (`connected` → `expired` on invalid_grant,
 *     timer-driven refresh success → `connected`) emits a
 *     `gwsAccount.statusChanged` notification; desktop forwards it to
 *     the renderer via the usual pipe.
 *
 * The refresh token never crosses the IPC boundary. `gwsAccount.getToken`
 * returns only `{ accessToken, scopes, expiresAt }` so main can mint
 * manifest entries for child OpenCode processes without ever seeing a
 * refresh token. (The plan reviewer called this out explicitly as
 * decision #3 in open questions §9.)
 */
import { EventEmitter } from 'node:events';
import type { Database } from 'better-sqlite3';
import type { StorageAPI } from '@accomplish_ai/agent-core';
import type {
  GoogleAccount,
  GoogleAccountStatus,
  GoogleAccountToken,
  GwsAccountAddInput,
  GwsAccountStatusChangedPayload,
  GwsAccountTokenResult,
} from '@accomplish_ai/agent-core';

/** Refresh 10 minutes before the access token's actual expiry. */
const TOKEN_REFRESH_MARGIN_MS = 10 * 60 * 1000;
const TRANSIENT_RETRY_DELAY_MS = 60 * 1000;
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** SecureStorage key for a given Google account's token blob. */
const tokenKey = (accountId: string): string => `gws:token:${accountId}`;

interface GoogleAccountRow {
  google_account_id: string;
  email: string;
  display_name: string;
  picture_url: string | null;
  label: string;
  status: GoogleAccountStatus;
  connected_at: string;
  last_refreshed_at: string | null;
}

export const GWS_ACCOUNT_STATUS_CHANGED = 'gwsAccount.statusChanged' as const;

export class GoogleAccountService extends EventEmitter {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly googleClientId: string;

  constructor(
    private readonly db: Database,
    private readonly storage: StorageAPI,
  ) {
    super();
    // The refresh flow needs a Google OAuth `client_id`. Pre-M4 this was
    // read in the desktop `TokenManager` via `process.env.GOOGLE_CLIENT_ID`.
    // The daemon inherits the Electron process env when it's a fork, and
    // receives explicit env overrides when spawned from a packaged build.
    this.googleClientId = process.env.GOOGLE_CLIENT_ID ?? '';
  }

  /** Crash-recovery bootstrap: on daemon startup, rebuild refresh timers
   *  for every `status = 'connected'` account whose stored token is still
   *  parseable. Idempotent — safe to call on every init. */
  startAllTimers(): void {
    for (const account of this.list()) {
      if (account.status !== 'connected') {
        continue;
      }
      const raw = this.storage.get(tokenKey(account.googleAccountId));
      if (!raw) {
        continue;
      }
      try {
        const token = JSON.parse(raw) as GoogleAccountToken;
        this.scheduleRefresh(account.googleAccountId, token.expiresAt);
      } catch {
        // Malformed stored token — skip; next explicit refresh/reconnect
        // will overwrite it.
      }
    }
  }

  stopAllTimers(): void {
    for (const [, timer] of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  // ─── Account CRUD ─────────────────────────────────────────────────────

  list(): GoogleAccount[] {
    const rows = this.db
      .prepare('SELECT * FROM google_accounts ORDER BY connected_at ASC')
      .all() as GoogleAccountRow[];
    return rows.map((row) => ({
      googleAccountId: row.google_account_id,
      email: row.email,
      displayName: row.display_name,
      pictureUrl: row.picture_url,
      label: row.label,
      status: row.status,
      connectedAt: row.connected_at,
      lastRefreshedAt: row.last_refreshed_at,
    }));
  }

  /** Add a fresh-connected account OR refresh an existing one's token
   *  (pre-M4 `AccountManager.addAccount` threw on duplicate ID — we keep
   *  that exact behavior so the desktop IPC's fall-through to
   *  `updateAccountToken` still works via the existing RPC call-shape). */
  add(input: GwsAccountAddInput): void {
    if (this.isDuplicate(input.googleAccountId)) {
      throw new Error('Account already connected');
    }
    if (this.isDuplicateLabel(input.label)) {
      throw new Error('Label already in use');
    }

    this.db
      .prepare(
        `INSERT INTO google_accounts
          (google_account_id, email, display_name, picture_url, label, status, connected_at, last_refreshed_at)
         VALUES (?, ?, ?, ?, ?, 'connected', ?, NULL)`,
      )
      .run(
        input.googleAccountId,
        input.email,
        input.displayName,
        input.pictureUrl,
        input.label,
        input.connectedAt,
      );

    // Compensate: remove the DB row if the secure-storage write fails,
    // so the two stores never diverge on a partial failure.
    try {
      this.storage.set(tokenKey(input.googleAccountId), JSON.stringify(input.token));
    } catch (err) {
      this.db
        .prepare('DELETE FROM google_accounts WHERE google_account_id = ?')
        .run(input.googleAccountId);
      throw err;
    }

    // Schedule the first refresh — pre-M4 this was done by the desktop
    // IPC handler separately; bundling it here keeps the invariant that
    // every `status = 'connected'` row has a live timer.
    this.scheduleRefresh(input.googleAccountId, input.token.expiresAt);
  }

  remove(googleAccountId: string): void {
    const previous = this.storage.get(tokenKey(googleAccountId)) ?? '';
    this.storage.set(tokenKey(googleAccountId), '');
    try {
      this.db
        .prepare('DELETE FROM google_accounts WHERE google_account_id = ?')
        .run(googleAccountId);
    } catch (err) {
      // DB delete failed — restore the token to stay in sync
      this.storage.set(tokenKey(googleAccountId), previous);
      throw err;
    }
    this.cancelRefresh(googleAccountId);
  }

  updateToken(googleAccountId: string, token: GoogleAccountToken, connectedAt: string): void {
    this.storage.set(tokenKey(googleAccountId), JSON.stringify(token));
    this.db
      .prepare(
        "UPDATE google_accounts SET status = 'connected', connected_at = ? WHERE google_account_id = ?",
      )
      .run(connectedAt, googleAccountId);
    this.scheduleRefresh(googleAccountId, token.expiresAt);
    this.emitStatus(googleAccountId, 'connected');
  }

  updateLabel(googleAccountId: string, label: string): void {
    if (this.isDuplicateLabel(label, googleAccountId)) {
      throw new Error('Label already in use');
    }
    this.db
      .prepare('UPDATE google_accounts SET label = ? WHERE google_account_id = ?')
      .run(label, googleAccountId);
  }

  /** Returns only the access-token fields main needs. The refresh token
   *  stays daemon-side — exposing it over IPC would widen the attack
   *  surface for no gain (main never does the refresh itself). */
  getToken(googleAccountId: string): GwsAccountTokenResult | null {
    const raw = this.storage.get(tokenKey(googleAccountId));
    if (!raw || raw === '') {
      return null;
    }
    try {
      const token = JSON.parse(raw) as GoogleAccountToken;
      return {
        accessToken: token.accessToken,
        scopes: token.scopes,
        expiresAt: token.expiresAt,
      };
    } catch {
      return null;
    }
  }

  // ─── Token refresh timer machinery ────────────────────────────────────

  scheduleRefresh(accountId: string, expiresAt: number): void {
    this.cancelRefresh(accountId);
    const delay = Math.max(expiresAt - Date.now() - TOKEN_REFRESH_MARGIN_MS, 0);
    const timer = setTimeout(() => void this.refreshToken(accountId), delay);
    this.timers.set(accountId, timer);
  }

  cancelRefresh(accountId: string): void {
    const timer = this.timers.get(accountId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(accountId);
    }
  }

  /** Manual refresh (called by `gwsAccount.refreshNow` RPC). Same logic
   *  as the timer callback; exposed so desktop can re-sync after the
   *  user reconnects a previously-expired account. */
  async refreshNow(accountId: string): Promise<void> {
    await this.refreshToken(accountId);
  }

  private async refreshToken(accountId: string): Promise<void> {
    const raw = this.storage.get(tokenKey(accountId));
    if (!raw) {
      return;
    }

    let parsed: { refreshToken: string; expiresAt: number; scopes: string[] };
    try {
      parsed = JSON.parse(raw) as { refreshToken: string; expiresAt: number; scopes: string[] };
    } catch {
      return;
    }

    try {
      const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.googleClientId,
          refresh_token: parsed.refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
      });

      if (res.status === 401 || res.status === 403) {
        this.handlePermanentFailure(accountId);
        return;
      }

      const data = (await res.json()) as {
        access_token?: string;
        expires_in?: number;
        error?: string;
      };

      if (!res.ok || data.error === 'invalid_grant' || !data.access_token) {
        if (data.error === 'invalid_grant') {
          this.handlePermanentFailure(accountId);
          return;
        }
        // Transient error — retry in 60s
        const timer = setTimeout(() => void this.refreshToken(accountId), TRANSIENT_RETRY_DELAY_MS);
        this.timers.set(accountId, timer);
        return;
      }

      const newExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
      const newToken: GoogleAccountToken = {
        accessToken: data.access_token,
        refreshToken: parsed.refreshToken,
        expiresAt: newExpiresAt,
        scopes: parsed.scopes,
      };

      // Same-string guard: abort if the stored token changed while we
      // were in flight (user removed or reconnected the account).
      const currentRaw = this.storage.get(tokenKey(accountId));
      if (!currentRaw || currentRaw !== raw) {
        return;
      }

      this.storage.set(tokenKey(accountId), JSON.stringify(newToken));
      this.db
        .prepare('UPDATE google_accounts SET last_refreshed_at = ? WHERE google_account_id = ?')
        .run(new Date().toISOString(), accountId);

      this.scheduleRefresh(accountId, newExpiresAt);
    } catch {
      // Network/transient error — retry in 60s
      const timer = setTimeout(() => void this.refreshToken(accountId), TRANSIENT_RETRY_DELAY_MS);
      this.timers.set(accountId, timer);
    }
  }

  private handlePermanentFailure(accountId: string): void {
    this.cancelRefresh(accountId);
    this.db
      .prepare("UPDATE google_accounts SET status = 'expired' WHERE google_account_id = ?")
      .run(accountId);
    this.emitStatus(accountId, 'expired');
  }

  private emitStatus(googleAccountId: string, status: GoogleAccountStatus): void {
    this.emit(GWS_ACCOUNT_STATUS_CHANGED, {
      googleAccountId,
      status,
    } satisfies GwsAccountStatusChangedPayload);
  }

  // ─── Duplicate checks ─────────────────────────────────────────────────

  private isDuplicate(googleAccountId: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM google_accounts WHERE google_account_id = ?')
      .get(googleAccountId);
    return row !== undefined;
  }

  private isDuplicateLabel(label: string, excludeGoogleAccountId?: string): boolean {
    if (excludeGoogleAccountId) {
      const row = this.db
        .prepare(
          'SELECT 1 FROM google_accounts WHERE LOWER(label) = LOWER(?) AND google_account_id != ?',
        )
        .get(label, excludeGoogleAccountId);
      return row !== undefined;
    }
    const row = this.db
      .prepare('SELECT 1 FROM google_accounts WHERE LOWER(label) = LOWER(?)')
      .get(label);
    return row !== undefined;
  }
}
