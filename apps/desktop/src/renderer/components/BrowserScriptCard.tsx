import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe,
  TextCursor,
  MousePointer2,
  Keyboard,
  Camera,
  Image,
  Clock,
  Code,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { springs } from '../lib/animations';
import loadingSymbol from '/assets/loading-symbol.svg';

// Spinning Openwork icon component
const SpinningIcon = ({ className }: { className?: string }) => (
  <img
    src={loadingSymbol}
    alt=""
    className={cn('animate-spin-ccw', className)}
  />
);

// Browser action type from the MCP tool
interface BrowserAction {
  action: string;
  url?: string;
  selector?: string;
  ref?: string;
  text?: string;
  key?: string;
  code?: string;
}

interface BrowserScriptCardProps {
  actions: BrowserAction[];
  isRunning?: boolean;
}

// Action type to icon mapping
const ACTION_ICONS: Record<string, typeof Globe> = {
  goto: Globe,
  findAndFill: TextCursor,
  findAndClick: MousePointer2,
  fillByRef: TextCursor,
  clickByRef: MousePointer2,
  keyboard: Keyboard,
  snapshot: Camera,
  screenshot: Image,
  waitForSelector: Clock,
  waitForLoad: Clock,
  waitForNavigation: Clock,
  evaluate: Code,
};

// Format action to human-readable label
function formatActionLabel(action: BrowserAction): string {
  const maxLength = 25;
  let label = '';

  switch (action.action) {
    case 'goto': {
      try {
        const hostname = new URL(action.url || '').hostname.replace('www.', '');
        label = `Navigate to ${hostname}`;
      } catch {
        label = 'Navigate';
      }
      break;
    }
    case 'findAndFill':
    case 'fillByRef': {
      const text = action.text || '';
      label = text ? `Fill "${text}"` : 'Fill field';
      break;
    }
    case 'findAndClick':
    case 'clickByRef': {
      const target = action.ref || action.selector || 'element';
      // Simplify selector for display
      const simplified = target.length > 15 ? target.slice(0, 12) + '...' : target;
      label = `Click ${simplified}`;
      break;
    }
    case 'keyboard':
      label = `Press ${action.key || 'key'}`;
      break;
    case 'snapshot':
      label = 'Capture page';
      break;
    case 'screenshot':
      label = 'Screenshot';
      break;
    case 'waitForSelector':
      label = 'Wait for element';
      break;
    case 'waitForLoad':
      label = 'Wait for page';
      break;
    case 'waitForNavigation':
      label = 'Wait for navigation';
      break;
    case 'evaluate':
      label = 'Run script';
      break;
    default:
      label = action.action;
  }

  // Truncate if too long
  if (label.length > maxLength) {
    return label.slice(0, maxLength - 3) + '...';
  }
  return label;
}

// Single action chip component
function ActionChip({ action }: { action: BrowserAction }) {
  const Icon = ACTION_ICONS[action.action] || Code;
  const label = formatActionLabel(action);

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground border border-border whitespace-nowrap">
      <Icon className="h-3 w-3 shrink-0" />
      <span>{label}</span>
    </span>
  );
}

// Arrow separator
function Arrow() {
  return <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />;
}

// Generate stable key for action based on content, not index
function getActionKey(action: BrowserAction, index: number): string {
  const parts = [action.action];
  if (action.url) parts.push(action.url);
  if (action.selector) parts.push(action.selector);
  if (action.ref) parts.push(action.ref);
  if (action.text) parts.push(action.text);
  if (action.key) parts.push(action.key);
  // Include index as fallback for duplicate actions
  return `${parts.join('-')}-${index}`;
}

// Custom comparison for memo - compare actions by content, not reference
function arePropsEqual(
  prevProps: BrowserScriptCardProps,
  nextProps: BrowserScriptCardProps
): boolean {
  if (prevProps.isRunning !== nextProps.isRunning) return false;
  if (prevProps.actions.length !== nextProps.actions.length) return false;

  // Deep compare actions array
  for (let i = 0; i < prevProps.actions.length; i++) {
    const prev = prevProps.actions[i];
    const next = nextProps.actions[i];
    if (
      prev.action !== next.action ||
      prev.url !== next.url ||
      prev.selector !== next.selector ||
      prev.ref !== next.ref ||
      prev.text !== next.text ||
      prev.key !== next.key
    ) {
      return false;
    }
  }
  return true;
}

export const BrowserScriptCard = memo(function BrowserScriptCard({
  actions,
  isRunning = false,
}: BrowserScriptCardProps) {
  const [expanded, setExpanded] = useState(false);

  // Early return for empty actions
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
        <span className="text-sm font-medium text-primary">Browser Actions</span>
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
              <ActionChip action={action} />
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
              aria-label={expanded ? 'Show fewer actions' : `Show ${hiddenCount} more actions`}
              className={cn(
                'inline-flex items-center px-2 py-1 rounded-md text-xs font-medium',
                'bg-primary/10 text-primary cursor-pointer',
                'hover:bg-primary/20 transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-1'
              )}
            >
              {expanded ? 'Show less' : `+${hiddenCount} more`}
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}, arePropsEqual);
