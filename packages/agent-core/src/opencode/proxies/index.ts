export {
  ensureAzureFoundryProxy,
  stopAzureFoundryProxy,
  isAzureFoundryProxyRunning,
  transformRequestBody as transformAzureFoundryRequestBody,
} from './azure-foundry-proxy.js';
export type { AzureFoundryProxyInfo } from './azure-foundry-proxy.js';

export {
  ensureMoonshotProxy,
  stopMoonshotProxy,
  isMoonshotProxyRunning,
  transformMoonshotRequestBody,
} from './moonshot-proxy.js';
export type { MoonshotProxyInfo } from './moonshot-proxy.js';

export {
  getAzureEntraToken,
  clearAzureTokenCache,
  hasValidToken as hasValidAzureToken,
  getTokenExpiry as getAzureTokenExpiry,
} from './azure-token-manager.js';
