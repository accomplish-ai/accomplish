// apps/desktop/src/renderer/components/landing/PlusMenu/index.tsx

import { useState, useEffect, useCallback } from 'react';
import { Plus, Paperclip } from 'lucide-react';
import type { Skill, McpConnector } from '@accomplish_ai/agent-core/common';
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
import { ConnectorsSubmenu } from './ConnectorsSubmenu';
import { CreateSkillModal } from '@/components/skills/CreateSkillModal';

interface PlusMenuProps {
  onSkillSelect: (command: string) => void;
  onOpenSettings: (tab: 'skills' | 'connectors') => void;
  disabled?: boolean;
}

export function PlusMenu({ onSkillSelect, onOpenSettings, disabled }: PlusMenuProps) {
  const [open, setOpen] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [connectors, setConnectors] = useState<McpConnector[]>([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch enabled skills and connectors when dropdown opens
  useEffect(() => {
    if (open && window.accomplish) {
      window.accomplish
        .getEnabledSkills()
        .then((skills) => setSkills(skills.filter((s) => !s.isHidden)))
        .catch((err) => console.error('Failed to load skills:', err));

      window.accomplish
        .getConnectors()
        .then(setConnectors)
        .catch((err) => console.error('Failed to load connectors:', err));
    }
  }, [open]);

  const handleRefresh = async () => {
    const accomplish = window.accomplish;
    if (!accomplish || isRefreshing) return;
    setIsRefreshing(true);
    try {
      // Run resync and minimum delay in parallel so animation is visible
      const [, updatedSkills] = await Promise.all([
        new Promise((resolve) => setTimeout(resolve, 600)),
        accomplish.resyncSkills().then(() => accomplish.getEnabledSkills()),
      ]);
      // Filter out hidden skills for UI display
      setSkills(updatedSkills.filter((s) => !s.isHidden));
    } catch (err) {
      console.error('Failed to refresh skills:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSkillSelect = (command: string) => {
    onSkillSelect(command);
    setOpen(false);
  };

  const handleManageSkills = () => {
    setOpen(false);
    onOpenSettings('skills');
  };

  const handleCreateNewSkill = () => {
    setOpen(false);
    setCreateModalOpen(true);
  };

  const handleToggleConnector = useCallback(async (id: string, enabled: boolean) => {
    if (!window.accomplish) return;
    try {
      await window.accomplish.setConnectorEnabled(id, enabled);
      setConnectors((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isEnabled: enabled } : c))
      );
    } catch (err) {
      console.error('Failed to toggle connector:', err);
    }
  }, []);

  const handleManageConnectors = () => {
    setOpen(false);
    onOpenSettings('connectors');
  };

  return (
    <>
      <CreateSkillModal open={createModalOpen} onOpenChange={setCreateModalOpen} />
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
        <DropdownMenuItem disabled className="text-muted-foreground/60">
          <Paperclip className="h-4 w-4 mr-2 shrink-0" />
          Attach Files
          <span className="ml-auto pl-4 text-[10px] text-muted-foreground/50 whitespace-nowrap">Soon</span>
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
              onCreateNewSkill={handleCreateNewSkill}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {connectors.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <svg
                  className="h-4 w-4 mr-2"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                Connectors
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-[280px] p-0">
                <ConnectorsSubmenu
                  connectors={connectors}
                  onToggle={handleToggleConnector}
                  onManageConnectors={handleManageConnectors}
                />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
    </>
  );
}
