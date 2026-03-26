import { registerTaskHandlers } from './task-handlers';
import { registerApiKeyHandlers } from './api-key-handlers';
import { registerProviderConfigHandlers } from './provider-config-handlers';
import { registerSettingsHandlers } from './settings-handlers';
import { registerSpeechHandlers } from './speech-handlers';
import { registerDebugHandlers } from './debug-handlers';
import { registerFileHandlers } from './file-handlers';
import { registerSkillsHandlers } from './skills-handlers';
import { registerFavoritesHandlers } from './favorites-handlers';
import { registerConnectorHandlers } from './connector-handlers';
import { registerWorkspaceHandlers } from './workspace-handlers';
import { registerHuggingFaceHandlers } from './huggingface-handlers';

export function registerIPCHandlers(): void {
  registerTaskHandlers();
  registerApiKeyHandlers();
  registerProviderConfigHandlers();
  registerSettingsHandlers();
  registerSpeechHandlers();
  registerDebugHandlers();
  registerFileHandlers();
  registerSkillsHandlers();
  registerFavoritesHandlers();
  registerConnectorHandlers();
  registerWorkspaceHandlers();
  registerHuggingFaceHandlers();
}
