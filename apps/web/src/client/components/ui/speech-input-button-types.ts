export interface SpeechInputButtonProps {
  isRecording: boolean;

  isTranscribing: boolean;

  /**
   * Current recording duration in milliseconds
   */
  recordingDuration?: number;

  /**
   * Error | null
   */
  error?: Error | null;

  isConfigured?: boolean;

  disabled?: boolean;

  onStartRecording?: () => void;

  onStopRecording?: () => void;

  onCancel?: () => void;

  onRetry?: () => void;

  /**
   * Called when user clicks the button while not configured
   * (to open settings dialog)
   */
  onOpenSettings?: () => void;

  size?: 'sm' | 'md' | 'lg';

  className?: string;

  tooltipText?: string;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
