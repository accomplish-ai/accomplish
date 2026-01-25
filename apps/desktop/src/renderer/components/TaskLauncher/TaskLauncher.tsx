'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {ArrowDownIcon, ArrowUpIcon, CornerDownLeftIcon, Plus} from 'lucide-react';
import { useTaskStore } from '@/stores/taskStore';
import { getAccomplish } from '@/lib/accomplish';
import { cn } from '@/lib/utils';
import TaskLauncherItem from './TaskLauncherItem';
import { hasAnyReadyProvider } from '@accomplish/shared';
import type { Task } from '@accomplish/shared';
import { buttonVariants } from '@/components/ui/button';
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup, CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {Kbd, KbdGroup} from "@/components/ui/kbd";

type LauncherItem =
  | { type: 'new-task' }
  | { type: 'task'; task: Task };

export default function TaskLauncher() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const {
    isLauncherOpen,
    closeLauncher,
    tasks,
    startTask
  } = useTaskStore();
  const accomplish = getAccomplish();

  // Filter tasks by search query (title only)
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) {
      // Show last 7 days when no search
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return tasks.filter(t => new Date(t.createdAt).getTime() > sevenDaysAgo);
    }
    const query = searchQuery.toLowerCase();
    return tasks.filter(t => t.prompt.toLowerCase().includes(query));
  }, [tasks, searchQuery]);
  const visibleTasks = useMemo(() => filteredTasks.slice(0, 10), [filteredTasks]);
  const newTaskItems: LauncherItem[] = [{ type: 'new-task' }];
  const taskItems = useMemo<LauncherItem[]>(
    () => visibleTasks.map(task => ({ type: 'task', task })),
    [visibleTasks]
  );
  const visibleItems = useMemo(
    () => [...newTaskItems, ...taskItems],
    [newTaskItems, taskItems]
  );

  // Reset state when launcher opens
  useEffect(() => {
    if (isLauncherOpen) {
      setSearchQuery('');
    }
  }, [isLauncherOpen]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open && isLauncherOpen) {
      closeLauncher();
      setSearchQuery('');
    }
  }, [isLauncherOpen, closeLauncher])

  const handleNewTaskSelected = useCallback(async  () => {
    if (searchQuery.trim()) {
      // Check if any provider is ready before starting task
      const settings = await accomplish.getProviderSettings();
      if (!hasAnyReadyProvider(settings)) {
        closeLauncher();
        navigate('/');
        return;
      }

      closeLauncher();
      const taskId = `task_${Date.now()}`;
      startTask({prompt: searchQuery.trim(), taskId})
          .then((task) => {
            if (task) {
              navigate(`/execution/${task.id}`)
            }
          })
    } else {
      closeLauncher();
      navigate('/');
    }
  }, [searchQuery, accomplish, closeLauncher, navigate, startTask])

  const handleTaskSelected = useCallback(async (selectedValue: string) => {
    const selectedTask = tasks.find(task => task.id === selectedValue);
    if (!selectedTask) return;

    closeLauncher();
    navigate(`/execution/${selectedTask.id}`);
  },[tasks, closeLauncher, navigate, startTask])

  const handleSelect = useCallback(async (selectedValue: string) => {
    if (selectedValue === 'new-task') {
      handleNewTaskSelected()
    } else {
      handleTaskSelected(selectedValue)
    }
  }, [handleNewTaskSelected, handleTaskSelected]);

  return (
    <CommandDialog open={isLauncherOpen} onOpenChange={handleOpenChange}>
      <CommandDialogPopup className="-translate-y-1/2 top-1/2">
        <Command items={visibleItems} filteredItems={visibleItems}>
          <CommandInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks..."
          />
          <CommandList>
            <CommandGroup items={newTaskItems}>
              <CommandCollection>
                {(item: LauncherItem) => {
                  return (
                    <CommandItem
                      key={item.type}
                      value={item.type}
                      className={cn(
                        'group w-full justify-start! gap-2',
                        buttonVariants({ variant: 'ghost' }),
                        'data-highlighted:bg-primary data-highlighted:text-primary-foreground'
                      )}
                      onClick={() => handleSelect(item.type)}>
                      <Plus className="h-4 w-4 shrink-0" />
                      <span>New task</span>
                      {searchQuery.trim() && (
                        <span
                          className={cn(
                            'text-xs truncate text-muted-foreground',
                            'group-data-highlighted:text-primary-foreground/70'
                          )}
                        >
                          — "{searchQuery}"
                        </span>
                      )}
                    </CommandItem>
                  );
                }}
              </CommandCollection>
            </CommandGroup>
            {taskItems.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup items={taskItems}>
                  <CommandGroupLabel>
                    {searchQuery.trim() ? 'Results' : 'Last 7 days'}
                  </CommandGroupLabel>
                  <CommandCollection>
                    {(item: LauncherItem) => {
                      if (item.type !== 'task') return null;

                      return (
                        <CommandItem
                          key={item.task.id}
                          value={item.task.id}
                          className={cn(
                            'group w-full px-3 py-2',
                            'data-highlighted:bg-primary data-highlighted:text-primary-foreground'
                          )}
                          onClick={() => handleSelect(item.task.id)}
                        >
                          <TaskLauncherItem task={item.task} />
                        </CommandItem>
                      );
                    }}
                  </CommandCollection>
                </CommandGroup>
              </>
            )}
          </CommandList>
          <CommandFooter>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <KbdGroup>
                  <Kbd>
                    <ArrowUpIcon />
                  </Kbd>
                  <Kbd>
                    <ArrowDownIcon />
                  </Kbd>
                </KbdGroup>
                <span>Navigate</span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>
                  <CornerDownLeftIcon />
                </Kbd>
                <span>Select</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Kbd>Esc</Kbd>
              <span>Close</span>
            </div>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
