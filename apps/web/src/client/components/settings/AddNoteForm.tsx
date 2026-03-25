import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { KnowledgeNoteType } from '@accomplish_ai/agent-core';
import { Textarea } from '@/components/ui/textarea';

const NOTE_TYPES: KnowledgeNoteType[] = ['context', 'instruction', 'reference'];
const MAX_CONTENT_LENGTH = 500;

interface AddNoteFormProps {
  newType: KnowledgeNoteType;
  newContent: string;
  setNewType: (type: KnowledgeNoteType) => void;
  setNewContent: (content: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function AddNoteForm({
  newType,
  newContent,
  setNewType,
  setNewContent,
  onSave,
  onCancel,
}: AddNoteFormProps) {
  const { t } = useTranslation('settings');

  return (
    <div className="mb-3 rounded-md border border-border bg-background p-3 space-y-2">
      <select
        aria-label={t('knowledgeNotes.labels.type')}
        value={newType}
        onChange={(e) => setNewType(e.target.value as KnowledgeNoteType)}
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
      >
        {NOTE_TYPES.map((type) => (
          <option key={type} value={type}>
            {t(`knowledgeNotes.types.${type}`)}
          </option>
        ))}
      </select>
      <Textarea
        aria-label={t('knowledgeNotes.labels.content')}
        value={newContent}
        onChange={(e) => setNewContent(e.target.value.slice(0, MAX_CONTENT_LENGTH))}
        placeholder={t('knowledgeNotes.placeholder')}
        rows={2}
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm resize-none"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {newContent.length}/{MAX_CONTENT_LENGTH}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label={t('knowledgeNotes.cancel')}
            title={t('knowledgeNotes.cancel')}
            onClick={onCancel}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={t('knowledgeNotes.save')}
            title={t('knowledgeNotes.save')}
            onClick={onSave}
            disabled={!newContent.trim()}
            className="p-1 text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
