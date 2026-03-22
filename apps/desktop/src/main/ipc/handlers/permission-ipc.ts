import { BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { sanitizeString, type TaskManagerAPI } from '@accomplish_ai/agent-core';
import type { PermissionResponse } from '@accomplish_ai/agent-core';
import {
  startPermissionApiServer,
  startQuestionApiServer,
  initPermissionApi,
  resolvePermission,
  resolveQuestion,
  isFilePermissionRequest,
  isQuestionRequest,
} from '../../permission-api';
import { permissionResponseSchema, validate } from '../../ipc/validation';
import { handle } from './utils';

/**
 * Creates a one-shot initializer for the permission/question API servers.
 * The returned function is safe to call multiple times; a flag guards re-entry.
 * Each call to `createPermissionApiInitializer` produces an independent flag,
 * so tests that call `registerPermissionHandlers` multiple times get a fresh guard.
 */
function createPermissionApiInitializer(): (
  window: BrowserWindow,
  getActiveTaskId: () => string | null,
) => Promise<void> {
  let initialized = false;

  return async (window: BrowserWindow, getActiveTaskId: () => string | null): Promise<void> => {
    if (initialized) {
      return;
    }
    // Set flag synchronously to prevent concurrent initialization on overlapping calls.
    initialized = true;
    initPermissionApi(window, getActiveTaskId);
    const permServer = startPermissionApiServer();
    const questionServer = startQuestionApiServer();
    // Await actual server readiness. Listen for both 'listening' and 'error' so that an
    // EADDRINUSE (another instance already holds the port) never causes an indefinite hang.
    const waitForServer = (server: ReturnType<typeof startPermissionApiServer>) =>
      new Promise<void>((resolve) => {
        if (!server?.once) {
          resolve();
          return;
        }
        server.once('listening', resolve);
        server.once('error', resolve);
      });
    await Promise.all([waitForServer(permServer), waitForServer(questionServer)]);
  };
}

export type PermissionApiInitializer = ReturnType<typeof createPermissionApiInitializer>;

/**
 * Registers the permission:respond IPC handler.
 * Returns an `ensurePermissionApiInitialized` function scoped to this registration,
 * so callers (task:start, session:resume) can trigger lazy server startup.
 */
export function registerPermissionHandlers(taskManager: TaskManagerAPI): PermissionApiInitializer {
  const ensurePermissionApiInitialized = createPermissionApiInitializer();

  handle('permission:respond', async (_event: IpcMainInvokeEvent, response: PermissionResponse) => {
    const parsedResponse = validate(permissionResponseSchema, response);
    const { taskId, decision, requestId } = parsedResponse;

    if (requestId && isFilePermissionRequest(requestId)) {
      const allowed = decision === 'allow';
      const resolved = resolvePermission(requestId, allowed);
      if (resolved) {
        return;
      }
      console.warn(`[IPC] File permission request ${requestId} not found in pending requests`);
      return;
    }

    if (requestId && isQuestionRequest(requestId)) {
      const denied = decision === 'deny';
      const resolved = resolveQuestion(requestId, {
        selectedOptions: parsedResponse.selectedOptions,
        customText: parsedResponse.customText,
        denied,
      });
      if (resolved) {
        return;
      }
      console.warn(`[IPC] Question request ${requestId} not found in pending requests`);
      return;
    }

    if (!taskManager.hasActiveTask(taskId)) {
      console.warn(`[IPC] Permission response for inactive task ${taskId}`);
      return;
    }

    if (decision === 'allow') {
      const message = parsedResponse.selectedOptions?.join(', ') || parsedResponse.message || 'yes';
      const sanitizedMessage = sanitizeString(message, 'permissionResponse', 1024);
      await taskManager.sendResponse(taskId, sanitizedMessage);
    } else {
      await taskManager.sendResponse(taskId, 'no');
    }
  });

  return ensurePermissionApiInitialized;
}
