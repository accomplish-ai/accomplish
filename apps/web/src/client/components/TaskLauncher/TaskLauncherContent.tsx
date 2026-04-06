import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { MagnifyingGlass, Plus, X } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { springs } from '@/lib/animations';
import { TaskLauncherItem } from './TaskLauncherItem';
import { Input } from '@/components/ui/input';
import type { Task } from '@accomplish_ai/agent-core/common';

interface TaskLauncherContentProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedIndex: number;
  filteredTasks: Task[];
  onSelect: (index: number) => void;
  onClose: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function TaskLauncherContent({
  searchQuery,
  onSearchChange,
  selectedIndex,
  filteredTasks,
  onSelect,
  onClose,
  onKeyDown,
}: TaskLauncherContentProps) {
  const { t } = useTranslation('sidebar');

  return (
    <DialogPrimitive.Content
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      aria-describedby={undefined}
      onKeyDown={onKeyDown}
    >
      <DialogPrimitive.Title className="sr-only">Task Launcher</DialogPrimitive.Title>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        transition={springs.bouncy}
        className="w-full max-w-lg bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <MagnifyingGlass className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="border-0 px-0 py-1 h-full focus:outline-none focus-visible:ring-0"
          />
          <DialogPrimitive.Close asChild>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t('close')}
            >
              <X className="h-4 w-4" />
            </button>
          </DialogPrimitive.Close>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto p-2">
          {/* New Task Option */}
          <button
            onClick={() => onSelect(0)}
            className={cn(
              'w-full text-left px-3 py-2 rounded-md text-sm transition-colors duration-100',
              'flex items-center gap-2',
              selectedIndex === 0
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground hover:bg-accent',
            )}
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>{t('newTask')}</span>
            {searchQuery.trim() && (
              <span
                className={cn(
                  'text-xs truncate',
                  selectedIndex === 0 ? 'text-primary-foreground/70' : 'text-muted-foreground',
                )}
              >
                — &ldquo;{searchQuery}&rdquo;
              </span>
            )}
          </button>

          {/* Task List */}
          {filteredTasks.length > 0 && (
            <>
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
                {searchQuery.trim() ? t('results') : t('lastSevenDays')}
              </div>
              {filteredTasks.slice(0, 10).map((task, i) => (
                <TaskLauncherItem
                  key={task.id}
                  task={task}
                  isSelected={selectedIndex === i + 1}
                  onClick={() => onSelect(i + 1)}
                />
              ))}
            </>
          )}

          {/* Empty State */}
          {searchQuery.trim() && filteredTasks.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
              {t('noTasksFound')}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground flex items-center gap-4">
          <span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">↑↓</kbd> {t('navigate')}
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">↵</kbd> {t('select')}
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Esc</kbd> {t('close')}
          </span>
        </div>
      </motion.div>
    </DialogPrimitive.Content>
  );
}
