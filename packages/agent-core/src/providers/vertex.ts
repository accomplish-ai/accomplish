import crypto from 'crypto';
import { execFile } from 'child_process';
import type { VertexCredentials } from '../common/types/auth.js';
import { safeParseJson } from '../utils/json.js';
import type { ValidationResult } from './validation.js';

const VERTEX_TOKEN_TIMEOUT_MS = 15000;

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key: string;
  client_email: string;
  token_uri?: string;
}

/**
 * Generates a signed JWT from a GCP service account key and exchanges it
 * for an access token via Google's OAuth2 token endpoint.
 */
async function getServiceAccountAccessToken(key: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: key.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encode = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');

  const unsigned = `${encode(header)}.${encode(payload)}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = signer.sign(key.private_key, 'base64url');
  const jwt = `${unsigned}.${signature}`;

  const tokenUri = key.token_uri || 'https://oauth2.googleapis.com/token';
  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    signal: AbortSignal.timeout(VERTEX_TOKEN_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Token exchange failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error('No access token in response');
  }
  return data.access_token;
}

/**
 * Gets an access token using Application Default Credentials (gcloud CLI).
 * Uses `gcloud auth application-default print-access-token` which reads
 * credentials set up via `gcloud auth application-default login`.
 */
async function getAdcAccessToken(): Promise<string> {
  try {
    const token = await new Promise<string>((resolve, reject) => {
      execFile(
        'gcloud',
        ['auth', 'application-default', 'print-access-token'],
        { timeout: VERTEX_TOKEN_TIMEOUT_MS, encoding: 'utf-8' },
        (error, stdout) => {
          if (error) {
            reject(error);
          } else {
            resolve((stdout as string).trim());
          }
        },
      );
    });
    if (!token) {
      throw new Error('Empty token returned from gcloud');
    }
    return token;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (
      message.includes('ENOENT') ||
      message.includes('not found') ||
      message.includes('not recognized')
    ) {
      throw new Error(
        'gcloud CLI not found. Install the Google Cloud SDK and run "gcloud auth application-default login".',
      );
    }
    throw new Error(`Failed to get ADC token: ${message}`);
  }
}

/**
 * Obtains an access token based on the credential type.
 */
async function getVertexAccessToken(credentials: VertexCredentials): Promise<string> {
  switch (credentials.authType) {
    case 'serviceAccount': {
      const parseResult = safeParseJson<ServiceAccountKey>(credentials.serviceAccountJson);
      if (!parseResult.success) {
        throw new Error('Invalid service account JSON');
      }
      return getServiceAccountAccessToken(parseResult.data);
    }
    case 'adc':
      return await getAdcAccessToken();
    default: {
      const _exhaustive: never = credentials;
      throw new Error(`Unknown authType: ${(_exhaustive as VertexCredentials).authType}`);
    }
  }
}

export interface VertexModel {
  id: string;
  name: string;
  provider: string;
}

export interface FetchVertexModelsResult {
  success: boolean;
  models: VertexModel[];
  error?: string;
}

/** Curated list of Google models available through Vertex AI.
 *  Source: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models
 */
const VERTEX_CURATED_MODELS: Array<{ publisher: string; modelId: string; displayName: string }> = [
  // Google — Gemini 3 (preview)
  { publisher: 'google', modelId: 'gemini-3-pro-preview', displayName: 'Gemini 3 Pro (Preview)' },
  {
    publisher: 'google',
    modelId: 'gemini-3-flash-preview',
    displayName: 'Gemini 3 Flash (Preview)',
  },
  // Google — Gemini 2.5 (GA)
  { publisher: 'google', modelId: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
  { publisher: 'google', modelId: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
  { publisher: 'google', modelId: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash Lite' },
];

/**
 * Client for Vertex AI API calls. Encapsulates base URL, auth token,
 * and project/location.
 */
export class VertexClient {
  readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(
    readonly projectId: string,
    readonly location: string,
    private readonly accessToken: string,
  ) {
    this.baseUrl =
      location === 'global'
        ? 'https://aiplatform.googleapis.com'
        : `https://${location}-aiplatform.googleapis.com`;
    this.headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /** Factory: acquires token from credentials, returns ready client */
  static async create(credentials: VertexCredentials): Promise<VertexClient> {
    const token = await getVertexAccessToken(credentials);
    return new VertexClient(credentials.projectId, credentials.location, token);
  }

  /** Quick connectivity + auth test via a lightweight generateContent call */
  async testAccess(): Promise<void> {
    const url = `${this.baseUrl}/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/gemini-2.5-flash:generateContent`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Say hi' }] }],
      }),
      signal: AbortSignal.timeout(VERTEX_TOKEN_TIMEOUT_MS),
    });

    if (!response.ok) {
      // 429 means credentials are valid — the request was authenticated and
      // authorized but the project hit its quota.  Treat as success.
      if (response.status === 429) {
        return;
      }
      const errorText = await response.text().catch(() => '');
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          'Authentication failed. Check your credentials and ensure the Vertex AI API is enabled.',
        );
      }
      if (response.status === 404) {
        throw new Error(
          `Project "${this.projectId}" or location "${this.location}" not found. Verify your project ID and location.`,
        );
      }
      throw new Error(`Vertex AI API error (${response.status}): ${errorText}`);
    }
  }
}

/**
 * Validates Vertex AI credentials by obtaining an access token and making a test API call.
 */
export async function validateVertexCredentials(
  credentialsJson: string,
): Promise<ValidationResult> {
  const parseResult = safeParseJson<VertexCredentials>(credentialsJson);
  if (!parseResult.success) {
    return { valid: false, error: 'Failed to parse credentials' };
  }

  const credentials = parseResult.data;

  if (!credentials.projectId?.trim()) {
    return { valid: false, error: 'Project ID is required' };
  }
  if (!credentials.location?.trim()) {
    return { valid: false, error: 'Location is required' };
  }

  if (credentials.authType === 'serviceAccount') {
    if (!credentials.serviceAccountJson?.trim()) {
      return { valid: false, error: 'Service account JSON key is required' };
    }
    const keyResult = safeParseJson<ServiceAccountKey>(credentials.serviceAccountJson);
    if (!keyResult.success) {
      return { valid: false, error: 'Invalid service account JSON format' };
    }
    const key = keyResult.data;
    if (!key.type || !key.project_id || !key.private_key || !key.client_email) {
      return {
        valid: false,
        error:
          'Service account key missing required fields (type, project_id, private_key, client_email)',
      };
    }
  }

  try {
    const client = await VertexClient.create(credentials);
    await client.testAccess();
    return { valid: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Validation failed';
    return { valid: false, error: message };
  }
}

/**
 * Returns the curated list of models available on Vertex AI.
 * No API call needed — the list is hardcoded from Google's documentation.
 */
export function fetchVertexModels(_credentials: VertexCredentials): FetchVertexModelsResult {
  const models: VertexModel[] = VERTEX_CURATED_MODELS.map((m) => ({
    id: `vertex/${m.publisher}/${m.modelId}`,
    name: m.displayName,
    provider: m.publisher,
  }));
  return { success: true, models };
}
