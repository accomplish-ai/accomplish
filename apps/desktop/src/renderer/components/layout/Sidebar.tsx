'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore } from '@/stores/taskStore';
import { getAccomplish } from '@/lib/accomplish';
import { analytics } from '@/lib/analytics';
import { staggerContainer } from '@/lib/animations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import ConversationListItem from './ConversationListItem';
import SettingsDialog from './SettingsDialog';
import { Settings, MessageSquarePlus, Search, X } from 'lucide-react';
import logoImage from '/assets/logo-1.png';

export default function Sidebar() {
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { tasks, loadTasks, updateTaskStatus, addTaskUpdate } = useTaskStore();
  const accomplish = getAccomplish();

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Subscribe to task status changes (queued -> running) and task updates (complete/error)
  // This ensures sidebar always reflects current task status
  useEffect(() => {
    const unsubscribeStatusChange = accomplish.onTaskStatusChange?.((data) => {
      updateTaskStatus(data.taskId, data.status);
    });

    const unsubscribeTaskUpdate = accomplish.onTaskUpdate((event) => {
      addTaskUpdate(event);
    });

    return () => {
      unsubscribeStatusChange?.();
      unsubscribeTaskUpdate();
    };
  }, [updateTaskStatus, addTaskUpdate, accomplish]);

  const handleNewConversation = () => {
    analytics.trackNewTask();
    navigate('/');
  };

  const toggleSearch = useCallback(() => {
    setIsSearchVisible((prev) => {
      const newVisibility = !prev;
      if (newVisibility) {
        // Focus input when opening search
        setTimeout(() => searchInputRef.current?.focus(), 100);
      } else {
        // Clear search when closing
        setSearchQuery('');
      }
      return newVisibility;
    });
  }, []);

  const closeSearch = useCallback(() => {
    setIsSearchVisible(false);
    setSearchQuery('');
  }, []);

  // Filter tasks based on search query
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) {
      return tasks;
    }
    const query = searchQuery.toLowerCase();
    return tasks.filter(
      (task) =>
        task.prompt.toLowerCase().includes(query) ||
        (task.summary && task.summary.toLowerCase().includes(query))
    );
  }, [tasks, searchQuery]);

  // Expose toggleSearch to window for Cmd+K shortcut
  useEffect(() => {
    (window as any).toggleSidebarSearch = toggleSearch;
    return () => {
      delete (window as any).toggleSidebarSearch;
    };
  }, [toggleSearch]);

  return (
    <>
      <div className="flex h-screen w-[260px] flex-col border-r border-border bg-card pt-12">
        {/* Action Buttons */}
        <div className="px-3 py-3 border-b border-border flex gap-2">
          <Button
            data-testid="sidebar-new-task-button"
            onClick={handleNewConversation}
            variant="default"
            size="sm"
            className="flex-1 justify-center gap-2"
            title="New Task"
          >
            <MessageSquarePlus className="h-4 w-4" />
            New Task
          </Button>
          <Button
            onClick={toggleSearch}
            variant="outline"
            size="sm"
            className="px-2"
            title="Search Tasks (⌘K)"
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>

        {/* Search Bar */}
        <AnimatePresence>
          {isSearchVisible && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="px-3 py-2 border-b border-border"
            >
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search conversations..."
                  className="flex-1 h-8 text-sm"
                />
                <Button
                  onClick={closeSearch}
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  title="Close search"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Conversation List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            <AnimatePresence mode="wait">
              {filteredTasks.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  {searchQuery.trim() ? 'No conversations found' : 'No conversations yet'}
                </motion.div>
              ) : (
                <motion.div
                  key="task-list"
                  variants={staggerContainer}
                  initial="initial"
                  animate="animate"
                  className="space-y-1"
                >
                  {filteredTasks.map((task) => (
                    <ConversationListItem key={task.id} task={task} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>

        {/* Bottom Section - Logo and Settings */}
        <div className="px-3 py-4 border-t border-border flex items-center justify-between">
          {/* Logo - Bottom Left */}
          <div className="flex items-center">
            <img
              src={logoImage}
              alt="Openwork"
              style={{ height: '20px', paddingLeft: '6px' }}
            />
          </div>

          {/* Settings Button - Bottom Right */}
          <Button
            data-testid="sidebar-settings-button"
            variant="ghost"
            size="icon"
            onClick={() => {
              analytics.trackOpenSettings();
              setShowSettings(true);
            }}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </>
  );
}
