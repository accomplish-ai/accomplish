import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { SkillCard } from './SkillCard';
import { useSkillsPanel } from './useSkillsPanel';
import { SkillsFilterBar } from './SkillsFilterBar';

interface SkillsPanelProps {
  refreshTrigger?: number;
}

export function SkillsPanel({ refreshTrigger }: SkillsPanelProps) {
  const { t } = useTranslation('settings');
  const {
    loading,
    searchQuery,
    filter,
    isAtBottom,
    isResyncing,
    scrollRef,
    filterCounts,
    filteredSkills,
    setFilter,
    handleToggle,
    handleDelete,
    handleEdit,
    handleShowInFolder,
    handleSearchChange,
    handleResync,
    checkScrollPosition,
  } = useSkillsPanel(refreshTrigger);

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
        <SkillsFilterBar filter={filter} filterCounts={filterCounts} onFilterChange={setFilter} />

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
