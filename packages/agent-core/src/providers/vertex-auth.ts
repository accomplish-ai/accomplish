/**
 * Vertex AI authentication helpers
 *
 * Handles access token acquisition for Google Cloud Vertex AI via:
 * - Service account key (JWT → OAuth2 token exchange)
 * - Application Default Credentials (gcloud CLI)
 */

import crypto from 'crypto';
import { execFile } from 'child_process';
import type { VertexCredentials } from '../common/types/auth.js';
import { safeParseJson } from '../utils/json.js';

const VERTEX_TOKEN_TIMEOUT_MS = 15000;

export interface ServiceAccountKey {
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
export async function getServiceAccountAccessToken(key: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
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

  const tokenUri = 'https://oauth2.googleapis.com/token';
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
 */
export async function getAdcAccessToken(): Promise<string> {
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
export async function getVertexAccessToken(credentials: VertexCredentials): Promise<string> {
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
