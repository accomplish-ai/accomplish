// Settings handlers are split into focused sub-modules for maintainability.
import { app, BrowserWindow, nativeTheme } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { getStorage } from '../../store/storage';
import { handle } from './utils';
import { registerCloudBrowserHandlers } from './settings-handlers/cloud-browser-handlers';
import { registerSandboxHandlers } from './settings-handlers/sandbox-handlers';
import { registerAuthHandlers } from './settings-handlers/auth-handlers';
import { registerOnboardingHandlers } from './settings-handlers/onboarding-handlers';
import { registerOpenCodeHandlers } from './settings-handlers/opencode-handlers';
import { registerWhatsAppHandlers } from './whatsapp-handlers';

export function registerSettingsHandlers(): void {
  const storage = getStorage();

  handle('settings:notifications-enabled', async (_event: IpcMainInvokeEvent) => {
    return storage.getNotificationsEnabled();
  });

  handle(
    'settings:set-notifications-enabled',
    async (_event: IpcMainInvokeEvent, enabled: boolean) => {
      if (typeof enabled !== 'boolean') {
        throw new Error('Invalid notifications-enabled flag');
      }
      storage.setNotificationsEnabled(enabled);
    },
  );

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

  // ── Daemon ──────────────────────────────────────────────────────────

  handle('daemon:get-socket-path', async () => {
    const { getSocketPath } = await import('@accomplish_ai/agent-core');
    return getSocketPath(app.getPath('userData'));
  });

  // ── Daemon Control ──────────────────────────────────────────────────

  handle('daemon:ping', async () => {
    const { getDaemonClient } = await import('../../daemon-bootstrap');
    try {
      const client = getDaemonClient();
      return await client.ping();
    } catch {
      return { status: 'disconnected', uptime: 0 };
    }
  });

  handle('daemon:restart', async () => {
    const { getDaemonClient, shutdownDaemon, bootstrapDaemon } =
      await import('../../daemon-bootstrap');
    const { suppressReconnect, enableReconnect } = await import('../../daemon/daemon-connector');

    // Suppress auto-reconnect during intentional restart
    suppressReconnect();
    try {
      try {
        const client = getDaemonClient();
        await client.call('daemon.shutdown');

        // Wait for daemon to finish draining before starting a new one.
        // Same pattern as daemon:stop — prevents bootstrap from reconnecting
        // to the old draining daemon instead of spawning a fresh one.
        const drainDeadline = Date.now() + 35_000;
        while (Date.now() < drainDeadline) {
          await new Promise((r) => setTimeout(r, 500));
          try {
            await client.ping();
          } catch {
            break; // Daemon exited
          }
        }
      } catch {
        // Daemon may already be down — that's fine
      }
      shutdownDaemon();
      await bootstrapDaemon();
      return { success: true };
    } finally {
      enableReconnect();
    }
  });

  handle('daemon:stop', async () => {
    const { getDaemonClient, shutdownDaemon } = await import('../../daemon-bootstrap');
    const { suppressReconnect } = await import('../../daemon/daemon-connector');

    // Suppress auto-reconnect — user intentionally stopped the daemon
    suppressReconnect();
    try {
      const client = getDaemonClient();
      await client.call('daemon.shutdown');

      // Wait for daemon to finish draining before clearing the local client.
      // During drain, the daemon is still reachable and workspace guards can
      // query task.getActiveCount. We clear client only after daemon exits.
      const drainDeadline = Date.now() + 35_000; // 30s drain + 5s buffer
      while (Date.now() < drainDeadline) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          await client.ping();
        } catch {
          // Daemon exited — drain complete
          break;
        }
      }
    } catch {
      // Daemon may already be down
    }
    shutdownDaemon();
    return { success: true };
  });

  handle('daemon:start', async () => {
    const { bootstrapDaemon } = await import('../../daemon-bootstrap');
    const { enableReconnect } = await import('../../daemon/daemon-connector');

    await bootstrapDaemon();
    // Re-enable auto-reconnect after explicit start
    enableReconnect();
    return { success: true };
  });

  // ── Scheduler ────────────────────────────────────────────────────────

  handle('scheduler:list', async (_event: IpcMainInvokeEvent, workspaceId?: string) => {
    const { getDaemonClient } = await import('../../daemon-bootstrap');
    const client = getDaemonClient();
    return client.call('task.listScheduled', { workspaceId });
  });

  handle(
    'scheduler:create',
    async (_event: IpcMainInvokeEvent, cron: string, prompt: string, workspaceId?: string) => {
      const { getDaemonClient } = await import('../../daemon-bootstrap');
      const client = getDaemonClient();
      return client.call('task.schedule', { cron, prompt, workspaceId });
    },
  );

  handle('scheduler:delete', async (_event: IpcMainInvokeEvent, scheduleId: string) => {
    const { getDaemonClient } = await import('../../daemon-bootstrap');
    const client = getDaemonClient();
    return client.call('task.cancelScheduled', { scheduleId });
  });

  handle(
    'scheduler:set-enabled',
    async (_event: IpcMainInvokeEvent, scheduleId: string, enabled: boolean) => {
      const { getDaemonClient } = await import('../../daemon-bootstrap');
      const client = getDaemonClient();
      return client.call('task.setScheduleEnabled', { scheduleId, enabled });
    },
  );

  handle('daemon:is-auto-start-enabled', async () => {
    const { isAutoStartEnabled } = await import('../../daemon/service-manager');
    return isAutoStartEnabled();
  });

  // ── Close Behavior ──────────────────────────────────────────────────

  handle('daemon:get-close-behavior', async () => {
    return storage.getCloseBehavior();
  });

  handle('daemon:set-close-behavior', async (_event: IpcMainInvokeEvent, behavior: string) => {
    if (behavior !== 'keep-daemon' && behavior !== 'stop-daemon') {
      throw new Error(`Invalid close behavior: ${behavior}`);
    }
    storage.setCloseBehavior(behavior);
  });

  registerCloudBrowserHandlers(handle);
  registerSandboxHandlers(handle);
  registerAuthHandlers(handle);
  registerOnboardingHandlers(handle);
  registerOpenCodeHandlers(handle);
  // WhatsApp integration (ENG-684)
  registerWhatsAppHandlers(handle);
}
