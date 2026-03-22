// Settings handlers are split into focused sub-modules for maintainability.
import { BrowserWindow, nativeTheme } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { getStorage } from '../../store/storage';
import { handle } from './utils';
import { registerCloudBrowserHandlers } from './settings-handlers/cloud-browser-handlers';
import { registerSandboxHandlers } from './settings-handlers/sandbox-handlers';
import { registerAuthHandlers } from './settings-handlers/auth-handlers';
import { registerOnboardingHandlers } from './settings-handlers/onboarding-handlers';
import { registerOpenCodeHandlers } from './settings-handlers/opencode-handlers';

export function registerSettingsHandlers(): void {
  const storage = getStorage();

  handle('settings:debug-mode', async (_event: IpcMainInvokeEvent) => {
    return storage.getDebugMode();
  });

  handle('settings:set-debug-mode', async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('Invalid debug mode flag');
    }
    storage.setDebugMode(enabled);
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('settings:debug-mode-changed', { enabled });
    }
  });

  handle('settings:theme', async (_event: IpcMainInvokeEvent) => {
    return storage.getTheme();
  });

  handle('settings:set-theme', async (_event: IpcMainInvokeEvent, theme: string) => {
    if (!['system', 'light', 'dark'].includes(theme)) {
      throw new Error('Invalid theme value');
    }
    storage.setTheme(theme as 'system' | 'light' | 'dark');
    nativeTheme.themeSource = theme as 'system' | 'light' | 'dark';

    const resolved =
      theme === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : theme;

    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('settings:theme-changed', { theme, resolved });
    }
  });

  handle('settings:app-settings', async (_event: IpcMainInvokeEvent) => {
    return storage.getAppSettings();
  });

  registerCloudBrowserHandlers(handle);
  registerSandboxHandlers(handle);
  registerAuthHandlers(handle);
  registerOnboardingHandlers(handle);
  registerOpenCodeHandlers(handle);
}
