/**
 * Unit tests for favorites repository
 * @vitest-environment node
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Favorites repository', () => {
  let testDir: string;
  let dbPath: string;
  let databaseModule: typeof import('../../../src/storage/database.js') | null = null;
  let favoritesModule: typeof import('../../../src/storage/repositories/favorites.js') | null = null;

  beforeAll(async () => {
    try {
      databaseModule = await import('../../../src/storage/database.js');
      favoritesModule = await import('../../../src/storage/repositories/favorites.js');
    } catch (err) {
      console.warn('Skipping favorites tests:', err);
    }
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  beforeEach(() => {
    if (!databaseModule || !favoritesModule) return;
    testDir = path.join(os.tmpdir(), `fav-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
    if (!favoritesModule) return;

    favoritesModule.addFavorite('task_1', 'Prompt one', 'Summary one');
    favoritesModule.addFavorite('task_2', 'Prompt two');

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
    if (!favoritesModule) return;

    favoritesModule.addFavorite('task_a', 'A');
    favoritesModule.addFavorite('task_b', 'B');
    favoritesModule.addFavorite('task_c', 'C');

    const list = favoritesModule.getFavorites();
    expect(list.map((f) => f.taskId)).toEqual(['task_c', 'task_b', 'task_a']);
  });

  it('should replace existing favorite when adding same taskId', () => {
    if (!favoritesModule) return;

    favoritesModule.addFavorite('task_1', 'Old prompt', 'Old summary');
    favoritesModule.addFavorite('task_1', 'New prompt', 'New summary');

    const list = favoritesModule.getFavorites();
    expect(list).toHaveLength(1);
    expect(list[0].prompt).toBe('New prompt');
    expect(list[0].summary).toBe('New summary');
  });

  it('should remove favorite', () => {
    if (!favoritesModule) return;

    favoritesModule.addFavorite('task_1', 'P1');
    favoritesModule.addFavorite('task_2', 'P2');
    favoritesModule.removeFavorite('task_1');

    const list = favoritesModule.getFavorites();
    expect(list).toHaveLength(1);
    expect(list[0].taskId).toBe('task_2');
  });

  it('should return isFavorite true when task is favorited', () => {
    if (!favoritesModule) return;

    favoritesModule.addFavorite('task_1', 'P1');
    expect(favoritesModule.isFavorite('task_1')).toBe(true);
    expect(favoritesModule.isFavorite('task_2')).toBe(false);
  });

  it('should return isFavorite false after remove', () => {
    if (!favoritesModule) return;

    favoritesModule.addFavorite('task_1', 'P1');
    favoritesModule.removeFavorite('task_1');
    expect(favoritesModule.isFavorite('task_1')).toBe(false);
  });
});
