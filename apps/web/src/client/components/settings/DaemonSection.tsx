/**
 * DaemonSection — Settings UI for daemon monitoring and control.
 *
 * Reads daemon status from the global daemonStore (single source of truth).
 * All status changes go through the store so sidebar dot, toast, and this
 * section always agree.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Warning } from '@phosphor-icons/react';
import { useAccomplish } from '@/lib/accomplish';
import { useDaemonStore } from '@/stores/daemonStore';
import { Button } from '@/components/ui/button';

function formatUptime(ms: number): string {
  if (ms <= 0) {
    return '\u2014';
  }
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

// Map global store status → display status for the settings section
function getDisplayStatus(
  storeStatus: ReturnType<typeof useDaemonStore.getState>['status'],
): string {
  switch (storeStatus) {
    case 'connected':
      return 'running';
    case 'starting':
      return 'starting';
    case 'stopping':
      return 'stopping';
    case 'stopped':
      return 'stopped';
    case 'disconnected':
    case 'reconnecting':
      return 'reconnecting';
    case 'reconnect-failed':
      return 'failed';
    default:
      return 'unknown';
  }
}

function getStatusDotClass(displayStatus: string): string {
  switch (displayStatus) {
    case 'running':
      return 'bg-green-500';
    case 'starting':
      return 'bg-green-500 animate-pulse';
    case 'stopping':
      return 'bg-red-500 animate-pulse';
    case 'reconnecting':
      return 'bg-yellow-500 animate-pulse';
    case 'failed':
    case 'stopped':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
}

// Skips overwriting transitional states (starting/stopping/reconnecting)
// to prevent the polling loop from defeating intentional state transitions.
const TRANSITIONAL_STATES = new Set(['starting', 'stopping', 'reconnecting']);

export function DaemonSection() {
  const accomplish = useAccomplish();
  const { t } = useTranslation('settings');

  // Read status from global store — single source of truth
  const storeStatus = useDaemonStore((s) => s.status);
  const setGlobalStatus = useDaemonStore((s) => s.setStatus);
  const displayStatus = getDisplayStatus(storeStatus);

  // Local state for section-specific data (not daemon connection state)
  const [uptime, setUptime] = useState(0);
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollStatus = useCallback(async () => {
    try {
      const result = await accomplish.daemonPing();
      if (result.status === 'ok') {
        setUptime(result.uptime);
        // Only set connected if not in a transitional state
        const currentStatus = useDaemonStore.getState().status;
        if (!TRANSITIONAL_STATES.has(currentStatus)) {
          setGlobalStatus('connected');
        }
      } else {
        setUptime(0);
        const currentStatus = useDaemonStore.getState().status;
        if (!TRANSITIONAL_STATES.has(currentStatus)) {
          setGlobalStatus('stopped');
        }
      }
      setLastPing(new Date());
    } catch {
      setUptime(0);
      // Don't override store status on poll failure — store handles
      // disconnect/reconnect events with more nuance
    }
  }, [accomplish, setGlobalStatus]);

  useEffect(() => {
    void pollStatus();
    pollRef.current = setInterval(() => void pollStatus(), 10_000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [pollStatus]);

  // Control actions — update global store for all state changes.
  // After successful start/restart, explicitly set 'connected' before
  // calling pollStatus(), since the poll guard skips transitional states.
  const handleRestart = async () => {
    setActionInProgress('restart');
    setGlobalStatus('reconnecting');
    try {
      await accomplish.daemonRestart();
      setGlobalStatus('connected'); // Explicit: daemon is healthy
      await pollStatus(); // Updates uptime/lastPing
    } catch {
      setGlobalStatus('reconnect-failed');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleStop = async () => {
    setActionInProgress('stop');
    setGlobalStatus('stopping');
    try {
      await accomplish.daemonStop();
      setGlobalStatus('stopped');
      setUptime(0);
    } catch {
      setGlobalStatus('reconnect-failed');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleStart = async () => {
    setActionInProgress('start');
    setGlobalStatus('starting');
    try {
      await accomplish.daemonStart();
      setGlobalStatus('connected'); // Explicit: daemon is healthy
      await pollStatus(); // Updates uptime/lastPing
    } catch {
      setGlobalStatus('reconnect-failed');
    } finally {
      setActionInProgress(null);
    }
  };

  const dotClass = getStatusDotClass(displayStatus);
  const statusLabel = t(`daemon.status.${displayStatus}`, displayStatus);
  const isRunning = displayStatus === 'running';
  const isFailed = displayStatus === 'failed';

  return (
    <>
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">
        {t('daemon.title')}
      </h4>

      {/* Status Monitor */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
            <div>
              <div className="font-medium text-foreground text-sm">{statusLabel}</div>
              {isRunning && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('daemon.status.uptime', { uptime: formatUptime(uptime) })}
                  {lastPing && (
                    <span className="ml-2">
                      {' '}
                      {t('daemon.status.lastPing', {
                        seconds: Math.round((Date.now() - lastPing.getTime()) / 1000),
                      })}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isRunning ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRestart}
                  disabled={actionInProgress !== null}
                >
                  {actionInProgress === 'restart'
                    ? t('daemon.controls.restarting')
                    : t('daemon.controls.restart')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleStop}
                  disabled={actionInProgress !== null}
                >
                  {actionInProgress === 'stop'
                    ? t('daemon.controls.stopping')
                    : t('daemon.controls.stop')}
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleStart}
                disabled={actionInProgress !== null}
              >
                {actionInProgress === 'start'
                  ? t('daemon.controls.starting')
                  : t('daemon.controls.start')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Failed Warning Banner */}
      {isFailed && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-3">
          <Warning className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{t('daemon.status.failedMessage')}</p>
        </div>
      )}
    </>
  );
}
