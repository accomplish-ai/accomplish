/**
 * Google Workspace token constants — shared between desktop and daemon.
 *
 * Kept deliberately minimal: only the values `prepare-manifest.ts` needs. The
 * desktop-side `apps/desktop/src/main/google-accounts/constants.ts` carries
 * the richer set (OAuth endpoints, scopes, callback ports) that only the
 * desktop OAuth-initiation flow uses.
 */

/** Refresh the token 10 minutes before actual expiry to avoid using an expired one. */
export const TOKEN_REFRESH_MARGIN_MS = 10 * 60 * 1000;

/** Google OAuth 2.0 token endpoint — used for refresh grants. */
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** StorageAPI key shape for a given Google account's token blob. */
export const gwsTokenKey = (accountId: string): string => `gws:token:${accountId}`;
