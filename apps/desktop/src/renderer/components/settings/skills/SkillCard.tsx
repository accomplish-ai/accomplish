// apps/desktop/src/renderer/components/settings/skills/SkillCard.tsx

import { memo, useCallback } from 'react';
import type { Skill } from '@accomplish_ai/agent-core/common';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import accomplishFavicon from '/assets/accomplish-favicon.png';

interface SkillCardProps {
  skill: Skill;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (filePath: string) => void;
  onShowInFolder: (filePath: string) => void;
}

export const SkillCard = memo(function SkillCard({
  skill,
  onToggle,
  onDelete,
  onEdit,
  onShowInFolder,
}: SkillCardProps) {
  const handleToggle = useCallback(() => {
    onToggle(skill.id);
  }, [onToggle, skill.id]);

  const handleDelete = useCallback(() => {
    onDelete(skill.id);
  }, [onDelete, skill.id]);

  const handleEdit = useCallback(() => {
    onEdit(skill.filePath);
  }, [onEdit, skill.filePath]);

  const handleShowInFolder = useCallback(() => {
    onShowInFolder(skill.filePath);
  }, [onShowInFolder, skill.filePath]);

  const formattedDate = new Date(skill.updatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="group rounded-xl border border-border bg-card p-3.5 transition-all duration-200 hover:border-primary hover:shadow-md">
      {/* Header: Name + Toggle */}
      <div className="mb-1.5 flex items-start justify-between">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
          {skill.name}
          {skill.isVerified && (
            <svg
              className="h-3.5 w-3.5 text-blue-500"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </span>
        <button
          onClick={handleToggle}
          className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${
            skill.isEnabled ? 'bg-primary' : 'bg-muted'
          }`}
          aria-label={skill.isEnabled ? 'Disable skill' : 'Enable skill'}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
              skill.isEnabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Description */}
      <p className="mb-2.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
        {skill.description}
      </p>

      {/* Footer: Badge + Date + Menu */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
            {skill.source === 'official' && (
              <>
                <img src={accomplishFavicon} alt="" className="h-2.5 w-2.5" />
                By Accomplish
              </>
            )}
            {skill.source === 'community' && (
              <>
                <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                GitHub
              </>
            )}
            {skill.source === 'custom' && (
              <>
                <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Built By You
              </>
            )}
          </span>
          <span className="text-[10px] text-muted-foreground">{formattedDate}</span>
        </div>

{skill.source !== 'official' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Skill options"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="12" cy="19" r="1.5" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleEdit}>
                <svg
                  className="mr-2 h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleShowInFolder}>
                <svg
                  className="mr-2 h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                </svg>
                Show in Folder
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleDelete}
                variant="destructive"
              >
                <svg
                  className="mr-2 h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
});
