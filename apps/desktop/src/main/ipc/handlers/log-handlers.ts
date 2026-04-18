import fs from 'fs';
import { BrowserWindow, dialog } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { getLogCollector } from '../../logging';
import { handle, assertTrustedWindow } from './utils';
import { getDaemonClient } from '../../daemon-bootstrap';

export function registerLogHandlers(): void {
  // Milestone 3 sub-chunk 3c: debug-mode gate routes through the daemon.
  const assertDebugModeEnabled = async () => {
    const snap = await getDaemonClient().call('settings.getAll');
    if (!snap.app.debugMode) {
      throw new Error('Debug mode is disabled');
    }
  };

  handle('logs:export', async (event: IpcMainInvokeEvent) => {
    await assertDebugModeEnabled();
    const window = assertTrustedWindow(BrowserWindow.fromWebContents(event.sender));

    const collector = getLogCollector();
    collector.flush();

    const logPath = collector.getCurrentLogPath();
    const logDir = collector.getLogDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const defaultFilename = `accomplish-logs-${timestamp}.txt`;

    const result = await dialog.showSaveDialog(window, {
      title: 'Export Application Logs',
      defaultPath: defaultFilename,
      filters: [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'Log Files', extensions: ['log'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, reason: 'cancelled' };
    }

    try {
      if (fs.existsSync(logPath)) {
        fs.copyFileSync(logPath, result.filePath);
      } else {
        const header = `Accomplish Application Logs\nExported: ${new Date().toISOString()}\nLog Directory: ${logDir}\n\nNo logs recorded yet.\n`;
        fs.writeFileSync(result.filePath, header);
      }

      return { success: true, path: result.filePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  handle(
    'log:event',
    async (
      _event: IpcMainInvokeEvent,
      payload: { level?: string; message?: string; context?: Record<string, unknown> },
    ) => {
      const validLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const;
      type LogLevel = (typeof validLevels)[number];
      const level: LogLevel = validLevels.includes(payload?.level?.toUpperCase() as LogLevel)
        ? (payload.level!.toUpperCase() as LogLevel)
        : 'INFO';
      const message = typeof payload?.message === 'string' ? payload.message : '';
      const collector = getLogCollector();
      if (typeof collector.logBrowser === 'function') {
        collector.logBrowser(level, message, payload?.context);
      }
      return { ok: true };
    },
  );
}
