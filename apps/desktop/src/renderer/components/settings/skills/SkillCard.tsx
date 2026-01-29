// apps/desktop/src/renderer/components/settings/skills/SkillCard.tsx

import { memo, useCallback } from 'react';
import type { Skill } from '@accomplish/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SkillCardProps {
  skill: Skill;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onConfigure: (id: string) => void;
}

export const SkillCard = memo(function SkillCard({
  skill,
  onToggle,
  onDelete,
  onConfigure,
}: SkillCardProps) {
  const handleToggle = useCallback(() => {
    onToggle(skill.id);
  }, [onToggle, skill.id]);

  const handleDelete = useCallback(() => {
    onDelete(skill.id);
  }, [onDelete, skill.id]);

  const handleConfigure = useCallback(() => {
    onConfigure(skill.id);
  }, [onConfigure, skill.id]);

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
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium capitalize text-secondary-foreground">
            {skill.source === 'official' && (
              <svg
                className="h-2.5 w-2.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            )}
            {skill.source}
          </span>
          <span className="text-[10px] text-muted-foreground">{formattedDate}</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
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
            <DropdownMenuItem onClick={handleConfigure}>
              <svg
                className="mr-2 h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
              Configure
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleDelete}
              variant="destructive"
              disabled={skill.source === 'official'}
              className={skill.source === 'official' ? 'opacity-50 cursor-not-allowed' : ''}
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
      </div>
    </div>
  );
});
