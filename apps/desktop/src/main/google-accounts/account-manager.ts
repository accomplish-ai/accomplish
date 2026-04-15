/**
 * CRUD operations for the google_accounts table and per-account SecureStorage tokens.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Database } from 'better-sqlite3';
import type {
  GoogleAccount,
  GoogleAccountStatus,
  GoogleAccountToken,
} from '@accomplish_ai/agent-core/common';
import type { StorageAPI } from '@accomplish_ai/agent-core';
import { gwsTokenKey } from './constants.js';
import { getLogCollector } from '../logging/index.js';

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

export class AccountManager {
  constructor(
    private readonly db: Database,
    private readonly storage: StorageAPI,
    private readonly userDataPath: string,
  ) {}

  addAccount(
    account: Omit<GoogleAccount, 'status' | 'lastRefreshedAt'>,
    token: GoogleAccountToken,
  ): void {
    if (this.isDuplicate(account.googleAccountId)) {
      throw new Error('Account already connected');
    }
    if (this.isDuplicateLabel(account.label)) {
      throw new Error('Label already in use');
    }

    this.db
      .prepare(
        `INSERT INTO google_accounts
          (google_account_id, email, display_name, picture_url, label, status, connected_at, last_refreshed_at)
         VALUES (?, ?, ?, ?, ?, 'connected', ?, NULL)`,
      )
      .run(
        account.googleAccountId,
        account.email,
        account.displayName,
        account.pictureUrl,
        account.label,
        account.connectedAt,
      );

    // Compensate: delete the DB row if storage.set fails to keep them in sync
    try {
      this.storage.set(gwsTokenKey(account.googleAccountId), JSON.stringify(token));
    } catch (err) {
      this.db
        .prepare('DELETE FROM google_accounts WHERE google_account_id = ?')
        .run(account.googleAccountId);
      throw err;
    }

    getLogCollector().log('INFO', 'main', 'Google account connected', {
      googleAccountId: account.googleAccountId,
    });
  }

  removeAccount(googleAccountId: string): void {
    // Capture the current token so we can restore it if the DB delete fails
    const previousToken = this.storage.get(gwsTokenKey(googleAccountId)) ?? '';
    this.storage.set(gwsTokenKey(googleAccountId), '');
    try {
      this.db
        .prepare('DELETE FROM google_accounts WHERE google_account_id = ?')
        .run(googleAccountId);
    } catch (err) {
      // DB delete failed — restore the token to stay in sync
      this.storage.set(gwsTokenKey(googleAccountId), previousToken);
      throw err;
    }

    getLogCollector().log('INFO', 'main', 'Google account disconnected', { googleAccountId });
  }

  updateAccountToken(
    googleAccountId: string,
    token: GoogleAccountToken,
    connectedAt: string,
  ): void {
    this.storage.set(gwsTokenKey(googleAccountId), JSON.stringify(token));
    this.db
      .prepare(
        "UPDATE google_accounts SET status = 'connected', connected_at = ? WHERE google_account_id = ?",
      )
      .run(connectedAt, googleAccountId);
  }

  listAccounts(): GoogleAccount[] {
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

  getAccountToken(googleAccountId: string): GoogleAccountToken | null {
    const raw = this.storage.get(gwsTokenKey(googleAccountId));
    if (!raw || raw === '') {
      return null;
    }
    try {
      return JSON.parse(raw) as GoogleAccountToken;
    } catch {
      return null;
    }
  }

  updateAccountStatus(googleAccountId: string, status: GoogleAccountStatus): void {
    this.db
      .prepare('UPDATE google_accounts SET status = ? WHERE google_account_id = ?')
      .run(status, googleAccountId);
  }

  updateAccountLabel(googleAccountId: string, label: string): void {
    if (this.isDuplicateLabel(label, googleAccountId)) {
      throw new Error('Label already in use');
    }
    this.db
      .prepare('UPDATE google_accounts SET label = ? WHERE google_account_id = ?')
      .run(label, googleAccountId);
  }

  isDuplicate(googleAccountId: string): boolean {
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

  writeAccountsManifest(
    entries: Array<{
      googleAccountId: string;
      label: string;
      email: string;
      tokenFilePath: string;
    }>,
  ): string {
    const manifestDir = path.join(this.userDataPath, 'gws-manifests');
    fs.mkdirSync(manifestDir, { recursive: true });

    const manifestPath = path.join(manifestDir, 'manifest.json');
    const tmpPath = `${manifestPath}.tmp`;

    fs.writeFileSync(tmpPath, JSON.stringify(entries, null, 2), { encoding: 'utf-8' });
    fs.renameSync(tmpPath, manifestPath);
    fs.chmodSync(manifestPath, 0o600);

    return manifestPath;
  }
}
