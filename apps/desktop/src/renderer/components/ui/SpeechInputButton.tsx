/**
 * Speech Input Button Component
 *
 * A microphone button that toggles recording and shows status during transcription.
 * Supports two modes:
 * 1. Click toggle: click to start, click again to stop and transcribe
 * 2. Push-to-talk: hold Alt (configurable) to record, release to transcribe
 */

import React, { useMemo } from 'react';
import { Mic, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SpeechInputButtonProps {
  /**
   * Whether currently recording
   */
  isRecording: boolean;

  /**
   * Whether currently transcribing
   */
  isTranscribing: boolean;

  /**
   * Current recording duration in milliseconds
   */
  recordingDuration?: number;

  /**
   * Error state
   */
  error?: Error | null;

  /**
   * Whether speech input is configured
   */
  isConfigured?: boolean;

  /**
   * Whether disabled (e.g., during task execution)
   */
  disabled?: boolean;

  /**
   * Called when user clicks to start recording
   */
  onStartRecording?: () => void;

  /**
   * Called when user clicks to stop recording
   */
  onStopRecording?: () => void;

  /**
   * Called when user clicks to cancel recording
   */
  onCancel?: () => void;

  /**
   * Called when user clicks to retry
   */
  onRetry?: () => void;

  /**
   * Called when user clicks the button while not configured
   * (to open settings dialog)
   */
  onOpenSettings?: () => void;

  /**
   * Size variant
   */
  size?: 'sm' | 'md' | 'lg';

  /**
   * Custom CSS classes
   */
  className?: string;

  /**
   * Custom tooltip text
   */
  tooltipText?: string;
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
  const sizeClasses = useMemo(
    () => {
      switch (size) {
        case 'sm':
          return 'h-7 w-7 text-xs';
        case 'lg':
          return 'h-11 w-11 text-base';
        case 'md':
        default:
          return 'h-9 w-9 text-sm';
      }
    },
    [size]
  );

  const buttonClasses = useMemo(
    () => {
      if (isRecording) {
        // Recording state: red button with animation
        return 'bg-transparent text-red-600 hover:text-red-700';
      }
      if (isTranscribing) {
        // Transcribing state: blue button
        return 'bg-transparent text-blue-600 hover:text-blue-700 cursor-wait';
      }
      if (error) {
        // Error state: red/orange button
        return 'bg-transparent text-orange-600 hover:text-orange-700';
      }
      if (!isConfigured) {
        // Not configured: show muted style but still clickable (will open settings)
        return 'bg-transparent text-muted-foreground hover:text-foreground';
      }
      // Normal state: primary color
      return 'bg-transparent text-foreground hover:text-primary';
    },
    [isRecording, isTranscribing, error, isConfigured]
  );

  const tooltipLabel = useMemo(() => {
    if (tooltipText) return tooltipText;
    if (!isConfigured) return 'Click to set up voice input';
    if (isRecording) return `Recording (${formatDuration(recordingDuration)}) - Click to stop`;
    if (isTranscribing) return 'Transcribing...';
    if (error) return 'Error during transcription - Click to retry';
    return 'Click to record or hold Alt to record voice input';
  }, [tooltipText, isConfigured, isRecording, isTranscribing, error, recordingDuration]);

  const handleClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isConfigured) {
        // Open settings dialog when not configured
        onOpenSettings?.();
      } else if (isRecording) {
        onStopRecording?.();
      } else if (error) {
        onRetry?.();
      } else {
        onStartRecording?.();
      }
    },
    [isConfigured, isRecording, error, onStartRecording, onStopRecording, onRetry, onOpenSettings]
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
              className
            )}
            title={tooltipLabel}
            data-testid="speech-input-button"
          >
            {isTranscribing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isRecording ? (
              <div className="relative h-4 w-4">
                <Mic className="h-4 w-4" />
              </div>
            ) : error ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-sm">
          {tooltipLabel}
        </TooltipContent>
      </Tooltip>

      {/* Recording timer */}
      {isRecording && (
        <div className="text-xs font-mono text-red-600 dark:text-red-400 shrink-0 min-w-[40px]">
          {formatDuration(recordingDuration)}
        </div>
      )}

      {/* Status indicator */}
      {isTranscribing && (
        <div className="text-xs text-blue-600 dark:text-blue-400 shrink-0">
          Processing...
        </div>
      )}

      {/* Error retry helper text */}
      {error && !isRecording && !isTranscribing && (
        <div className="text-xs text-orange-600 dark:text-orange-400 shrink-0">
          Retry
        </div>
      )}
    </div>
  );
}

/**
 * Format milliseconds to MM:SS display
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Standalone microphone icon button (for use in other places)
 */
export function MicrophoneIcon({
  isRecording,
  className,
}: {
  isRecording?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <Mic className={cn('h-4 w-4', isRecording && 'text-red-500 animate-pulse')} />
      {isRecording && (
        <div className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-75" />
      )}
    </div>
  );
}
