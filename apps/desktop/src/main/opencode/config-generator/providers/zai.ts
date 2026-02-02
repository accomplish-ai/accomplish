/**
 * Z.AI (ZAI) Coding Plan provider configuration builder
 *
 * Generates Z.AI Coding Plan provider configuration for OpenCode CLI.
 * Supports region-based endpoint selection (China vs International).
 */

import type { ProviderSettings, ZaiCredentials } from '@accomplish/shared';
import type { ZaiProviderConfig } from '../types';
import { ZAI_MODELS, PROVIDER_URLS, NPM_PACKAGES } from '../constants';
import { getApiKey } from '../../../store/secureStorage';

// Re-export ZAI_MODELS for backward compatibility with tests
export { ZAI_MODELS } from '../constants';

/**
 * Build Z.AI Coding Plan provider configuration for OpenCode CLI
 *
 * @param providerSettings - Provider settings containing ZAI credentials (optional)
 * @returns Z.AI provider config or null if no API key
 */
export function buildZaiProviderConfig(
  providerSettings?: ProviderSettings
): ZaiProviderConfig | null {
  // Check for API key
  const zaiKey = getApiKey('zai');
  if (!zaiKey || !zaiKey.trim()) {
    return null;
  }

  // Determine region from provider settings
  const zaiProvider = providerSettings?.connectedProviders?.zai;
  let region: 'china' | 'international' = 'international';

  if (zaiProvider?.credentials?.type === 'zai') {
    const zaiCredentials = zaiProvider.credentials as ZaiCredentials;
    region = zaiCredentials.region || 'international';
  }

  // Select endpoint based on region using PROVIDER_URLS constants
  const baseURL = region === 'china'
    ? PROVIDER_URLS.zai.china
    : PROVIDER_URLS.zai.international;

  return {
    npm: NPM_PACKAGES.zai,
    name: 'Z.AI Coding Plan',
    options: {
      baseURL,
      // Note: API key is NOT included here - it's synced via syncApiKeysToOpenCodeAuth()
      // which writes to OpenCode's auth.json for the zai-coding-plan provider
    },
    models: { ...ZAI_MODELS },
  };
}
