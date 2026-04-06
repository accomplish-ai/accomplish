import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from '@phosphor-icons/react';
import type { Skill, McpConnector } from '@accomplish_ai/agent-core/common';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PlusMenuItems } from './PlusMenuItems';
import { CreateSkillModal } from '@/components/skills/CreateSkillModal';
import { createLogger } from '@/lib/logger';

const logger = createLogger('PlusMenu');

interface PlusMenuProps {
  onSkillSelect: (command: string) => void;
  onOpenSettings: (tab: 'skills' | 'connectors') => void;
  onAttachFiles?: () => void;
  onSelectFolder?: (folderPath: string) => void;
  disabled?: boolean;
  attachmentCount?: number;
  maxAttachments?: number;
}

export function PlusMenu({
  onSkillSelect,
  onOpenSettings,
  onAttachFiles,
  onSelectFolder,
  disabled,
  attachmentCount = 0,
  maxAttachments = 5,
}: PlusMenuProps) {
  const { t } = useTranslation('home');
  const [open, setOpen] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [connectors, setConnectors] = useState<McpConnector[]>([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (open && window.accomplish) {
      window.accomplish
        .getEnabledSkills()
        .then((skills) => setSkills(skills.filter((s) => !s.isHidden)))
        .catch((err) => logger.error('Failed to load skills:', err));

      window.accomplish
        .getConnectors()
        .then(setConnectors)
        .catch((err) => logger.error('Failed to load connectors:', err));
    }
  }, [open]);

  const handleRefresh = async () => {
    const accomplish = window.accomplish;
    if (!accomplish || isRefreshing) return;
    setIsRefreshing(true);
    try {
      const [, updatedSkills] = await Promise.all([
        new Promise((resolve) => setTimeout(resolve, 600)),
        accomplish.resyncSkills().then(() => accomplish.getEnabledSkills()),
      ]);
      setSkills(updatedSkills.filter((s) => !s.isHidden));
    } catch (err) {
      logger.error('Failed to refresh skills:', err);
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
      setConnectors((prev) => prev.map((c) => (c.id === id ? { ...c, isEnabled: enabled } : c)));
    } catch (err) {
      logger.error('Failed to toggle connector:', err);
    }
  }, []);

  const handleManageConnectors = () => {
    setOpen(false);
    onOpenSettings('connectors');
  };

  const handleSelectFolder = useCallback(async () => {
    setOpen(false);
    const accomplish = window.accomplish;
    if (!accomplish?.pickFolder) {
      return;
    }
    try {
      const folderPath = await accomplish.pickFolder();
      if (folderPath) {
        onSelectFolder?.(folderPath);
      }
    } catch (err) {
      logger.error('Failed to pick folder:', err);
    }
  }, [onSelectFolder]);

  return (
    <>
      <CreateSkillModal open={createModalOpen} onOpenChange={setCreateModalOpen} />
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            disabled={disabled}
            className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            title={t('plusMenu.addContent')}
          >
            <Plus className="h-4 w-4" weight="light" />
          </button>
        </DropdownMenuTrigger>
        <PlusMenuItems
          skills={skills}
          connectors={connectors}
          attachmentCount={attachmentCount}
          maxAttachments={maxAttachments}
          isRefreshing={isRefreshing}
          onAttachFiles={
            onAttachFiles
              ? () => {
                  onAttachFiles();
                  setOpen(false);
                }
              : undefined
          }
          onSelectFolder={
            onSelectFolder
              ? () => {
                  void handleSelectFolder();
                }
              : undefined
          }
          onSkillSelect={handleSkillSelect}
          onManageSkills={handleManageSkills}
          onCreateNewSkill={handleCreateNewSkill}
          onRefresh={handleRefresh}
          onToggleConnector={handleToggleConnector}
          onManageConnectors={handleManageConnectors}
        />
      </DropdownMenu>
    </>
  );
}
