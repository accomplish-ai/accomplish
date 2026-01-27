/**
 * React Hook for managing speech-to-text input
 *
 * Handles:
 * - Recording audio from microphone (in renderer process)
 * - Button click toggle (start/stop recording)
 * - Push-to-talk via keyboard shortcut (hold to record, release to transcribe)
 * - Sending audio to main process for transcription via IPC
 * - State management (recording, transcribing, error)
 * - Automatic retry on failure
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { getAccomplish } from '../lib/accomplish';

/**
 * Speech recognition error
 */
export class SpeechRecognitionError extends Error {
  constructor(
    public code: string,
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'SpeechRecognitionError';
  }
}

export interface UseSpeechInputOptions {
  /**
   * Callback when transcription is complete
   */
  onTranscriptionComplete?: (text: string) => void;

  /**
   * Callback when recording state changes
   */
  onRecordingStateChange?: (isRecording: boolean) => void;

  /**
   * Callback when error occurs
   */
  onError?: (error: SpeechRecognitionError) => void;

  /**
   * Maximum recording duration in milliseconds (default 120000 = 2 minutes)
   */
  maxDuration?: number;

  /**
   * Keyboard shortcut for push-to-talk (e.g., 'Alt', 'Control', 'Shift', or specific key code)
   */
  pushToTalkKey?: string;
}

export interface UseSpeechInputState {
  /**
   * Is currently recording
   */
  isRecording: boolean;

  /**
   * Is currently transcribing
   */
  isTranscribing: boolean;

  /**
   * Current recording duration in milliseconds
   */
  recordingDuration: number;

  /**
   * Last error that occurred
   */
  error: SpeechRecognitionError | null;

  /**
   * Last transcribed text
   */
  lastTranscription: string | null;

  /**
   * Whether speech input is configured and available
   */
  isConfigured: boolean;
}

export function useSpeechInput(options: UseSpeechInputOptions = {}): UseSpeechInputState & {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  cancelRecording: () => void;
  retry: () => Promise<void>;
  clearError: () => void;
} {
  const {
    onTranscriptionComplete,
    onRecordingStateChange,
    onError,
    maxDuration = 120000,
    pushToTalkKey = 'Alt',
  } = options;

  const accomplish = getAccomplish();

  // Refs for recording state
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastAudioDataRef = useRef<ArrayBuffer | null>(null);

  const [state, setState] = useState<UseSpeechInputState>({
    isRecording: false,
    isTranscribing: false,
    recordingDuration: 0,
    error: null,
    lastTranscription: null,
    isConfigured: false,
  });

  const formatErrorMessage = useCallback((message: unknown): string => {
    if (typeof message === 'string') {
      return message;
    }
    if (message instanceof Error) {
      return message.message;
    }
    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }, []);

  // Check if speech input is configured
  useEffect(() => {
    accomplish.speechIsConfigured().then((configured) => {
      setState((prev) => ({ ...prev, isConfigured: configured }));
    });
  }, [accomplish]);

  /**
   * Clean up recording resources
   */
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
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  /**
   * Start recording audio
   */
  const startRecording = useCallback(async () => {
    if (state.isRecording || state.isTranscribing) {
      return;
    }

    if (!state.isConfigured) {
      const error = new SpeechRecognitionError(
        'NOT_CONFIGURED',
        'ElevenLabs API is not configured. Please add your API key in settings.'
      );
      setState((prev) => ({ ...prev, error }));
      onError?.(error);
      return;
    }

    try {
      setState((prev) => ({ ...prev, error: null, recordingDuration: 0 }));

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      recordingStartTimeRef.current = Date.now();

      // Collect audio data
      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Handle recording errors
      mediaRecorder.onerror = () => {
        const error = new SpeechRecognitionError(
          'RECORDING_ERROR',
          'Recording error occurred'
        );
        setState((prev) => ({ ...prev, isRecording: false, error }));
        onError?.(error);
        cleanup();
      };

      mediaRecorder.start();

      setState((prev) => ({ ...prev, isRecording: true }));
      onRecordingStateChange?.(true);

      // Update duration every 100ms
      durationIntervalRef.current = setInterval(() => {
        const duration = Date.now() - recordingStartTimeRef.current;
        setState((prev) => ({ ...prev, recordingDuration: duration }));
      }, 100);

      // Set max duration timeout
      recordingTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          stopRecording();
        }
      }, maxDuration);
    } catch (error) {
      cleanup();

      let speechError: SpeechRecognitionError;
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        speechError = new SpeechRecognitionError(
          'MICROPHONE_DENIED',
          'Microphone access denied. Please allow microphone access in settings.',
          error
        );
      } else if (error instanceof DOMException && error.name === 'NotFoundError') {
        speechError = new SpeechRecognitionError(
          'NO_MICROPHONE',
          'No microphone found. Please check your audio devices.',
          error
        );
      } else {
        speechError = new SpeechRecognitionError(
          'RECORDING_FAILED',
          `Failed to start recording: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error instanceof Error ? error : undefined
        );
      }

      setState((prev) => ({ ...prev, error: speechError, isRecording: false }));
      onError?.(speechError);
    }
  }, [state.isRecording, state.isTranscribing, state.isConfigured, maxDuration, onRecordingStateChange, onError, cleanup]);

  /**
   * Stop recording and transcribe via IPC
   */
  const stopRecording = useCallback(async () => {
    if (!state.isRecording || !mediaRecorderRef.current) {
      return;
    }

    // Stop duration timer
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    // Clear max duration timeout
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    setState((prev) => ({ ...prev, isRecording: false, isTranscribing: true }));
    onRecordingStateChange?.(false);

    try {
      // Stop recording and collect audio
      const audioBlob = await new Promise<Blob>((resolve, reject) => {
        const recorder = mediaRecorderRef.current;
        if (!recorder) {
          reject(new Error('MediaRecorder is null'));
          return;
        }

        recorder.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          cleanup();
          resolve(blob);
        };

        recorder.stop();
      });

      // Convert blob to ArrayBuffer for IPC transfer
      const audioData = await audioBlob.arrayBuffer();
      lastAudioDataRef.current = audioData;

      // Send to main process for transcription
      const result = await accomplish.speechTranscribe(audioData, 'audio/webm');

      if (result.success) {
        setState((prev) => ({
          ...prev,
          isTranscribing: false,
          lastTranscription: result.result.text,
          error: null,
          recordingDuration: 0,
        }));
        onTranscriptionComplete?.(result.result.text);
      } else {
        const error = new SpeechRecognitionError(
          result.error.code,
          formatErrorMessage(result.error.message)
        );
        setState((prev) => ({
          ...prev,
          isTranscribing: false,
          error,
          recordingDuration: 0,
        }));
        onError?.(error);
      }
    } catch (error) {
      cleanup();
      const speechError = new SpeechRecognitionError(
        'TRANSCRIPTION_FAILED',
        error instanceof Error ? error.message : 'Failed to transcribe audio'
      );
      setState((prev) => ({
        ...prev,
        isTranscribing: false,
        error: speechError,
        recordingDuration: 0,
      }));
      onError?.(speechError);
    }
  }, [state.isRecording, onRecordingStateChange, onTranscriptionComplete, onError, cleanup, accomplish, formatErrorMessage]);

  /**
   * Cancel recording without transcribing
   */
  const cancelRecording = useCallback(() => {
    if (!state.isRecording) {
      return;
    }

    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    cleanup();

    setState((prev) => ({
      ...prev,
      isRecording: false,
      error: null,
      recordingDuration: 0,
    }));
    onRecordingStateChange?.(false);
  }, [state.isRecording, cleanup, onRecordingStateChange]);

  /**
   * Retry transcription of last recording
   */
  const retry = useCallback(async () => {
    if (!lastAudioDataRef.current || state.isTranscribing || state.isRecording) {
      return;
    }

    try {
      setState((prev) => ({ ...prev, isTranscribing: true, error: null }));

      const result = await accomplish.speechTranscribe(lastAudioDataRef.current, 'audio/webm');

      if (result.success) {
        setState((prev) => ({
          ...prev,
          isTranscribing: false,
          lastTranscription: result.result.text,
          error: null,
        }));
        onTranscriptionComplete?.(result.result.text);
      } else {
        const error = new SpeechRecognitionError(
          result.error.code,
          formatErrorMessage(result.error.message)
        );
        setState((prev) => ({ ...prev, isTranscribing: false, error }));
        onError?.(error);
      }
    } catch (error) {
      const speechError = new SpeechRecognitionError(
        'TRANSCRIPTION_FAILED',
        error instanceof Error ? error.message : 'Failed to transcribe audio'
      );
      setState((prev) => ({ ...prev, isTranscribing: false, error: speechError }));
      onError?.(speechError);
    }
  }, [state.isTranscribing, state.isRecording, onTranscriptionComplete, onError, accomplish, formatErrorMessage]);

  /**
   * Clear the current error
   */
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  // Handle push-to-talk keyboard shortcuts and Escape to cancel
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Escape to cancel recording
      if (event.key === 'Escape' && state.isRecording) {
        event.preventDefault();
        cancelRecording();
        return;
      }

      // Push-to-talk
      if (event.key === pushToTalkKey && !state.isRecording && !state.isTranscribing) {
        event.preventDefault();
        void startRecording();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === pushToTalkKey && state.isRecording) {
        event.preventDefault();
        void stopRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [state.isRecording, state.isTranscribing, pushToTalkKey, startRecording, stopRecording, cancelRecording]);

  return {
    ...state,
    startRecording,
    stopRecording,
    cancelRecording,
    retry,
    clearError,
  };
}
