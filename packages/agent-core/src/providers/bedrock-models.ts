import { BedrockClient, ListFoundationModelsCommand } from '@aws-sdk/client-bedrock';
import type { BedrockCredentials } from '../common/types/auth.js';
import { createConsoleLogger } from '../utils/logging.js';
import { resolveFromIni } from './bedrock-credential-resolver.js';

const log = createConsoleLogger({ prefix: 'Bedrock' });

export interface BedrockModel {
  id: string;
  name: string;
  provider: string;
}

export interface FetchBedrockModelsResult {
  success: boolean;
  models: BedrockModel[];
  error?: string;
}

/**
 * Fetches available foundation models from AWS Bedrock.
 *
 * Creates a BedrockClient based on the authentication type (apiKey, accessKeys, or profile),
 * fetches models, filters for TEXT output modality, and returns a formatted list.
 *
 * @param credentials - The Bedrock credentials (apiKey, accessKeys, or profile based)
 * @returns Object with success status, models array, and optional error message
 */
export async function fetchBedrockModels(
  credentials: BedrockCredentials,
): Promise<FetchBedrockModelsResult> {
  let originalToken: string | undefined;
  const setEnvVar = credentials.authType === 'apiKey';

  if (setEnvVar) {
    originalToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
    process.env.AWS_BEARER_TOKEN_BEDROCK = credentials.apiKey;
  }

  try {
    let bedrockClient: BedrockClient;
    if (credentials.authType === 'apiKey') {
      bedrockClient = new BedrockClient({
        region: credentials.region || 'us-east-1',
      });
    } else if (credentials.authType === 'accessKeys') {
      bedrockClient = new BedrockClient({
        region: credentials.region || 'us-east-1',
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken,
        },
      });
    } else {
      const fromIni = await resolveFromIni();
      bedrockClient = new BedrockClient({
        region: credentials.region || 'us-east-1',
        credentials: fromIni({ profile: credentials.profileName }),
      });
    }

    const command = new ListFoundationModelsCommand({});
    const response = await bedrockClient.send(command);

    const models = (response.modelSummaries || [])
      .filter((m) => m.outputModalities?.includes('TEXT'))
      .map((m) => ({
        id: `amazon-bedrock/${m.modelId}`,
        name: m.modelId || 'Unknown',
        provider: m.providerName || 'Unknown',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { success: true, models };
  } catch (error) {
    log.error(`[Bedrock] Failed to fetch models: ${error}`);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage, models: [] };
  } finally {
    if (setEnvVar) {
      if (originalToken !== undefined) {
        process.env.AWS_BEARER_TOKEN_BEDROCK = originalToken;
      } else {
        delete process.env.AWS_BEARER_TOKEN_BEDROCK;
      }
    }
  }
}
