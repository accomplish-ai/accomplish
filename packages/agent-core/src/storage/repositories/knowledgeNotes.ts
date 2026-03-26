import { getMetaDatabase } from '../workspace-meta-db.js';
import type {
  KnowledgeNote,
  KnowledgeNoteCreateInput,
  KnowledgeNoteUpdateInput,
  KnowledgeNoteType,
} from '../../common/types/workspace.js';

const NOTE_TYPE_LABELS: Record<KnowledgeNoteType, string> = {
  context: 'Context',
  instruction: 'Instruction',
  reference: 'Reference',
};

const MAX_NOTES_PER_WORKSPACE = 20;
const MAX_CONTENT_LENGTH = 500;

function createNoteId(): string {
  return `kn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function rowToNote(row: Record<string, unknown>): KnowledgeNote {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    type: row.type as KnowledgeNoteType,
    content: row.content as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function listKnowledgeNotes(workspaceId: string): KnowledgeNote[] {
  const db = getMetaDatabase();
  const rows = db
    .prepare('SELECT * FROM knowledge_notes WHERE workspace_id = ? ORDER BY created_at ASC')
    .all(workspaceId) as Record<string, unknown>[];
  return rows.map(rowToNote);
}

export function getKnowledgeNote(id: string, workspaceId: string): KnowledgeNote | null {
  const db = getMetaDatabase();
  const row = db
    .prepare('SELECT * FROM knowledge_notes WHERE id = ? AND workspace_id = ?')
    .get(id, workspaceId) as Record<string, unknown> | undefined;
  return row ? rowToNote(row) : null;
}

export function createKnowledgeNote(input: KnowledgeNoteCreateInput): KnowledgeNote {
  const db = getMetaDatabase();

  const count = db
    .prepare('SELECT COUNT(*) as cnt FROM knowledge_notes WHERE workspace_id = ?')
    .get(input.workspaceId) as { cnt: number };
  if (count.cnt >= MAX_NOTES_PER_WORKSPACE) {
    throw new Error(`Maximum of ${MAX_NOTES_PER_WORKSPACE} notes per workspace`);
  }

  const content = input.content.slice(0, MAX_CONTENT_LENGTH);
  const id = createNoteId();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO knowledge_notes (id, workspace_id, type, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, input.workspaceId, input.type, content, now, now);

  return getKnowledgeNote(id, input.workspaceId)!;
}

export function updateKnowledgeNote(
  id: string,
  workspaceId: string,
  input: KnowledgeNoteUpdateInput,
): KnowledgeNote | null {
  const db = getMetaDatabase();
  const existing = getKnowledgeNote(id, workspaceId);
  if (!existing) {
    return null;
  }

  const now = new Date().toISOString();
  const type = input.type ?? existing.type;
  const content =
    input.content !== undefined ? input.content.slice(0, MAX_CONTENT_LENGTH) : existing.content;

  db.prepare('UPDATE knowledge_notes SET type = ?, content = ?, updated_at = ? WHERE id = ?').run(
    type,
    content,
    now,
    id,
  );

  return getKnowledgeNote(id, workspaceId);
}

export function deleteKnowledgeNote(id: string, workspaceId: string): boolean {
  const db = getMetaDatabase();
  const result = db
    .prepare('DELETE FROM knowledge_notes WHERE id = ? AND workspace_id = ?')
    .run(id, workspaceId);
  return result.changes > 0;
}

export function getKnowledgeNotesForPrompt(workspaceId: string): string {
  const notes = listKnowledgeNotes(workspaceId);
  if (notes.length === 0) {
    return '';
  }

  const grouped: Record<KnowledgeNoteType, string[]> = {
    context: [],
    instruction: [],
    reference: [],
  };

  for (const note of notes) {
    if (!grouped[note.type]) {
      continue;
    }
    grouped[note.type].push(note.content);
  }

  const sections: string[] = [];
  for (const type of ['context', 'instruction', 'reference'] as KnowledgeNoteType[]) {
    if (grouped[type].length > 0) {
      const label = NOTE_TYPE_LABELS[type];
      const items = grouped[type].map((c) => `- ${c}`).join('\n');
      sections.push(`### ${label}\n${items}`);
    }
  }

  return sections.join('\n\n');
}
