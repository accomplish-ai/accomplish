interface CachedToken {
  token: string;
  expiresAt: Date;
}

let tokenCache: CachedToken | null = null;

const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const DEFAULT_TOKEN_LIFETIME_MS = 60 * 60 * 1000;

export async function getAzureEntraToken(): Promise<
  { success: true; token: string } | { success: false; error: string }
> {
  const now = new Date();

  if (tokenCache && tokenCache.expiresAt > new Date(now.getTime() + REFRESH_BUFFER_MS)) {
    return { success: true, token: tokenCache.token };
  }

  try {
    const { DefaultAzureCredential } = await import('@azure/identity');
    const credential = new DefaultAzureCredential();
    const tokenResponse = await credential.getToken('https://cognitiveservices.azure.com/.default');

    let expiresAt: Date;
    if (tokenResponse.expiresOnTimestamp) {
      expiresAt = new Date(tokenResponse.expiresOnTimestamp);
    } else {
      expiresAt = new Date(now.getTime() + DEFAULT_TOKEN_LIFETIME_MS);
    }

    tokenCache = {
      token: tokenResponse.token,
      expiresAt,
    };

    console.log(`[Azure Token Manager] Acquired new token, expires at ${expiresAt.toISOString()}`);

    return { success: true, token: tokenResponse.token };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    let hint = '';
    if (message.includes('AADSTS')) {
      hint = ' Check your Azure AD configuration.';
    } else if (message.includes('DefaultAzureCredential')) {
      hint = " Ensure you're logged in with 'az login' or have valid Azure credentials configured.";
    } else if (message.includes('network') || message.includes('ENOTFOUND')) {
      hint = ' Check your network connectivity.';
    }

    return {
      success: false,
      error: `Failed to acquire Azure Entra ID token: ${message}.${hint}`,
    };
  }
}

export function clearAzureTokenCache(): void {
  tokenCache = null;
  console.log('[Azure Token Manager] Token cache cleared');
}

export function hasValidToken(): boolean {
  if (!tokenCache) return false;
  const now = new Date();
  return tokenCache.expiresAt > new Date(now.getTime() + REFRESH_BUFFER_MS);
}

export function getTokenExpiry(): Date | null {
  return tokenCache?.expiresAt ?? null;
}
