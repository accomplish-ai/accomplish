import { useTranslation } from 'react-i18next';
import { Paperclip, FolderOpen } from '@phosphor-icons/react';
import type { Skill, McpConnector } from '@accomplish_ai/agent-core/common';
import {
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { SkillsSubmenu } from './SkillsSubmenu';
import { ConnectorsSubmenu } from './ConnectorsSubmenu';

interface PlusMenuItemsProps {
  skills: Skill[];
  connectors: McpConnector[];
  attachmentCount: number;
  maxAttachments: number;
  isRefreshing: boolean;
  onAttachFiles?: () => void;
  onSelectFolder?: () => void;
  onSkillSelect: (command: string) => void;
  onManageSkills: () => void;
  onCreateNewSkill: () => void;
  onRefresh: () => void;
  onToggleConnector: (id: string, enabled: boolean) => void;
  onManageConnectors: () => void;
}

export function PlusMenuItems({
  skills,
  connectors,
  attachmentCount,
  maxAttachments,
  isRefreshing,
  onAttachFiles,
  onSelectFolder,
  onSkillSelect,
  onManageSkills,
  onCreateNewSkill,
  onRefresh,
  onToggleConnector,
  onManageConnectors,
}: PlusMenuItemsProps) {
  const { t } = useTranslation('home');

  return (
    <DropdownMenuContent align="start" className="w-[200px]">
      <DropdownMenuItem
        disabled={!onAttachFiles || attachmentCount >= maxAttachments}
        onSelect={() => {
          onAttachFiles?.();
        }}
      >
        <Paperclip className="h-4 w-4 mr-2 shrink-0" />
        {t('plusMenu.attachFiles')}
        {attachmentCount > 0 && (
          <span
            className="ml-auto pl-4 text-[10px] text-muted-foreground whitespace-nowrap"
            aria-label={`${attachmentCount} of ${maxAttachments} files attached`}
          >
            {attachmentCount}/{maxAttachments}
          </span>
        )}
      </DropdownMenuItem>

      {window.accomplish?.pickFolder && onSelectFolder && (
        <DropdownMenuItem onSelect={onSelectFolder}>
          <FolderOpen className="h-4 w-4 mr-2 shrink-0" />
          {t('plusMenu.selectFolder')}
        </DropdownMenuItem>
      )}

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
          {t('plusMenu.useSkills')}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-[280px] p-0">
          <SkillsSubmenu
            skills={skills}
            onSkillSelect={onSkillSelect}
            onManageSkills={onManageSkills}
            onCreateNewSkill={onCreateNewSkill}
            onRefresh={onRefresh}
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
            {t('plusMenu.connectors')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-[280px] p-0">
            <ConnectorsSubmenu
              connectors={connectors}
              onToggle={onToggleConnector}
              onManageConnectors={onManageConnectors}
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
    </DropdownMenuContent>
  );
}
