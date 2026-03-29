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
import { UploadErrorDialog } from './UploadErrorDialog';
import { useAddSkill } from './useAddSkill';

interface AddSkillDropdownProps {
  onSkillAdded?: () => void;
  onClose?: () => void; // Close the settings dialog
}

export function AddSkillDropdown({ onSkillAdded, onClose }: AddSkillDropdownProps) {
  const { t } = useTranslation('settings');
  const {
    isGitHubDialogOpen,
    isUploadErrorDialogOpen,
    isCreateModalOpen,
    gitHubUrl,
    isLoading,
    error,
    uploadError,
    setIsCreateModalOpen,
    setIsUploadErrorDialogOpen,
    setGitHubUrl,
    handleUploadSkill,
    handleImportFromGitHub,
    handleBuildWithAI,
    handleOpenGitHubDialog,
    handleCloseGitHubDialog,
  } = useAddSkill();

  return (
    <>
      <CreateSkillModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onSettingsClose={onClose}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-9 gap-1.5">
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
            onClick={() => handleUploadSkill(onSkillAdded)}
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
            <DialogDescription>{t('skills.importDialogDescription')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <Input
              placeholder="https://github.com/user/repo/blob/main/SKILL.md"
              value={gitHubUrl}
              onChange={(e) => setGitHubUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isLoading && gitHubUrl.trim()) {
                  handleImportFromGitHub(onSkillAdded);
                }
              }}
              disabled={isLoading}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseGitHubDialog} disabled={isLoading}>
              {t('skills.cancel')}
            </Button>
            <Button
              onClick={() => handleImportFromGitHub(onSkillAdded)}
              disabled={isLoading || !gitHubUrl.trim()}
            >
              {isLoading ? t('skills.importing') : t('skills.import')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UploadErrorDialog
        open={isUploadErrorDialogOpen}
        uploadError={uploadError}
        onClose={() => setIsUploadErrorDialogOpen(false)}
      />
    </>
  );
}
