// apps/desktop/src/renderer/components/settings/skills/AddSkillDropdown.tsx

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CreateSkillModal } from '@/components/skills/CreateSkillModal';

interface AddSkillDropdownProps {
  onSkillAdded?: () => void;
  onClose?: () => void; // Close the settings dialog
}

export function AddSkillDropdown({ onSkillAdded, onClose }: AddSkillDropdownProps) {
  const { t } = useTranslation('settings');
  const [isGitHubDialogOpen, setIsGitHubDialogOpen] = useState(false);
  const [isUploadErrorDialogOpen, setIsUploadErrorDialogOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [gitHubUrl, setGitHubUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleUploadSkill = async () => {
    if (!window.accomplish) return;

    try {
      setIsLoading(true);
      setUploadError(null);
      const filePath = await window.accomplish.pickSkillFile();
      if (!filePath) {
        setIsLoading(false);
        return; // User cancelled
      }
      await window.accomplish.addSkillFromFile(filePath);
      onSkillAdded?.();
    } catch (err) {
      console.error('Failed to upload skill:', err);
      let errorMessage = err instanceof Error ? err.message : 'Failed to upload skill';
      // Clean up the error message - extract the actual error after "Error: "
      const errorMatch = errorMessage.match(/Error:\s*(.+)$/);
      if (errorMatch) {
        errorMessage = errorMatch[1];
      }
      setUploadError(errorMessage);
      setIsUploadErrorDialogOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportFromGitHub = async () => {
    if (!gitHubUrl.trim() || !window.accomplish) return;

    try {
      setIsLoading(true);
      setError(null);
      await window.accomplish.addSkillFromGitHub(gitHubUrl);
      setGitHubUrl('');
      setIsGitHubDialogOpen(false);
      onSkillAdded?.();
    } catch (err) {
      console.error('Failed to import from GitHub:', err);
      setError(err instanceof Error ? err.message : 'Failed to import skill');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBuildWithAI = () => {
    setIsCreateModalOpen(true);
  };

  const handleOpenGitHubDialog = () => {
    setGitHubUrl('');
    setError(null);
    setIsGitHubDialogOpen(true);
  };

  const handleCloseGitHubDialog = () => {
    if (!isLoading) {
      setIsGitHubDialogOpen(false);
      setGitHubUrl('');
      setError(null);
    }
  };

  return (
    <>
      <CreateSkillModal open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen} onSettingsClose={onClose} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="gap-1.5">
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t('skills.add')}
            <svg
              className="h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem
            onClick={handleBuildWithAI}
            className="flex-col items-start gap-0.5 py-2.5"
          >
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M8 12h8M12 8v8" />
              </svg>
              <span className="font-medium">{t('skills.buildWithAccomplish')}</span>
            </div>
            <span className="pl-6 text-xs text-muted-foreground">
              {t('skills.buildDescription')}
            </span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={handleUploadSkill}
            disabled={isLoading}
            className="flex-col items-start gap-0.5 py-2.5"
          >
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17,8 12,3 7,8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="font-medium">{t('skills.uploadSkill')}</span>
            </div>
            <span className="pl-6 text-xs text-muted-foreground">
              {t('skills.uploadDescription')}
            </span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={handleOpenGitHubDialog}
            className="flex-col items-start gap-0.5 py-2.5"
          >
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" />
              </svg>
              <span className="font-medium">{t('skills.importFromGitHub')}</span>
            </div>
            <span className="pl-6 text-xs text-muted-foreground">
              {t('skills.importDescription')}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* GitHub Import Dialog */}
      <Dialog open={isGitHubDialogOpen} onOpenChange={handleCloseGitHubDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('skills.importFromGitHub')}</DialogTitle>
            <DialogDescription>
              {t('skills.importDialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <Input
              placeholder="https://github.com/user/repo/blob/main/SKILL.md"
              value={gitHubUrl}
              onChange={(e) => setGitHubUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isLoading && gitHubUrl.trim()) {
                  handleImportFromGitHub();
                }
              }}
              disabled={isLoading}
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCloseGitHubDialog}
              disabled={isLoading}
            >
              {t('skills.cancel')}
            </Button>
            <Button
              onClick={handleImportFromGitHub}
              disabled={isLoading || !gitHubUrl.trim()}
            >
              {isLoading ? t('skills.importing') : t('skills.import')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Error Dialog */}
      <Dialog open={isUploadErrorDialogOpen} onOpenChange={setIsUploadErrorDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <div className="flex items-start gap-4">
            <div className="bg-destructive/10 rounded-full p-3 flex-shrink-0">
              <svg className="w-5 h-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <DialogHeader className="space-y-1">
                <DialogTitle>{t('skills.uploadFailedTitle')}</DialogTitle>
                <DialogDescription>
                  {t('skills.uploadFailedDescription')}
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>

          <div className="mt-4 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-destructive">{uploadError}</p>
            </div>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            {t('skills.uploadErrorHelp')} <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">{t('skills.uploadErrorField')}</code> {t('skills.uploadErrorFieldSuffix')}
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
            <Button onClick={() => setIsUploadErrorDialogOpen(false)}>
              {t('skills.ok')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
