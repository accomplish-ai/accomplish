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
import { registerBuiltInConnectorHandlers } from './built-in-connector-handlers';
import { registerWorkspaceHandlers } from './workspace-handlers';
import { registerHuggingFaceHandlers } from './huggingface-handlers';
import { registerAnalyticsHandlers } from './analytics-handlers';
import { registerGoogleAccountHandlers } from './google-account-handlers';
import type { AccountManager } from '../../google-accounts/account-manager';
import type { TokenManager } from '../../google-accounts/token-manager';
import type { startGoogleOAuth, cancelGoogleOAuth } from '../../google-accounts/google-auth';

type GoogleAuthFn = typeof startGoogleOAuth;
type CancelGoogleOAuthFn = typeof cancelGoogleOAuth;

export function registerIPCHandlers(
  googleAccountManager?: AccountManager,
  googleTokenManager?: TokenManager,
  googleAuth?: GoogleAuthFn,
  cancelGoogleOAuthFn?: CancelGoogleOAuthFn,
): void {
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
  registerBuiltInConnectorHandlers();
  registerWorkspaceHandlers();
  registerHuggingFaceHandlers();
  registerAnalyticsHandlers();
  if (googleAccountManager && googleTokenManager && googleAuth && cancelGoogleOAuthFn) {
    registerGoogleAccountHandlers(
      googleAccountManager,
      googleTokenManager,
      googleAuth,
      cancelGoogleOAuthFn,
    );
  }
}
