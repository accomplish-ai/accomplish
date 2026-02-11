import { getMetaDatabase } from "../workspace-meta-db.js";
import type {
  Workspace,
  WorkspaceCreateInput,
  WorkspaceUpdateInput,
} from "../../common/types/workspace.js";

function createWorkspaceId(): string {
  return `ws_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function rowToWorkspace(row: Record<string, unknown>): Workspace {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) || undefined,
    color: (row.color as string) || undefined,
    isDefault: (row.is_default as number) === 1,
    order: row.sort_order as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function listWorkspaces(): Workspace[] {
  const db = getMetaDatabase();
  const rows = db
    .prepare("SELECT * FROM workspaces ORDER BY sort_order ASC, created_at ASC")
    .all() as Record<string, unknown>[];
  return rows.map(rowToWorkspace);
}

export function getWorkspace(id: string): Workspace | null {
  const db = getMetaDatabase();
  const row = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToWorkspace(row) : null;
}

export function getDefaultWorkspace(): Workspace | null {
  const db = getMetaDatabase();
  const row = db
    .prepare("SELECT * FROM workspaces WHERE is_default = 1")
    .get() as Record<string, unknown> | undefined;
  return row ? rowToWorkspace(row) : null;
}

export function createWorkspace(input: WorkspaceCreateInput): Workspace {
  const db = getMetaDatabase();
  const id = createWorkspaceId();
  const now = new Date().toISOString();

  const maxOrder = db
    .prepare("SELECT MAX(sort_order) as max_order FROM workspaces")
    .get() as { max_order: number | null } | undefined;
  const order = (maxOrder?.max_order ?? -1) + 1;

  db.prepare(
    `INSERT INTO workspaces (id, name, description, color, sort_order, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(
    id,
    input.name,
    input.description || null,
    input.color || null,
    order,
    now,
    now
  );

  return getWorkspace(id)!;
}

export function createDefaultWorkspace(): Workspace {
  const db = getMetaDatabase();
  const existing = getDefaultWorkspace();
  if (existing) return existing;

  const id = createWorkspaceId();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO workspaces (id, name, description, color, sort_order, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, 1, ?, ?)`
  ).run(id, "Default", "Your default workspace", null, now, now);

  return getWorkspace(id)!;
}

export function updateWorkspace(
  id: string,
  input: WorkspaceUpdateInput
): Workspace | null {
  const db = getMetaDatabase();
  const existing = getWorkspace(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const name = input.name ?? existing.name;
  const description =
    input.description !== undefined ? input.description : existing.description;
  const color = input.color !== undefined ? input.color : existing.color;
  const order = input.order ?? existing.order;

  db.prepare(
    `UPDATE workspaces SET name = ?, description = ?, color = ?, sort_order = ?, updated_at = ? WHERE id = ?`
  ).run(name, description || null, color || null, order, now, id);

  return getWorkspace(id);
}

export function deleteWorkspace(id: string): boolean {
  const db = getMetaDatabase();
  const workspace = getWorkspace(id);
  if (!workspace || workspace.isDefault) return false;

  db.prepare("DELETE FROM workspaces WHERE id = ?").run(id);
  return true;
}

export function getActiveWorkspaceId(): string | null {
  const db = getMetaDatabase();
  const row = db
    .prepare(
      "SELECT value FROM workspace_meta WHERE key = 'active_workspace_id'"
    )
    .get() as { value: string } | undefined;
  return row?.value ?? null;
}

export function setActiveWorkspaceId(id: string): void {
  const db = getMetaDatabase();
  db.prepare(
    `INSERT INTO workspace_meta (key, value) VALUES ('active_workspace_id', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(id);
}
