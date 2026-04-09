// Supported UI languages for validation and type safety
export const SUPPORTED_LANGUAGES = ['auto', 'en', 'zh-CN', 'ru', 'fr'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
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

  handle('settings:language', async (_event: IpcMainInvokeEvent) => {
    return storage.getLanguage();
  });

  handle('settings:set-language', async (_event: IpcMainInvokeEvent, language: string) => {
    if (!SUPPORTED_LANGUAGES.includes(language as Language)) {
      throw new Error('Invalid language value');
    }
    storage.setLanguage(language as Language);
    // Broadcast to all renderer windows
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('settings:language-changed', { language });
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
        // Tell daemon to shut down — don't await, it exits asynchronously
        client.call('daemon.shutdown').catch(() => {});
      } catch {
        // Daemon may already be down
      }
      shutdownDaemon();

      // Wait for the old daemon to fully exit by checking the PID file.
      // The daemon deletes its PID lock on exit. Once the PID file is gone
      // (or its PID is no longer alive), it's safe to spawn a new one.
      try {
        const { getPidFilePath } = await import('@accomplish_ai/agent-core');
        const { getDataDir } = await import('../../daemon/daemon-connector');
        const fs = await import('fs');
        const pidPath = getPidFilePath(getDataDir());

        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
          if (!fs.existsSync(pidPath)) {
            break; // PID file gone — daemon exited
          }
          // PID file exists — check if the process is still alive
          try {
            const content = fs.readFileSync(pidPath, 'utf8');
            const pid = JSON.parse(content).pid;
            process.kill(pid, 0); // signal 0 = check if alive
            // Still alive — wait and retry
            await new Promise((r) => setTimeout(r, 100));
          } catch {
            break; // Process dead or PID file unreadable — safe to proceed
          }
        }
      } catch {
        // Best effort — fall through to bootstrap which handles retries
      }

      // Remove stale socket file so bootstrapDaemon spawns fresh
      try {
        const { getSocketPath } = await import('@accomplish_ai/agent-core');
        const { getDataDir } = await import('../../daemon/daemon-connector');
        const fs = await import('fs');
        const socketPath = getSocketPath(getDataDir());
        if (fs.existsSync(socketPath)) {
          fs.unlinkSync(socketPath);
        }
      } catch {
        // Best effort
      }

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
      client.call('daemon.shutdown').catch(() => {});
    } catch {
      // Daemon may already be down
    }
    shutdownDaemon();

    // Wait for the daemon to fully exit before reporting success.
    // Same PID polling approach as restart.
    try {
      const { getPidFilePath } = await import('@accomplish_ai/agent-core');
      const { getDataDir } = await import('../../daemon/daemon-connector');
      const fs = await import('fs');
      const pidPath = getPidFilePath(getDataDir());

      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        if (!fs.existsSync(pidPath)) {
          break;
        }
        try {
          const content = fs.readFileSync(pidPath, 'utf8');
          const pid = JSON.parse(content).pid;
          process.kill(pid, 0);
          await new Promise((r) => setTimeout(r, 100));
        } catch {
          break; // Process dead
        }
      }
    } catch {
      // Best effort
    }

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

  // Build capabilities — tells renderer which features are available
  handle('app:get-build-capabilities', async () => {
    const { isFreeMode, isAnalyticsEnabled } = await import('../../config/build-config');
    return {
      hasFreeMode: isFreeMode(),
      hasAnalytics: isAnalyticsEnabled(),
    };
  });
}
