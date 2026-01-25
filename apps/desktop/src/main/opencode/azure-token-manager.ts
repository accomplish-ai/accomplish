/**
 * Azure Entra ID Token Manager
 *
 * Manages token acquisition and refresh for Azure AI Foundry with Entra ID authentication.
 * Tokens are cached and automatically refreshed before expiry.
 */

interface CachedToken {
  token: string;
  expiresAt: Date;
}

// Token cache - null means no valid token
let tokenCache: CachedToken | null = null;

// Buffer time before expiry to trigger refresh (5 minutes)
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

// Default token lifetime if expiry not provided (1 hour)
const DEFAULT_TOKEN_LIFETIME_MS = 60 * 60 * 1000;

/**
 * Get a valid Azure Entra ID token, refreshing if necessary.
 *
 * @returns Object with token on success, or error message on failure
 */
export async function getAzureEntraToken(): Promise<
  { success: true; token: string } | { success: false; error: string }
> {
  const now = new Date();

  // Check if we have a valid cached token (with buffer time)
  if (tokenCache && tokenCache.expiresAt > new Date(now.getTime() + REFRESH_BUFFER_MS)) {
    return { success: true, token: tokenCache.token };
  }

  // Need to acquire a new token
  try {
    const { DefaultAzureCredential } = await import('@azure/identity');
    const credential = new DefaultAzureCredential();
    const tokenResponse = await credential.getToken('https://cognitiveservices.azure.com/.default');

    // Calculate expiry time
    let expiresAt: Date;
    if (tokenResponse.expiresOnTimestamp) {
      expiresAt = new Date(tokenResponse.expiresOnTimestamp);
    } else {
      // Fallback: assume 1 hour lifetime
      expiresAt = new Date(now.getTime() + DEFAULT_TOKEN_LIFETIME_MS);
    }

    // Cache the token
    tokenCache = {
      token: tokenResponse.token,
      expiresAt,
    };

    console.log(
      `[Azure Token Manager] Acquired new token, expires at ${expiresAt.toISOString()}`
    );

    return { success: true, token: tokenResponse.token };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Provide helpful error messages for common issues
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

/**
 * Clear the cached token.
 * Call this when Azure Foundry is disconnected or credentials change.
 */
export function clearAzureTokenCache(): void {
  tokenCache = null;
  console.log('[Azure Token Manager] Token cache cleared');
}

/**
 * Check if we have a valid cached token.
 */
export function hasValidToken(): boolean {
  if (!tokenCache) return false;
  const now = new Date();
  return tokenCache.expiresAt > new Date(now.getTime() + REFRESH_BUFFER_MS);
}

/**
 * Get the expiry time of the current cached token, if any.
 */
export function getTokenExpiry(): Date | null {
  return tokenCache?.expiresAt ?? null;
}
