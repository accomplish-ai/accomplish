import { motion, AnimatePresence } from 'framer-motion';
import { Download } from '@phosphor-icons/react';
import { Card } from '@/components/ui/card';
import { springs } from '../../lib/animations';
import { useTranslation } from 'react-i18next';

interface BrowserInstallModalProps {
  setupProgress: string | null;
  setupProgressTaskId: string | null;
  taskId: string | undefined;
  setupDownloadStep: number;
}

/** Modal overlay shown while the browser is being installed/downloaded. */
export function BrowserInstallModal({
  setupProgress,
  setupProgressTaskId,
  taskId,
  setupDownloadStep,
}: BrowserInstallModalProps) {
  const { t } = useTranslation('execution');

  const isVisible = !!(
    setupProgress &&
    setupProgressTaskId === taskId &&
    (setupProgress.toLowerCase().includes('download') || setupProgress.includes('% of'))
  );

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-[12px]"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={springs.bouncy}
          >
            <Card className="w-[480px] p-6">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Download className="h-7 w-7 text-primary" />
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-primary/30 border-t-primary"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                </div>
                <div className="w-full">
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    {t('browserInstall.title')}
                  </h3>
                  <p className="text-muted-foreground mb-4">{t('browserInstall.description')}</p>
                  {(() => {
                    const percentMatch = setupProgress?.match(/(\d+)%/);
                    const currentPercent = percentMatch ? parseInt(percentMatch[1], 10) : 0;
                    let overallPercent = 0;
                    if (setupDownloadStep === 1) {
                      overallPercent = Math.round(currentPercent * 0.64);
                    } else if (setupDownloadStep === 2) {
                      overallPercent = 64 + Math.round(currentPercent * 0.01);
                    } else {
                      overallPercent = 65 + Math.round(currentPercent * 0.35);
                    }
                    return (
                      <div className="w-full">
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-muted-foreground">
                            {t('browserInstall.downloading')}
                          </span>
                          <span className="text-foreground font-medium">{overallPercent}%</span>
                        </div>
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-primary rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${overallPercent}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                  <p className="text-xs text-muted-foreground mt-4 text-center">
                    {t('browserInstall.oneTimeSetup')}
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
