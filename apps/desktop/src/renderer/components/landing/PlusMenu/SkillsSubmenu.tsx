// apps/desktop/src/renderer/components/landing/PlusMenu/SkillsSubmenu.tsx

import { useState, useMemo } from 'react';
import type { Skill } from '@accomplish/shared';
import { Input } from '@/components/ui/input';
import { DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import openworkFavicon from '/assets/openwork-favicon.png';

interface SkillsSubmenuProps {
  skills: Skill[];
  onSkillSelect: (command: string) => void;
  onManageSkills: () => void;
}

export function SkillsSubmenu({ skills, onSkillSelect, onManageSkills }: SkillsSubmenuProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) return skills;
    const query = searchQuery.toLowerCase();
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query) ||
        s.command.toLowerCase().includes(query)
    );
  }, [skills, searchQuery]);

  return (
    <div className="flex flex-col">
      {/* Search Input */}
      <div className="p-2">
        <Input
          type="text"
          placeholder="Search Skills..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8 text-sm"
          autoFocus
        />
      </div>

      <DropdownMenuSeparator />

      {/* Skills List */}
      <div className="max-h-[300px] overflow-y-auto">
        {filteredSkills.length === 0 ? (
          <div className="p-3 text-center text-sm text-muted-foreground">
            No skills found
          </div>
        ) : (
          filteredSkills.map((skill) => (
            <button
              key={skill.id}
              onClick={() => onSkillSelect(skill.command)}
              className="w-full px-3 py-2 text-left hover:bg-accent transition-colors"
            >
              <div className="text-[13px] font-semibold text-foreground">
                {skill.name}
              </div>
              <div className="mt-0.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                  {skill.source === 'official' && (
                    <>
                      <img src={openworkFavicon} alt="" className="h-2.5 w-2.5" />
                      By Openwork
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
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                {skill.description}
              </div>
            </button>
          ))
        )}
      </div>

      <DropdownMenuSeparator />

      {/* Manage Skills Link */}
      <button
        onClick={onManageSkills}
        className="flex items-center justify-between px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        Manage Skills
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M7 17L17 7M17 7H7M17 7V17" />
        </svg>
      </button>
    </div>
  );
}
