export enum OAuthProviderId {
  Slack = 'slack',
  Google = 'google',
}

export function isOAuthProviderId(value: string): value is OAuthProviderId {
  return value === OAuthProviderId.Slack || value === OAuthProviderId.Google;
}

export function getOAuthProviderDisplayName(providerId: OAuthProviderId): string {
  switch (providerId) {
    case OAuthProviderId.Slack:
      return 'Slack';
    case OAuthProviderId.Google:
      return 'Google';
  }
}

export type ConnectorStatus = 'connected' | 'disconnected' | 'error' | 'connecting';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt?: number; // unix timestamp ms
  scope?: string;
}

export interface OAuthMetadata {
  issuer?: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
  scopesSupported?: string[];
}

export interface OAuthClientRegistration {
  clientId: string;
  clientSecret?: string;
}

export interface McpConnector {
  id: string;
  name: string;
  url: string;
  status: ConnectorStatus;
  isEnabled: boolean;
  oauthMetadata?: OAuthMetadata;
  clientRegistration?: OAuthClientRegistration;
  lastConnectedAt?: string;
  createdAt: string;
  updatedAt: string;
}
