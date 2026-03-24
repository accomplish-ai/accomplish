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

const ELEVENLABS_API_TIMEOUT_MS = 30000;
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

    try {
      const response = await fetchWithTimeout(
        'https://api.elevenlabs.io/v1/models',
        {
          method: 'GET',
          headers: {
            'xi-api-key': key.trim(),
          },
        },
        ELEVENLABS_API_TIMEOUT_MS,
      );

      if (response.ok) {
        return { valid: true };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          valid: false,
          error: 'Invalid API key. Please check your ElevenLabs API key.',
        };
      }

      const errorData = await response.json().catch(() => ({}));
      const errorMessage =
        (errorData as { error?: { message?: string } })?.error?.message ||
        `API returned status ${response.status}`;
      return { valid: false, error: `API error: ${errorMessage}` };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          valid: false,
          error: 'Request timed out. Please check your internet connection.',
        };
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { valid: false, error: `Network error: ${message}` };
    }
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

    console.log('[ElevenLabs] Starting transcription:', {
      audioSize: audioData.length,
      mimeType,
      modelId,
    });

    try {
      // Create a Blob from the Buffer for FormData
      // Use Uint8Array to ensure proper typing for Blob constructor
      const uint8Array = new Uint8Array(audioData);
      const blob = new Blob([uint8Array], { type: mimeType });

      console.log('[ElevenLabs] Created blob:', {
        blobSize: blob.size,
        blobType: blob.type,
      });

      // Create FormData for multipart upload
      const formData = new FormData();
      formData.append('file', blob, 'audio.webm');
      formData.append('model_id', modelId);

      const response = await fetchWithTimeout(
        'https://api.elevenlabs.io/v1/speech-to-text',
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
          },
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

        console.error('[ElevenLabs] API error:', {
          status: response.status,
          statusText: response.statusText,
          errorData: JSON.stringify(errorData, null, 2),
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

        // ElevenLabs can return errors in different formats
        // detail can be: string, { message: string }, or other object structures
        const detail = (errorData as { detail?: unknown })?.detail;
        let errorMessage: string;

        if (typeof detail === 'string') {
          errorMessage = detail;
        } else if (detail && typeof detail === 'object') {
          // detail could be { message: string } or { status: string, message: string } etc.
          const detailObj = detail as Record<string, unknown>;
          const detailMessage = detailObj.message ?? detailObj.status;
          if (typeof detailMessage === 'string') {
            errorMessage = detailMessage;
          } else if (detailMessage !== undefined) {
            errorMessage = JSON.stringify(detailMessage);
          } else {
            errorMessage = JSON.stringify(detail);
          }
        } else if ((errorData as { error?: { message?: unknown } })?.error?.message) {
          const nestedMessage = (errorData as { error: { message: unknown } }).error.message;
          errorMessage =
            typeof nestedMessage === 'string' ? nestedMessage : JSON.stringify(nestedMessage);
        } else if ((errorData as { message?: unknown })?.message) {
          const rootMessage = (errorData as { message: unknown }).message;
          errorMessage =
            typeof rootMessage === 'string' ? rootMessage : JSON.stringify(rootMessage);
        } else if (errorText) {
          errorMessage = errorText.substring(0, 200);
        } else {
          errorMessage = response.statusText || 'Unknown API error';
        }

        return {
          success: false,
          error: {
            code: 'TRANSCRIPTION_FAILED',
            message: `Transcription failed: ${errorMessage}`,
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
          error: {
            code: 'EMPTY_RESULT',
            message: 'No speech was recognized. Please try again.',
          },
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
          error: {
            code: 'TIMEOUT',
            message: 'Transcription request timed out. Please try again.',
          },
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

/**
 * Create a new SpeechService instance
 */
export function createSpeechService(storage: SecureStorage): SpeechService {
  return new SpeechService(storage);
}
