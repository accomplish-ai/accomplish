import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { WarningCircle, X } from '@phosphor-icons/react';
import { springs } from '../../lib/animations';
import { Button } from '@/components/ui/button';

interface CreditExhaustedChatBannerProps {
  resetDate: string;
  onConnectProvider: () => void;
  variant?: 'exhausted' | 'insufficient';
}

function formatResetDate(resetsAt: string): string {
  if (!resetsAt) return 'soon';
  try {
    return new Date(resetsAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'soon';
  }
}

export function CreditExhaustedChatBanner({
  resetDate,
  onConnectProvider,
  variant = 'exhausted',
}: CreditExhaustedChatBannerProps) {
  const { t } = useTranslation('common');
  const [dismissed, setDismissed] = useState(false);

  const formattedDate = formatResetDate(resetDate);

  const title =
    variant === 'insufficient'
      ? t('credits.chatBannerInsufficientTitle', 'Insufficient credits')
      : t('credits.chatBannerTitle', 'Credits exhausted');
  const message =
    variant === 'insufficient'
      ? t('credits.chatBannerInsufficientMessage', {
          date: formattedDate,
          defaultValue: `Not enough credits for this request. Credits reset on ${formattedDate}.`,
        })
      : t('credits.chatBannerMessage', {
          date: formattedDate,
          defaultValue: `Your free credits have been used up. Credits reset on ${formattedDate}.`,
        });

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={springs.gentle}
          className="rounded-2xl border border-border bg-card p-4 sm:p-5"
          data-testid="credits-exhausted-chat-banner"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
                <WarningCircle className="h-5 w-5 text-amber-600" weight="fill" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{message}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 sm:self-center">
              <Button onClick={onConnectProvider}>
                {t('credits.connectProvider', 'Connect a Provider')}
              </Button>
              <button
                onClick={() => setDismissed(true)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label={t('credits.dismiss', 'Dismiss')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
