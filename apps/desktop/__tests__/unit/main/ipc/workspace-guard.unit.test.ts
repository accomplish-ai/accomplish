/**
 * Tests for the workspace daemon guard (hasDaemonActiveTasks).
 *
 * Verifies three states:
 * 1. Daemon reachable + tasks running → block workspace changes
 * 2. Daemon reachable + no tasks → allow workspace changes
 * 3. Daemon unreachable + explicitly stopped → allow (no tasks possible)
 * 4. Daemon unreachable + not stopped (crash/disconnect) → block (fail closed)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => ({
      id: 1,
      isDestroyed: () => false,
      webContents: { send: vi.fn(), isDestroyed: () => false },
    })),
  },
  app: { getPath: vi.fn(() => '/mock/userData') },
}));

// Track mock state
let mockActiveCount = 0;
let mockDaemonReachable = true;
let mockDaemonStopped = false;

const mockDaemonClient = {
  call: vi.fn(async (method: string) => {
    if (!mockDaemonReachable) {
      throw new Error('Daemon not bootstrapped');
    }
    if (method === 'task.getActiveCount') {
      return mockActiveCount;
    }
    return undefined;
  }),
  ping: vi.fn(),
  close: vi.fn(),
  onNotification: vi.fn(),
  offNotification: vi.fn(),
};

vi.mock('@main/daemon-bootstrap', () => ({
  getDaemonClient: vi.fn(() => {
    if (!mockDaemonReachable) {
      throw new Error('Daemon not bootstrapped');
    }
    return mockDaemonClient;
  }),
}));

vi.mock('@main/daemon/daemon-connector', () => ({
  isDaemonStopped: vi.fn(() => mockDaemonStopped),
}));

vi.mock('@main/store/workspaceManager', () => ({
  listWorkspaces: vi.fn(() => []),
  getActiveWorkspace: vi.fn(() => 'ws-1'),
  switchWorkspace: vi.fn(() => true),
  createWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(() => true),
}));

vi.mock('@accomplish_ai/agent-core', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    listKnowledgeNotes: vi.fn(() => []),
    createKnowledgeNote: vi.fn(),
    updateKnowledgeNote: vi.fn(),
    deleteKnowledgeNote: vi.fn(),
  };
});

// Import after mocks
const { registerWorkspaceHandlers } = await import('@main/ipc/handlers/workspace-handlers');

// Get the registered handler
const { ipcMain } = await import('electron');
const mockedIpcMain = ipcMain as unknown as {
  handle: ReturnType<typeof vi.fn>;
};

function getHandler(channel: string): ((...args: unknown[]) => Promise<unknown>) | undefined {
  for (const call of mockedIpcMain.handle.mock.calls) {
    if (call[0] === channel) {
      return call[1] as (...args: unknown[]) => Promise<unknown>;
    }
  }
  return undefined;
}

const mockEvent = { sender: { id: 1 } };

describe('workspace daemon guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveCount = 0;
    mockDaemonReachable = true;
    mockDaemonStopped = false;
    registerWorkspaceHandlers();
  });

  it('blocks workspace switch when daemon has active tasks', async () => {
    mockActiveCount = 2;
    const handler = getHandler('workspace:switch')!;
    const result = await handler(mockEvent, 'ws-2');
    expect(result).toEqual({
      success: false,
      reason: 'Cannot switch workspace while tasks are running',
    });
  });

  it('allows workspace switch when daemon has no active tasks', async () => {
    mockActiveCount = 0;
    const handler = getHandler('workspace:switch')!;
    const result = await handler(mockEvent, 'ws-2');
    expect(result).toEqual({ success: true });
  });

  it('blocks workspace switch when daemon is unreachable (crash/disconnect)', async () => {
    mockDaemonReachable = false;
    mockDaemonStopped = false;
    const handler = getHandler('workspace:switch')!;
    const result = await handler(mockEvent, 'ws-2');
    expect(result).toEqual({
      success: false,
      reason: 'Cannot switch workspace while tasks are running',
    });
  });

  it('allows workspace switch when daemon was explicitly stopped', async () => {
    mockDaemonReachable = false;
    mockDaemonStopped = true;
    const handler = getHandler('workspace:switch')!;
    const result = await handler(mockEvent, 'ws-2');
    expect(result).toEqual({ success: true });
  });
});
