export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
export const GOOGLE_USERINFO_EP = 'https://www.googleapis.com/oauth2/v3/userinfo';

export const GOOGLE_OAUTH_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
];

export const OAUTH_CALLBACK_PORT_PRIMARY = 4567;
export const OAUTH_CALLBACK_PORT_FALLBACK = 4568;

/** Refresh token 10 minutes before actual expiry to avoid using an expired token */
export const TOKEN_REFRESH_MARGIN_MS = 10 * 60 * 1000;

/** SecureStorage key for a given Google account's token data */
export const gwsTokenKey = (accountId: string): string => `gws:token:${accountId}`;
