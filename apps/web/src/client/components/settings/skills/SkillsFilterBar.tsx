import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { FilterType } from './useSkillsPanel';

interface SkillsFilterBarProps {
  filter: FilterType;
  filterCounts: { all: number; active: number; inactive: number; official: number };
  onFilterChange: (f: FilterType) => void;
}

export function SkillsFilterBar({ filter, filterCounts, onFilterChange }: SkillsFilterBarProps) {
  const { t } = useTranslation('settings');

  const filterLabelMap: Record<FilterType, string> = {
    all: t('skills.filterAll'),
    active: t('skills.filterActive'),
    inactive: t('skills.filterInactive'),
    official: t('skills.byAccomplish'),
  };

  const filterLabel = filterLabelMap[filter];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-[150px] items-center justify-between gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted">
          <div className="flex items-center gap-1.5">
            <svg
              className="h-3.5 w-3.5 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
            </svg>
            {filterLabel}
          </div>
          <svg
            className="h-3 w-3 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[180px]">
        <DropdownMenuItem onClick={() => onFilterChange('all')} className="flex justify-between">
          {t('skills.filterAll')} <span className="text-muted-foreground">{filterCounts.all}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onFilterChange('active')} className="flex justify-between">
          {t('skills.filterActive')}{' '}
          <span className="text-muted-foreground">{filterCounts.active}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onFilterChange('inactive')}
          className="flex justify-between"
        >
          {t('skills.filterInactive')}{' '}
          <span className="text-muted-foreground">{filterCounts.inactive}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onFilterChange('official')}
          className="flex justify-between"
        >
          {t('skills.byAccomplish')}{' '}
          <span className="text-muted-foreground">{filterCounts.official}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
