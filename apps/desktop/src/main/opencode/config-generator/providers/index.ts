/**
 * Provider modules index
 *
 * Re-exports all provider-related modules for convenient imports.
 *
 * @module main/opencode/config-generator/providers
 */

// Registry - provider specifications and helper functions
export {
  PROVIDER_SPECS,
  SPECIAL_PROVIDERS,
  STANDARD_PROVIDER_IDS,
  getProviderSpec,
  isSpecialProvider,
  isStandardProvider,
  getStandardProviderIds,
  stripModelIdPrefix,
  addModelIdPrefix,
  getBaseURL,
} from './registry';
export type { ProviderSpec } from './registry';

// Builder - builds provider configs for standard providers
export {
  buildProviderConfig,
  buildAllStandardProviders,
} from './builder';
export type { BuildProviderConfigParams, StandardProviderConfig } from './builder';

// Special providers - have dedicated builders
export { buildBedrockProviderConfig } from './bedrock';
export type { BedrockProviderConfig } from './bedrock';

export { buildAzureFoundryProviderConfig } from './azure-foundry';
export type { AzureFoundryProviderConfig } from '../types';

export { buildZaiProviderConfig, ZAI_MODELS } from './zai';
export type { ZaiProviderConfig } from '../types';
