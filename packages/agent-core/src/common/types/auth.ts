export interface ApiKeyConfig {
  id: string;
  provider:
    | 'anthropic'
    | 'openai'
    | 'openrouter'
    | 'google'
    | 'xai'
    | 'deepseek'
    | 'moonshot'
    | 'zai'
    | 'azure-foundry'
    | 'custom'
    | 'bedrock'
    | 'vertex';
  label?: string;
  keyPrefix?: string;
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
}

export interface BedrockAccessKeyCredentials {
  authType: 'accessKeys';
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

export interface BedrockProfileCredentials {
  authType: 'profile';
  profileName: string;
  region: string;
}

export interface BedrockApiKeyCredentials {
  authType: 'apiKey';
  apiKey: string;
  region: string;
}

export type BedrockCredentials =
  | BedrockAccessKeyCredentials
  | BedrockProfileCredentials
  | BedrockApiKeyCredentials;

export interface VertexServiceAccountCredentials {
  authType: 'serviceAccount';
  serviceAccountJson: string;
  projectId: string;
  location: string;
}

export interface VertexAdcCredentials {
  authType: 'adc';
  projectId: string;
  location: string;
}

export type VertexCredentials = VertexServiceAccountCredentials | VertexAdcCredentials;
