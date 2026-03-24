import { app } from 'electron';
import path from 'path';
import {
  initializeMetaDatabase,
  closeMetaDatabase,
  createDefaultWorkspace,
  createWorkspaceRecord,
  updateWorkspaceRecord,
  deleteWorkspaceRecord,
  listWorkspaces,
  getWorkspace,
  getActiveWorkspaceId,
  setActiveWorkspaceId,
} from '@accomplish_ai/agent-core';
import type {
  Workspace,
  WorkspaceCreateInput,
  WorkspaceUpdateInput,
} from '@accomplish_ai/agent-core';
import { getTaskManager } from '../opencode';
import { getLogCollector } from '../logging';

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string, data?: Record<string, unknown>) {
  try {
    const l = getLogCollector();
    if (l?.log) {
      l.log(level, 'main', msg, data);
    }
  } catch (_e) {
    /* best-effort logging */
  }
}

function getMetaDatabasePath(): string {
  const dbName = app.isPackaged ? 'workspace-meta.db' : 'workspace-meta-dev.db';
  return path.join(app.getPath('userData'), dbName);
}

let _activeWorkspaceId: string | null = null;
let _initialized = false;

export function isInitialized(): boolean {
  return _initialized;
}

export function getActiveWorkspace(): string | null {
  return _activeWorkspaceId;
}

/**
 * Initialize the workspace system.
 * Creates the meta database and ensures a default workspace exists.
 * Does NOT initialize the main app database - that's done separately.
 */
export function initialize(): void {
  log('INFO', '[WorkspaceManager] Initializing...');

  try {
    // Initialize the meta database (workspace metadata only)
    initializeMetaDatabase(getMetaDatabasePath());

    // Ensure default workspace exists
    const defaultWorkspace = createDefaultWorkspace();
    log('INFO', `[WorkspaceManager] Default workspace: ${defaultWorkspace.id}`);

    // Get the active workspace (or fall back to default)
    let activeId = getActiveWorkspaceId();
    if (!activeId || !getWorkspace(activeId)) {
      activeId = defaultWorkspace.id;
      setActiveWorkspaceId(activeId);
    }

    _activeWorkspaceId = activeId;
    _initialized = true;

    log('INFO', `[WorkspaceManager] Initialized with active workspace: ${activeId}`);
  } catch (err) {
    log('ERROR', '[WorkspaceManager] Initialization failed', { err: String(err) });
    _activeWorkspaceId = null;
    throw err;
  }
}

export function switchWorkspace(workspaceId: string): boolean {
  if (workspaceId === _activeWorkspaceId) {
    return false;
  }

  // Guard: don't switch workspace while a task is running
  const taskManager = getTaskManager();
  const activeTaskId = taskManager.getActiveTaskId();
  if (activeTaskId) {
    log('WARN', `[WorkspaceManager] Cannot switch workspace while task ${activeTaskId} is running`);
    return false;
  }

  const workspace = getWorkspace(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  log('INFO', `[WorkspaceManager] Switching to workspace: ${workspace.name} (${workspaceId})`);

  _activeWorkspaceId = workspaceId;
  setActiveWorkspaceId(workspaceId);
  return true;
}

export function createWorkspace(input: WorkspaceCreateInput): Workspace {
  return createWorkspaceRecord(input);
}

export function updateWorkspace(id: string, input: WorkspaceUpdateInput): Workspace | null {
  return updateWorkspaceRecord(id, input);
}

export function deleteWorkspace(id: string): boolean {
  const workspace = getWorkspace(id);
  if (!workspace || workspace.isDefault) {
    return false;
  }

  // If deleting the active workspace, switch to default first
  if (_activeWorkspaceId === id) {
    // Guard: don't delete active workspace while a task is running
    const taskManager = getTaskManager();
    const activeTaskId = taskManager.getActiveTaskId();
    if (activeTaskId) {
      log(
        'WARN',
        `[WorkspaceManager] Cannot delete active workspace while task ${activeTaskId} is running`,
      );
      return false;
    }

    const allWorkspaces = listWorkspaces();
    const defaultWs = allWorkspaces.find((w) => w.isDefault);
    const fallbackId = defaultWs
      ? defaultWs.id
      : (allWorkspaces.find((w) => w.id !== id)?.id ?? null);
    _activeWorkspaceId = fallbackId;
    if (fallbackId) {
      setActiveWorkspaceId(fallbackId);
    }
  }

  return deleteWorkspaceRecord(id);
}

export { listWorkspaces, getWorkspace };

export function close(): void {
  log('INFO', '[WorkspaceManager] Closing...');
  closeMetaDatabase();
  _activeWorkspaceId = null;
  _initialized = false;
}
