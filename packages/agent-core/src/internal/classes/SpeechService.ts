/**
 * Speech-to-Text service using ElevenLabs API
 *
 * This service handles:
 * - API key validation
 * - Audio transcription via ElevenLabs STT API
 *
 * The service requires a SecureStorage instance to be provided,
 * allowing it to be used in different environments (Electron, CLI, etc.)
 */

import type { SecureStorage } from './SecureStorage.js';
import {
  validateElevenLabsApiKey,
  callElevenLabsTranscribe,
  DEFAULT_ELEVENLABS_STT_MODEL_ID,
} from './speech-api.js';

export type { TranscriptionResult, TranscriptionError } from './speech-api.js';

/**
 * Speech service that uses ElevenLabs API for transcription.
 * Requires a SecureStorage instance for API key management.
 */
export class SpeechService {
  private storage: SecureStorage;

  constructor(storage: SecureStorage) {
    this.storage = storage;
  }

  /**
   * Get the configured ElevenLabs API key
   */
  getElevenLabsApiKey(): string | null {
    const key = this.storage.getApiKey('elevenlabs');
    return key && key.trim() ? key : null;
  }

  /**
   * Check if ElevenLabs is configured
   */
  isElevenLabsConfigured(): boolean {
    return this.getElevenLabsApiKey() !== null;
  }

  /**
   * Validate ElevenLabs API key by making a test request
   */
  async validateElevenLabsApiKey(apiKey?: string): Promise<{ valid: boolean; error?: string }> {
    const key = apiKey || this.getElevenLabsApiKey();
    if (!key || !key.trim()) {
      return { valid: false, error: 'API key is required' };
    }
    return validateElevenLabsApiKey(key);
  }

  /**
   * Transcribe audio using ElevenLabs Speech-to-Text API
   *
   * @param audioData - Audio data as Buffer (from renderer via IPC)
   * @param mimeType - MIME type of the audio (e.g., 'audio/webm')
   * @returns Transcription result or error
   */
  async transcribeAudio(
    audioData: Buffer,
    mimeType: string = 'audio/webm',
  ): Promise<
    | { success: true; result: import('./speech-api.js').TranscriptionResult }
    | { success: false; error: import('./speech-api.js').TranscriptionError }
  > {
    const apiKey = this.getElevenLabsApiKey();
    const modelId = process.env.ELEVENLABS_STT_MODEL_ID?.trim() || DEFAULT_ELEVENLABS_STT_MODEL_ID;

    if (!apiKey) {
      return {
        success: false,
        error: {
          code: 'MISSING_API_KEY',
          message: 'ElevenLabs API key is not configured. Please add it in settings.',
        },
      };
    }

    return callElevenLabsTranscribe(apiKey, audioData, mimeType, modelId);
  }
}

/**
 * Create a new SpeechService instance
 */
export function createSpeechService(storage: SecureStorage): SpeechService {
  return new SpeechService(storage);
}
