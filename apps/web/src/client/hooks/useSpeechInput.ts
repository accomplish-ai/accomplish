/**
 * React Hook for managing speech-to-text input (orchestrator)
 * Delegates low-level recording to useSpeechRecorder.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { getAccomplish } from '../lib/accomplish';
import { SpeechRecognitionError, UseSpeechInputOptions, UseSpeechInputState } from './speech-types';
import { useSpeechRecorder } from './useSpeechRecorder';

export { SpeechRecognitionError } from './speech-types';
export type { UseSpeechInputOptions, UseSpeechInputState } from './speech-types';

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
  } = options;

  const accomplish = getAccomplish();
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

  useEffect(() => {
    let mounted = true;
    getAccomplish()
      .speechIsConfigured()
      .then((configured) => {
        if (mounted) {
          setState((prev) => ({ ...prev, isConfigured: configured }));
        }
      })
      .catch(() => {
        // ignore errors from speechIsConfigured on mount
      });
    return () => {
      mounted = false;
    };
  }, []);

  const recorder = useSpeechRecorder({
    maxDuration,
    onError: (code, message, originalError) => {
      const speechError = new SpeechRecognitionError(code, message, originalError);
      setState((prev) => ({
        ...prev,
        isRecording: false,
        isTranscribing: false,
        error: speechError,
        recordingDuration: 0,
      }));
      onError?.(speechError);
    },
    onStateChange: (recording) => {
      setState((prev) => ({ ...prev, isRecording: recording }));
      onRecordingStateChange?.(recording);
    },
    onDurationUpdate: (ms) => {
      setState((prev) => ({ ...prev, recordingDuration: ms }));
    },
  });

  const stopRecording = useCallback(async () => {
    if (!recorder.isCapturing) {
      return;
    }
    setState((prev) => ({ ...prev, isTranscribing: true }));
    try {
      const audioData = await recorder.stopCapture();
      if (!audioData) {
        setState((prev) => ({ ...prev, isTranscribing: false, recordingDuration: 0 }));
        return;
      }
      lastAudioDataRef.current = audioData;
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
          formatErrorMessage(result.error.message),
        );
        setState((prev) => ({ ...prev, isTranscribing: false, error, recordingDuration: 0 }));
        onError?.(error);
      }
    } catch (error) {
      const speechError = new SpeechRecognitionError(
        'TRANSCRIPTION_FAILED',
        error instanceof Error ? error.message : 'Failed to transcribe audio',
      );
      setState((prev) => ({
        ...prev,
        isTranscribing: false,
        error: speechError,
        recordingDuration: 0,
      }));
      onError?.(speechError);
    }
  }, [recorder, accomplish, onTranscriptionComplete, onError, formatErrorMessage]);

  const startRecording = useCallback(async () => {
    if (recorder.isCapturing || state.isTranscribing) {
      return;
    }
    lastAudioDataRef.current = null;
    if (!state.isConfigured) {
      const error = new SpeechRecognitionError(
        'NOT_CONFIGURED',
        'ElevenLabs API is not configured. Please add your API key in settings.',
      );
      setState((prev) => ({ ...prev, error }));
      onError?.(error);
      return;
    }
    setState((prev) => ({ ...prev, error: null, recordingDuration: 0 }));
    await recorder.startCapture();
  }, [recorder, state.isTranscribing, state.isConfigured, onError]);

  const cancelRecording = useCallback(() => {
    if (!recorder.isCapturing) {
      return;
    }
    recorder.cancelCapture();
    lastAudioDataRef.current = null;
    setState((prev) => ({ ...prev, isRecording: false, error: null, recordingDuration: 0 }));
  }, [recorder]);

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
          formatErrorMessage(result.error.message),
        );
        setState((prev) => ({ ...prev, isTranscribing: false, error }));
        onError?.(error);
      }
    } catch (error) {
      const speechError = new SpeechRecognitionError(
        'TRANSCRIPTION_FAILED',
        error instanceof Error ? error.message : 'Failed to transcribe audio',
      );
      setState((prev) => ({ ...prev, isTranscribing: false, error: speechError }));
      onError?.(speechError);
    }
  }, [
    state.isTranscribing,
    state.isRecording,
    onTranscriptionComplete,
    onError,
    accomplish,
    formatErrorMessage,
  ]);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && state.isRecording) {
        event.preventDefault();
        cancelRecording();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [state.isRecording, cancelRecording]);

  return { ...state, startRecording, stopRecording, cancelRecording, retry, clearError };
}
