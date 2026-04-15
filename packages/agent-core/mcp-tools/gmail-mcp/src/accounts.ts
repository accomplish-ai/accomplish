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
  } catch {
    return [];
  }
}

export function loadToken(tokenFilePath: string): TokenData {
  try {
    return JSON.parse(fs.readFileSync(tokenFilePath, 'utf-8')) as TokenData;
  } catch (err) {
    throw new Error(`Failed to load token from ${tokenFilePath}: ${String(err)}`);
  }
}

const READ_COMMANDS = new Set(['list', 'read']);

export function resolveAccounts(
  accounts: AccountEntry[],
  accountParam: string | undefined,
  subcommand: string,
): { resolved: AccountEntry[]; clarificationNeeded?: string; error?: string } {
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

  if (!READ_COMMANDS.has(subcommand)) {
    const available = accounts.map((a) => `${a.label} (${a.email})`).join(', ');
    return {
      resolved: [],
      clarificationNeeded: `Which account would you like to use? Available accounts: ${available}`,
    };
  }

  return { resolved: accounts };
}
