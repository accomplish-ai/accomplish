import { Warning, X } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useDaemonStore } from '@/stores/daemonStore';
import { Button } from './ui/button';

interface DaemonConnectionToastProps {
  onOpenSettings?: () => void;
}

export function DaemonConnectionToast({ onOpenSettings }: DaemonConnectionToastProps) {
  const { t } = useTranslation('errors');
  const { status, toastDismissed, dismissToast } = useDaemonStore();

  const isVisible =
    (status === 'disconnected' || status === 'reconnecting' || status === 'reconnect-failed') &&
    !toastDismissed;

  const isFailed = status === 'reconnect-failed';

  const title = isFailed ? t('daemon.reconnectFailed') : t('daemon.disconnected');
  const message = isFailed ? t('daemon.reconnectFailedMessage') : t('daemon.disconnectedMessage');

  const borderClass = isFailed
    ? 'border-destructive/50 bg-destructive/10'
    : 'border-yellow-500/50 bg-yellow-500/10';
  const iconBgClass = isFailed ? 'bg-destructive/20' : 'bg-yellow-500/20';
  const iconColorClass = isFailed ? 'text-destructive' : 'text-yellow-600 dark:text-yellow-400';

  const handleOpenSettings = () => {
    onOpenSettings?.();
    dismissToast();
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="fixed bottom-4 left-4 z-50 max-w-md"
          data-testid="daemon-connection-toast"
        >
          <div className={`rounded-lg border ${borderClass} p-4 shadow-lg backdrop-blur-sm`}>
            <div className="flex items-start gap-3">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full ${iconBgClass} flex-shrink-0`}
              >
                <Warning className={`h-4 w-4 ${iconColorClass}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-medium text-foreground">{title}</h4>
                  <button
                    onClick={dismissToast}
                    className="flex-shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    data-testid="daemon-connection-toast-dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{message}</p>
                {isFailed && onOpenSettings && (
                  <div className="mt-3">
                    <Button size="sm" onClick={handleOpenSettings}>
                      {t('daemon.openSettings')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
