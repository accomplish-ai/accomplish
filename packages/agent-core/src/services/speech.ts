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

import { fetchWithTimeout } from '../utils/fetch.js';
import type { SecureStorage } from '../storage/secure-storage.js';
import { createConsoleLogger } from '../utils/logging.js';
import {
  validateElevenLabsApiKey,
  parseElevenLabsErrorMessage,
  ELEVENLABS_API_TIMEOUT_MS,
} from './speech-validation.js';

const log = createConsoleLogger({ prefix: 'Speech' });

const DEFAULT_ELEVENLABS_STT_MODEL_ID = 'scribe_v2';

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  duration: number;
  timestamp: number;
}

export interface TranscriptionError {
  code: string;
  message: string;
}

/**
 * Speech service that uses ElevenLabs API for transcription.
 * Requires a SecureStorage instance for API key management.
 */
export class SpeechService {
  private storage: SecureStorage;

  constructor(storage: SecureStorage) {
    this.storage = storage;
  }

  getElevenLabsApiKey(): string | null {
    const key = this.storage.getApiKey('elevenlabs');
    return key && key.trim() ? key : null;
  }

  isElevenLabsConfigured(): boolean {
    return this.getElevenLabsApiKey() !== null;
  }

  async validateElevenLabsApiKey(apiKey?: string): Promise<{ valid: boolean; error?: string }> {
    return validateElevenLabsApiKey(apiKey ?? this.getElevenLabsApiKey());
  }

  /**
   * Transcribe audio using ElevenLabs Speech-to-Text API
   */
  async transcribeAudio(
    audioData: Buffer,
    mimeType: string = 'audio/webm',
  ): Promise<
    { success: true; result: TranscriptionResult } | { success: false; error: TranscriptionError }
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

    const startTime = Date.now();

    log.info('[ElevenLabs] Starting transcription:', {
      audioSize: audioData.length,
      mimeType,
      modelId,
    });

    try {
      const uint8Array = new Uint8Array(audioData);
      const blob = new Blob([uint8Array], { type: mimeType });

      log.info('[ElevenLabs] Created blob:', { blobSize: blob.size, blobType: blob.type });

      const formData = new FormData();
      formData.append('file', blob, 'audio.webm');
      formData.append('model_id', modelId);

      const normalizedApiKey = apiKey.trim();
      const response = await fetchWithTimeout(
        'https://api.elevenlabs.io/v1/speech-to-text',
        {
          method: 'POST',
          headers: { 'xi-api-key': normalizedApiKey },
          body: formData,
        },
        ELEVENLABS_API_TIMEOUT_MS,
      );

      const duration = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        let errorData: Record<string, unknown> = {};
        try {
          errorData = JSON.parse(errorText);
        } catch {
          // Not JSON, use raw text
        }

        log.error('[ElevenLabs] API error:', {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText.substring(0, 500),
        });

        if (response.status === 401 || response.status === 403) {
          return {
            success: false,
            error: {
              code: 'INVALID_API_KEY',
              message: 'Invalid or expired ElevenLabs API key. Please check your settings.',
            },
          };
        }

        if (response.status === 429) {
          return {
            success: false,
            error: {
              code: 'RATE_LIMIT',
              message: 'Rate limit exceeded. Please wait a moment and try again.',
            },
          };
        }

        return {
          success: false,
          error: {
            code: 'TRANSCRIPTION_FAILED',
            message: `Transcription failed: ${parseElevenLabsErrorMessage(errorData, errorText, response.statusText)}`,
          },
        };
      }

      const result = (await response.json()) as {
        text?: string;
        confidence?: number;
      };

      if (!result.text) {
        return {
          success: false,
          error: { code: 'EMPTY_RESULT', message: 'No speech was recognized. Please try again.' },
        };
      }

      return {
        success: true,
        result: {
          text: result.text.trim(),
          confidence: result.confidence,
          duration,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: { code: 'TIMEOUT', message: 'Transcription request timed out. Please try again.' },
        };
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: `Network error during transcription: ${message}`,
        },
      };
    }
  }
}

export function createSpeechService(storage: SecureStorage): SpeechService {
  return new SpeechService(storage);
}
