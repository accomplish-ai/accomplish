/**
 * Integration tests for Permission API
 *
 * Tests the REAL exported functions from permission-api module:
 * - isFilePermissionRequest() - checks if request ID is a file permission
 * - resolvePermission() - resolves a pending permission request
 * - initPermissionApi() - initializes the API with window and task getter
 * - startPermissionApiServer() - starts the HTTP server
 * - PERMISSION_API_PORT - the port constant
 *
 * These tests mock only electron (external dependency) and test the real
 * module behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock electron before importing the module
vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(),
    getFocusedWindow: vi.fn(),
    getAllWindows: vi.fn(() => []),
  },
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp/test-app'),
  },
}));

// Import the REAL module functions after mocking electron
import {
  isFilePermissionRequest,
  resolvePermission,
  resolveQuestion,
  initPermissionApi,
  startPermissionApiServer,
  startQuestionApiServer,
  PERMISSION_API_PORT,
  QUESTION_API_PORT,
} from '@main/permission-api';

describe('Permission API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('isFilePermissionRequest', () => {
    it('should return true for IDs starting with filereq_', () => {
      expect(isFilePermissionRequest('filereq_123')).toBe(true);
      expect(isFilePermissionRequest('filereq_abc_def')).toBe(true);
      expect(isFilePermissionRequest('filereq_1234567890_abcdefghi')).toBe(true);
      expect(isFilePermissionRequest('filereq_')).toBe(true);
    });

    it('should return false for IDs not starting with filereq_', () => {
      expect(isFilePermissionRequest('req_123')).toBe(false);
      expect(isFilePermissionRequest('permission_abc')).toBe(false);
      expect(isFilePermissionRequest('file_req_123')).toBe(false);
      expect(isFilePermissionRequest('FILEREQ_123')).toBe(false); // case sensitive
      expect(isFilePermissionRequest('')).toBe(false);
      expect(isFilePermissionRequest('filereq')).toBe(false); // missing underscore
      expect(isFilePermissionRequest('_filereq_123')).toBe(false);
    });
  });

  describe('resolvePermission', () => {
    it('should return false for non-existent request ID', () => {
      // The real function returns false when the request is not in pending
      expect(resolvePermission('filereq_nonexistent', true)).toBe(false);
      expect(resolvePermission('filereq_notpending', false)).toBe(false);
    });

    it('should return false when called multiple times with same ID', () => {
      const requestId = 'filereq_double_resolve';
      // First call returns false (not pending)
      expect(resolvePermission(requestId, true)).toBe(false);
      // Second call also returns false (still not pending)
      expect(resolvePermission(requestId, false)).toBe(false);
    });
  });

  describe('PERMISSION_API_PORT', () => {
    it('should be exported with correct value', () => {
      expect(PERMISSION_API_PORT).toBe(9226);
    });
  });

  describe('initPermissionApi', () => {
    it('should accept window and task getter without throwing', () => {
      const mockWindow = {
        isDestroyed: () => false,
        webContents: {
          send: vi.fn(),
          isDestroyed: () => false,
        },
      } as unknown as import('electron').BrowserWindow;
      const mockTaskGetter = () => 'task_123';

      expect(() => initPermissionApi(() => mockWindow, mockTaskGetter)).not.toThrow();
    });

    it('should be a function', () => {
      expect(typeof initPermissionApi).toBe('function');
    });
  });

  describe('startPermissionApiServer', () => {
    it('should be a function', () => {
      expect(typeof startPermissionApiServer).toBe('function');
    });

    it('should return an HTTP server when called', async () => {
      const server = startPermissionApiServer();
      expect(server).toBeDefined();
      // Clean up - close the server and await so the port is free for subsequent tests
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
  });

  describe('taskId resolution from request body', () => {
    it('should trim an explicit taskId before dispatching a permission request', async () => {
      const send = vi.fn();
      const mockWindow = {
        isDestroyed: () => false,
        webContents: {
          send,
          isDestroyed: () => false,
        },
      } as unknown as import('electron').BrowserWindow;

      initPermissionApi(
        () => mockWindow,
        () => 'fallback-task',
      );

      const server = startPermissionApiServer();
      await new Promise<void>((resolve) => {
        if (server.listening) {
          resolve();
        } else {
          server.once('listening', resolve);
        }
      });

      const fetchPromise = fetch(`http://127.0.0.1:${PERMISSION_API_PORT}/permission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'modify',
          filePath: '/tmp/test.txt',
          taskId: '  task-with-spaces  ',
        }),
      });

      // Wait for the permission request to reach the renderer
      await vi.waitFor(() => {
        expect(send).toHaveBeenCalledWith(
          'permission:request',
          expect.objectContaining({ taskId: 'task-with-spaces' }),
        );
      });

      // Resolve the pending permission so the handler completes and the connection closes cleanly
      const capturedReq = send.mock.calls.find(([event]) => event === 'permission:request')?.[1] as
        | { id: string }
        | undefined;
      if (capturedReq) {
        resolvePermission(capturedReq.id, true);
      }
      await fetchPromise.catch(() => {});
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('should fall back to active task when no taskId in request body', async () => {
      const send = vi.fn();
      const mockWindow = {
        isDestroyed: () => false,
        webContents: {
          send,
          isDestroyed: () => false,
        },
      } as unknown as import('electron').BrowserWindow;

      initPermissionApi(
        () => mockWindow,
        () => 'active-task-123',
      );

      const server = startPermissionApiServer();
      await new Promise<void>((resolve) => {
        if (server.listening) {
          resolve();
        } else {
          server.once('listening', resolve);
        }
      });

      const fetchPromise = fetch(`http://127.0.0.1:${PERMISSION_API_PORT}/permission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'modify',
          filePath: '/tmp/test.txt',
        }),
      });

      await vi.waitFor(() => {
        expect(send).toHaveBeenCalledWith(
          'permission:request',
          expect.objectContaining({ taskId: 'active-task-123' }),
        );
      });

      const capturedReq = send.mock.calls.find(([event]) => event === 'permission:request')?.[1] as
        | { id: string }
        | undefined;
      if (capturedReq) {
        resolvePermission(capturedReq.id, true);
      }
      await fetchPromise.catch(() => {});
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
  });

  describe('QUESTION_API_PORT', () => {
    it('should be exported with correct value', () => {
      expect(QUESTION_API_PORT).toBe(9227);
    });
  });

  describe('startQuestionApiServer', () => {
    it('should be a function', () => {
      expect(typeof startQuestionApiServer).toBe('function');
    });

    it('should use a trimmed taskId from the request body', async () => {
      const send = vi.fn();
      const mockWindow = {
        isDestroyed: () => false,
        webContents: {
          send,
          isDestroyed: () => false,
        },
      } as unknown as import('electron').BrowserWindow;

      initPermissionApi(
        () => mockWindow,
        () => null,
      );

      const server = startQuestionApiServer();
      await new Promise<void>((resolve) => {
        if (server.listening) {
          resolve();
        } else {
          server.once('listening', resolve);
        }
      });

      const fetchPromise = fetch(`http://127.0.0.1:${QUESTION_API_PORT}/question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: '  task-explicit-question  ',
          question: 'What filename should I use?',
          header: 'File Name',
          options: [{ label: 'notes.txt' }, { label: 'todo.md' }],
        }),
      });

      await vi.waitFor(() => {
        expect(send).toHaveBeenCalledWith(
          'permission:request',
          expect.objectContaining({
            taskId: 'task-explicit-question',
            type: 'question',
            question: 'What filename should I use?',
          }),
        );
      });

      const capturedReq = send.mock.calls.find(([event]) => event === 'permission:request')?.[1] as
        | { id: string }
        | undefined;
      if (capturedReq) {
        resolveQuestion(capturedReq.id, { selectedOptions: [], denied: false });
      }
      await fetchPromise.catch(() => {});
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('should fall back to active task when no taskId in request body', async () => {
      const send = vi.fn();
      const mockWindow = {
        isDestroyed: () => false,
        webContents: {
          send,
          isDestroyed: () => false,
        },
      } as unknown as import('electron').BrowserWindow;

      initPermissionApi(
        () => mockWindow,
        () => 'fallback-active-task',
      );

      const server = startQuestionApiServer();
      await new Promise<void>((resolve) => {
        if (server.listening) {
          resolve();
        } else {
          server.once('listening', resolve);
        }
      });

      const fetchPromise = fetch(`http://127.0.0.1:${QUESTION_API_PORT}/question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'Choose an option',
          options: [{ label: 'Option A' }, { label: 'Option B' }],
        }),
      });

      await vi.waitFor(() => {
        expect(send).toHaveBeenCalledWith(
          'permission:request',
          expect.objectContaining({
            taskId: 'fallback-active-task',
            type: 'question',
            question: 'Choose an option',
          }),
        );
      });

      const capturedReq = send.mock.calls.find(([event]) => event === 'permission:request')?.[1] as
        | { id: string }
        | undefined;
      if (capturedReq) {
        resolveQuestion(capturedReq.id, { selectedOptions: [], denied: false });
      }
      await fetchPromise.catch(() => {});
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
  });
});
