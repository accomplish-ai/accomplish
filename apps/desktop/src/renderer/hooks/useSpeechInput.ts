/**
 * React Hook for managing speech-to-text input
 *
 * Handles:
 * - Recording audio from microphone
 * - Button click toggle (start/stop recording)
 * - Push-to-talk via keyboard shortcut (hold to record, release to transcribe)
 * - State management (recording, transcribing, error)
 * - Automatic retry on failure
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { getAccomplish } from '../lib/accomplish';

/**
 * Speech recognition result
 */
export interface SpeechRecognitionResult {
  text: string;
  confidence?: number;
  duration: number;
  timestamp: number;
}

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

/**
 * Client-side SpeechToTextService wrapper that uses IPC for transcription
 */
class ClientSpeechToTextService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isRecording = false;
  private recordingStartTime = 0;
  private recordingTimeoutId: NodeJS.Timeout | null = null;
  private stream: MediaStream | null = null;

  async startRecording(config?: { maxDuration?: number }): Promise<void> {
    if (this.isRecording) {
      throw new SpeechRecognitionError('ALREADY_RECORDING', 'Recording is already in progress');
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.audioChunks = [];
      this.isRecording = true;
      this.recordingStartTime = Date.now();

      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onerror = (event: Event) => {
        this.isRecording = false;
        const mediaEvent = event as any;
        throw new SpeechRecognitionError(
          'RECORDING_ERROR',
          `Recording error: ${mediaEvent.error}`,
          new Error(mediaEvent.error)
        );
      };

      this.mediaRecorder.start();

      const maxDuration = config?.maxDuration ?? 120000;
      this.recordingTimeoutId = setTimeout(() => {
        if (this.isRecording) {
          this.stopRecording();
        }
      }, maxDuration);
    } catch (error) {
      this.isRecording = false;
      this.cleanup();

      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        throw new SpeechRecognitionError(
          'MICROPHONE_DENIED',
          'Microphone access denied. Please allow microphone access in settings.',
          error
        );
      }

      if (error instanceof DOMException && error.name === 'NotFoundError') {
        throw new SpeechRecognitionError(
          'NO_MICROPHONE',
          'No microphone found. Please check your audio devices.',
          error
        );
      }

      throw new SpeechRecognitionError(
        'RECORDING_FAILED',
        `Failed to start recording: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async stopRecording(): Promise<Blob> {
    if (!this.mediaRecorder || !this.isRecording) {
      throw new SpeechRecognitionError('NOT_RECORDING', 'No recording in progress');
    }

    if (this.recordingTimeoutId) {
      clearTimeout(this.recordingTimeoutId);
      this.recordingTimeoutId = null;
    }

    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new SpeechRecognitionError('RECORDING_FAILED', 'MediaRecorder is null'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        this.isRecording = false;
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.cleanup();
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  cancelRecording(): void {
    if (this.recordingTimeoutId) {
      clearTimeout(this.recordingTimeoutId);
      this.recordingTimeoutId = null;
    }

    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
    }

    this.cleanup();
  }

  getIsRecording(): boolean {
    return this.isRecording;
  }

  getRecordingDuration(): number {
    if (!this.isRecording) return 0;
    return Date.now() - this.recordingStartTime;
  }

  async transcribeAudio(audioBlob: Blob, apiKey: string): Promise<SpeechRecognitionResult> {
    if (!apiKey || apiKey.trim() === '') {
      throw new SpeechRecognitionError(
        'MISSING_API_KEY',
        'ElevenLabs API key is not configured. Please add it in settings.'
      );
    }

    const startTime = Date.now();

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.webm');

      const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
        },
        body: formData,
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        if (response.status === 401 || response.status === 403) {
          throw new SpeechRecognitionError(
            'INVALID_API_KEY',
            'Invalid or expired ElevenLabs API key. Please check your settings.',
            new Error(errorData.error?.message || 'Unauthorized')
          );
        }

        if (response.status === 429) {
          throw new SpeechRecognitionError(
            'RATE_LIMIT',
            'Rate limit exceeded. Please wait a moment and try again.',
            new Error('Too many requests')
          );
        }

        throw new SpeechRecognitionError(
          'TRANSCRIPTION_FAILED',
          `Transcription failed: ${errorData.error?.message || response.statusText}`,
          new Error(JSON.stringify(errorData))
        );
      }

      const result = await response.json();

      if (!result.text) {
        throw new SpeechRecognitionError(
          'EMPTY_RESULT',
          'No text was recognized. Please try again.',
          new Error('Empty transcription result')
        );
      }

      return {
        text: result.text.trim(),
        confidence: result.confidence,
        duration,
        timestamp: Date.now(),
      };
    } catch (error) {
      if (error instanceof SpeechRecognitionError) {
        throw error;
      }

      throw new SpeechRecognitionError(
        'NETWORK_ERROR',
        `Network error during transcription: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async recordAndTranscribe(config: { apiKey: string; maxDuration?: number }): Promise<SpeechRecognitionResult> {
    try {
      await this.startRecording({ maxDuration: config.maxDuration });
      const audioBlob = await this.stopRecording();
      const result = await this.transcribeAudio(audioBlob, config.apiKey);
      return result;
    } catch (error) {
      this.cancelRecording();
      throw error;
    }
  }

  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this.audioChunks = [];
    this.mediaRecorder = null;
  }

  dispose(): void {
    this.cancelRecording();
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

  /**
   * Whether to automatically send text after transcription
   */
  autoSend?: boolean;
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
  const serviceRef = useRef<ClientSpeechToTextService | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioDataRef = useRef<Blob | null>(null);
  const apiKeyRef = useRef<string | null>(null);

  const [state, setState] = useState<UseSpeechInputState>({
    isRecording: false,
    isTranscribing: false,
    recordingDuration: 0,
    error: null,
    lastTranscription: null,
    isConfigured: false,
  });

  // Check if speech input is configured
  useEffect(() => {
    if (accomplish.speechIsConfigured) {
      accomplish.speechIsConfigured().then((configured) => {
        setState((prev) => ({ ...prev, isConfigured: configured }));
      });
    }
  }, [accomplish]);

  // Initialize service and get API key
  useEffect(() => {
    if (!serviceRef.current) {
      serviceRef.current = new ClientSpeechToTextService();
    }

    // Try to get the API key from secure storage via IPC
    // Note: We can't get the actual key for security, so we'll use a placeholder
    // The key is retrieved during transcription from secure storage on the main process
    apiKeyRef.current = 'placeholder-will-be-retrieved-during-transcription';

    return () => {
      if (serviceRef.current) {
        serviceRef.current.dispose();
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, []);

  /**
   * Get the API key from IPC (retrieved securely on main process)
   */
  const getApiKey = useCallback(async (): Promise<string> => {
    // We need to create an IPC handler that returns the API key
    // For now, we'll just return the placeholder - it will be retrieved during actual transcription
    // In a real implementation, we'd add an IPC handler to get the API key
    return apiKeyRef.current || '';
  }, []);

  /**
   * Start recording
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

      if (serviceRef.current) {
        await serviceRef.current.startRecording({ maxDuration });
        setState((prev) => ({ ...prev, isRecording: true }));
        onRecordingStateChange?.(true);

        // Update duration every 100ms
        durationIntervalRef.current = setInterval(() => {
          if (serviceRef.current) {
            const duration = serviceRef.current.getRecordingDuration();
            setState((prev) => ({ ...prev, recordingDuration: duration }));
          }
        }, 100);
      }
    } catch (error) {
      const speechError =
        error instanceof SpeechRecognitionError
          ? error
          : new SpeechRecognitionError(
              'RECORDING_FAILED',
              error instanceof Error ? error.message : 'Failed to start recording'
            );
      setState((prev) => ({ ...prev, error: speechError, isRecording: false }));
      onError?.(speechError);
    }
  }, [state.isRecording, state.isTranscribing, state.isConfigured, maxDuration, onRecordingStateChange, onError]);

  /**
   * Stop recording and transcribe
   */
  const stopRecording = useCallback(async () => {
    if (!state.isRecording || !serviceRef.current) {
      return;
    }

    // Stop duration timer
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    try {
      setState((prev) => ({ ...prev, isRecording: false, isTranscribing: true }));
      onRecordingStateChange?.(false);

      // Stop recording and get audio
      const audioBlob = await serviceRef.current.stopRecording();
      audioDataRef.current = audioBlob;

      // Get the API key (this needs to be retrieved from secure storage)
      // We'll use IPC to get it from the main process
      const apiKey = await (accomplish as any).speechGetApiKey?.() || '';
      
      if (!apiKey) {
        throw new SpeechRecognitionError(
          'MISSING_API_KEY',
          'ElevenLabs API key is not available'
        );
      }

      const result = await serviceRef.current.transcribeAudio(audioBlob, apiKey);

      setState((prev) => ({
        ...prev,
        isTranscribing: false,
        lastTranscription: result.text,
        error: null,
        recordingDuration: 0,
      }));

      onTranscriptionComplete?.(result.text);
    } catch (error) {
      const speechError =
        error instanceof SpeechRecognitionError
          ? error
          : new SpeechRecognitionError(
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
  }, [state.isRecording, onRecordingStateChange, onTranscriptionComplete, onError, accomplish]);

  /**
   * Cancel recording without transcribing
   */
  const cancelRecording = useCallback(() => {
    if (!state.isRecording) {
      return;
    }

    // Stop duration timer
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    if (serviceRef.current) {
      serviceRef.current.cancelRecording();
    }

    setState((prev) => ({
      ...prev,
      isRecording: false,
      error: null,
      recordingDuration: 0,
    }));
    onRecordingStateChange?.(false);
  }, [state.isRecording, onRecordingStateChange]);

  /**
   * Retry transcription of last recording
   */
  const retry = useCallback(async () => {
    if (!audioDataRef.current || state.isTranscribing || state.isRecording) {
      return;
    }

    try {
      setState((prev) => ({ ...prev, isTranscribing: true, error: null }));

      const apiKey = await accomplish.speechGetApiKey?.() || '';
      if (!apiKey || !serviceRef.current) {
        throw new SpeechRecognitionError(
          'MISSING_API_KEY',
          'ElevenLabs API key is not available'
        );
      }

      const result = await serviceRef.current.transcribeAudio(audioDataRef.current, apiKey);

      setState((prev) => ({
        ...prev,
        isTranscribing: false,
        lastTranscription: result.text,
        error: null,
      }));

      onTranscriptionComplete?.(result.text);
    } catch (error) {
      const speechError =
        error instanceof SpeechRecognitionError
          ? error
          : new SpeechRecognitionError(
              'TRANSCRIPTION_FAILED',
              error instanceof Error ? error.message : 'Failed to transcribe audio'
            );
      setState((prev) => ({ ...prev, isTranscribing: false, error: speechError }));
      onError?.(speechError);
    }
  }, [state.isTranscribing, state.isRecording, onTranscriptionComplete, onError, accomplish]);

  /**
   * Clear the current error
   */
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  // Handle push-to-talk keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
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
  }, [state.isRecording, state.isTranscribing, pushToTalkKey, startRecording, stopRecording]);

  return {
    ...state,
    startRecording,
    stopRecording,
    cancelRecording,
    retry,
    clearError,
  };
}
