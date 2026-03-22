import fs from 'fs';
import { BrowserWindow, dialog } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { getLogCollector } from '../../logging';
import { getStorage } from '../../store/storage';
import { handle, assertTrustedWindow } from './utils';

export function registerLogHandlers(): void {
  const storage = getStorage();

  const assertDebugModeEnabled = () => {
    if (!storage.getDebugMode()) {
      throw new Error('Debug mode is disabled');
    }
  };

  handle('logs:export', async (event: IpcMainInvokeEvent) => {
    assertDebugModeEnabled();
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
      _payload: { level?: string; message?: string; context?: Record<string, unknown> },
    ) => {
      return { ok: true };
    },
  );
}
