// Provider config handlers are split into focused per-provider sub-modules.
// This file orchestrates registration of all provider config handlers.
import { handle } from './utils';
import { registerOllamaHandlers } from './provider-config-handlers/ollama-handlers';
import { registerAzureFoundryHandlers } from './provider-config-handlers/azure-foundry-handlers';
import { registerLiteLLMHandlers } from './provider-config-handlers/litellm-handlers';
import { registerLMStudioHandlers } from './provider-config-handlers/lmstudio-handlers';
import { registerProviderSettingsHandlers } from './provider-config-handlers/provider-settings-handlers';

export function registerProviderConfigHandlers(): void {
  registerOllamaHandlers(handle);
  registerAzureFoundryHandlers(handle);
  registerLiteLLMHandlers(handle);
  registerLMStudioHandlers(handle);
  registerProviderSettingsHandlers(handle);
}
