import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { springs } from '../../lib/animations';
import { getToolDisplayInfo, THINKING_PHRASES } from '../../constants/tool-mappings';
import { SpinningIcon } from './SpinningIcon';

interface ToolProgressProps {
  isRunning: boolean;
  hasPermissionRequest: boolean;
  currentTool: string | null;
  currentToolInput: unknown;
  startupStageTaskId: string | null;
  startupStage: {
    message: string;
    startTime: number;
    isFirstTask?: boolean;
    stage?: string;
  } | null;
  taskId: string | undefined;
  elapsedTime: number;
}

export function ToolProgress({
  isRunning,
  hasPermissionRequest,
  currentTool,
  currentToolInput,
  startupStageTaskId,
  startupStage,
  taskId,
  elapsedTime,
}: ToolProgressProps) {
  const thinkingPhrase = useMemo(() => {
    return THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTool]);

  return (
    <AnimatePresence>
      {isRunning &&
        !hasPermissionRequest &&
        (currentTool?.endsWith('browser_script') ? null : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={springs.gentle}
            className="flex flex-col gap-1 text-muted-foreground py-2"
            data-testid="execution-thinking-indicator"
          >
            <div className="flex items-center gap-2">
              <SpinningIcon className="h-4 w-4" />
              <span className="text-sm">
                {currentTool
                  ? (currentToolInput as { description?: string })?.description ||
                    getToolDisplayInfo(currentTool)?.label ||
                    currentTool
                  : startupStageTaskId === taskId && startupStage
                    ? startupStage.message
                    : thinkingPhrase}
              </span>
              {currentTool && !(currentToolInput as { description?: string })?.description && (
                <span className="text-xs text-muted-foreground/60">({currentTool})</span>
              )}
              {!currentTool && startupStageTaskId === taskId && startupStage && elapsedTime > 0 && (
                <span className="text-xs text-muted-foreground/60">({elapsedTime}s)</span>
              )}
            </div>
            {!currentTool &&
              startupStageTaskId === taskId &&
              startupStage?.isFirstTask &&
              startupStage.stage === 'browser' && (
                <span className="text-xs text-muted-foreground/50 ml-6">
                  First task takes a bit longer...
                </span>
              )}
          </motion.div>
        ))}
    </AnimatePresence>
  );
}
