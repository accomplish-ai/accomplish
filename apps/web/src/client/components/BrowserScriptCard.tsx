import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Globe } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { springs } from '../lib/animations';
import loadingSymbol from '/assets/loading-symbol.svg';
import {
  BrowserAction,
  ActionChip,
  Arrow,
  getActionKey,
  arePropsEqual,
} from './BrowserScriptCardHelpers';

// Spinning Accomplish icon component
const SpinningIcon = ({ className }: { className?: string }) => (
  <img src={loadingSymbol} alt="" className={cn('animate-spin-ccw', className)} />
);

interface BrowserScriptCardProps {
  actions: BrowserAction[];
  isRunning?: boolean;
}

export const BrowserScriptCard = memo(function BrowserScriptCard({
  actions,
  isRunning = false,
}: BrowserScriptCardProps) {
  const { t } = useTranslation('execution');
  const [expanded, setExpanded] = useState(false);

  if (!actions || actions.length === 0) {
    return null;
  }

  const visibleCount = 3;
  const hasMore = actions.length > visibleCount;
  const visibleActions = expanded ? actions : actions.slice(0, visibleCount);
  const hiddenCount = actions.length - visibleCount;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.gentle}
      className="bg-muted border border-border rounded-2xl px-4 py-3 max-w-[85%]"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Globe className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-primary">{t('browserScript.title')}</span>
        {isRunning && <SpinningIcon className="h-3.5 w-3.5 ml-auto" />}
      </div>

      {/* Action chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <AnimatePresence mode="popLayout">
          {visibleActions.map((action, index) => (
            <motion.div
              key={getActionKey(action, index)}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-1.5"
            >
              {index > 0 && <Arrow />}
              <ActionChip action={action} t={t} />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* +N more / Show less button */}
        {hasMore && (
          <>
            <Arrow />
            <button
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              aria-label={
                expanded
                  ? t('browserScript.showFewerActions')
                  : t('browserScript.showMoreActions', { count: hiddenCount })
              }
              className={cn(
                'inline-flex items-center px-2 py-1 rounded-md text-xs font-medium',
                'bg-primary/10 text-primary cursor-pointer',
                'hover:bg-primary/20 transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-1',
              )}
            >
              {expanded
                ? t('browserScript.showLess')
                : t('browserScript.showMore', { count: hiddenCount })}
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}, arePropsEqual);
