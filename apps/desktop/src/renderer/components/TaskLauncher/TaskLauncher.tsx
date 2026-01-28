'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Search, Plus, X } from 'lucide-react';
import { useTaskStore } from '@/stores/taskStore';
import { getAccomplish } from '@/lib/accomplish';
import { cn } from '@/lib/utils';
import { springs } from '@/lib/animations';
import TaskLauncherItem from './TaskLauncherItem';
import { hasAnyReadyProvider } from '@accomplish/shared';
import { Input } from '@/components/ui/input';

export default function TaskLauncher() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { isLauncherOpen, closeLauncher, tasks, startTask } = useTaskStore();
  const accomplish = getAccomplish();

  // Filter tasks by search query (title only)
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) {
      // Show last 7 days when no search
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return tasks.filter(
        (t) => new Date(t.createdAt).getTime() > sevenDaysAgo
      );
    }
    const query = searchQuery.toLowerCase();
    return tasks.filter((t) => t.prompt.toLowerCase().includes(query));
  }, [tasks, searchQuery]);

  // Total items: "New task" + filtered tasks
  const totalItems = 1 + filteredTasks.length;

  // Clamp selected index when results change
  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(0, totalItems - 1)));
  }, [totalItems]);

  // Reset state when launcher opens
  useEffect(() => {
    if (isLauncherOpen) {
      setSearchQuery('');
      setSelectedIndex(0);
    }
  }, [isLauncherOpen]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && isLauncherOpen) {
        closeLauncher();
        setSearchQuery('');
        setSelectedIndex(0);
      }
    },
    [isLauncherOpen, closeLauncher]
  );

  const handleSelect = useCallback(
    async (index: number) => {
      if (index === 0) {
        // "New task" selected
        if (searchQuery.trim()) {
          // Check if any provider is ready before starting task
          const settings = await accomplish.getProviderSettings();
          if (!hasAnyReadyProvider(settings)) {
            // No ready provider - navigate to home which will show settings
            closeLauncher();
            navigate('/');
            return;
          }
          closeLauncher();
          const taskId = `task_${Date.now()}`;
          const task = await startTask({ prompt: searchQuery.trim(), taskId });
          if (task) {
            navigate(`/execution/${task.id}`);
          }
        } else {
          // Navigate to home for empty input
          closeLauncher();
          navigate('/');
        }
      } else {
        // Task selected - navigate to it
        const task = filteredTasks[index - 1];
        if (task) {
          closeLauncher();
          navigate(`/execution/${task.id}`);
        }
      }
    },
    [searchQuery, filteredTasks, closeLauncher, navigate, startTask, accomplish]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ignore Enter during IME composition (Chinese/Japanese input)
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, totalItems - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          handleSelect(selectedIndex);
          break;
        case 'Escape':
          e.preventDefault();
          closeLauncher();
          break;
      }
    },
    [totalItems, selectedIndex, handleSelect, closeLauncher]
  );

  return (
    <DialogPrimitive.Root open={isLauncherOpen} onOpenChange={handleOpenChange}>
      <AnimatePresence>
        {isLauncherOpen && (
          <DialogPrimitive.Portal forceMount>
            {/* Overlay */}
            <DialogPrimitive.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              />
            </DialogPrimitive.Overlay>

            {/* Content */}
            <DialogPrimitive.Content
              className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
              onKeyDown={handleKeyDown}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={springs.bouncy}
                className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
              >
                {/* Search Input */}
                <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search tasks..."
                    className="h-full border-0 px-0 py-1 focus:outline-none focus-visible:ring-0"
                  />
                  <DialogPrimitive.Close asChild>
                    <button
                      className="text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </DialogPrimitive.Close>
                </div>

                {/* Results */}
                <div className="max-h-80 overflow-y-auto p-2">
                  {/* New Task Option */}
                  <button
                    onClick={() => handleSelect(0)}
                    className={cn(
                      'w-full rounded-md px-3 py-2 text-left text-sm transition-colors duration-100',
                      'flex items-center gap-2',
                      selectedIndex === 0
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:bg-accent'
                    )}
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>New task</span>
                    {searchQuery.trim() && (
                      <span
                        className={cn(
                          'truncate text-xs',
                          selectedIndex === 0
                            ? 'text-primary-foreground/70'
                            : 'text-muted-foreground'
                        )}
                      >
                        — "{searchQuery}"
                      </span>
                    )}
                  </button>

                  {/* Task List */}
                  {filteredTasks.length > 0 && (
                    <>
                      <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
                        {searchQuery.trim() ? 'Results' : 'Last 7 days'}
                      </div>
                      {filteredTasks.slice(0, 10).map((task, i) => (
                        <TaskLauncherItem
                          key={task.id}
                          task={task}
                          isSelected={selectedIndex === i + 1}
                          onClick={() => handleSelect(i + 1)}
                        />
                      ))}
                    </>
                  )}

                  {/* Empty State */}
                  {searchQuery.trim() && filteredTasks.length === 0 && (
                    <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                      No tasks found
                    </div>
                  )}
                </div>

                {/* Footer hint */}
                <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted-foreground">
                  <span>
                    <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                      ↑↓
                    </kbd>{' '}
                    Navigate
                  </span>
                  <span>
                    <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                      ↵
                    </kbd>{' '}
                    Select
                  </span>
                  <span>
                    <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                      Esc
                    </kbd>{' '}
                    Close
                  </span>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
