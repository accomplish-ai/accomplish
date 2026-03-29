import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface UploadErrorDialogProps {
  open: boolean;
  uploadError: string | null;
  onClose: () => void;
}

export function UploadErrorDialog({ open, uploadError, onClose }: UploadErrorDialogProps) {
  const { t } = useTranslation('settings');

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <div className="flex items-start gap-4">
          <div className="bg-destructive/10 rounded-full p-3 flex-shrink-0">
            <svg
              className="w-5 h-5 text-destructive"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <DialogHeader className="space-y-1">
              <DialogTitle>{t('skills.uploadFailedTitle')}</DialogTitle>
              <DialogDescription>{t('skills.uploadFailedDescription')}</DialogDescription>
            </DialogHeader>
          </div>
        </div>

        <div className="mt-4 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
          <div className="flex items-start gap-2">
            <svg
              className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-sm text-destructive">{uploadError}</p>
          </div>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          {t('skills.uploadErrorHelp')}{' '}
          <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">
            {t('skills.uploadErrorField')}
          </code>{' '}
          {t('skills.uploadErrorFieldSuffix')}
        </p>

        <pre className="mt-2 p-3 bg-muted rounded-md text-xs overflow-x-auto text-muted-foreground">
          {`---
name: my-skill
description: What this skill does
---

# My Skill

Instructions here...`}
        </pre>

        <DialogFooter className="mt-4">
          <Button onClick={onClose}>{t('skills.ok')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
