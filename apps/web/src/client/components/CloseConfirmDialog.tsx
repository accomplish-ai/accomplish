/**
 * CloseConfirmDialog — themed close confirmation shown when the user
 * clicks the window close button. Replaces the native OS dialog with
 * a Radix-based dialog matching the app's design system.
 */
import { useState, useEffect, useCallback } from 'react';
import { Warning, Power, ArrowRight } from '@phosphor-icons/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAccomplish } from '@/lib/accomplish';

type CloseDecision = 'keep-daemon' | 'stop-daemon';

export function CloseConfirmDialog() {
  const accomplish = useAccomplish();
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<CloseDecision>('keep-daemon');

  useEffect(() => {
    if (!accomplish.onCloseRequested) {
      return;
    }
    const unsubscribe = accomplish.onCloseRequested(() => {
      setDecision('keep-daemon');
      setOpen(true);
    });
    return unsubscribe;
  }, [accomplish]);

  const handleConfirm = useCallback(() => {
    setOpen(false);
    accomplish.respondToClose?.(decision);
  }, [accomplish, decision]);

  const handleCancel = useCallback(() => {
    setOpen(false);
    accomplish.respondToClose?.('cancel');
  }, [accomplish]);

  const isKeepDaemon = decision === 'keep-daemon';

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          handleCancel();
        }
      }}
    >
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Power className="h-5 w-5" weight="bold" />
            Close Accomplish
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Choose how to close the application.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          {/* Option 1: Keep daemon */}
          <button
            type="button"
            onClick={() => setDecision('keep-daemon')}
            className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
              isKeepDaemon
                ? 'border-primary bg-primary/5'
                : 'border-border bg-card hover:bg-muted/50'
            }`}
          >
            <div
              className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                isKeepDaemon ? 'border-primary' : 'border-muted-foreground/40'
              }`}
            >
              {isKeepDaemon && <div className="h-2 w-2 rounded-full bg-primary" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-foreground">Close window</div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                The background daemon keeps running. Scheduled tasks, WhatsApp messages, and other
                integrations will continue working.
              </p>
            </div>
          </button>

          {/* Option 2: Stop daemon */}
          <button
            type="button"
            onClick={() => setDecision('stop-daemon')}
            className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
              !isKeepDaemon
                ? 'border-destructive/50 bg-destructive/5'
                : 'border-border bg-card hover:bg-muted/50'
            }`}
          >
            <div
              className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                !isKeepDaemon ? 'border-destructive' : 'border-muted-foreground/40'
              }`}
            >
              {!isKeepDaemon && <div className="h-2 w-2 rounded-full bg-destructive" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-foreground">Close & stop daemon</div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Stop all background processing. Scheduled tasks and integrations will not run until
                you reopen the app.
              </p>
            </div>
          </button>

          {/* Warning when stop-daemon is selected */}
          {!isKeepDaemon && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3">
              <Warning className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" weight="bold" />
              <p className="text-xs text-destructive leading-relaxed">
                Background tasks, scheduled jobs, and WhatsApp message processing will stop
                immediately. They will resume when you reopen Accomplish.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            variant={isKeepDaemon ? 'default' : 'destructive'}
            onClick={handleConfirm}
            className="gap-1.5"
          >
            {isKeepDaemon ? 'Close' : 'Close & Stop'}
            <ArrowRight className="h-3.5 w-3.5" weight="bold" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
