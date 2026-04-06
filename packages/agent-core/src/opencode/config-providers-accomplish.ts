/**
 * Accomplish AI provider config builder.
 *
 * Delegates to the injected AccomplishRuntime adapter. In OSS the runtime is
 * noopRuntime (isAvailable() === false), so this builder returns empty configs.
 * The private @accomplish/llm-gateway-client package provides the real runtime.
 */

import { createConsoleLogger } from '../utils/logging.js';
import type { ProviderBuildContext, ProviderBuildResult } from './config-provider-context.js';

const log = createConsoleLogger({ prefix: 'AccomplishAiConfigBuilder' });

export async function buildAccomplishAiConfig(
  ctx: ProviderBuildContext,
): Promise<ProviderBuildResult> {
  if (!ctx.accomplishRuntime?.isAvailable()) {
    return { configs: [], enableToAdd: [] };
  }
  const provider = ctx.providerSettings.connectedProviders['accomplish-ai'];
  if (provider?.connectionStatus !== 'connected') {
    return { configs: [], enableToAdd: [] };
  }
  if (!ctx.accomplishStorageDeps) {
    log.warn('Accomplish AI connected but storage deps not available — skipping');
    return { configs: [], enableToAdd: [] };
  }
  try {
    return await ctx.accomplishRuntime.buildProviderConfig(ctx.accomplishStorageDeps);
  } catch (err) {
    log.error('Failed to start Accomplish AI proxy', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { configs: [], enableToAdd: [] };
  }
}
