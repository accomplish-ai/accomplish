import type { Task, TaskMessage, TaskStatus, TaskAttachment } from '../../shared/types/task.js';
import type { TodoItem } from '../../shared/types/todo.js';
import { getDatabase } from '../database.js';

export interface StoredTask {
  id: string;
  prompt: string;
  summary?: string;
  status: TaskStatus;
  messages: TaskMessage[];
  sessionId?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface TaskRow {
  id: string;
  prompt: string;
  summary: string | null;
  status: string;
  session_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface MessageRow {
  id: string;
  task_id: string;
  type: string;
  content: string;
  tool_name: string | null;
  tool_input: string | null;
  timestamp: string;
  sort_order: number;
}

interface AttachmentRow {
  id: number;
  message_id: string;
  type: string;
  data: string;
  label: string | null;
}

interface TodoRow {
  id: number;
  task_id: string;
  todo_id: string;
  content: string;
  status: string;
  priority: string;
  sort_order: number;
}

const MAX_HISTORY_ITEMS = 100;

function getMessagesForTask(taskId: string): TaskMessage[] {
  const db = getDatabase();

  const messageRows = db
    .prepare(
      'SELECT * FROM task_messages WHERE task_id = ? ORDER BY sort_order ASC'
    )
    .all(taskId) as MessageRow[];

  const messages: TaskMessage[] = [];

  for (const row of messageRows) {
    const attachmentRows = db
      .prepare('SELECT * FROM task_attachments WHERE message_id = ?')
      .all(row.id) as AttachmentRow[];

    const attachments: TaskAttachment[] | undefined =
      attachmentRows.length > 0
        ? attachmentRows.map((a) => ({
            type: a.type as 'screenshot' | 'json',
            data: a.data,
            label: a.label || undefined,
          }))
        : undefined;

    messages.push({
      id: row.id,
      type: row.type as TaskMessage['type'],
      content: row.content,
      toolName: row.tool_name || undefined,
      toolInput: row.tool_input ? JSON.parse(row.tool_input) : undefined,
      timestamp: row.timestamp,
      attachments,
    });
  }

  return messages;
}

function rowToTask(row: TaskRow): StoredTask {
  return {
    id: row.id,
    prompt: row.prompt,
    summary: row.summary || undefined,
    status: row.status as TaskStatus,
    sessionId: row.session_id || undefined,
    createdAt: row.created_at,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    messages: getMessagesForTask(row.id),
  };
}

export function getTasks(): StoredTask[] {
  const db = getDatabase();
  const rows = db
    .prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?')
    .all(MAX_HISTORY_ITEMS) as TaskRow[];

  return rows.map(rowToTask);
}

export function getTask(taskId: string): StoredTask | undefined {
  const db = getDatabase();
  const row = db
    .prepare('SELECT * FROM tasks WHERE id = ?')
    .get(taskId) as TaskRow | undefined;

  return row ? rowToTask(row) : undefined;
}

export function saveTask(task: Task): void {
  const db = getDatabase();

  db.transaction(() => {
    db.prepare(
      `INSERT OR REPLACE INTO tasks
        (id, prompt, summary, status, session_id, created_at, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      task.id,
      task.prompt,
      task.summary || null,
      task.status,
      task.sessionId || null,
      task.createdAt,
      task.startedAt || null,
      task.completedAt || null
    );

    db.prepare('DELETE FROM task_messages WHERE task_id = ?').run(task.id);

    const insertMessage = db.prepare(
      `INSERT INTO task_messages
        (id, task_id, type, content, tool_name, tool_input, timestamp, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const insertAttachment = db.prepare(
      `INSERT INTO task_attachments (message_id, type, data, label) VALUES (?, ?, ?, ?)`
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
        sortOrder++
      );

      if (msg.attachments) {
        for (const att of msg.attachments) {
          insertAttachment.run(msg.id, att.type, att.data, att.label || null);
        }
      }
    }

    db.prepare(
      `DELETE FROM tasks WHERE id NOT IN (
        SELECT id FROM tasks ORDER BY created_at DESC LIMIT ?
      )`
    ).run(MAX_HISTORY_ITEMS);
  })();
}

export function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  completedAt?: string
): void {
  const db = getDatabase();

  if (completedAt) {
    db.prepare('UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?').run(
      status,
      completedAt,
      taskId
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      message.id,
      taskId,
      message.type,
      message.content,
      message.toolName || null,
      message.toolInput ? JSON.stringify(message.toolInput) : null,
      message.timestamp,
      sortOrder
    );

    if (message.attachments) {
      const insertAttachment = db.prepare(
        `INSERT INTO task_attachments (message_id, type, data, label) VALUES (?, ?, ?, ?)`
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

export function getTodosForTask(taskId: string): TodoItem[] {
  const db = getDatabase();

  const rows = db
    .prepare('SELECT * FROM task_todos WHERE task_id = ? ORDER BY sort_order ASC')
    .all(taskId) as TodoRow[];

  return rows.map((row) => ({
    id: row.todo_id,
    content: row.content,
    status: row.status as TodoItem['status'],
    priority: row.priority as TodoItem['priority'],
  }));
}

export function saveTodosForTask(taskId: string, todos: TodoItem[]): void {
  const db = getDatabase();

  db.transaction(() => {
    db.prepare('DELETE FROM task_todos WHERE task_id = ?').run(taskId);

    const insert = db.prepare(
      `INSERT INTO task_todos (task_id, todo_id, content, status, priority, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    todos.forEach((todo, index) => {
      insert.run(taskId, todo.id, todo.content, todo.status, todo.priority, index);
    });
  })();
}

export function clearTodosForTask(taskId: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM task_todos WHERE task_id = ?').run(taskId);
}
