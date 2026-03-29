import { ArrowBendDownLeft } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { ModelIndicator } from '../../components/ui/ModelIndicator';
import { SpeechInputButton } from '../../components/ui/SpeechInputButton';
import { PlusMenu } from '../../components/landing/PlusMenu';
import type { FileAttachmentInfo } from '@accomplish_ai/agent-core/common';
import type { useSpeechInput } from '../../hooks/useSpeechInput';

interface FollowUpToolbarProps {
  followUp: string;
  setFollowUp: (v: string) => void;
  attachments: FileAttachmentInfo[];
  isLoading: boolean;
  isFollowUpOverLimit: boolean;
  speechInput: ReturnType<typeof useSpeechInput>;
  followUpInputRef: React.RefObject<HTMLTextAreaElement | null>;
  handleFollowUp: () => void;
  handlePickFiles: () => void;
  onOpenSettings: (tab: 'providers' | 'voice' | 'skills' | 'connectors') => void;
  onOpenModelSettings: () => void;
  onOpenSpeechSettings: () => void;
}

/** Bottom toolbar row: PlusMenu, model indicator, speech, and send button. */
export function FollowUpToolbar({
  followUp,
  setFollowUp,
  attachments,
  isLoading,
  isFollowUpOverLimit,
  speechInput,
  followUpInputRef,
  handleFollowUp,
  handlePickFiles,
  onOpenSettings,
  onOpenModelSettings,
  onOpenSpeechSettings,
}: FollowUpToolbarProps) {
  const { t: tCommon } = useTranslation('common');

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border/50">
      <PlusMenu
        onSkillSelect={(command) => {
          setFollowUp(`${command} ${followUp}`.trim());
          setTimeout(() => followUpInputRef.current?.focus(), 0);
        }}
        onAttachFiles={handlePickFiles}
        onOpenSettings={onOpenSettings}
        disabled={isLoading || speechInput.isRecording}
      />
      <div className="flex items-center gap-2">
        <ModelIndicator isRunning={false} onOpenSettings={onOpenModelSettings} />
        <div className="w-px h-6 bg-border flex-shrink-0" />
        <SpeechInputButton
          isRecording={speechInput.isRecording}
          isTranscribing={speechInput.isTranscribing}
          recordingDuration={speechInput.recordingDuration}
          error={speechInput.error}
          isConfigured={speechInput.isConfigured}
          disabled={isLoading}
          onStartRecording={() => speechInput.startRecording()}
          onStopRecording={() => speechInput.stopRecording()}
          onRetry={() => speechInput.retry()}
          onOpenSettings={onOpenSpeechSettings}
          size="md"
        />
        <button
          type="button"
          onClick={handleFollowUp}
          disabled={
            (!followUp.trim() && attachments.length === 0) ||
            isLoading ||
            speechInput.isRecording ||
            isFollowUpOverLimit
          }
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={tCommon('buttons.send')}
        >
          <ArrowBendDownLeft className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
