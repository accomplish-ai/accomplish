'use client';

import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getAccomplish } from '@/lib/accomplish';
import { useKnowledgeNotes } from './useKnowledgeNotes';
import { AddNoteForm } from './AddNoteForm';
import { NoteRow } from './NoteRow';

const MAX_NOTES = 20;

interface KnowledgeNotesPanelProps {
  workspaceId: string;
}

export function KnowledgeNotesPanel({ workspaceId }: KnowledgeNotesPanelProps) {
  const { t } = useTranslation('settings');
  const accomplish = useMemo(() => getAccomplish(), []);
  const {
    notes,
    error,
    showAddForm,
    setShowAddForm,
    editingId,
    setEditingId,
    newType,
    setNewType,
    newContent,
    setNewContent,
    editType,
    setEditType,
    editContent,
    setEditContent,
    handleAdd,
    handleEdit,
    handleDelete,
    startEdit,
  } = useKnowledgeNotes(accomplish, workspaceId);

  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-medium text-foreground">{t('knowledgeNotes.title')}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">{t('knowledgeNotes.description')}</p>
        </div>
        {notes.length < MAX_NOTES && !showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('knowledgeNotes.addNote')}
          </button>
        )}
      </div>

      {showAddForm && (
        <AddNoteForm
          newType={newType}
          newContent={newContent}
          setNewType={setNewType}
          setNewContent={setNewContent}
          onSave={handleAdd}
          onCancel={() => {
            setShowAddForm(false);
            setNewContent('');
          }}
        />
      )}

      {error && <p className="mb-2 text-xs text-destructive">{error}</p>}

      {notes.length === 0 && !showAddForm && (
        <p className="text-xs text-muted-foreground italic">{t('knowledgeNotes.empty')}</p>
      )}

      <div className="space-y-2">
        {notes.map((note) => (
          <NoteRow
            key={note.id}
            note={note}
            isEditing={editingId === note.id}
            editType={editType}
            editContent={editContent}
            setEditType={setEditType}
            setEditContent={setEditContent}
            onStartEdit={startEdit}
            onCancelEdit={() => setEditingId(null)}
            onSaveEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {notes.length >= MAX_NOTES && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t('knowledgeNotes.maxNotes', { max: MAX_NOTES })}
        </p>
      )}
    </div>
  );
}
