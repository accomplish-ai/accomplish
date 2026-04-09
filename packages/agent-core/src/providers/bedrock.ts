import { BedrockClient, ListFoundationModelsCommand } from '@aws-sdk/client-bedrock';
import type { BedrockCredentials } from '../common/types/auth.js';
import { safeParseJson } from '../utils/json.js';
import type { ValidationResult } from './validation.js';
import { resolveFromIni } from './bedrock-credential-resolver.js';

export type { BedrockModel, FetchBedrockModelsResult } from './bedrock-models.js';
export { fetchBedrockModels } from './bedrock-models.js';

/**
 * Validates AWS Bedrock credentials by making a test API call.
 * Supports three authentication types:
 * - API Key (bearer token)
 * - Access Keys (accessKeyId + secretAccessKey)
 * - IAM Profile (uses fromIni)
 *
 * @param credentialsJson - JSON string containing BedrockCredentials
 * @returns ValidationResult indicating if credentials are valid
 */
export async function validateBedrockCredentials(
  credentialsJson: string,
): Promise<ValidationResult> {
  const parseResult = safeParseJson<BedrockCredentials>(credentialsJson);
  if (!parseResult.success) {
    return { valid: false, error: 'Failed to parse credentials' };
  }

  const parsed = parseResult.data;
  let client: BedrockClient;
  let cleanupEnv: (() => void) | null = null;

  try {
    if (parsed.authType === 'apiKey') {
      const originalToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
      process.env.AWS_BEARER_TOKEN_BEDROCK = parsed.apiKey;
      cleanupEnv = () => {
        if (originalToken !== undefined) {
          process.env.AWS_BEARER_TOKEN_BEDROCK = originalToken;
        } else {
          delete process.env.AWS_BEARER_TOKEN_BEDROCK;
        }
      };
      client = new BedrockClient({
        region: parsed.region || 'us-east-1',
      });
    } else if (parsed.authType === 'accessKeys') {
      if (!parsed.accessKeyId || !parsed.secretAccessKey) {
        return { valid: false, error: 'Access Key ID and Secret Access Key are required' };
      }
      const awsCredentials: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
      } = {
        accessKeyId: parsed.accessKeyId,
        secretAccessKey: parsed.secretAccessKey,
      };
      if (parsed.sessionToken) {
        awsCredentials.sessionToken = parsed.sessionToken;
      }
      client = new BedrockClient({
        region: parsed.region || 'us-east-1',
        credentials: awsCredentials,
      });
    } else if (parsed.authType === 'profile') {
      const fromIni = await resolveFromIni();
      client = new BedrockClient({
        region: parsed.region || 'us-east-1',
        credentials: fromIni({ profile: parsed.profileName || 'default' }),
      });
    } else {
      return { valid: false, error: 'Invalid authentication type' };
    }

    const command = new ListFoundationModelsCommand({});
    await client.send(command);

    return { valid: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Validation failed';

    if (
      message.includes('UnrecognizedClientException') ||
      message.includes('InvalidSignatureException')
    ) {
      return {
        valid: false,
        error: 'Invalid AWS credentials. Please check your Access Key ID and Secret Access Key.',
      };
    }
    if (message.includes('AccessDeniedException')) {
      return {
        valid: false,
        error: 'Access denied. Ensure your AWS credentials have Bedrock permissions.',
      };
    }
    if (message.includes('could not be found')) {
      return { valid: false, error: 'AWS profile not found. Check your ~/.aws/credentials file.' };
    }
    if (message.includes('InvalidBearerTokenException') || message.includes('bearer token')) {
      return {
        valid: false,
        error: 'Invalid Bedrock API key. Please check your API key and try again.',
      };
    }

    return { valid: false, error: message };
  } finally {
    cleanupEnv?.();
  }
}
