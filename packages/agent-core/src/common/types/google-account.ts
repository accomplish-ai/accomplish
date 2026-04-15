export type GoogleAccountStatus = 'connected' | 'expired' | 'error' | 'connecting';

export interface GoogleAccount {
  googleAccountId: string;
  email: string;
  displayName: string;
  pictureUrl: string | null;
  /** User-assigned label set at connection time, e.g. "Work" or "Personal" */
  label: string;
  status: GoogleAccountStatus;
  connectedAt: string;
  lastRefreshedAt: string | null;
}

export interface GoogleAccountToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
}

/** Passed to resolveTaskConfig to provide all connected Google accounts */
export interface GwsAccountsContext {
  accounts: Array<{
    googleAccountId: string;
    label: string;
    email: string;
    tokenFilePath: string;
  }>;
  manifestFilePath: string;
}
