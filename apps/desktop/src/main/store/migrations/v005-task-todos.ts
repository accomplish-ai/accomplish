// apps/desktop/src/main/store/migrations/v005-task-todos.ts

import type { Database } from 'better-sqlite3';
import type { Migration } from './index';

/**
 * Migration v005: Add task_todos table
 *
 * Creates a table to persist task todos so they survive app refresh.
 */
export const migration: Migration = {
  version: 5,
  up(db: Database): void {
    // Create task_todos table
    db.exec(`
      CREATE TABLE task_todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        todo_id TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        priority TEXT NOT NULL DEFAULT 'medium',
        sort_order INTEGER NOT NULL,
        UNIQUE(task_id, todo_id)
      )
    `);

    // Create index for fast lookups by task_id
    db.exec(`CREATE INDEX idx_task_todos_task_id ON task_todos(task_id)`);
  },
};
