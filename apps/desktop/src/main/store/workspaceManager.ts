import { app } from "electron";
import path from "path";
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
} from "@accomplish_ai/agent-core";
import type {
  Workspace,
  WorkspaceCreateInput,
  WorkspaceUpdateInput,
} from "@accomplish_ai/agent-core";

function getMetaDatabasePath(): string {
  const dbName = app.isPackaged ? "workspace-meta.db" : "workspace-meta-dev.db";
  return path.join(app.getPath("userData"), dbName);
}

let _activeWorkspaceId: string | null = null;

export function getActiveWorkspace(): string | null {
  return _activeWorkspaceId;
}

/**
 * Initialize the workspace system.
 * Creates the meta database and ensures a default workspace exists.
 * Does NOT initialize the main app database - that's done separately.
 */
export function initialize(): void {
  console.log("[WorkspaceManager] Initializing...");

  // Initialize the meta database (workspace metadata only)
  initializeMetaDatabase(getMetaDatabasePath());

  // Ensure default workspace exists
  const defaultWorkspace = createDefaultWorkspace();
  console.log("[WorkspaceManager] Default workspace:", defaultWorkspace.id);

  // Get the active workspace (or fall back to default)
  let activeId = getActiveWorkspaceId();
  if (!activeId || !getWorkspace(activeId)) {
    activeId = defaultWorkspace.id;
    setActiveWorkspaceId(activeId);
  }

  _activeWorkspaceId = activeId;

  console.log(
    "[WorkspaceManager] Initialized with active workspace:",
    activeId
  );
}

export function switchWorkspace(workspaceId: string): void {
  if (workspaceId === _activeWorkspaceId) return;

  const workspace = getWorkspace(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  console.log(
    "[WorkspaceManager] Switching to workspace:",
    workspace.name,
    `(${workspaceId})`
  );

  _activeWorkspaceId = workspaceId;
  setActiveWorkspaceId(workspaceId);
}

export function createWorkspace(input: WorkspaceCreateInput): Workspace {
  return createWorkspaceRecord(input);
}

export function updateWorkspace(
  id: string,
  input: WorkspaceUpdateInput
): Workspace | null {
  return updateWorkspaceRecord(id, input);
}

export function deleteWorkspace(id: string): boolean {
  const workspace = getWorkspace(id);
  if (!workspace || workspace.isDefault) return false;

  // If deleting the active workspace, switch to default first
  if (_activeWorkspaceId === id) {
    const allWorkspaces = listWorkspaces();
    const defaultWs = allWorkspaces.find((w) => w.isDefault);
    if (defaultWs) {
      _activeWorkspaceId = defaultWs.id;
      setActiveWorkspaceId(defaultWs.id);
    }
  }

  return deleteWorkspaceRecord(id);
}

export { listWorkspaces, getWorkspace };

export function close(): void {
  console.log("[WorkspaceManager] Closing...");
  closeMetaDatabase();
  _activeWorkspaceId = null;
}
