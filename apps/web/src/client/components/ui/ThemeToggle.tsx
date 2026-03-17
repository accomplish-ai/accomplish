import { Moon, Sun } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function ThemeToggle() {
  const { t } = useTranslation('common');
  const { isDark, toggleTheme } = useTheme();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? t('theme.switchToLight') : t('theme.switchToDark')}
          className={cn(
            'no-drag flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
            'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          {isDark ? (
            <Sun className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Moon className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isDark ? t('theme.lightMode') : t('theme.darkMode')}
      </TooltipContent>
    </Tooltip>
  );
}
