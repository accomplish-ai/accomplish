/**
 * Module-level singletons for Google account management.
 *
 * AccountManager and TokenManager are initialized lazily after storage
 * is ready. Call initGoogleAccountManagers() once during app startup,
 * then use getAccountManager() and getTokenManager() everywhere else.
 */
import { app } from 'electron';
import { getDatabase as coreGetDatabase } from '@accomplish_ai/agent-core/storage/database';
import { getStorage } from '../store/storage';
import { AccountManager } from './account-manager';
import { TokenManager } from './token-manager';

export { startGoogleOAuth, cancelGoogleOAuth } from './google-auth';

let _accountManager: AccountManager | null = null;
let _tokenManager: TokenManager | null = null;

export function getAccountManager(): AccountManager {
  if (!_accountManager) {
    _accountManager = new AccountManager(coreGetDatabase(), getStorage(), app.getPath('userData'));
  }
  return _accountManager;
}

export function getTokenManager(): TokenManager {
  if (!_tokenManager) {
    _tokenManager = new TokenManager(getStorage(), coreGetDatabase(), null);
  }
  return _tokenManager;
}
