import type { Task, TaskMessage, TaskStatus } from '../../common/types/task.js';
import { getDatabase } from '../database.js';
import { rowToTask, getMessagesForTask } from './task-row-mapper.js';
import type { TaskRow, StoredTask } from './task-row-mapper.js';

export type { StoredTask } from './task-row-mapper.js';

// Todo functions
export { getTodosForTask, saveTodosForTask, clearTodosForTask } from './task-todos.js';

// Re-export for internal use by other modules
export { getMessagesForTask };

const MAX_HISTORY_ITEMS = 100;

export function getTasks(workspaceId?: string | null): StoredTask[] {
  const db = getDatabase();
  let rows: TaskRow[];
  if (workspaceId) {
    rows = db
      .prepare('SELECT * FROM tasks WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(workspaceId, MAX_HISTORY_ITEMS) as TaskRow[];
  } else {
    rows = db
      .prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?')
      .all(MAX_HISTORY_ITEMS) as TaskRow[];
  }

  return rows.map(rowToTask);
}

export function getTask(taskId: string): StoredTask | undefined {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow | undefined;

  return row ? rowToTask(row) : undefined;
}

export function saveTask(task: Task, workspaceId?: string | null): void {
  const db = getDatabase();

  db.transaction(() => {
    db.prepare(
      `INSERT OR REPLACE INTO tasks
        (id, prompt, summary, status, session_id, created_at, started_at, completed_at, workspace_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      task.id,
      task.prompt,
      task.summary || null,
      task.status,
      task.sessionId || null,
      task.createdAt,
      task.startedAt || null,
      task.completedAt || null,
      workspaceId || null,
    );

    db.prepare('DELETE FROM task_messages WHERE task_id = ?').run(task.id);

    const insertMessage = db.prepare(
      `INSERT INTO task_messages
        (id, task_id, type, content, tool_name, tool_input, timestamp, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const insertAttachment = db.prepare(
      `INSERT INTO task_attachments (message_id, type, data, label) VALUES (?, ?, ?, ?)`,
    );

    let sortOrder = 0;
    for (const msg of task.messages || []) {
      insertMessage.run(
        msg.id,
        task.id,
        msg.type,
        msg.content,
        msg.toolName || null,
        msg.toolInput ? JSON.stringify(msg.toolInput) : null,
        msg.timestamp,
        sortOrder++,
      );

      if (msg.attachments) {
        for (const att of msg.attachments) {
          insertAttachment.run(msg.id, att.type, att.data, att.label || null);
        }
      }
    }

    if (workspaceId) {
      db.prepare(
        `DELETE FROM tasks
         WHERE workspace_id = ?
           AND id NOT IN (
             SELECT id FROM tasks WHERE workspace_id = ?
             ORDER BY created_at DESC LIMIT ?
           )`,
      ).run(workspaceId, workspaceId, MAX_HISTORY_ITEMS);
    } else {
      db.prepare(
        `DELETE FROM tasks
         WHERE workspace_id IS NULL
           AND id NOT IN (
             SELECT id FROM tasks WHERE workspace_id IS NULL
             ORDER BY created_at DESC LIMIT ?
           )`,
      ).run(MAX_HISTORY_ITEMS);
    }
  })();
}

export function updateTaskStatus(taskId: string, status: TaskStatus, completedAt?: string): void {
  const db = getDatabase();

  if (completedAt) {
    db.prepare('UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?').run(
      status,
      completedAt,
      taskId,
    );
  } else {
    db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, taskId);
  }
}

export function addTaskMessage(taskId: string, message: TaskMessage): void {
  const db = getDatabase();

  db.transaction(() => {
    const maxOrder = db
      .prepare('SELECT MAX(sort_order) as max FROM task_messages WHERE task_id = ?')
      .get(taskId) as { max: number | null };

    const sortOrder = (maxOrder.max ?? -1) + 1;

    db.prepare(
      `INSERT INTO task_messages
        (id, task_id, type, content, tool_name, tool_input, timestamp, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      message.id,
      taskId,
      message.type,
      message.content,
      message.toolName || null,
      message.toolInput ? JSON.stringify(message.toolInput) : null,
      message.timestamp,
      sortOrder,
    );

    if (message.attachments) {
      const insertAttachment = db.prepare(
        `INSERT INTO task_attachments (message_id, type, data, label) VALUES (?, ?, ?, ?)`,
      );

      for (const att of message.attachments) {
        insertAttachment.run(message.id, att.type, att.data, att.label || null);
      }
    }
  })();
}

export function updateTaskSessionId(taskId: string, sessionId: string): void {
  const db = getDatabase();
  db.prepare('UPDATE tasks SET session_id = ? WHERE id = ?').run(sessionId, taskId);
}

export function updateTaskSummary(taskId: string, summary: string): void {
  const db = getDatabase();
  db.prepare('UPDATE tasks SET summary = ? WHERE id = ?').run(summary, taskId);
}

export function deleteTask(taskId: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
}

export function clearHistory(): void {
  const db = getDatabase();
  db.prepare('DELETE FROM tasks').run();
}

export function setMaxHistoryItems(_max: number): void {}

export function clearTaskHistoryStore(): void {
  clearHistory();
}

export function flushPendingTasks(): void {}
