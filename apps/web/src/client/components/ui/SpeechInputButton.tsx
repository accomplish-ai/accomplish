/**
 * Speech Input Button Component
 *
 * A microphone button that toggles recording and shows status during transcription.
 * Supports two modes:
 * 1. Click toggle: click to start, click again to stop and transcribe
 * 2. Push-to-talk: hold Alt (configurable) to record, release to transcribe
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SpinnerGap, WarningCircle, Microphone } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getModifierKeyLabel } from '@/lib/platform';
import type { SpeechInputButtonProps } from './speech-input-button-types';
import { formatDuration } from './speech-input-button-types';
import { MicrophoneIcon } from './speechInputHelpers';

const modifierKey = getModifierKeyLabel();

export type { SpeechInputButtonProps } from './speech-input-button-types';
export { MicrophoneIcon } from './speechInputHelpers';

function getStatusIcon(
  isTranscribing: boolean,
  isRecording: boolean,
  error?: Error | null,
): React.ReactNode {
  if (isTranscribing) {
    return <SpinnerGap className="h-4 w-4 animate-spin" />;
  }
  if (isRecording) {
    return <MicrophoneIcon isRecording className="h-4 w-4" />;
  }
  if (error) {
    return <WarningCircle className="h-4 w-4" />;
  }
  return <Microphone className="h-4 w-4" />;
}

export function SpeechInputButton({
  isRecording,
  isTranscribing,
  recordingDuration = 0,
  error,
  isConfigured = true,
  disabled = false,
  onStartRecording,
  onStopRecording,
  onRetry,
  onOpenSettings,
  size = 'md',
  className,
  tooltipText,
}: SpeechInputButtonProps) {
  const { t } = useTranslation('settings');
  const sizeClasses = useMemo(() => {
    switch (size) {
      case 'sm':
        return 'h-7 w-7 text-xs';
      case 'lg':
        return 'h-11 w-11 text-base';
      case 'md':
      default:
        return 'h-9 w-9 text-sm';
    }
  }, [size]);

  const buttonClasses = useMemo(() => {
    if (isRecording) {
      return 'bg-transparent text-red-600 hover:text-red-700';
    }
    if (isTranscribing) {
      return 'bg-transparent text-blue-600 hover:text-blue-700 cursor-wait';
    }
    if (error) {
      return 'bg-transparent text-orange-600 hover:text-orange-700';
    }
    if (!isConfigured) {
      return 'bg-transparent text-muted-foreground hover:text-foreground';
    }
    return 'bg-transparent text-foreground hover:text-primary';
  }, [isRecording, isTranscribing, error, isConfigured]);

  const tooltipLabel = useMemo(() => {
    if (tooltipText) {
      return tooltipText;
    }
    if (!isConfigured) {
      return t('speech.tooltipSetup');
    }
    if (isRecording) {
      return t('speech.tooltipRecording', { duration: formatDuration(recordingDuration) });
    }
    if (isTranscribing) {
      return t('speech.tooltipTranscribing');
    }
    if (error) {
      return t('speech.tooltipError');
    }
    return t('speech.tooltipDefault', { modifierKey });
  }, [tooltipText, isConfigured, isRecording, isTranscribing, error, recordingDuration, t]);

  const handleClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isConfigured) {
        onOpenSettings?.();
      } else if (isRecording) {
        onStopRecording?.();
      } else if (error) {
        onRetry?.();
      } else {
        onStartRecording?.();
      }
    },
    [isConfigured, isRecording, error, onStartRecording, onStopRecording, onRetry, onOpenSettings],
  );

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleClick}
            disabled={disabled || isTranscribing}
            className={cn(
              'inline-flex items-center justify-center rounded-lg transition-all duration-200 ease-accomplish shrink-0',
              'disabled:cursor-not-allowed disabled:opacity-50',
              sizeClasses,
              buttonClasses,
              className,
            )}
            title={tooltipLabel}
            data-testid="speech-input-button"
          >
            {getStatusIcon(isTranscribing, isRecording, error)}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-sm">
          {tooltipLabel}
        </TooltipContent>
      </Tooltip>

      {/* Recording timer */}
      {isRecording && (
        <div className="text-xs font-mono text-destructive shrink-0 min-w-[40px]">
          {formatDuration(recordingDuration)}
        </div>
      )}

      {/* Status indicator */}
      {isTranscribing && (
        <div className="text-xs text-blue-600 dark:text-blue-400 shrink-0">Processing...</div>
      )}

      {/* Error retry helper text */}
      {error && !isRecording && !isTranscribing && (
        <div className="text-xs text-orange-600 dark:text-orange-400 shrink-0">Retry</div>
      )}
    </div>
  );
}
