"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Plus, X, Check } from "lucide-react";
import type { Workspace } from "@accomplish_ai/agent-core/common";

const WORKSPACE_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#64748b", // slate
];

export function WorkspacesPanel() {
  const {
    workspaces,
    loadWorkspaces,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
  } = useWorkspaceStore();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Create form state
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newColor, setNewColor] = useState(WORKSPACE_COLORS[0]);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editColor, setEditColor] = useState("");

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    await createWorkspace({
      name: newName.trim(),
      description: newDescription.trim() || undefined,
      color: newColor,
    });
    setNewName("");
    setNewDescription("");
    setNewColor(WORKSPACE_COLORS[0]);
    setShowCreateForm(false);
  }, [newName, newDescription, newColor, createWorkspace]);

  const handleStartEdit = useCallback((workspace: Workspace) => {
    setEditingId(workspace.id);
    setEditName(workspace.name);
    setEditDescription(workspace.description || "");
    setEditColor(workspace.color || WORKSPACE_COLORS[0]);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingId || !editName.trim()) return;
    await updateWorkspace(editingId, {
      name: editName.trim(),
      description: editDescription.trim() || undefined,
      color: editColor,
    });
    setEditingId(null);
  }, [editingId, editName, editDescription, editColor, updateWorkspace]);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteWorkspace(id);
      setDeletingId(null);
    },
    [deleteWorkspace]
  );

  return (
    <div className="space-y-4">
      {/* Workspace List */}
      <div className="space-y-2">
        {workspaces.map((workspace) => (
          <div
            key={workspace.id}
            className="rounded-lg border border-border bg-card p-4"
          >
            {editingId === workspace.id ? (
              /* Edit Mode */
              <div className="space-y-3">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  placeholder="Workspace name"
                  autoFocus
                />
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  placeholder="Description (optional)"
                />
                <div className="flex items-center gap-1.5">
                  {WORKSPACE_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setEditColor(color)}
                      className={`h-5 w-5 rounded-full transition-transform ${
                        editColor === color
                          ? "ring-2 ring-primary ring-offset-2 ring-offset-card scale-110"
                          : "hover:scale-110"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveEdit}
                    disabled={!editName.trim()}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Save
                  </Button>
                </div>
              </div>
            ) : deletingId === workspace.id ? (
              /* Delete Confirmation */
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Delete &quot;{workspace.name}&quot;? All tasks, settings, and
                  API keys in this workspace will be permanently removed.
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeletingId(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(workspace.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ) : (
              /* Display Mode */
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  {workspace.color && (
                    <span
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: workspace.color }}
                    />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">
                      {workspace.name}
                      {workspace.isDefault && (
                        <span className="ml-2 text-xs text-muted-foreground font-normal">
                          (Default)
                        </span>
                      )}
                    </div>
                    {workspace.description && (
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {workspace.description}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleStartEdit(workspace)}
                    title="Edit workspace"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {!workspace.isDefault && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeletingId(workspace.id)}
                      title="Delete workspace"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Create Form */}
      {showCreateForm ? (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            placeholder="Workspace name"
            autoFocus
          />
          <input
            type="text"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            placeholder="Description (optional)"
          />
          <div className="flex items-center gap-1.5">
            {WORKSPACE_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setNewColor(color)}
                className={`h-5 w-5 rounded-full transition-transform ${
                  newColor === color
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-card scale-110"
                    : "hover:scale-110"
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowCreateForm(false);
                setNewName("");
                setNewDescription("");
                setNewColor(WORKSPACE_COLORS[0]);
              }}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Create
            </Button>
          </div>
        </div>
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
