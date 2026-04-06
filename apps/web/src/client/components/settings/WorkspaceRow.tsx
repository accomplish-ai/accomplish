import { Button } from '@/components/ui/button';
import { Pencil, Trash2 } from 'lucide-react';
import type { Workspace } from '@accomplish_ai/agent-core/common';
import { EditWorkspaceForm } from './WorkspacePanelForm';
import { KnowledgeNotesPanel } from './KnowledgeNotesPanel';

interface WorkspaceRowProps {
  workspace: Workspace;
  isEditing: boolean;
  isDeleting: boolean;
  editName: string;
  editDescription: string;
  editColor: string;
  onEditNameChange: (v: string) => void;
  onEditDescriptionChange: (v: string) => void;
  onEditColorChange: (v: string) => void;
  onStartEdit: (workspace: Workspace) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: string) => void;
}

export function WorkspaceRow({
  workspace,
  isEditing,
  isDeleting,
  editName,
  editDescription,
  editColor,
  onEditNameChange,
  onEditDescriptionChange,
  onEditColorChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onStartDelete,
  onCancelDelete,
  onConfirmDelete,
}: WorkspaceRowProps) {
  if (isEditing) {
    return (
      <EditWorkspaceForm
        name={editName}
        description={editDescription}
        color={editColor}
        onNameChange={onEditNameChange}
        onDescriptionChange={onEditDescriptionChange}
        onColorChange={onEditColorChange}
        onSave={onSaveEdit}
        onCancel={onCancelEdit}
      />
    );
  }

  if (isDeleting) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Delete &quot;{workspace.name}&quot;? All tasks and history in this workspace will be
          permanently removed.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancelDelete}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={() => onConfirmDelete(workspace.id)}>
            Delete
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
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
                <span className="ml-2 text-xs text-muted-foreground font-normal">(Default)</span>
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
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onStartEdit(workspace)}
            title="Edit workspace"
            aria-label={`Edit workspace ${workspace.name}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {!workspace.isDefault && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => onStartDelete(workspace.id)}
              title="Delete workspace"
              aria-label={`Delete workspace ${workspace.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      <KnowledgeNotesPanel workspaceId={workspace.id} />
    </>
  );
}
