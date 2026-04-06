import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface AddScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (cron: string, prompt: string) => Promise<void>;
}

export function AddScheduleDialog({ open, onOpenChange, onSubmit }: AddScheduleDialogProps) {
  const { t } = useTranslation('settings');
  const [cron, setCron] = useState('');
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = cron.trim().length > 0 && prompt.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(cron.trim(), prompt.trim());
      setCron('');
      setPrompt('');
      setError(null);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey && canSubmit) {
      handleSubmit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>{t('scheduler.addDialog.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('scheduler.addDialog.cronLabel')}</label>
            <input
              type="text"
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              placeholder={t('scheduler.addDialog.cronPlaceholder')}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">{t('scheduler.addDialog.cronHelp')}</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('scheduler.addDialog.promptLabel')}</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('scheduler.addDialog.promptPlaceholder')}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              {t('scheduler.addDialog.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? '...' : t('scheduler.addDialog.create')}
            </button>
          </div>
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
