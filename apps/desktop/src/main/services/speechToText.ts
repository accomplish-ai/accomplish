/**
 * Speech-to-Text service using ElevenLabs Speech-to-Speech API
 *
 * Features:
 * - Records audio from system microphone
 * - Converts audio to text using ElevenLabs STT API
 * - Supports cancellation and retry mechanisms
 * - Validates API configuration
 */

import { getApiKey } from '../store/secureStorage';

export interface SpeechRecognitionConfig {
  apiKey: string;
  maxDuration?: number; // milliseconds, default 120000 (2 minutes)
  language?: string; // default 'en'
}

export interface SpeechRecognitionResult {
  text: string;
  confidence?: number;
  duration: number; // milliseconds
  timestamp: number;
}

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
 * Speech-to-Text service
 * Uses native Web Audio API for recording and ElevenLabs for transcription
 */
export class SpeechToTextService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isRecording = false;
  private recordingStartTime = 0;
  private recordingTimeoutId: NodeJS.Timeout | null = null;
  private stream: MediaStream | null = null;

  /**
   * Start recording audio from microphone
   */
  async startRecording(config?: { maxDuration?: number }): Promise<void> {
    if (this.isRecording) {
      throw new SpeechRecognitionError('ALREADY_RECORDING', 'Recording is already in progress');
    }

    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Create MediaRecorder
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.audioChunks = [];
      this.isRecording = true;
      this.recordingStartTime = Date.now();

      // Collect audio data
      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      // Handle recording errors
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

      // Set max duration timeout
      const maxDuration = config?.maxDuration ?? 120000; // Default 2 minutes
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

  /**
   * Stop recording and return audio blob
   */
  async stopRecording(): Promise<Blob> {
    if (!this.mediaRecorder || !this.isRecording) {
      throw new SpeechRecognitionError('NOT_RECORDING', 'No recording in progress');
    }

    // Clear timeout
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

  /**
   * Cancel recording without saving
   */
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

  /**
   * Check if currently recording
   */
  getIsRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Get current recording duration in milliseconds
   */
  getRecordingDuration(): number {
    if (!this.isRecording) return 0;
    return Date.now() - this.recordingStartTime;
  }

  /**
   * Transcribe audio using ElevenLabs Speech-to-Speech API
   */
  async transcribeAudio(audioBlob: Blob, apiKey: string): Promise<SpeechRecognitionResult> {
    if (!apiKey || apiKey.trim() === '') {
      throw new SpeechRecognitionError(
        'MISSING_API_KEY',
        'ElevenLabs API key is not configured. Please add it in settings.'
      );
    }

    const startTime = Date.now();

    try {
      // Create FormData for multipart upload
      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.webm');

      // Call ElevenLabs STT API
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

  /**
   * Record and transcribe audio in one call
   */
  async recordAndTranscribe(config: SpeechRecognitionConfig): Promise<SpeechRecognitionResult> {
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

  /**
   * Clean up resources
   */
  private cleanup(): void {
    // Stop all audio tracks
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this.audioChunks = [];
    this.mediaRecorder = null;
  }

  /**
   * Dispose service (cleanup resources)
   */
  dispose(): void {
    this.cancelRecording();
  }
}

/**
 * Get the configured ElevenLabs API key
 */
export function getElevenLabsApiKey(): string | null {
  const key = getApiKey('elevenlabs');
  return key && key.trim() ? key : null;
}

/**
 * Validate if API key is properly configured
 */
export function isElevenLabsConfigured(): boolean {
  return getElevenLabsApiKey() !== null;
}
