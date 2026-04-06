/**
 * useWhatsAppCard — state machine hook for WhatsApp connection management.
 *
 * Extracted from WhatsAppCard for modularity (> 200 line limit).
 * Encapsulates IPC bootstrapping, subscription cleanup, and status transitions.
 * IPC subscriptions are delegated to useWhatsAppSubscriptions.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import { useWhatsAppSubscriptions } from './useWhatsAppSubscriptions';

const VALID_STATUSES = new Set([
  'connecting',
  'qr_ready',
  'connected',
  'disconnected',
  'logged_out',
  'reconnecting',
]);

function normalizeStatus(status: string): string {
  return VALID_STATUSES.has(status) ? status : 'disconnected';
}

export interface WhatsAppCardState {
  config: { status: string; phoneNumber?: string; lastConnectedAt?: number } | null;
  loading: boolean;
  connecting: boolean;
  disconnecting: boolean;
  confirmDisconnect: boolean;
  error: string | null;
  qrCode: string | null;
  qrExpiresAt: number;
}

export interface WhatsAppCardActions {
  handleConnect(): Promise<void>;
  handleDisconnect(): Promise<void>;
  setQrCode(qr: string | null): void;
}

export function useWhatsAppCard(): WhatsAppCardState & WhatsAppCardActions {
  const accomplish = useMemo(() => getAccomplish(), []);

  const [config, setConfig] = useState<WhatsAppCardState['config']>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrExpiresAt, setQrExpiresAt] = useState<number>(0);
  const qrTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-clear confirm disconnect after 3 seconds
  useEffect(() => {
    if (!confirmDisconnect) {
      return;
    }
    const timer = setTimeout(() => setConfirmDisconnect(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmDisconnect]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (qrTimerRef.current) {
        clearInterval(qrTimerRef.current);
      }
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
      }
    };
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const result = await accomplish.getWhatsAppConfig();
      if (result?.enabled) {
        const status = normalizeStatus(result.status);
        setConfig({
          status,
          phoneNumber: result.phoneNumber,
          lastConnectedAt: result.lastConnectedAt,
        });
        // QR recovery: if daemon is already in qr_ready with a QR code, show it
        if (status === 'qr_ready' && result.qrCode && result.qrIssuedAt) {
          setQrCode(result.qrCode);
          setQrExpiresAt(result.qrIssuedAt + 60_000);
          setConnecting(false);
        }
      } else {
        setConfig(null);
      }
    } catch {
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, [accomplish]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useWhatsAppSubscriptions({
    accomplish,
    qrTimerRef,
    connectTimeoutRef,
    setQrCode,
    setQrExpiresAt,
    setError,
    setConnecting,
    setConfig,
    fetchConfig,
    normalizeStatus,
  });

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    setQrCode(null);
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
    }
    connectTimeoutRef.current = setTimeout(() => {
      setConnecting((prev) => {
        if (prev) {
          setError('Connection timed out. Please try again.');
        }
        return false;
      });
    }, 30_000);
    try {
      await accomplish.connectWhatsApp();
    } catch (err) {
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setConnecting(false);
    }
  }, [accomplish]);

  const handleDisconnect = useCallback(async () => {
    if (!confirmDisconnect) {
      setConfirmDisconnect(true);
      return;
    }
    setDisconnecting(true);
    setConfirmDisconnect(false);
    try {
      await accomplish.disconnectWhatsApp();
      setConfig(null);
      setQrCode(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  }, [confirmDisconnect, accomplish]);

  return {
    config,
    loading,
    connecting,
    disconnecting,
    confirmDisconnect,
    error,
    qrCode,
    qrExpiresAt,
    handleConnect,
    handleDisconnect,
    setQrCode,
  };
}
