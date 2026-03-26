import { Trash2, Pencil, Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { KnowledgeNote, KnowledgeNoteType } from '@accomplish_ai/agent-core';

const NOTE_TYPES: KnowledgeNoteType[] = ['context', 'instruction', 'reference'];
const MAX_CONTENT_LENGTH = 500;

function typeBadgeColor(type: KnowledgeNoteType): string {
  switch (type) {
    case 'context':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'instruction':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    case 'reference':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  }
}

interface NoteRowProps {
  note: KnowledgeNote;
  isEditing: boolean;
  editType: KnowledgeNoteType;
  editContent: string;
  setEditType: (type: KnowledgeNoteType) => void;
  setEditContent: (content: string) => void;
  onStartEdit: (note: KnowledgeNote) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function NoteRow({
  note,
  isEditing,
  editType,
  editContent,
  setEditType,
  setEditContent,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: NoteRowProps) {
  const { t } = useTranslation('settings');

  return (
    <div className="rounded-md border border-border bg-background p-2.5">
      {isEditing ? (
        <div className="space-y-2">
          <select
            aria-label={t('knowledgeNotes.labels.type')}
            value={editType}
            onChange={(e) => setEditType(e.target.value as KnowledgeNoteType)}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            {NOTE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`knowledgeNotes.types.${type}`)}
              </option>
            ))}
          </select>
          <textarea
            aria-label={t('knowledgeNotes.labels.content')}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value.slice(0, MAX_CONTENT_LENGTH))}
            rows={2}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm resize-none"
          />
          <div className="flex justify-end gap-2">
            <button
              aria-label={t('knowledgeNotes.cancel')}
              title={t('knowledgeNotes.cancel')}
              onClick={onCancelEdit}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              aria-label={t('knowledgeNotes.save')}
              title={t('knowledgeNotes.save')}
              onClick={() => onSaveEdit(note.id)}
              className="p-1 text-primary hover:text-primary/80 transition-colors"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <span
              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${typeBadgeColor(note.type)}`}
            >
              {t(`knowledgeNotes.types.${note.type}`)}
            </span>
            <p className="mt-1 text-sm text-foreground whitespace-pre-wrap break-words">
              {note.content}
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            <button
              aria-label={t('knowledgeNotes.edit')}
              title={t('knowledgeNotes.edit')}
              onClick={() => onStartEdit(note)}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              aria-label={t('knowledgeNotes.delete')}
              title={t('knowledgeNotes.delete')}
              onClick={() => onDelete(note.id)}
              className="p-1 text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
