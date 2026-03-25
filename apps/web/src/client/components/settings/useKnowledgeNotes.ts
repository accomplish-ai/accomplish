import { useState, useEffect, useCallback } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import type { KnowledgeNote, KnowledgeNoteType } from '@accomplish_ai/agent-core';

type AccomplishInstance = ReturnType<typeof getAccomplish>;

export interface UseKnowledgeNotesReturn {
  notes: KnowledgeNote[];
  error: string | null;
  showAddForm: boolean;
  setShowAddForm: (show: boolean) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  newType: KnowledgeNoteType;
  setNewType: (type: KnowledgeNoteType) => void;
  newContent: string;
  setNewContent: (content: string) => void;
  editType: KnowledgeNoteType;
  setEditType: (type: KnowledgeNoteType) => void;
  editContent: string;
  setEditContent: (content: string) => void;
  handleAdd: () => Promise<void>;
  handleEdit: (id: string) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  startEdit: (note: KnowledgeNote) => void;
}

export function useKnowledgeNotes(
  accomplish: AccomplishInstance,
  workspaceId: string,
): UseKnowledgeNotesReturn {
  const [notes, setNotes] = useState<KnowledgeNote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newType, setNewType] = useState<KnowledgeNoteType>('context');
  const [newContent, setNewContent] = useState('');
  const [editType, setEditType] = useState<KnowledgeNoteType>('context');
  const [editContent, setEditContent] = useState('');

  const loadNotes = useCallback(async () => {
    const loaded = await accomplish.listKnowledgeNotes(workspaceId);
    setNotes(loaded);
  }, [accomplish, workspaceId]);

  useEffect(() => {
    let isActive = true;
    accomplish
      .listKnowledgeNotes(workspaceId)
      .then((loaded) => {
        if (isActive) {
          setError(null);
          setNotes(loaded);
        }
      })
      .catch((err: unknown) => {
        if (isActive) {
          setError(err instanceof Error ? err.message : String(err));
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
      setError(null);
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
        setError(null);
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
        setError(null);
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

  return {
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
  };
}
