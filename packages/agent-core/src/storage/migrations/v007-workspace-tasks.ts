import type { Database } from "better-sqlite3";
import type { Migration } from "./index.js";

export const migration: Migration = {
  version: 7,
  up: (db: Database) => {
    // Add workspace_id column to tasks table
    db.exec(`ALTER TABLE tasks ADD COLUMN workspace_id TEXT`);

    // Index for filtering tasks by workspace
    db.exec(`CREATE INDEX idx_tasks_workspace_id ON tasks(workspace_id)`);
  },
};
