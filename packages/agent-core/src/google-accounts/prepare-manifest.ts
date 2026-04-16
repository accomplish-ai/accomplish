/**
 * `prepareGwsManifest` — daemon-portable GWS manifest generator.
 *
 * Reads connected Google accounts from the shared SQLite `google_accounts`
 * table, pulls each account's OAuth token from SecureStorage (via StorageAPI),
 * lazily refreshes tokens that are within `TOKEN_REFRESH_MARGIN_MS` of
 * expiry, writes per-account token files + a manifest to userDataPath, and
 * returns the manifest path + summary for injection into `opencode.json`.
 *
 * Pure function, no class, no singleton: callable from both the daemon's
 * `resolveTaskConfig` step and any other context that has the dependencies.
 *
 * Why this lives here and not inside a class (per review):
 *   - Daemon is the new caller; it only reads state and does occasional
 *     lazy refreshes. The long-lived `TokenManager` refresh loop + the DB
 *     CRUD patterns in `AccountManager` stay in desktop for now.
 *   - A free function with explicit dependencies is the minimum surface
 *     needed to fix the task-config bypass without introducing a
 *     cross-process class-ownership question.
 *
 * The lazy-refresh is a best-effort belt-and-braces for the edge case where
 * a task starts from a daemon-only source (scheduler, WhatsApp) while the
 * desktop `TokenManager` isn't attached. On refresh failure we fall back
 * to the previously-stored (possibly-stale) token rather than skipping
 * the account — the stale token may still work for the duration of the
 * task, and persistent failure is handled by the desktop `TokenManager`
 * on its own schedule (which eventually flips the account status to
 * `expired` in `google_accounts`).
 *
 * An account IS omitted from the manifest entry list (but still appears
 * in the returned summary) only when it has no stored token at all, or
 * when writing its per-account token file fails — i.e. when we have
 * nothing to pass to the GWS MCP servers.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Database } from 'better-sqlite3';
import type { StorageAPI } from '../types/storage.js';
import type {
  GoogleAccount,
  GoogleAccountStatus,
  GoogleAccountToken,
} from '../common/types/google-account.js';
import { gwsTokenKey, TOKEN_REFRESH_MARGIN_MS, GOOGLE_TOKEN_ENDPOINT } from './constants.js';
import { atomicWriteFile } from '../internal/classes/secure-storage-crypto.js';

export type LogFn = (
  level: 'INFO' | 'WARN' | 'ERROR',
  message: string,
  data?: Record<string, unknown>,
) => void;

export interface GwsAccountEntry {
  googleAccountId: string;
  label: string;
  email: string;
  tokenFilePath: string;
}

export interface GwsAccountSummary {
  label: string;
  email: string;
  status: GoogleAccountStatus;
}

export interface PrepareGwsManifestResult {
  manifestPath: string;
  summary: GwsAccountSummary[];
}

interface ConnectedAccountRow {
  google_account_id: string;
  email: string;
  display_name: string;
  picture_url: string | null;
  label: string;
  status: GoogleAccountStatus;
  connected_at: string;
  last_refreshed_at: string | null;
}

/**
 * Main entry point. Returns `undefined` when there are no connected accounts —
 * callers should treat that as "don't register GWS MCP servers" rather than
 * a failure. Returns a result with manifest path + summary on success; any
 * per-account failure is logged and that account is skipped from the manifest
 * but does not fail the whole call.
 */
export async function prepareGwsManifest(
  storage: StorageAPI,
  db: Database,
  userDataPath: string,
  log: LogFn,
): Promise<PrepareGwsManifestResult | undefined> {
  let rows: ConnectedAccountRow[];
  try {
    rows = db
      .prepare(`SELECT * FROM google_accounts WHERE status = 'connected' ORDER BY connected_at ASC`)
      .all() as ConnectedAccountRow[];
  } catch (err) {
    // Pre-migration DB (v028 not yet applied) or transient DB error — treat
    // as "no accounts connected", don't fail the task.
    log('WARN', '[prepareGwsManifest] google_accounts read failed; skipping GWS step', {
      err: String(err),
    });
    return undefined;
  }

  if (rows.length === 0) {
    return undefined;
  }

  const accounts: GoogleAccount[] = rows.map(rowToAccount);

  const tokenDir = path.join(userDataPath, 'gws-tokens');
  fs.mkdirSync(tokenDir, { recursive: true });
  try {
    fs.chmodSync(tokenDir, 0o700);
  } catch {
    // Non-critical on platforms that don't support chmod (Windows).
  }

  const entries: GwsAccountEntry[] = [];
  const summary: GwsAccountSummary[] = [];

  for (const account of accounts) {
    const token = await readOrRefreshToken(storage, db, account.googleAccountId, log);
    if (!token) {
      // Refresh failed or account had no token — skip from manifest but
      // include in summary so the agent still sees the account exists.
      summary.push({ label: account.label, email: account.email, status: account.status });
      continue;
    }

    const tokenFilePath = path.join(tokenDir, `${account.googleAccountId}.json`);
    try {
      atomicWriteFile(tokenFilePath, JSON.stringify(token));
      try {
        fs.chmodSync(tokenFilePath, 0o600);
      } catch {
        // chmod is best-effort (Windows, etc.)
      }
    } catch (err) {
      log('WARN', '[prepareGwsManifest] failed to write per-account token file', {
        googleAccountId: account.googleAccountId,
        err: String(err),
      });
      summary.push({ label: account.label, email: account.email, status: account.status });
      continue;
    }

    entries.push({
      googleAccountId: account.googleAccountId,
      label: account.label,
      email: account.email,
      tokenFilePath,
    });
    summary.push({ label: account.label, email: account.email, status: account.status });
  }

  if (entries.length === 0) {
    // Every account's token read failed. No manifest makes sense, but
    // return the summary so the agent still sees account presence.
    return { manifestPath: '', summary };
  }

  const manifestDir = path.join(userDataPath, 'gws-manifests');
  fs.mkdirSync(manifestDir, { recursive: true });
  const manifestPath = path.join(manifestDir, 'manifest.json');
  try {
    atomicWriteFile(manifestPath, JSON.stringify(entries, null, 2));
    try {
      fs.chmodSync(manifestPath, 0o600);
    } catch {
      // non-critical
    }
  } catch (err) {
    log('ERROR', '[prepareGwsManifest] failed to write manifest', { err: String(err) });
    return { manifestPath: '', summary };
  }

  return { manifestPath, summary };
}

/**
 * Read the stored token for an account; if it's within the refresh margin,
 * attempt an inline refresh using the Google OAuth token endpoint. Returns
 * the freshest available token, or `null` if no usable token exists (caller
 * should skip that account).
 *
 * Writes back to StorageAPI + updates `last_refreshed_at` on successful
 * refresh. On any failure, returns the previously-stored token (even if
 * expired — better to try the task than fail silently).
 */
async function readOrRefreshToken(
  storage: StorageAPI,
  db: Database,
  accountId: string,
  log: LogFn,
): Promise<GoogleAccountToken | null> {
  const raw = storage.get(gwsTokenKey(accountId));
  if (!raw || raw === '') {
    return null;
  }

  let token: GoogleAccountToken;
  try {
    token = JSON.parse(raw) as GoogleAccountToken;
  } catch (err) {
    log('WARN', '[prepareGwsManifest] failed to parse stored token', {
      accountId,
      err: String(err),
    });
    return null;
  }

  const needsRefresh = token.expiresAt - Date.now() < TOKEN_REFRESH_MARGIN_MS;
  if (!needsRefresh) {
    return token;
  }

  if (!token.refreshToken) {
    log('WARN', '[prepareGwsManifest] token near expiry but no refresh token', { accountId });
    return token; // best-effort: return the stale token rather than null
  }

  const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
  if (!clientId) {
    log('WARN', '[prepareGwsManifest] GOOGLE_CLIENT_ID unset; skipping inline refresh', {
      accountId,
    });
    return token;
  }

  try {
    const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        refresh_token: token.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!res.ok) {
      log('WARN', '[prepareGwsManifest] inline refresh non-OK response', {
        accountId,
        status: res.status,
      });
      return token; // return stale; TokenManager (desktop) owns permanent-failure handling
    }

    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };

    if (!data.access_token || data.error) {
      log('WARN', '[prepareGwsManifest] inline refresh returned no access_token', {
        accountId,
        error: data.error,
      });
      return token;
    }

    const newExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
    const refreshed: GoogleAccountToken = {
      accessToken: data.access_token,
      refreshToken: token.refreshToken,
      expiresAt: newExpiresAt,
      scopes: token.scopes,
    };

    // Guard: abort the write if the stored token changed while the fetch was
    // in-flight (e.g. desktop's TokenManager refreshed it first, or user
    // reconnected). Matches desktop TokenManager's behavior.
    const currentRaw = storage.get(gwsTokenKey(accountId));
    if (!currentRaw || currentRaw !== raw) {
      log('INFO', '[prepareGwsManifest] stored token changed during inline refresh; not writing', {
        accountId,
      });
      // Return whatever is currently stored instead — the other writer wrote
      // a presumably-newer token.
      try {
        return currentRaw ? (JSON.parse(currentRaw) as GoogleAccountToken) : refreshed;
      } catch {
        return refreshed;
      }
    }

    storage.set(gwsTokenKey(accountId), JSON.stringify(refreshed));
    try {
      db.prepare(
        'UPDATE google_accounts SET last_refreshed_at = ? WHERE google_account_id = ?',
      ).run(new Date().toISOString(), accountId);
    } catch (err) {
      log('WARN', '[prepareGwsManifest] last_refreshed_at UPDATE failed', {
        accountId,
        err: String(err),
      });
    }

    return refreshed;
  } catch (err) {
    log('WARN', '[prepareGwsManifest] inline refresh network error', {
      accountId,
      err: String(err),
    });
    return token; // return stale, let the task proceed; it may still work
  }
}

function rowToAccount(row: ConnectedAccountRow): GoogleAccount {
  return {
    googleAccountId: row.google_account_id,
    email: row.email,
    displayName: row.display_name,
    pictureUrl: row.picture_url,
    label: row.label,
    status: row.status,
    connectedAt: row.connected_at,
    lastRefreshedAt: row.last_refreshed_at,
  };
}
