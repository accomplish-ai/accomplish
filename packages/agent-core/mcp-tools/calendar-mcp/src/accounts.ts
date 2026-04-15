import fs from 'node:fs';

export interface AccountEntry {
  googleAccountId: string;
  label: string;
  email: string;
  tokenFilePath: string;
}

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
}

export function loadManifest(): AccountEntry[] {
  const manifestPath = process.env.GWS_ACCOUNTS_MANIFEST;
  if (!manifestPath) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as AccountEntry[];
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load Google accounts manifest at "${manifestPath}": ${errMsg}. ` +
        'Check that the file exists and contains valid JSON.',
    );
  }
}

export function loadToken(tokenFilePath: string): TokenData {
  return JSON.parse(fs.readFileSync(tokenFilePath, 'utf-8')) as TokenData;
}

const READ_COMMANDS = new Set(['list', 'get', 'free-time']);

export function resolveAccounts(
  accounts: AccountEntry[],
  accountParam: string | undefined,
  subcommand: string,
): { resolved: AccountEntry[]; clarificationNeeded?: string; error?: string } {
  if (accounts.length === 0) {
    return {
      resolved: [],
      error: 'No Google accounts configured. Add accounts in Settings → Integrations.',
    };
  }

  if (accountParam) {
    const needle = accountParam.toLowerCase();
    const match = accounts.find(
      (a) => a.label.toLowerCase() === needle || a.email.toLowerCase() === needle,
    );
    if (!match) {
      const available = accounts.map((a) => a.label).join(', ');
      return { resolved: [], error: `Account not found: ${accountParam}. Available: ${available}` };
    }
    return { resolved: [match] };
  }

  // free-time always queries all accounts regardless of account param
  if (subcommand === 'free-time') {
    return { resolved: accounts };
  }

  // get requires a specific account when multiple exist
  if (subcommand === 'get' && accounts.length > 1) {
    const available = accounts.map((a) => `${a.label} (${a.email})`).join(', ');
    return {
      resolved: [],
      clarificationNeeded: `Which account's calendar? Available: ${available}`,
    };
  }

  if (!READ_COMMANDS.has(subcommand)) {
    const available = accounts.map((a) => `${a.label} (${a.email})`).join(', ');
    return {
      resolved: [],
      clarificationNeeded: `Which account's calendar? Available: ${available}`,
    };
  }

  return { resolved: accounts };
}
