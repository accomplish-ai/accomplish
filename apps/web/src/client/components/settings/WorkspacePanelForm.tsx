'use client';

import { Button } from '@/components/ui/button';
import { Plus, X, Check } from 'lucide-react';

export const WORKSPACE_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#64748b', // slate
];

interface ColorPickerProps {
  selectedColor: string;
  onColorChange: (color: string) => void;
}

export function ColorPicker({ selectedColor, onColorChange }: ColorPickerProps) {
  return (
    <div className="flex items-center gap-1.5">
      {WORKSPACE_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onColorChange(color)}
          aria-label={`Select color ${color}`}
          aria-pressed={selectedColor === color}
          className={`h-5 w-5 rounded-full transition-transform ${
            selectedColor === color
              ? 'ring-2 ring-primary ring-offset-2 ring-offset-card scale-110'
              : 'hover:scale-110'
          }`}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

interface CreateWorkspaceFormProps {
  name: string;
  description: string;
  color: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function CreateWorkspaceForm({
  name,
  description,
  color,
  onNameChange,
  onDescriptionChange,
  onColorChange,
  onSubmit,
  onCancel,
}: CreateWorkspaceFormProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <input
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        placeholder="Workspace name"
        autoFocus
      />
      <input
        type="text"
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        placeholder="Description (optional)"
      />
      <ColorPicker selectedColor={color} onColorChange={onColorChange} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-3.5 w-3.5 mr-1" />
          Cancel
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={!name.trim()}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Create
        </Button>
      </div>
    </div>
  );
}

interface EditWorkspaceFormProps {
  name: string;
  description: string;
  color: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function EditWorkspaceForm({
  name,
  description,
  color,
  onNameChange,
  onDescriptionChange,
  onColorChange,
  onSave,
  onCancel,
}: EditWorkspaceFormProps) {
  return (
    <div className="space-y-3">
      <input
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        placeholder="Workspace name"
        autoFocus
      />
      <input
        type="text"
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        placeholder="Description (optional)"
      />
      <ColorPicker selectedColor={color} onColorChange={onColorChange} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={!name.trim()}>
          <Check className="h-3.5 w-3.5 mr-1" />
          Save
        </Button>
      </div>
    </div>
  );
}
