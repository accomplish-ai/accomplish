import { Button } from '@/components/ui/button';
import {
  Bug,
  CaretUp,
  CaretDown,
  Download,
  Trash,
  Check,
  File,
  ArrowClockwise,
  SpinnerGap,
} from '@phosphor-icons/react';
import type { DebugLogEntry } from './DebugPanel';

interface DebugPanelHeaderProps {
  isOpen: boolean;
  onToggle: () => void;
  debugLogs: DebugLogEntry[];
  filteredDebugLogs: DebugLogEntry[];
  debugSearchQuery: string;
  debugExported: boolean;
  onExport: () => void;
  onClearLogs: () => void;
  onBugReport?: () => void;
  bugReporting?: boolean;
  bugReportSaved?: boolean;
  onRepeatTask?: () => void;
  repeatingTask?: boolean;
  isRunning?: boolean;
}

export function DebugPanelHeader({
  isOpen,
  onToggle,
  debugLogs,
  filteredDebugLogs,
  debugSearchQuery,
  debugExported,
  onExport,
  onClearLogs,
  onBugReport,
  bugReporting = false,
  bugReportSaved = false,
  onRepeatTask,
  repeatingTask = false,
  isRunning = false,
}: DebugPanelHeaderProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      className="w-full flex items-center justify-between px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Bug className="h-4 w-4" />
        <span className="font-medium">Debug Logs</span>
        {debugLogs.length > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-zinc-700 text-zinc-300 text-xs">
            {debugSearchQuery.trim() && filteredDebugLogs.length !== debugLogs.length
              ? `${filteredDebugLogs.length} of ${debugLogs.length}`
              : debugLogs.length}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {debugLogs.length > 0 && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
              onClick={(e) => {
                e.stopPropagation();
                onExport();
              }}
            >
              {debugExported ? (
                <Check className="h-3 w-3 mr-1 text-green-400" />
              ) : (
                <Download className="h-3 w-3 mr-1" />
              )}
              {debugExported ? 'Exported' : 'Export'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
              onClick={(e) => {
                e.stopPropagation();
                onClearLogs();
              }}
            >
              <Trash className="h-3 w-3 mr-1" />
              Clear
            </Button>
          </>
        )}
        {onBugReport && (
          <Button
            variant="ghost"
            size="sm"
            disabled={bugReporting}
            className="h-6 px-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            onClick={(e) => {
              e.stopPropagation();
              onBugReport();
            }}
            title="Save bug report with screenshot, accessibility tree, and debug logs"
            data-testid="debug-bug-report-button"
          >
            {bugReporting ? (
              <SpinnerGap className="h-3 w-3 mr-1 animate-spin" />
            ) : bugReportSaved ? (
              <Check className="h-3 w-3 mr-1 text-green-400" />
            ) : (
              <File className="h-3 w-3 mr-1" />
            )}
            {bugReportSaved ? 'Saved' : 'Bug Report'}
          </Button>
        )}
        {onRepeatTask && (
          <Button
            variant="ghost"
            size="sm"
            disabled={repeatingTask || isRunning}
            className="h-6 px-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            onClick={(e) => {
              e.stopPropagation();
              onRepeatTask();
            }}
            title="Repeat this task with the same prompt"
            data-testid="debug-repeat-task-button"
          >
            {repeatingTask ? (
              <SpinnerGap className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <ArrowClockwise className="h-3 w-3 mr-1" />
            )}
            Repeat Task
          </Button>
        )}
        {isOpen ? (
          <CaretUp className="h-4 w-4 text-zinc-500" />
        ) : (
          <CaretDown className="h-4 w-4 text-zinc-500" />
        )}
      </div>
    </div>
  );
}
