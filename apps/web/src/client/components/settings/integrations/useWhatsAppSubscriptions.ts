/**
 * useWhatsAppSubscriptions — IPC event subscription hook for WhatsApp status updates.
 * Extracted from useWhatsAppCard to keep files under 200 lines.
 */
import { useEffect } from 'react';
import type { WhatsAppCardState } from './useWhatsAppCard';

const QR_EXPIRY_SECONDS = 60;

interface UseWhatsAppSubscriptionsOptions {
  accomplish: {
    onWhatsAppQR: (cb: (qr: string) => void) => () => void;
    onWhatsAppStatus: (cb: (status: string) => void) => () => void;
  };
  qrTimerRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  connectTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setQrCode: (qr: string | null) => void;
  setQrExpiresAt: (ts: number) => void;
  setError: (err: string | null) => void;
  setConnecting: (v: boolean) => void;
  setConfig: (fn: (prev: WhatsAppCardState['config']) => WhatsAppCardState['config']) => void;
  fetchConfig: () => Promise<void>;
  normalizeStatus: (status: string) => string;
}

export function useWhatsAppSubscriptions({
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
}: UseWhatsAppSubscriptionsOptions) {
  const clearTimers = () => {
    if (qrTimerRef.current) {
      clearInterval(qrTimerRef.current);
      qrTimerRef.current = null;
    }
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    const unsubQR = accomplish.onWhatsAppQR((qr: string) => {
      setQrCode(qr);
      setQrExpiresAt(Date.now() + QR_EXPIRY_SECONDS * 1000);
      setError(null);
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
      setConnecting(false);
      setConfig((prev) => (prev ? { ...prev, status: 'qr_ready' } : { status: 'qr_ready' }));
    });

    const unsubStatus = accomplish.onWhatsAppStatus((status: string) => {
      const nextStatus = normalizeStatus(status);
      setConfig((prev) => (prev ? { ...prev, status: nextStatus } : { status: nextStatus }));

      if (nextStatus === 'connected') {
        setQrCode(null);
        setConnecting(false);
        setError(null);
        clearTimers();
        void fetchConfig();
      }
      if (nextStatus === 'disconnected' || nextStatus === 'logged_out') {
        setQrCode(null);
        setConnecting(false);
        clearTimers();
      }
    });

    return () => {
      unsubQR();
      unsubStatus();
    };
  }, [
    accomplish,
    fetchConfig,
    normalizeStatus,
    qrTimerRef,
    connectTimeoutRef,
    setQrCode,
    setQrExpiresAt,
    setError,
    setConnecting,
    setConfig,
  ]);
}
