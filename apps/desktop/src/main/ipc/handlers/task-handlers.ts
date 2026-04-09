import { BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import {
  startBrowserPreviewStream,
  stopBrowserPreviewStream,
  stopAllBrowserPreviewStreams,
  isScreencastActive,
} from '../../services/browserPreview';
import {
  sanitizeString,
  createTaskId,
  type TaskConfig,
  type FileAttachmentInfo,
} from '@accomplish_ai/agent-core';
import { getStorage } from '../../store/storage';
import {
  isMockTaskEventsEnabled,
  createMockTask,
  executeMockTaskFlow,
  detectScenarioFromPrompt,
} from '../../test-utils/mock-task-flow';
import * as workspaceManager from '../../store/workspaceManager';
import { handle, assertTrustedWindow } from './utils';
import { getDaemonClient } from '../../daemon-bootstrap';
import { sanitizeAttachments } from './attachment-utils';

export function registerTaskHandlers(): void {
  const storage = getStorage();

  // ─── Task execution (proxied to daemon) ──────────────────────────────────────

  handle('task:start', async (event: IpcMainInvokeEvent, config: TaskConfig) => {
    assertTrustedWindow(BrowserWindow.fromWebContents(event.sender));

    if (!isMockTaskEventsEnabled() && !storage.hasReadyProvider()) {
      throw new Error(
        'No provider is ready. Please connect a provider and select a model in Settings.',
      );
    }

    const taskId = createTaskId();

    // E2E mock path — bypasses daemon entirely
    if (isMockTaskEventsEnabled()) {
      const window = BrowserWindow.fromWebContents(event.sender)!;
      const mockTask = createMockTask(taskId, config.prompt);
      const scenario = detectScenarioFromPrompt(config.prompt);
      storage.saveTask(mockTask, workspaceManager.getActiveWorkspace());
      void executeMockTaskFlow(window, {
        taskId,
        prompt: config.prompt,
        scenario,
        delayMs: 50,
      });
      return mockTask;
    }

    // Sanitize attachments at the IPC boundary (same as session:resume)
    const sanitizedAttachments = sanitizeAttachments(config.files as unknown[] | undefined);

    // Proxy to daemon via RPC — forward ALL TaskConfig fields
    const client = getDaemonClient();
    const task = await client.call('task.start', {
      prompt: config.prompt,
      taskId,
      modelId: config.modelId,
      workspaceId: workspaceManager.getActiveWorkspace() ?? undefined,
      workingDirectory: config.workingDirectory,
      allowedTools: config.allowedTools,
      systemPromptAppend: config.systemPromptAppend,
      outputSchema: config.outputSchema,
      sessionId: config.sessionId,
      attachments: sanitizedAttachments,
    });

    return task;
  });

  handle('task:cancel', async (_event: IpcMainInvokeEvent, taskId?: string) => {
    if (!taskId) {
      return;
    }

    // Proxy to daemon
    const client = getDaemonClient();
    await client.call('task.cancel', { taskId });

    // Stop browser preview locally (desktop-specific concern)
    await stopBrowserPreviewStream(taskId);
  });

  handle('task:interrupt', async (_event: IpcMainInvokeEvent, taskId?: string) => {
    if (!taskId) {
      return;
    }

    // Proxy to daemon
    const client = getDaemonClient();
    await client.call('task.interrupt', { taskId });

    // Stop browser preview locally (desktop-specific concern)
    await stopBrowserPreviewStream(taskId);
  });

  // ─── Task reads (proxied to daemon) ──────────────────────────────────────────
  // The daemon is the single source of truth for task runtime state.

  handle('task:get', async (_event: IpcMainInvokeEvent, taskId: string) => {
    const client = getDaemonClient();
    return (await client.call('task.get', { taskId })) || null;
  });

  handle('task:list', async (_event: IpcMainInvokeEvent) => {
    const client = getDaemonClient();
    return await client.call('task.list', {
      workspaceId: workspaceManager.getActiveWorkspace() ?? undefined,
    });
  });

  handle('task:delete', async (_event: IpcMainInvokeEvent, taskId: string) => {
    const client = getDaemonClient();
    await client.call('task.delete', { taskId });
    // Stop browser preview locally (desktop-specific concern)
    await stopBrowserPreviewStream(taskId);
  });

  handle('task:clear-history', async (_event: IpcMainInvokeEvent) => {
    const client = getDaemonClient();
    await client.call('task.clearHistory');
    // Stop all preview streams locally (desktop-specific concern)
    await stopAllBrowserPreviewStreams();
  });

  handle('task:get-todos', async (_event: IpcMainInvokeEvent, taskId: string) => {
    const client = getDaemonClient();
    return await client.call('task.getTodos', { taskId });
  });

  // ─── Browser Preview IPC handlers (ENG-695) ─────────────────────────────────
  // Desktop-local — not proxied to daemon.

  handle(
    'browser-preview:start',
    async (event: IpcMainInvokeEvent, taskId: string, pageName?: string) => {
      if (!taskId || typeof taskId !== 'string') {
        throw new Error('taskId is required');
      }
      await startBrowserPreviewStream(taskId, pageName);
      return { success: true };
    },
  );

  handle('browser-preview:stop', async (_event: IpcMainInvokeEvent, taskId: string) => {
    if (!taskId || typeof taskId !== 'string') {
      throw new Error('taskId is required');
    }
    await stopBrowserPreviewStream(taskId);
    return { stopped: true };
  });

  handle('browser-preview:status', async () => {
    return { active: isScreencastActive() };
  });

  // ─── Session resume (proxied to daemon) ──────────────────────────────────────

  handle(
    'session:resume',
    async (
      event: IpcMainInvokeEvent,
      sessionId: string,
      prompt: string,
      existingTaskId?: string,
      attachments?: FileAttachmentInfo[],
    ) => {
      assertTrustedWindow(BrowserWindow.fromWebContents(event.sender));

      const validatedSessionId = sanitizeString(sessionId, 'sessionId', 128);
      const validatedPrompt = sanitizeString(prompt, 'prompt');
      const validatedExistingTaskId = existingTaskId
        ? sanitizeString(existingTaskId, 'taskId', 128)
        : undefined;

      if (!isMockTaskEventsEnabled() && !storage.hasReadyProvider()) {
        throw new Error(
          'No provider is ready. Please connect a provider and select a model in Settings.',
        );
      }

      const sanitizedAttachments = sanitizeAttachments(attachments as unknown[] | undefined);

      // Proxy to daemon via RPC
      const client = getDaemonClient();
      const task = await client.call('session.resume', {
        sessionId: validatedSessionId,
        prompt: validatedPrompt,
        existingTaskId: validatedExistingTaskId,
        workspaceId: workspaceManager.getActiveWorkspace() ?? undefined,
        attachments: sanitizedAttachments,
      });

      return task;
    },
  );

  // ─── Permission response (proxied to daemon) ────────────────────────────────

  handle(
    'permission:respond',
    async (_event: IpcMainInvokeEvent, response: Record<string, unknown>) => {
      // In E2E mock mode, daemon isn't running — silently succeed
      if (isMockTaskEventsEnabled()) {
        return;
      }
      const client = getDaemonClient();
      // Type is now flat PermissionResponse (requestId, taskId, decision, ...)
      await client.call(
        'permission.respond',
        response as {
          requestId: string;
          taskId: string;
          decision: 'allow' | 'deny';
          message?: string;
          selectedOptions?: string[];
          customText?: string;
        },
      );
    },
  );
}
