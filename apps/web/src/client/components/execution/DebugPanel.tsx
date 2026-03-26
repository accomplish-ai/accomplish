import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  Bug,
  CaretUp,
  CaretDown,
  Download,
  Trash,
  Check,
  MagnifyingGlass,
  File,
  ArrowClockwise,
  SpinnerGap,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

export interface DebugLogEntry {
  taskId: string;
  timestamp: string;
  type: string;
  message: string;
  data?: unknown;
}

interface DebugPanelProps {
  debugLogs: DebugLogEntry[];
  taskId: string | undefined;
  onClearLogs: () => void;
  onBugReport?: () => void;
  bugReporting?: boolean;
  bugReportSaved?: boolean;
  onRepeatTask?: () => void;
  repeatingTask?: boolean;
  isRunning?: boolean;
}

export function DebugPanel({
  debugLogs,
  taskId,
  onClearLogs,
  onBugReport,
  bugReporting = false,
  bugReportSaved = false,
  onRepeatTask,
  repeatingTask = false,
  isRunning = false,
}: DebugPanelProps) {
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const [debugExported, setDebugExported] = useState(false);
  const [debugSearchQuery, setDebugSearchQuery] = useState('');
  const [debugSearchIndex, setDebugSearchIndex] = useState(0);
  const debugPanelRef = useRef<HTMLDivElement>(null);
  const debugSearchInputRef = useRef<HTMLInputElement>(null);
  const debugLogRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const filteredDebugLogs = useMemo(() => {
    if (!debugSearchQuery.trim()) return debugLogs;
    const query = debugSearchQuery.toLowerCase();
    return debugLogs.filter(
      (log) =>
        log.message.toLowerCase().includes(query) ||
        log.type.toLowerCase().includes(query) ||
        (log.data !== undefined &&
          (typeof log.data === 'string' ? log.data : JSON.stringify(log.data))
            .toLowerCase()
            .includes(query)),
    );
  }, [debugLogs, debugSearchQuery]);

  const handleSearchChange = useCallback((value: string) => {
    setDebugSearchQuery(value);
    setDebugSearchIndex(0);
  }, []);

  useEffect(() => {
    if (debugPanelOpen && debugPanelRef.current) {
      debugPanelRef.current.scrollTop = debugPanelRef.current.scrollHeight;
    }
  }, [debugLogs.length, debugPanelOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f' && debugPanelOpen) {
        e.preventDefault();
        debugSearchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [debugPanelOpen]);

  const goToNextMatch = useCallback(() => {
    if (filteredDebugLogs.length === 0) return;
    const nextIndex = (debugSearchIndex + 1) % filteredDebugLogs.length;
    setDebugSearchIndex(nextIndex);
    const rowEl = debugLogRefs.current.get(nextIndex);
    rowEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [filteredDebugLogs.length, debugSearchIndex]);

  const goToPrevMatch = useCallback(() => {
    if (filteredDebugLogs.length === 0) return;
    const prevIndex = (debugSearchIndex - 1 + filteredDebugLogs.length) % filteredDebugLogs.length;
    setDebugSearchIndex(prevIndex);
    const rowEl = debugLogRefs.current.get(prevIndex);
    rowEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [filteredDebugLogs.length, debugSearchIndex]);

  const highlightText = useCallback((text: string, query: string) => {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-yellow-500/40 text-yellow-200 rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      ),
    );
  }, []);

  const handleExportDebugLogs = useCallback(() => {
    const text = debugLogs
      .map((log) => {
        const dataStr =
          log.data !== undefined
            ? ` ${typeof log.data === 'string' ? log.data : JSON.stringify(log.data)}`
            : '';
        return `${new Date(log.timestamp).toISOString()} [${log.type}] ${log.message}${dataStr}`;
      })
      .join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-logs-${taskId}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setDebugExported(true);
    setTimeout(() => setDebugExported(false), 2000);
  }, [debugLogs, taskId]);

  return (
    <div className="flex-shrink-0 border-t border-border" data-testid="debug-panel">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setDebugPanelOpen(!debugPanelOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setDebugPanelOpen(!debugPanelOpen);
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
                  handleExportDebugLogs();
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
          {debugPanelOpen ? (
            <CaretDown className="h-4 w-4 text-zinc-500" />
          ) : (
            <CaretUp className="h-4 w-4 text-zinc-500" />
          )}
        </div>
      </div>

      <AnimatePresence>
        {debugPanelOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 200, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="h-[200px] flex flex-col bg-zinc-950">
              <div className="flex items-center justify-end gap-2 p-2 border-b border-zinc-800 shrink-0">
                {debugSearchQuery.trim() && filteredDebugLogs.length > 0 && (
                  <span className="text-xs text-zinc-500">
                    {debugSearchIndex + 1} of {filteredDebugLogs.length}
                  </span>
                )}
                {debugSearchQuery.trim() && filteredDebugLogs.length > 0 && (
                  <div className="flex">
                    <button
                      onClick={goToPrevMatch}
                      className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-l border border-zinc-700 border-r-0"
                      title="Previous match (Shift+Enter)"
                    >
                      <CaretUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={goToNextMatch}
                      className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-r border border-zinc-700"
                      title="Next match (Enter)"
                    >
                      <CaretDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div className="relative">
                  <MagnifyingGlass className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500" />
                  <input
                    ref={debugSearchInputRef}
                    type="text"
                    value={debugSearchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && debugSearchQuery.trim()) {
                        e.preventDefault();
                        if (e.shiftKey) {
                          goToPrevMatch();
                        } else {
                          goToNextMatch();
                        }
                      }
                    }}
                    placeholder="Search logs... (⌘F)"
                    className="h-7 w-52 pl-7 pr-2 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
                    data-testid="debug-search-input"
                  />
                </div>
              </div>
              <div
                ref={debugPanelRef}
                className="flex-1 overflow-y-auto text-zinc-300 font-mono text-xs p-4"
              >
                {debugLogs.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-zinc-500">
                    No debug logs yet. Run a task to see logs.
                  </div>
                ) : filteredDebugLogs.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-zinc-500">
                    No logs match your search
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredDebugLogs.map((log, index) => (
                      <div
                        key={`${log.taskId}-${log.timestamp}-${index}`}
                        ref={(el) => {
                          if (el) debugLogRefs.current.set(index, el);
                          else debugLogRefs.current.delete(index);
                        }}
                        className={cn(
                          'flex gap-2 px-1 -mx-1 rounded',
                          debugSearchQuery.trim() &&
                            index === debugSearchIndex &&
                            'bg-zinc-800/80 ring-1 ring-zinc-600',
                        )}
                      >
                        <span className="text-zinc-500 shrink-0">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 px-1 rounded',
                            log.type === 'error'
                              ? 'bg-red-500/20 text-red-400'
                              : log.type === 'warn'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : log.type === 'info'
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : 'bg-zinc-700 text-zinc-400',
                          )}
                        >
                          [{highlightText(log.type, debugSearchQuery)}]
                        </span>
                        <span className="text-zinc-300 break-all">
                          {highlightText(log.message, debugSearchQuery)}
                          {log.data !== undefined && (
                            <span className="text-zinc-500 ml-2">
                              {highlightText(
                                typeof log.data === 'string'
                                  ? log.data
                                  : JSON.stringify(log.data, null, 0),
                                debugSearchQuery,
                              )}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
