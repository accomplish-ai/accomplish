import path from 'path';
import fs from 'fs';
import { BrowserWindow, dialog, app } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { getStorage } from '../../store/storage';
import { handle, assertTrustedWindow } from './utils';

export function registerBugReportHandlers(): void {
  const storage = getStorage();

  const assertDebugModeEnabled = () => {
    if (!storage.getDebugMode()) {
      throw new Error('Debug mode is disabled');
    }
  };

  handle(
    'debug:generate-bug-report',
    async (
      event: IpcMainInvokeEvent,
      reportData: {
        taskId?: string;
        taskPrompt?: string;
        taskStatus?: string;
        taskCreatedAt?: string;
        taskCompletedAt?: string;
        messages?: unknown[];
        debugLogs?: unknown[];
        screenshot?: string;
        axtree?: string;
        appVersion?: string;
        platform?: string;
      },
    ) => {
      try {
        assertDebugModeEnabled();
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
      let window: BrowserWindow;
      try {
        window = assertTrustedWindow(BrowserWindow.fromWebContents(event.sender));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Untrusted window';
        return { success: false, error: message };
      }
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const defaultFilename = `bug-report-${timestamp}.json`;

        const result = await dialog.showSaveDialog(window, {
          title: 'Save Bug Report',
          defaultPath: defaultFilename,
          filters: [
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });

        if (result.canceled || !result.filePath) {
          return { success: false, reason: 'cancelled' };
        }

        let screenshotPath: string | undefined;
        if (reportData.screenshot) {
          const parsed = path.parse(result.filePath);
          const candidate = path.join(parsed.dir, `${parsed.name}.png`);
          try {
            await fs.promises.access(candidate);
            screenshotPath = path.join(parsed.dir, `${parsed.name}-${Date.now()}.png`);
          } catch {
            screenshotPath = candidate;
          }
          await fs.promises.writeFile(screenshotPath, Buffer.from(reportData.screenshot, 'base64'));
        }

        const report = {
          version: 1,
          generatedAt: new Date().toISOString(),
          app: {
            version: reportData.appVersion ?? app.getVersion(),
            platform: reportData.platform ?? process.platform,
          },
          task: {
            id: reportData.taskId,
            prompt: reportData.taskPrompt,
            status: reportData.taskStatus,
            createdAt: reportData.taskCreatedAt,
            completedAt: reportData.taskCompletedAt,
            messageCount: Array.isArray(reportData.messages) ? reportData.messages.length : 0,
          },
          messages: reportData.messages,
          debugLogs: reportData.debugLogs,
          axtree: reportData.axtree,
          screenshotFile: screenshotPath ? path.basename(screenshotPath) : null,
          hasScreenshot: Boolean(screenshotPath),
        };

        await fs.promises.writeFile(result.filePath, JSON.stringify(report, null, 2), 'utf-8');

        return { success: true, path: result.filePath };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
      }
    },
  );
}
