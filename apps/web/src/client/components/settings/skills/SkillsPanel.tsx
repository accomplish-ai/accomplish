import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import type { Skill } from '@accomplish_ai/agent-core/common';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { SkillCard } from './SkillCard';

type FilterType = 'all' | 'active' | 'inactive' | 'official';

interface SkillsPanelProps {
  refreshTrigger?: number;
}

export function SkillsPanel({ refreshTrigger }: SkillsPanelProps) {
  const { t } = useTranslation('settings');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [isAtBottom, setIsAtBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Get visible skills (non-hidden)
  const visibleSkills = useMemo(() => skills.filter((s) => !s.isHidden), [skills]);

  // Calculate counts for each filter
  const filterCounts = useMemo(
    () => ({
      all: visibleSkills.length,
      active: visibleSkills.filter((s) => s.isEnabled).length,
      inactive: visibleSkills.filter((s) => !s.isEnabled).length,
      official: visibleSkills.filter((s) => s.source === 'official').length,
    }),
    [visibleSkills],
  );

  // Filter and search skills (hide hidden skills)
  const filteredSkills = useMemo(() => {
    let result = visibleSkills;

    // Apply filter
    if (filter === 'active') {
      result = result.filter((s) => s.isEnabled);
    } else if (filter === 'inactive') {
      result = result.filter((s) => !s.isEnabled);
    } else if (filter === 'official') {
      result = result.filter((s) => s.source === 'official');
    }

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query) ||
          s.command.toLowerCase().includes(query),
      );
    }

    return result;
  }, [visibleSkills, filter, searchQuery]);

  // Check if scrolled to bottom
  const checkScrollPosition = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 5; // Small threshold for rounding errors
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setIsAtBottom(atBottom);
  }, []);

  // Check scroll position on mount and when filtered skills change
  useEffect(() => {
    checkScrollPosition();
  }, [filteredSkills, checkScrollPosition]);

  // Load skills on mount and when refreshTrigger changes
  useEffect(() => {
    if (!window.accomplish) {
      console.error('Accomplish API not available');
      setLoading(false);
      return;
    }
    window.accomplish
      .getSkills()
      .then(setSkills)
      .catch((err: unknown) => console.error('Failed to load skills:', err))
      .finally(() => setLoading(false));
  }, [refreshTrigger]);

  // Handlers
  const handleToggle = useCallback(
    async (id: string) => {
      const skill = skills.find((s) => s.id === id);
      if (!skill || !window.accomplish) return;

      try {
        await window.accomplish.setSkillEnabled(id, !skill.isEnabled);
        setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, isEnabled: !s.isEnabled } : s)));
      } catch (err) {
        console.error('Failed to toggle skill:', err);
      }
    },
    [skills],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const skill = skills.find((s) => s.id === id);
      if (!skill || !window.accomplish) return;

      if (skill.source === 'official') {
        console.warn('Cannot delete official skills');
        return;
      }

      try {
        await window.accomplish.deleteSkill(id);
        setSkills((prev) => prev.filter((s) => s.id !== id));
      } catch (err) {
        console.error('Failed to delete skill:', err);
      }
    },
    [skills],
  );

  const handleEdit = useCallback(async (filePath: string) => {
    if (!window.accomplish) return;
    try {
      await window.accomplish.openSkillInEditor(filePath);
    } catch (err) {
      console.error('Failed to open skill in editor:', err);
    }
  }, []);

  const handleShowInFolder = useCallback(async (filePath: string) => {
    if (!window.accomplish) return;
    try {
      await window.accomplish.showSkillInFolder(filePath);
    } catch (err) {
      console.error('Failed to show skill in folder:', err);
    }
  }, []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const [isResyncing, setIsResyncing] = useState(false);

  const handleResync = useCallback(async () => {
    if (!window.accomplish || isResyncing) return;
    setIsResyncing(true);
    try {
      // Run resync and minimum delay in parallel so animation is visible
      const [updatedSkills] = await Promise.all([
        window.accomplish.resyncSkills(),
        new Promise((resolve) => setTimeout(resolve, 600)),
      ]);
      setSkills(updatedSkills);
    } catch (err) {
      console.error('Failed to resync skills:', err);
    } finally {
      setIsResyncing(false);
    }
  }, [isResyncing]);

  const filterLabel =
    filter === 'all'
      ? t('skills.filterAll')
      : filter === 'active'
        ? t('skills.filterActive')
        : filter === 'inactive'
          ? t('skills.filterInactive')
          : t('skills.byAccomplish');

  if (loading) {
    return (
      <div className="flex h-[480px] items-center justify-center">
        <div className="text-sm text-muted-foreground">{t('skills.loading')}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Toolbar: Filter + Search */}
      <div className="mb-4 flex gap-3">
        {/* Filter Dropdown */}
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
            <DropdownMenuItem onClick={() => setFilter('all')} className="flex justify-between">
              {t('skills.filterAll')}{' '}
              <span className="text-muted-foreground">{filterCounts.all}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilter('active')} className="flex justify-between">
              {t('skills.filterActive')}{' '}
              <span className="text-muted-foreground">{filterCounts.active}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setFilter('inactive')}
              className="flex justify-between"
            >
              {t('skills.filterInactive')}{' '}
              <span className="text-muted-foreground">{filterCounts.inactive}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setFilter('official')}
              className="flex justify-between"
            >
              {t('skills.byAccomplish')}{' '}
              <span className="text-muted-foreground">{filterCounts.official}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Search Input */}
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <Input
            type="text"
            placeholder={t('skills.searchPlaceholder')}
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-9"
          />
        </div>

        {/* Refresh Button */}
        <motion.button
          onClick={handleResync}
          disabled={isResyncing}
          className="flex items-center justify-center rounded-lg border border-border bg-card p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          title={t('skills.refresh')}
          whileTap={{ scale: 0.9 }}
        >
          <motion.div
            animate={isResyncing ? { rotate: 720 } : { rotate: 0 }}
            transition={
              isResyncing ? { duration: 1, repeat: Infinity, ease: 'linear' } : { duration: 0 }
            }
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </motion.div>
        </motion.button>
      </div>

      {/* Scrollable Skills Grid */}
      <div
        ref={scrollRef}
        onScroll={checkScrollPosition}
        className="max-h-[480px] overflow-y-auto pr-1"
      >
        <div className="grid grid-cols-2 gap-3">
          <AnimatePresence mode="popLayout">
            {filteredSkills.map((skill, index) => (
              <motion.div
                key={skill.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{
                  layout: { duration: 0.2 },
                  opacity: { duration: 0.15 },
                  scale: { duration: 0.15 },
                  delay: index * 0.02,
                }}
              >
                <SkillCard
                  skill={skill}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                  onShowInFolder={handleShowInFolder}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <AnimatePresence>
          {filteredSkills.length === 0 && (
            <motion.div
              className="flex h-[340px] items-center justify-center text-sm text-muted-foreground"
              variants={settingsVariants.fadeSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.enter}
            >
              {t('skills.noSkillsFound')}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Scroll Indicator - use opacity to prevent layout shift flickering */}
      {filteredSkills.length > 4 && (
        <div
          className={`mt-2 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground transition-opacity duration-150 ${
            isAtBottom ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <svg
            className={`h-3.5 w-3.5 ${isAtBottom ? '' : 'animate-bounce'}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
          {t('skills.scrollForMore')}
        </div>
      )}
    </div>
  );
}
