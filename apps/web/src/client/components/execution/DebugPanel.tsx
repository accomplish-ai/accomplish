import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { DebugPanelHeader } from './DebugPanelHeader';
import { DebugLogList } from './DebugLogList';

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
    if (!debugSearchQuery.trim()) {
      return debugLogs;
    }
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
    if (filteredDebugLogs.length === 0) {
      return;
    }
    const nextIndex = (debugSearchIndex + 1) % filteredDebugLogs.length;
    setDebugSearchIndex(nextIndex);
    const rowEl = debugLogRefs.current.get(nextIndex);
    rowEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [filteredDebugLogs.length, debugSearchIndex]);

  const goToPrevMatch = useCallback(() => {
    if (filteredDebugLogs.length === 0) {
      return;
    }
    const prevIndex = (debugSearchIndex - 1 + filteredDebugLogs.length) % filteredDebugLogs.length;
    setDebugSearchIndex(prevIndex);
    const rowEl = debugLogRefs.current.get(prevIndex);
    rowEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [filteredDebugLogs.length, debugSearchIndex]);

  const highlightText = useCallback((text: string, query: string) => {
    if (!query.trim()) {
      return text;
    }
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
      <DebugPanelHeader
        isOpen={debugPanelOpen}
        onToggle={() => setDebugPanelOpen(!debugPanelOpen)}
        debugLogs={debugLogs}
        filteredDebugLogs={filteredDebugLogs}
        debugSearchQuery={debugSearchQuery}
        debugExported={debugExported}
        onExport={handleExportDebugLogs}
        onClearLogs={onClearLogs}
        onBugReport={onBugReport}
        bugReporting={bugReporting}
        bugReportSaved={bugReportSaved}
        onRepeatTask={onRepeatTask}
        repeatingTask={repeatingTask}
        isRunning={isRunning}
      />
      <DebugLogList
        isOpen={debugPanelOpen}
        debugLogs={debugLogs}
        filteredDebugLogs={filteredDebugLogs}
        debugSearchQuery={debugSearchQuery}
        debugSearchIndex={debugSearchIndex}
        onSearchChange={handleSearchChange}
        onGoToPrev={goToPrevMatch}
        onGoToNext={goToNextMatch}
        highlightText={highlightText}
        panelRef={debugPanelRef}
        logRefs={debugLogRefs}
        searchInputRef={debugSearchInputRef}
      />
    </div>
  );
}
