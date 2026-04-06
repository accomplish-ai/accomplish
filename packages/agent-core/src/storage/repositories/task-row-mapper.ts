import type { TaskMessage, TaskStatus, TaskAttachment } from '../../common/types/task.js';
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

export interface TaskRow {
  id: string;
  prompt: string;
  summary: string | null;
  status: string;
  session_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface MessageRow {
  id: string;
  task_id: string;
  type: string;
  content: string;
  tool_name: string | null;
  tool_input: string | null;
  timestamp: string;
  sort_order: number;
}

export interface AttachmentRow {
  id: number;
  message_id: string;
  type: string;
  data: string;
  label: string | null;
}

export function getMessagesForTask(taskId: string): TaskMessage[] {
  const db = getDatabase();

  const messageRows = db
    .prepare('SELECT * FROM task_messages WHERE task_id = ? ORDER BY sort_order ASC')
    .all(taskId) as MessageRow[];

  if (messageRows.length === 0) {
    return [];
  }

  // Fetch all attachments in a single query to avoid N+1
  const messageIds = messageRows.map((r) => r.id);
  const placeholders = messageIds.map(() => '?').join(',');
  const allAttachmentRows = db
    .prepare(`SELECT * FROM task_attachments WHERE message_id IN (${placeholders})`)
    .all(...messageIds) as AttachmentRow[];

  // Group attachments by message_id
  const attachmentsByMessageId = new Map<string, AttachmentRow[]>();
  for (const row of allAttachmentRows) {
    const existing = attachmentsByMessageId.get(row.message_id);
    if (existing) {
      existing.push(row);
    } else {
      attachmentsByMessageId.set(row.message_id, [row]);
    }
  }

  const messages: TaskMessage[] = [];

  for (const row of messageRows) {
    const attachmentRows = attachmentsByMessageId.get(row.id) ?? [];

    const attachments: TaskAttachment[] | undefined =
      attachmentRows.length > 0
        ? attachmentRows.map((a) => ({
            type: a.type as 'screenshot' | 'json',
            data: a.data,
            label: a.label || undefined,
          }))
        : undefined;

    let toolInput: unknown;
    if (row.tool_input) {
      try {
        toolInput = JSON.parse(row.tool_input);
      } catch {
        toolInput = row.tool_input;
      }
    }
    messages.push({
      id: row.id,
      type: row.type as TaskMessage['type'],
      content: row.content,
      toolName: row.tool_name || undefined,
      toolInput,
      timestamp: row.timestamp,
      attachments,
    });
  }

  return messages;
}

export function rowToTask(row: TaskRow): StoredTask {
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
