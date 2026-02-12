import type { StoredFavorite } from '../../types/storage.js';
import { getDatabase } from '../database.js';

export function addFavorite(taskId: string, prompt: string, summary?: string): void {
  const db = getDatabase();
  const favoritedAt = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO task_favorites (task_id, prompt, summary, favorited_at)
     VALUES (?, ?, ?, ?)`
  ).run(taskId, prompt, summary ?? null, favoritedAt);
}

export function removeFavorite(taskId: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM task_favorites WHERE task_id = ?').run(taskId);
}

export function getFavorites(): StoredFavorite[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT task_id, prompt, summary, favorited_at
       FROM task_favorites
       ORDER BY favorited_at DESC`
    )
    .all() as Array<{
    task_id: string;
    prompt: string;
    summary: string | null;
    favorited_at: string;
  }>;
  return rows.map((row) => ({
    taskId: row.task_id,
    prompt: row.prompt,
    summary: row.summary ?? undefined,
    favoritedAt: row.favorited_at,
  }));
}

export function isFavorite(taskId: string): boolean {
  const db = getDatabase();
  const row = db.prepare('SELECT 1 FROM task_favorites WHERE task_id = ?').get(taskId);
  return !!row;
}
