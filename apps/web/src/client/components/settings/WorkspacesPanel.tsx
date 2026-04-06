'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import type { Workspace } from '@accomplish_ai/agent-core/common';
import { WorkspaceRow } from './WorkspaceRow';
import { CreateWorkspaceForm, WORKSPACE_COLORS } from './WorkspacePanelForm';

export function WorkspacesPanel() {
  const { workspaces, loadWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace } =
    useWorkspaceStore();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newColor, setNewColor] = useState(WORKSPACE_COLORS[0]);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editColor, setEditColor] = useState('');

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) {
      return;
    }
    const created = await createWorkspace({
      name: newName.trim(),
      description: newDescription.trim() || undefined,
      color: newColor,
    });
    if (!created) {
      return;
    }
    setNewName('');
    setNewDescription('');
    setNewColor(WORKSPACE_COLORS[0]);
    setShowCreateForm(false);
  }, [newName, newDescription, newColor, createWorkspace]);

  const handleStartEdit = useCallback((workspace: Workspace) => {
    setEditingId(workspace.id);
    setEditName(workspace.name);
    setEditDescription(workspace.description || '');
    setEditColor(workspace.color || WORKSPACE_COLORS[0]);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingId || !editName.trim()) {
      return;
    }
    const updated = await updateWorkspace(editingId, {
      name: editName.trim(),
      description: editDescription.trim() || undefined,
      color: editColor,
    });
    if (!updated) {
      return;
    }
    setEditingId(null);
  }, [editingId, editName, editDescription, editColor, updateWorkspace]);

  const handleDelete = useCallback(
    async (id: string) => {
      const success = await deleteWorkspace(id);
      if (success) {
        setDeletingId(null);
      }
    },
    [deleteWorkspace],
  );

  return (
    <div className="space-y-4">
      {/* Workspace List */}
      <div className="space-y-2">
        {workspaces.map((workspace) => (
          <div key={workspace.id} className="rounded-lg border border-border bg-card p-4">
            <WorkspaceRow
              workspace={workspace}
              isEditing={editingId === workspace.id}
              isDeleting={deletingId === workspace.id}
              editName={editName}
              editDescription={editDescription}
              editColor={editColor}
              onEditNameChange={setEditName}
              onEditDescriptionChange={setEditDescription}
              onEditColorChange={setEditColor}
              onStartEdit={handleStartEdit}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={() => setEditingId(null)}
              onStartDelete={setDeletingId}
              onCancelDelete={() => setDeletingId(null)}
              onConfirmDelete={handleDelete}
            />
          </div>
        ))}
      </div>

      {/* Create Form */}
      {showCreateForm ? (
        <CreateWorkspaceForm
          name={newName}
          description={newDescription}
          color={newColor}
          onNameChange={setNewName}
          onDescriptionChange={setNewDescription}
          onColorChange={setNewColor}
          onSubmit={handleCreate}
          onCancel={() => {
            setShowCreateForm(false);
            setNewName('');
            setNewDescription('');
            setNewColor(WORKSPACE_COLORS[0]);
          }}
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCreateForm(true)}
          className="w-full"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Create Workspace
        </Button>
      )}
    </div>
  );
}
