/**
 * Low-level hook for managing MediaRecorder state and audio capture
 */

import { useRef, useCallback, useEffect } from 'react';
import { SpeechRecognitionError } from './speech-types';

export interface UseSpeechRecorderOptions {
  maxDuration?: number;
  onError: (code: string, message: string, originalError?: Error) => void;
  onStateChange: (recording: boolean) => void;
  onDurationUpdate: (ms: number) => void;
}

export interface UseSpeechRecorderReturn {
  isCapturing: boolean;
  startCapture(): Promise<void>;
  stopCapture(): Promise<ArrayBuffer | null>;
  cancelCapture(): void;
}

export function useSpeechRecorder(options: UseSpeechRecorderOptions): UseSpeechRecorderReturn {
  const { maxDuration = 120000, onError, onStateChange, onDurationUpdate } = options;

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isCapturingRef = useRef<boolean>(false);
  const stopCaptureResolveRef = useRef<((data: ArrayBuffer | null) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    audioChunksRef.current = [];
    mediaRecorderRef.current = null;
    isCapturingRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const stopCapture = useCallback((): Promise<ArrayBuffer | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || !isCapturingRef.current) {
        resolve(null);
        return;
      }

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }

      stopCaptureResolveRef.current = resolve;

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const resolveCapture = stopCaptureResolveRef.current;
        stopCaptureResolveRef.current = null;
        cleanup();

        blob
          .arrayBuffer()
          .then((buffer) => {
            if (resolveCapture) {
              resolveCapture(buffer);
            }
          })
          .catch(() => {
            if (resolveCapture) {
              resolveCapture(null);
            }
          });
      };

      recorder.stop();
      isCapturingRef.current = false;
      onStateChange(false);
    });
  }, [cleanup, onStateChange]);

  const startCapture = useCallback(async (): Promise<void> => {
    if (isCapturingRef.current) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      recordingStartTimeRef.current = Date.now();
      isCapturingRef.current = true;

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = () => {
        onError('RECORDING_ERROR', 'Recording error occurred');
        cleanup();
      };

      mediaRecorder.start();
      onStateChange(true);

      durationIntervalRef.current = setInterval(() => {
        const duration = Date.now() - recordingStartTimeRef.current;
        onDurationUpdate(duration);
      }, 100);

      recordingTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          void stopCapture();
        }
      }, maxDuration);
    } catch (error) {
      cleanup();

      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        onError(
          'MICROPHONE_DENIED',
          'Microphone access denied. Please allow microphone access in settings.',
          error,
        );
      } else if (error instanceof DOMException && error.name === 'NotFoundError') {
        onError('NO_MICROPHONE', 'No microphone found. Please check your audio devices.', error);
      } else {
        onError(
          'RECORDING_FAILED',
          `Failed to start recording: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error instanceof Error ? error : undefined,
        );
      }
    }
  }, [maxDuration, onError, onStateChange, onDurationUpdate, cleanup, stopCapture]);

  const cancelCapture = useCallback((): void => {
    if (!isCapturingRef.current) {
      return;
    }

    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    stopCaptureResolveRef.current = null;
    cleanup();
    onStateChange(false);
  }, [cleanup, onStateChange]);

  return {
    get isCapturing() {
      return isCapturingRef.current;
    },
    startCapture,
    stopCapture,
    cancelCapture,
  };
}

// Re-export for consumers that import error class from this module
export { SpeechRecognitionError };
