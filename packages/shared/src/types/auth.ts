/**
 * Authentication and user types
 */

export interface User {
  id: string;
  email: string;
  name?: string;
  pictureUrl?: string;
  tier: 'free' | 'pro' | 'enterprise';
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  deviceId?: string;
  deviceName?: string;
  createdAt: string;
  expiresAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ApiKeyConfig {
  id: string;
  provider: 'anthropic' | 'openai' | 'google' | 'groq' | 'local' | 'custom' | 'aws_bedrock';
  label?: string;
  keyPrefix?: string;
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
}

export interface QuotaStatus {
  callsUsed: number;
  callsLimit: number;
  remaining: number;
  resetsAt?: string;
}
