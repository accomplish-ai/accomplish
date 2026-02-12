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
