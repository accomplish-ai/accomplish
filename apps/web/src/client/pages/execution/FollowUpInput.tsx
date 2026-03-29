import { useTranslation } from 'react-i18next';
import { WarningCircle } from '@phosphor-icons/react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SlashCommandPopover } from '../../components/landing/SlashCommandPopover';
import { FollowUpToolbar } from './FollowUpToolbar';
import { DragOverlay, AttachmentList } from './FollowUpAttachments';
import type { FileAttachmentInfo, Task } from '@accomplish_ai/agent-core';
import type { useSpeechInput } from '../../hooks/useSpeechInput';
import type { useSlashCommand } from '../../hooks/useSlashCommand';

interface FollowUpInputProps {
  followUp: string;
  setFollowUp: (v: string) => void;
  isFollowUpOverLimit: boolean;
  attachments: FileAttachmentInfo[];
  setAttachments: (updater: (prev: FileAttachmentInfo[]) => FileAttachmentInfo[]) => void;
  removeAttachment: (id: string) => void;
  isDragging: boolean;
  setDragCounter: React.Dispatch<React.SetStateAction<number>>;
  setIsDragging: (v: boolean) => void;
  handleDrop: (e: React.DragEvent) => void;
  handlePickFiles: () => void;
  speechInput: ReturnType<typeof useSpeechInput>;
  slashCommand: ReturnType<typeof useSlashCommand>;
  followUpInputRef: React.RefObject<HTMLTextAreaElement | null>;
  handleFollowUp: () => void;
  isLoading: boolean;
  currentTask: Task;
  hasSession: string | boolean | null | undefined;
  onOpenSettings: (tab: 'providers' | 'voice' | 'skills' | 'connectors') => void;
  onOpenModelSettings: () => void;
  onOpenSpeechSettings: () => void;
}

/** Follow-up input bar shown when the user can send a message. */
export function FollowUpInput(props: FollowUpInputProps) {
  const { t: tCommon } = useTranslation('common');
  const { t } = useTranslation('execution');
  const {
    followUp,
    setFollowUp,
    isFollowUpOverLimit,
    attachments,
    removeAttachment,
    isDragging,
    setDragCounter,
    setIsDragging,
    handleDrop,
    handlePickFiles,
    speechInput,
    slashCommand,
    followUpInputRef,
    handleFollowUp,
    isLoading,
    currentTask,
    hasSession,
    onOpenSettings,
    onOpenModelSettings,
    onOpenSpeechSettings,
  } = props;

  const getPlaceholder = () => {
    if (currentTask.status === 'interrupted') {
      return hasSession ? t('followUp.interruptedPlaceholder') : t('followUp.noSessionPlaceholder');
    }
    if (currentTask.status === 'completed') {
      return t('followUp.completedPlaceholder');
    }
    return t('followUp.defaultPlaceholder');
  };

  return (
    <div
      className="flex-shrink-0 border-t border-border bg-card/50 px-6 py-4 relative"
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        setDragCounter((prev) => prev + 1);
        if (!isDragging) {
          setIsDragging(true);
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragCounter((prev) => {
          const next = Math.max(prev - 1, 0);
          if (next === 0) {
            setIsDragging(false);
          }
          return next;
        });
      }}
      onDrop={handleDrop}
    >
      {isDragging && <DragOverlay setIsDragging={setIsDragging} handleDrop={handleDrop} />}
      <div className="max-w-4xl mx-auto space-y-2">
        {speechInput.error && (
          <Alert
            variant="destructive"
            className="py-2 px-3 flex items-center gap-2 [&>svg]:static [&>svg~*]:pl-0"
          >
            <WarningCircle className="h-4 w-4" />
            <AlertDescription className="text-xs leading-tight">
              {speechInput.error.message}
              {speechInput.error.code === 'EMPTY_RESULT' && (
                <button
                  onClick={() => speechInput.retry()}
                  className="ml-2 underline hover:no-underline"
                  type="button"
                >
                  {tCommon('buttons.retry')}
                </button>
              )}
            </AlertDescription>
          </Alert>
        )}
        <div className="rounded-xl border border-border bg-background shadow-sm transition-all duration-200 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
          <AttachmentList attachments={attachments} removeAttachment={removeAttachment} />
          <div className="px-4 pt-3 pb-2 relative">
            <textarea
              ref={followUpInputRef}
              value={followUp}
              onChange={(e) => {
                setFollowUp(e.target.value);
                slashCommand.handleChange(e.target.value, e.target.selectionStart);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) {
                  return;
                }
                if (slashCommand.handleKeyDown(e)) {
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  const isDisabled =
                    (!followUp.trim() && attachments.length === 0) ||
                    isLoading ||
                    speechInput.isRecording ||
                    isFollowUpOverLimit;
                  if (!isDisabled) {
                    handleFollowUp();
                  }
                }
              }}
              placeholder={getPlaceholder()}
              disabled={isLoading || speechInput.isRecording}
              rows={1}
              className="w-full max-h-[160px] resize-none bg-transparent text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="execution-follow-up-input"
            />
            <SlashCommandPopover
              isOpen={slashCommand.state.isOpen}
              skills={slashCommand.state.filteredSkills}
              selectedIndex={slashCommand.state.selectedIndex}
              query={slashCommand.state.query}
              textareaRef={followUpInputRef}
              triggerStart={slashCommand.state.triggerStart}
              onSelect={slashCommand.selectSkill}
              onDismiss={slashCommand.dismiss}
            />
          </div>
          <FollowUpToolbar
            followUp={followUp}
            setFollowUp={setFollowUp}
            attachments={attachments}
            isLoading={isLoading}
            isFollowUpOverLimit={isFollowUpOverLimit}
            speechInput={speechInput}
            followUpInputRef={followUpInputRef}
            handleFollowUp={handleFollowUp}
            handlePickFiles={handlePickFiles}
            onOpenSettings={onOpenSettings}
            onOpenModelSettings={onOpenModelSettings}
            onOpenSpeechSettings={onOpenSpeechSettings}
          />
        </div>
      </div>
    </div>
  );
}
