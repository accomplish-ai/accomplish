import { useEffect, useRef, useState } from 'react';
import { GoogleAccountCard } from './GoogleAccountCard';
import { GoogleLabelDialog } from './GoogleLabelDialog';
import { useGoogleAccountStore, initGoogleAccountListener } from '@/stores/googleAccountStore';
import { Button } from '@/components/ui/button';

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 15; // 30 s total

export function GoogleAccountsSection() {
  const { accounts, loading, fetchAccounts, removeAccount } = useGoogleAccountStore();
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [reconnectId, setReconnectId] = useState<string | null>(null);
  const [pendingAuthState, setPendingAuthState] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCancelRef = useRef<boolean>(false);

  useEffect(() => {
    const cleanup = initGoogleAccountListener();
    fetchAccounts();
    return () => {
      cleanup();
      pollCancelRef.current = true;
      if (pollTimerRef.current !== null) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [fetchAccounts]);

  const openAuth = async (
    label: string,
    onComplete?: () => void,
    accountId?: string,
  ): Promise<void> => {
    setConnecting(true);
    try {
      const result = await window.accomplish?.gws?.startAuth(label);
      if (result?.authUrl && result.authUrl.length > 0) {
        if (window.accomplish?.openExternal) {
          await window.accomplish.openExternal(result.authUrl);
        } else {
          window.open(result.authUrl, '_blank');
        }

        setPendingAuthState(result.state);

        // Poll fetchAccounts until a new account appears or reconnect completes
        const knownIds = new Set(accounts.map((a) => a.googleAccountId));
        const targetAccountId = accountId || reconnectId;
        let attempts = 0;
        pollCancelRef.current = false;
        const poll = async (): Promise<void> => {
          attempts++;
          try {
            await fetchAccounts();
          } catch (error) {
            // Handle fetch failures: log and stop polling if canceled
            console.error('Failed to fetch accounts during polling:', error);
            if (pollCancelRef.current) {
              return;
            }
          }

          // Check cancellation after async work
          if (pollCancelRef.current) {
            return;
          }

          const current = useGoogleAccountStore.getState().accounts;

          // Check for new account (add flow)
          const hasNewAccount = current.some((a) => !knownIds.has(a.googleAccountId));

          // Check for reconnect completion (in-place update)
          let reconnectComplete = false;
          if (targetAccountId) {
            const targetAccount = current.find((a) => a.googleAccountId === targetAccountId);
            if (targetAccount?.status === 'connected') {
              reconnectComplete = true;
            }
          }

          if (hasNewAccount || reconnectComplete || attempts >= POLL_MAX_ATTEMPTS) {
            if (pollTimerRef.current !== null) {
              clearTimeout(pollTimerRef.current);
              pollTimerRef.current = null;
            }
            setPendingAuthState(null);
            setConnecting(false);
            onComplete?.();
            return;
          }

          // Check cancellation before scheduling next poll
          if (pollCancelRef.current) {
            return;
          }

          pollTimerRef.current = setTimeout(() => void poll(), POLL_INTERVAL_MS);
        };
        pollTimerRef.current = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      } else {
        setConnecting(false);
        onComplete?.();
      }
    } catch {
      setConnecting(false);
      onComplete?.();
    }
  };

  const handleAddConfirm = async (label: string): Promise<void> => {
    setLabelDialogOpen(false);
    await openAuth(label);
  };

  const handleReconnect = async (id: string): Promise<void> => {
    const account = accounts.find((a) => a.googleAccountId === id);
    if (!account) {
      return;
    }
    setReconnectId(id);
    // Clear reconnectId only after connecting is fully finished (inside onComplete)
    await openAuth(account.label, () => setReconnectId(null), id);
  };

  const handleCancelConnecting = async () => {
    pollCancelRef.current = true;
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (pendingAuthState) {
      await window.accomplish?.gws?.cancelAuth(pendingAuthState);
    }
    setReconnectId(null);
    setPendingAuthState(null);
    setConnecting(false);
  };

  return (
    <div>
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Google Accounts
      </h4>

      {(() => {
        if (loading && accounts.length === 0) {
          return (
            <div className="flex h-[80px] items-center justify-center">
              <span className="text-sm text-muted-foreground">Loading accounts...</span>
            </div>
          );
        }

        if (accounts.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-8">
              <p className="text-sm text-muted-foreground">No Google accounts connected</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLabelDialogOpen(true)}
                disabled={connecting}
              >
                Add Google Account
              </Button>
            </div>
          );
        }

        return (
          <div className="flex flex-col gap-2">
            {accounts.map((account) => (
              <GoogleAccountCard
                key={account.googleAccountId}
                account={account}
                onDisconnect={removeAccount}
                onReconnect={handleReconnect}
              />
            ))}
            <div className="mt-2 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLabelDialogOpen(true)}
                disabled={connecting || !!reconnectId}
              >
                Add Google Account
              </Button>
              {connecting && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Waiting for Google...</span>
                  <Button variant="ghost" size="sm" onClick={handleCancelConnecting}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {connecting && accounts.length === 0 && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Waiting for Google...</span>
          <Button variant="ghost" size="sm" onClick={handleCancelConnecting}>
            Cancel
          </Button>
        </div>
      )}

      <GoogleLabelDialog
        open={labelDialogOpen}
        onConfirm={handleAddConfirm}
        onCancel={() => setLabelDialogOpen(false)}
      />
    </div>
  );
}
