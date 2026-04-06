import { cn } from '@/lib/utils';
import { Microphone } from '@phosphor-icons/react';

/**
 * Format milliseconds to MM:SS display
 */
export function formatDuration(ms: number): string {
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
      <Microphone className={cn('h-4 w-4', isRecording && 'text-red-500 animate-pulse')} />
      {isRecording && (
        <div className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-75" />
      )}
    </div>
  );
}
