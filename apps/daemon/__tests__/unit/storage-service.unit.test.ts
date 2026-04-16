/**
 * Regression tests for `StorageService` bootstrap.
 *
 * The primary concern pinned here is subtle and was caught only by running
 * the daemon end-to-end: `resolveTaskConfig` (routed through by PR #946)
 * calls `getKnowledgeNotesForPrompt`, which in turn calls `getMetaDatabase()`.
 * That meta database is a SIBLING SQLite file from the main `accomplish.db`;
 * before this test existed, only the desktop main process called
 * `initializeMetaDatabase`. The daemon never did.
 *
 * Consequence pre-fix: every daemon-run task silently dropped workspace
 * knowledge notes — the repo threw `"Workspace meta database not
 * initialized"`, `resolveTaskConfig`'s try/catch swallowed it into a log
 * warning, and the generated `opencode-<taskId>.json` was missing the
 * knowledge text users had configured.
 *
 * This test asserts the bootstrap order that makes the real flow work:
 *   1. `StorageService.initialize(dataDir)` calls `initializeMetaDatabase`
 *      with a path derived from the same dataDir (so desktop + daemon
 *      share the on-disk meta file).
 *   2. `StorageService.close()` tears the meta DB down too.
 *
 * Better-sqlite3's native binding can't be loaded in the daemon vitest
 * environment (NODE_MODULE_VERSION mismatch against Electron's bundled
 * Node), so we can't run a live DB here. Instead we intercept the three
 * agent-core meta-DB entry points and assert the call shapes — which is
 * exactly enough to detect a future revert.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';

let initCalls: string[] = [];
let closeCalls = 0;
let metaInitialized = false;

vi.mock('@accomplish_ai/agent-core', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    createStorage: vi.fn(() => ({
      initialize: vi.fn(),
      close: vi.fn(),
    })),
    initializeMetaDatabase: vi.fn((path: string) => {
      initCalls.push(path);
      metaInitialized = true;
    }),
    closeMetaDatabase: vi.fn(() => {
      closeCalls += 1;
      metaInitialized = false;
    }),
    isMetaDatabaseInitialized: vi.fn(() => metaInitialized),
  };
});

const { StorageService } = await import('../../src/storage-service.js');

describe('StorageService bootstrap — workspace-meta DB', () => {
  let dataDir: string;

  beforeEach(() => {
    initCalls = [];
    closeCalls = 0;
    metaInitialized = false;
    delete process.env.ACCOMPLISH_IS_PACKAGED;
    dataDir = join(tmpdir(), `storage-svc-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(() => {
    delete process.env.ACCOMPLISH_IS_PACKAGED;
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  });

  it('initialises the workspace-meta DB next to the main DB in dev mode', () => {
    const svc = new StorageService();
    svc.initialize(dataDir);

    expect(initCalls).toEqual([join(dataDir, 'workspace-meta-dev.db')]);
  });

  it('uses the packaged file name when ACCOMPLISH_IS_PACKAGED=1', () => {
    process.env.ACCOMPLISH_IS_PACKAGED = '1';
    const svc = new StorageService();
    svc.initialize(dataDir);

    expect(initCalls).toEqual([join(dataDir, 'workspace-meta.db')]);
  });

  it('closes the workspace-meta DB when close() is called', () => {
    const svc = new StorageService();
    svc.initialize(dataDir);
    expect(closeCalls).toBe(0);

    svc.close();
    expect(closeCalls).toBe(1);
  });

  it('close() is a no-op for the meta DB when it was never initialised', () => {
    // Caller accidentally invokes close() without initialize() — e.g. a
    // crashed bootstrap path. `closeMetaDatabase` must not fire for a
    // never-opened singleton.
    const svc = new StorageService();
    svc.close();
    expect(closeCalls).toBe(0);
  });
});
