/**
 * BrowserPreview — Embedded live CDP screencast in the execution chat.
 *
 * Receives base64 JPEG frames from the main process via IPC (browser:frame),
 * URL navigation events (browser:navigate), and status events (browser:status).
 *
 * Features:
 *  - Displays live browser frames as they arrive
 *  - Shows current URL and streaming/loading status
 *  - Collapsible / expandable panel
 *  - Auto-starts preview when a browser_* tool is detected (dhruvawani17, PR #489)
 *  - Pauses frame updates when the document/tab is hidden
 *  - Smooth Framer Motion transitions (david-mamani, PR #553)
 *
 * Contributed by:
 *  - david-mamani (PR #553) — component structure, animation, status indicator
 *  - dhruvawani17 (PR #489) — auto-start on browser_* tool, visibility pause
 *  - samarthsinh2660 (PR #414) — taskStore integration, collapse/expand
 *
 * ENG-695
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Globe, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { springs } from '../../lib/animations';
import { StatusBadge } from './StatusBadge';
import { PreviewBody } from './PreviewBody';
import { useBrowserPreview } from './useBrowserPreview';

interface BrowserPreviewProps {
  taskId: string;
  /** The page name that this preview is scoped to — IPC events not matching this page are ignored. */
  pageName?: string | null;
  /** The currently active tool name — auto-starts the screencast when a browser_* tool is detected. */
  currentTool?: string | null;
  className?: string;
}

export const BrowserPreview = memo(function BrowserPreview({
  taskId,
  pageName,
  currentTool,
  className,
}: BrowserPreviewProps) {
  const contentId = `browser-preview-content-${taskId}`;
  const { frameData, currentUrl, status, error, isCollapsed, setIsCollapsed, imgRef } =
    useBrowserPreview({ taskId, pageName, currentTool });

  // Don't render until we have at least a starting state or a frame
  if (status === 'idle' && !frameData) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.gentle}
      className={cn(
        'bg-card border border-border rounded-2xl overflow-hidden max-w-[90%] mt-2',
        className,
      )}
    >
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/50">
        <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs text-muted-foreground truncate flex-1 font-mono">
          {currentUrl || 'Browser Preview'}
        </span>
        <StatusBadge status={status} />
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-muted-foreground hover:text-foreground transition-colors ml-1"
          aria-label={isCollapsed ? 'Expand' : 'Collapse'}
          aria-expanded={!isCollapsed}
          aria-controls={contentId}
        >
          {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>

      {/* Content area */}
      <div id={contentId}>
        <PreviewBody
          status={status}
          frameData={frameData}
          imgRef={imgRef}
          error={error}
          isCollapsed={isCollapsed}
        />
      </div>
    </motion.div>
  );
});
