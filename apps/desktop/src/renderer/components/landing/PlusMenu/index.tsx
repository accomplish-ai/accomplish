// apps/desktop/src/renderer/components/landing/PlusMenu/index.tsx

import { useState, useEffect } from 'react';
import { Plus, Paperclip } from 'lucide-react';
import type { Skill } from '@accomplish/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { SkillsSubmenu } from './SkillsSubmenu';

interface PlusMenuProps {
  onSkillSelect: (command: string) => void;
  onOpenSettings: (tab: 'skills') => void;
  onFilesSelected: (paths: string[]) => void;
  disabled?: boolean;
}

export function PlusMenu({ onSkillSelect, onOpenSettings, onFilesSelected, disabled }: PlusMenuProps) {
  const [open, setOpen] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);

  // Fetch enabled skills on mount
  useEffect(() => {
    if (window.accomplish) {
      window.accomplish
        .getEnabledSkills()
        .then(setSkills)
        .catch((err) => console.error('Failed to load skills:', err));
    }
  }, []);

  const handleSkillSelect = (command: string) => {
    onSkillSelect(command);
    setOpen(false);
  };

  const handleManageSkills = () => {
    setOpen(false);
    onOpenSettings('skills');
  };

  const handleAttachFiles = async () => {
    setOpen(false);
    if (window.accomplish?.openFilePicker) {
      const paths = await window.accomplish.openFilePicker();
      if (paths.length > 0) {
        onFilesSelected(paths);
      }
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          disabled={disabled}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          title="Add content"
        >
          <Plus className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[200px]">
        <DropdownMenuItem onClick={handleAttachFiles}>
          <Paperclip className="h-4 w-4 mr-2" />
          Attach Files
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <svg
              className="h-4 w-4 mr-2"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Use Skills
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-[280px] p-0">
            <SkillsSubmenu
              skills={skills}
              onSkillSelect={handleSkillSelect}
              onManageSkills={handleManageSkills}
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
