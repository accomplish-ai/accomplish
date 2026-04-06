import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTaskStore } from '@/stores/taskStore';
import { getAccomplish } from '@/lib/accomplish';
import { TaskLauncherContent } from './TaskLauncherContent';
import { hasAnyReadyProvider } from '@accomplish_ai/agent-core/common';

export function TaskLauncher() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { isLauncherOpen, launcherInitialPrompt, closeLauncher, tasks, startTask } = useTaskStore();
  const accomplish = getAccomplish();
  const [openedAt, setOpenedAt] = useState(Date.now);

  // Filter tasks by search query (title only)
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) {
      // Show last 7 days when no search
      const sevenDaysAgo = openedAt - 7 * 24 * 60 * 60 * 1000;
      return tasks.filter((t) => new Date(t.createdAt).getTime() > sevenDaysAgo);
    }
    const query = searchQuery.toLowerCase();
    return tasks.filter((t) => t.prompt.toLowerCase().includes(query));
  }, [tasks, searchQuery, openedAt]);

  // Total items: "New task" + filtered tasks
  const totalItems = 1 + filteredTasks.length;

  // Clamp selected index when results change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: sync derived state from prop change
    setSelectedIndex((i) => Math.min(i, Math.max(0, totalItems - 1)));
  }, [totalItems]);

  // Reset state when launcher opens, use initial prompt if provided
  useEffect(() => {
    if (isLauncherOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset state on open
      setSearchQuery(launcherInitialPrompt || '');
      setSelectedIndex(0);
      setOpenedAt(Date.now());
    }
  }, [isLauncherOpen, launcherInitialPrompt]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && isLauncherOpen) {
        closeLauncher();
        setSearchQuery('');
        setSelectedIndex(0);
      }
    },
    [isLauncherOpen, closeLauncher],
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
    [searchQuery, filteredTasks, closeLauncher, navigate, startTask, accomplish],
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
    [totalItems, selectedIndex, handleSelect, closeLauncher],
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
                className="fixed inset-0 z-50 bg-white/60 backdrop-blur-[12px]"
              />
            </DialogPrimitive.Overlay>

            <TaskLauncherContent
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedIndex={selectedIndex}
              filteredTasks={filteredTasks}
              onSelect={handleSelect}
              onClose={closeLauncher}
              onKeyDown={handleKeyDown}
            />
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

export default TaskLauncher;
