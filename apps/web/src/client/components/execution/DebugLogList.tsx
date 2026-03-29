import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretUp, CaretDown, MagnifyingGlass } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { DebugLogEntry } from './DebugPanel';

interface DebugLogListProps {
  isOpen: boolean;
  debugLogs: DebugLogEntry[];
  filteredDebugLogs: DebugLogEntry[];
  debugSearchQuery: string;
  debugSearchIndex: number;
  onSearchChange: (v: string) => void;
  onGoToPrev: () => void;
  onGoToNext: () => void;
  highlightText: (text: string, query: string) => React.ReactNode;
  panelRef: React.RefObject<HTMLDivElement | null>;
  logRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

export function DebugLogList({
  isOpen,
  debugLogs,
  filteredDebugLogs,
  debugSearchQuery,
  debugSearchIndex,
  onSearchChange,
  onGoToPrev,
  onGoToNext,
  highlightText,
  panelRef,
  logRefs,
  searchInputRef,
}: DebugLogListProps) {
  return (
    <AnimatePresence>
      {isOpen && (
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
                    onClick={onGoToPrev}
                    className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-l border border-zinc-700 border-r-0"
                    title="Previous match (Shift+Enter)"
                  >
                    <CaretUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={onGoToNext}
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
                  ref={searchInputRef}
                  type="text"
                  value={debugSearchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && debugSearchQuery.trim()) {
                      e.preventDefault();
                      if (e.shiftKey) {
                        onGoToPrev();
                      } else {
                        onGoToNext();
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
              ref={panelRef}
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
                        if (el) {
                          logRefs.current.set(index, el);
                        } else {
                          logRefs.current.delete(index);
                        }
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
  );
}
