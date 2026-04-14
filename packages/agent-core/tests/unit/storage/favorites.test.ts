/** @vitest-environment node */

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Favorites repository', () => {
  let testDir: string;
  let dbPath: string;
  let databaseModule: typeof import('../../../src/storage/database.js') | null = null;
  let favoritesModule: typeof import('../../../src/storage/repositories/favorites.js') | null =
    null;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    if (process.env.SKIP_SQLITE_TESTS) {
      console.warn('Skipping favorites tests: better-sqlite3 native module not available');
      return;
    }
    try {
      // Probe instantiation — import alone succeeds even on ABI mismatch;
      // the error only surfaces when new Database() is called.
      const BetterSqlite3 = await import('better-sqlite3');
      const probe = new (
        BetterSqlite3 as unknown as { default: new (p: string) => { close(): void } }
      ).default(':memory:');
      probe.close();
      databaseModule = await import('../../../src/storage/database.js');
      favoritesModule = await import('../../../src/storage/repositories/favorites.js');
    } catch (_err) {
      console.warn('Skipping favorites tests: better-sqlite3 native module not available');
      console.warn('To fix: pnpm install --force');
    }
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
  });

  beforeEach(() => {
    if (!databaseModule || !favoritesModule) {
      return;
    }
    testDir = path.join(
      os.tmpdir(),
      `fav-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    fs.mkdirSync(testDir, { recursive: true });
    dbPath = path.join(testDir, 'test.db');
    databaseModule.initializeDatabase({ databasePath: dbPath });
  });

  afterEach(() => {
    if (databaseModule) {
      databaseModule.resetDatabaseInstance();
    }
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should add and get favorites', () => {
    if (!favoritesModule) {
      return;
    }

    const base = new Date('2025-01-01T00:00:00.000Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(base);
    favoritesModule.addFavorite('task_1', 'Prompt one', 'Summary one');
    vi.setSystemTime(base + 1000);
    favoritesModule.addFavorite('task_2', 'Prompt two');
    vi.useRealTimers();

    const list = favoritesModule.getFavorites();
    expect(list).toHaveLength(2);
    expect(list[0].taskId).toBe('task_2');
    expect(list[0].prompt).toBe('Prompt two');
    expect(list[0].summary).toBeUndefined();
    expect(list[0].favoritedAt).toBeDefined();
    expect(list[1].taskId).toBe('task_1');
    expect(list[1].prompt).toBe('Prompt one');
    expect(list[1].summary).toBe('Summary one');
  });

  it('should return favorites ordered by favoritedAt descending', () => {
    if (!favoritesModule) {
      return;
    }

    // Control the clock so each insert gets a distinct timestamp
    const base = new Date('2025-01-01T00:00:00.000Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(base);
    favoritesModule.addFavorite('task_a', 'A');
    vi.setSystemTime(base + 1000);
    favoritesModule.addFavorite('task_b', 'B');
    vi.setSystemTime(base + 2000);
    favoritesModule.addFavorite('task_c', 'C');
    vi.useRealTimers();

    const list = favoritesModule.getFavorites();
    expect(list.map((f) => f.taskId)).toEqual(['task_c', 'task_b', 'task_a']);
  });

  it('should replace existing favorite when adding same taskId', () => {
    if (!favoritesModule) {
      return;
    }

    favoritesModule.addFavorite('task_1', 'Old prompt', 'Old summary');
    favoritesModule.addFavorite('task_1', 'New prompt', 'New summary');

    const list = favoritesModule.getFavorites();
    expect(list).toHaveLength(1);
    expect(list[0].prompt).toBe('New prompt');
    expect(list[0].summary).toBe('New summary');
  });

  it('should remove favorite', () => {
    if (!favoritesModule) {
      return;
    }

    favoritesModule.addFavorite('task_1', 'P1');
    favoritesModule.addFavorite('task_2', 'P2');
    favoritesModule.removeFavorite('task_1');

    const list = favoritesModule.getFavorites();
    expect(list).toHaveLength(1);
    expect(list[0].taskId).toBe('task_2');
  });

  it('should return isFavorite true when task is favorited', () => {
    if (!favoritesModule) {
      return;
    }

    favoritesModule.addFavorite('task_1', 'P1');
    expect(favoritesModule.isFavorite('task_1')).toBe(true);
    expect(favoritesModule.isFavorite('task_2')).toBe(false);
  });

  it('should return isFavorite false after remove', () => {
    if (!favoritesModule) {
      return;
    }

    favoritesModule.addFavorite('task_1', 'P1');
    favoritesModule.removeFavorite('task_1');
    expect(favoritesModule.isFavorite('task_1')).toBe(false);
  });
});
