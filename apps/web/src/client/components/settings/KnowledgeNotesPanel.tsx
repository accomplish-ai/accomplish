'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getAccomplish } from '@/lib/accomplish';
import type { KnowledgeNote, KnowledgeNoteType } from '@accomplish_ai/agent-core';

const NOTE_TYPES: KnowledgeNoteType[] = ['context', 'instruction', 'reference'];
const MAX_CONTENT_LENGTH = 500;
const MAX_NOTES = 20;

interface KnowledgeNotesPanelProps {
  workspaceId: string;
}

export function KnowledgeNotesPanel({ workspaceId }: KnowledgeNotesPanelProps) {
  const { t } = useTranslation('settings');
  const accomplish = useMemo(() => getAccomplish(), []);

  const [notes, setNotes] = useState<KnowledgeNote[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newType, setNewType] = useState<KnowledgeNoteType>('context');
  const [newContent, setNewContent] = useState('');
  const [editType, setEditType] = useState<KnowledgeNoteType>('context');
  const [editContent, setEditContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    const loaded = await accomplish.listKnowledgeNotes(workspaceId);
    setNotes(loaded);
  }, [accomplish, workspaceId]);

  useEffect(() => {
    let isActive = true;
    void accomplish.listKnowledgeNotes(workspaceId).then((loaded) => {
      if (isActive) {
        setNotes(loaded);
      }
    });
    return () => {
      isActive = false;
    };
  }, [accomplish, workspaceId]);

  const handleAdd = useCallback(async () => {
    if (!newContent.trim()) {
      return;
    }
    try {
      await accomplish.createKnowledgeNote({
        workspaceId,
        type: newType,
        content: newContent.trim(),
      });
      setNewContent('');
      setNewType('context');
      setShowAddForm(false);
      await loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [accomplish, workspaceId, newType, newContent, loadNotes]);

  const handleEdit = useCallback(
    async (id: string) => {
      if (!editContent.trim()) {
        return;
      }
      try {
        await accomplish.updateKnowledgeNote(id, workspaceId, {
          type: editType,
          content: editContent.trim(),
        });
        setEditingId(null);
        await loadNotes();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [accomplish, workspaceId, editType, editContent, loadNotes],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await accomplish.deleteKnowledgeNote(id, workspaceId);
        await loadNotes();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [accomplish, workspaceId, loadNotes],
  );

  const startEdit = useCallback((note: KnowledgeNote) => {
    setEditingId(note.id);
    setEditType(note.type);
    setEditContent(note.content);
  }, []);

  const typeLabel = useCallback(
    (type: KnowledgeNoteType) => t(`knowledgeNotes.types.${type}`),
    [t],
  );

  const typeBadgeColor = (type: KnowledgeNoteType) => {
    switch (type) {
      case 'context':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'instruction':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'reference':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    }
  };

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
        <div className="mb-3 rounded-md border border-border bg-background p-3 space-y-2">
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as KnowledgeNoteType)}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            {NOTE_TYPES.map((type) => (
              <option key={type} value={type}>
                {typeLabel(type)}
              </option>
            ))}
          </select>
          <textarea
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
                aria-label={t('knowledgeNotes.cancel')}
                title={t('knowledgeNotes.cancel')}
                onClick={() => {
                  setShowAddForm(false);
                  setNewContent('');
                }}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                aria-label={t('knowledgeNotes.save')}
                title={t('knowledgeNotes.save')}
                onClick={handleAdd}
                disabled={!newContent.trim()}
                className="p-1 text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="mb-2 text-xs text-destructive">{error}</p>}

      {notes.length === 0 && !showAddForm && (
        <p className="text-xs text-muted-foreground italic">{t('knowledgeNotes.empty')}</p>
      )}

      <div className="space-y-2">
        {notes.map((note) => (
          <div key={note.id} className="rounded-md border border-border bg-background p-2.5">
            {editingId === note.id ? (
              <div className="space-y-2">
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as KnowledgeNoteType)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                >
                  {NOTE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {typeLabel(type)}
                    </option>
                  ))}
                </select>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value.slice(0, MAX_CONTENT_LENGTH))}
                  rows={2}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm resize-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    aria-label={t('knowledgeNotes.cancel')}
                    title={t('knowledgeNotes.cancel')}
                    onClick={() => setEditingId(null)}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <button
                    aria-label={t('knowledgeNotes.save')}
                    title={t('knowledgeNotes.save')}
                    onClick={() => handleEdit(note.id)}
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
                    {typeLabel(note.type)}
                  </span>
                  <p className="mt-1 text-sm text-foreground whitespace-pre-wrap break-words">
                    {note.content}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    aria-label={t('knowledgeNotes.edit')}
                    title={t('knowledgeNotes.edit')}
                    onClick={() => startEdit(note)}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    aria-label={t('knowledgeNotes.delete')}
                    title={t('knowledgeNotes.delete')}
                    onClick={() => handleDelete(note.id)}
                    className="p-1 text-muted-foreground hover:text-danger transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
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
