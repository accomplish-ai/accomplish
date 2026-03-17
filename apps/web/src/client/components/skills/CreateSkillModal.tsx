// apps/desktop/src/renderer/components/skills/CreateSkillModal.tsx

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useTaskStore } from '@/stores/taskStore';
import { useNavigate } from 'react-router';
import { getAccomplish } from '@/lib/accomplish';
import { buildCreateSkillPrompt } from '@/components/skills/createSkillPrompt';

interface CreateSkillModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsClose?: () => void;
}

export function CreateSkillModal({ open, onOpenChange, onSettingsClose }: CreateSkillModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasProvider, setHasProvider] = useState<boolean | null>(null);

  const { startTask } = useTaskStore();
  const navigate = useNavigate();
  const { t } = useTranslation('settings');

  // Check if there's an active provider when modal opens
  useEffect(() => {
    if (open) {
      const accomplish = getAccomplish();
      accomplish
        .getProviderSettings()
        .then((settings) => {
          setHasProvider(!!settings?.activeProviderId);
        })
        .catch(() => {
          setHasProvider(false);
        });
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !description.trim() || !hasProvider) return;

    setIsSubmitting(true);

    try {
      const accomplish = getAccomplish();
      const [skillsBasePath, platform] = await Promise.all([
        accomplish.getUserSkillsPath(),
        accomplish.getPlatform(),
      ]);

      const prompt = buildCreateSkillPrompt({
        name: name.trim(),
        description: description.trim(),
        skillsBasePath,
        platform,
      });

      const task = await startTask({ prompt });
      if (task) {
        onOpenChange(false);
        onSettingsClose?.();
        setName('');
        setDescription('');
        navigate(`/execution/${task.id}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false);
      setName('');
      setDescription('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('skills.createTitle')}</DialogTitle>
        </DialogHeader>

        {hasProvider === false && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{t('skills.noProviderWarning')}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="skill-name" className="text-sm font-medium">
                {t('skills.skillName')}
              </label>
              <Input
                id="skill-name"
                placeholder={t('skills.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSubmitting || hasProvider === false}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="skill-description" className="text-sm font-medium">
                {t('skills.description')}
              </label>
              <textarea
                id="skill-description"
                placeholder={t('skills.descriptionPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSubmitting || hasProvider === false}
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              {t('skills.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={
                !name.trim() || !description.trim() || isSubmitting || hasProvider === false
              }
            >
              {isSubmitting ? t('skills.creating') : t('skills.createButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
