/**
 * Bedrock provider configuration builder
 *
 * Generates Amazon Bedrock provider configuration for OpenCode CLI.
 * Supports both new provider settings and legacy JSON credentials fallback.
 */

import type { ConnectedProvider, BedrockCredentials } from '@accomplish/shared';
import { getApiKey } from '../../../store/secureStorage';
import type { BedrockProviderConfig } from '../types';

// Re-export the type for convenience
export type { BedrockProviderConfig } from '../types';

export interface BuildBedrockOptions {
  /**
   * If true, falls back to legacy JSON credentials stored in keychain
   * when no new provider settings are available
   */
  useLegacyFallback?: boolean;
}

/**
 * Build Amazon Bedrock provider configuration for OpenCode CLI
 *
 * @param provider - Connected provider settings (optional)
 * @param options - Build options including legacy fallback flag
 * @returns Bedrock provider config or null if not configured
 */
export function buildBedrockProviderConfig(
  provider?: ConnectedProvider,
  options: BuildBedrockOptions = {}
): BedrockProviderConfig | null {
  // Try new provider settings first
  if (provider?.connectionStatus === 'connected' && provider.credentials.type === 'bedrock') {
    const creds = provider.credentials;
    const bedrockOptions: BedrockProviderConfig['options'] = {
      region: creds.region || 'us-east-1',
    };

    if (creds.authMethod === 'profile' && creds.profileName) {
      bedrockOptions.profile = creds.profileName;
    }

    return { options: bedrockOptions };
  }

  // Legacy fallback: parse JSON credentials from keychain
  if (options.useLegacyFallback) {
    const bedrockCredsJson = getApiKey('bedrock');
    if (!bedrockCredsJson) {
      return null;
    }

    try {
      const creds = JSON.parse(bedrockCredsJson) as BedrockCredentials;

      const bedrockOptions: BedrockProviderConfig['options'] = {
        region: creds.region || 'us-east-1',
      };

      if (creds.authType === 'profile' && creds.profileName) {
        bedrockOptions.profile = creds.profileName;
      }

      return { options: bedrockOptions };
    } catch {
      // Failed to parse legacy credentials
      return null;
    }
  }

  return null;
}
