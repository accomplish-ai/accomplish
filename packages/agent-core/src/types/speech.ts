/**
 * Public API interface for SpeechService
 * Handles speech-to-text transcription using external services.
 */

import type { SecureStorageAPI } from './storage.js';

/** Result of a successful transcription */
export interface TranscriptionResult {
  /** Transcribed text */
  text: string;
  /** Confidence score (0-1) if available */
  confidence?: number;
  /** Duration of the audio in seconds */
  duration: number;
  /** Timestamp when transcription completed */
  timestamp: number;
}

/** Error from a failed transcription */
export interface TranscriptionError {
  /** Error code */
  code: string;
  /** Human-readable error message */
  message: string;
}

/** Options for creating a SpeechService instance */
export interface SpeechServiceOptions {
  /** Secure storage instance for API key retrieval */
  storage: SecureStorageAPI;
}

/** Public API for speech service operations */
export interface SpeechServiceAPI {
  /**
   * Get the configured ElevenLabs API key
   * @returns API key or null if not configured
   */
  getElevenLabsApiKey(): string | null;

  /**
   * Check if ElevenLabs is configured with an API key
   */
  isElevenLabsConfigured(): boolean;

  /**
   * Validate an ElevenLabs API key
   * @param apiKey - Optional API key to validate (uses stored key if not provided)
   * @returns Validation result
   */
  validateElevenLabsApiKey(apiKey?: string): Promise<{
    valid: boolean;
    error?: string;
  }>;

  /**
   * Transcribe audio data to text
   * @param audioData - Audio data buffer
   * @param mimeType - Optional MIME type of the audio (defaults to audio/webm)
   * @returns Transcription result or error
   */
  transcribeAudio(
    audioData: Buffer,
    mimeType?: string,
  ): Promise<
    { success: true; result: TranscriptionResult } | { success: false; error: TranscriptionError }
  >;
}
