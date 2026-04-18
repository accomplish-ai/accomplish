/**
 * WorkspaceManager — event-cached wrapper over the daemon's workspace RPCs.
 *
 * Milestone 3 sub-chunk 3d of the daemon-only-SQLite migration
 * (plan: /Users/yanai/.claude/plans/squishy-exploring-hamster.md).
 *
 * Before 3d: this module imported `createDefaultWorkspace`, `listWorkspaces`,
 * etc. directly from `@accomplish_ai/agent-core`. Those functions open the
 * main DB via `better-sqlite3`, so main held the second DB handle (alongside
 * the daemon's). Ported onto the daemon's `workspace.*` RPC surface.
 *
 * After 3d: every write path routes over RPC, and the initialization path
 * hydrates a local cache from `workspace.list` + `workspace.getActive`.
 * `task-handlers.ts` still reads the active id and the active-workspace
 * metadata synchronously (`task:list` uses `isDefault` to decide between the
 * strict and the "include-unassigned" filter), so the cache has to be
 * populated by the time the first task IPC lands — see `app-startup.ts`,
 * where `initialize()` now runs after `bootstrapDaemon()`.
 *
 * Cache freshness is driven by the daemon's `workspace.changed` notifications
 * (see `WorkspaceChangePayload`); the handler re-fetches the affected row
 * rather than trying to reconstruct workspace state from the event payload,
 * so we don't duplicate the daemon's invariants on the desktop side.
 */
import type {
  Workspace,
  WorkspaceChangePayload,
  WorkspaceCreateInput,
  WorkspaceDeleteResult,
  WorkspaceUpdateInput,
} from '@accomplish_ai/agent-core/desktop-main';
import { getDaemonClient } from '../daemon-bootstrap';
import { getLogCollector } from '../logging';

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string, data?: Record<string, unknown>): void {
  try {
    const l = getLogCollector();
    if (l?.log) {
      l.log(level, 'main', msg, data);
    }
  } catch (_e) {
    /* best-effort logging */
  }
}

let _activeWorkspaceId: string | null = null;
const _workspaces = new Map<string, Workspace>();
let _initialized = false;

export function isInitialized(): boolean {
  return _initialized;
}

/** Synchronous accessor used by task-handlers for the default-workspace
 *  detection during `task:list` / `task:start` / `session:resume`. */
export function getActiveWorkspace(): string | null {
  return _activeWorkspaceId;
}

/** Synchronous cache lookup. Returns null if the id is unknown — callers
 *  that need up-to-the-moment freshness should use the `workspace.get` RPC
 *  directly; this helper exists specifically for the hot path in
 *  `task-handlers.ts` where the cache is expected to be warm. */
export function getWorkspace(workspaceId: string): Workspace | null {
  return _workspaces.get(workspaceId) ?? null;
}

export function listWorkspaces(): Workspace[] {
  return Array.from(_workspaces.values());
}

/**
 * Hydrate the cache from the daemon and subscribe to change notifications
 * on the CURRENT `DaemonClient`.
 *
 * Must be called AFTER `bootstrapDaemon()` has resolved — the daemon's
 * `WorkspaceService.ensureInitialized()` guarantees a default workspace
 * exists and that `active_workspace_id` is valid, so this function just
 * pulls the current state.
 *
 * Called twice in the lifecycle:
 *   1. Once at app startup, after the initial bootstrap. Subscribes to
 *      the original client.
 *   2. On every daemon reconnect, from `daemon-bootstrap.ts`. The old
 *      client was `close()`d by the reconnect path (which clears its
 *      notification-handlers map), so without re-subscribing here the
 *      cache would go permanently stale on a daemon restart. See review
 *      finding P2.2 post-M5.
 *
 * Subscribing once per current client — we don't save handler refs for
 * `offNotification` because a closed client has no surviving listeners
 * to leak. A double-subscribe on the SAME client would simply re-fetch
 * each workspace twice on every change event (idempotent, not incorrect).
 */
export async function initialize(): Promise<void> {
  log('INFO', '[WorkspaceManager] Initializing...');

  const client = getDaemonClient();
  const list = await client.call('workspace.list');
  _workspaces.clear();
  for (const ws of list) {
    _workspaces.set(ws.id, ws);
  }

  const active = await client.call('workspace.getActive');
  _activeWorkspaceId = active?.id ?? null;

  client.onNotification('workspace.changed', (payload) => {
    // fire-and-forget — cache-refresh errors are non-fatal
    void refreshCacheFromEvent(payload);
  });

  _initialized = true;
  log(
    'INFO',
    `[WorkspaceManager] Initialized (${_workspaces.size} workspaces, active=${_activeWorkspaceId ?? 'none'})`,
  );
}

async function refreshCacheFromEvent(payload: WorkspaceChangePayload): Promise<void> {
  const client = getDaemonClient();
  try {
    switch (payload.kind) {
      case 'workspace.created':
      case 'workspace.updated': {
        const ws = await client.call('workspace.get', { workspaceId: payload.workspaceId });
        if (ws) {
          _workspaces.set(ws.id, ws);
        }
        break;
      }
      case 'workspace.deleted':
        _workspaces.delete(payload.workspaceId);
        // The daemon emits a separate `workspace.activeChanged` event when
        // a delete cascades to the active pointer; handled below.
        break;
      case 'workspace.activeChanged':
        _activeWorkspaceId = payload.workspaceId;
        break;
      case 'knowledgeNote.changed':
        // Knowledge notes aren't cached on this side; renderers reload on
        // the matching IPC event. Nothing to do here.
        break;
    }
  } catch (err) {
    log('WARN', '[WorkspaceManager] Cache refresh failed', { err: String(err) });
  }
}

export async function switchWorkspace(workspaceId: string): Promise<boolean> {
  const result = await getDaemonClient().call('workspace.setActive', { workspaceId });
  if (result.changed) {
    _activeWorkspaceId = workspaceId;
  }
  return result.changed;
}

export async function createWorkspace(input: WorkspaceCreateInput): Promise<Workspace> {
  const ws = await getDaemonClient().call('workspace.create', { input });
  _workspaces.set(ws.id, ws);
  return ws;
}

export async function updateWorkspace(
  workspaceId: string,
  input: WorkspaceUpdateInput,
): Promise<Workspace | null> {
  const ws = await getDaemonClient().call('workspace.update', { workspaceId, input });
  if (ws) {
    _workspaces.set(ws.id, ws);
  }
  return ws;
}

export async function deleteWorkspace(workspaceId: string): Promise<WorkspaceDeleteResult> {
  const result = await getDaemonClient().call('workspace.delete', { workspaceId });
  if (result.deleted) {
    _workspaces.delete(workspaceId);
  }
  if (result.newActiveWorkspaceId !== undefined) {
    _activeWorkspaceId = result.newActiveWorkspaceId;
  }
  return result;
}

export function close(): void {
  log('INFO', '[WorkspaceManager] Closing...');
  _activeWorkspaceId = null;
  _workspaces.clear();
  _initialized = false;
}
