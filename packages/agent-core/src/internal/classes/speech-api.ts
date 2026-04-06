/**
 * ElevenLabs Speech API helpers
 *
 * Handles HTTP interactions with the ElevenLabs Speech-to-Text and validation
 * APIs, including error parsing and response normalization.
 */

import { fetchWithTimeout } from '../../utils/fetch.js';
import { createConsoleLogger } from '../../utils/logging.js';

const log = createConsoleLogger({ prefix: 'SpeechAPI' });

export const ELEVENLABS_API_TIMEOUT_MS = 30000;
export const DEFAULT_ELEVENLABS_STT_MODEL_ID = 'scribe_v2';

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
 * Validate an ElevenLabs API key by calling the models endpoint.
 */
export async function validateElevenLabsApiKey(
  key: string,
): Promise<{ valid: boolean; error?: string }> {
  if (!key || !key.trim()) {
    return { valid: false, error: 'API key is required' };
  }

  try {
    const response = await fetchWithTimeout(
      'https://api.elevenlabs.io/v1/models',
      {
        method: 'GET',
        headers: { 'xi-api-key': key.trim() },
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

function parseDetailField(detail: unknown): string {
  if (typeof detail === 'string') {
    return detail;
  }
  if (detail && typeof detail === 'object') {
    const detailObj = detail as Record<string, unknown>;
    const msg = detailObj.message ?? detailObj.status;
    if (typeof msg === 'string') {
      return msg;
    }
    if (msg !== undefined) {
      return JSON.stringify(msg);
    }
    return JSON.stringify(detail);
  }
  return '';
}

function parseErrorMessage(
  errorData: Record<string, unknown>,
  errorText: string,
  statusText: string,
): string {
  const detail = (errorData as { detail?: unknown })?.detail;
  if (detail !== undefined) {
    const msg = parseDetailField(detail);
    if (msg) return msg;
  }
  const nestedMsg = (errorData as { error?: { message?: unknown } })?.error?.message;
  if (nestedMsg !== undefined) {
    return typeof nestedMsg === 'string' ? nestedMsg : JSON.stringify(nestedMsg);
  }
  const rootMsg = (errorData as { message?: unknown })?.message;
  if (rootMsg !== undefined) {
    return typeof rootMsg === 'string' ? rootMsg : JSON.stringify(rootMsg);
  }
  return errorText ? errorText.substring(0, 200) : statusText || 'Unknown API error';
}

async function handleTranscribeErrorResponse(
  response: Response,
): Promise<{ success: false; error: TranscriptionError }> {
  const errorText = await response.text().catch(() => '');
  let errorData: Record<string, unknown> = {};
  try {
    errorData = JSON.parse(errorText);
  } catch {
    // Not JSON
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
  const msg = parseErrorMessage(errorData, errorText, response.statusText);
  return {
    success: false,
    error: { code: 'TRANSCRIPTION_FAILED', message: `Transcription failed: ${msg}` },
  };
}

/**
 * Call ElevenLabs Speech-to-Text API.
 */
export async function callElevenLabsTranscribe(
  apiKey: string,
  audioData: Buffer,
  mimeType: string,
  modelId: string,
): Promise<
  { success: true; result: TranscriptionResult } | { success: false; error: TranscriptionError }
> {
  const startTime = Date.now();
  log.info('[ElevenLabs] Starting transcription:', {
    audioSize: audioData.length,
    mimeType,
    modelId,
  });

  try {
    const blob = new Blob([new Uint8Array(audioData)], { type: mimeType });
    log.info('[ElevenLabs] Created blob:', { blobSize: blob.size, blobType: blob.type });

    const formData = new FormData();
    formData.append('file', blob, 'audio.webm');
    formData.append('model_id', modelId);

    const response = await fetchWithTimeout(
      'https://api.elevenlabs.io/v1/speech-to-text',
      { method: 'POST', headers: { 'xi-api-key': apiKey }, body: formData },
      ELEVENLABS_API_TIMEOUT_MS,
    );

    if (!response.ok) {
      return handleTranscribeErrorResponse(response);
    }

    const duration = Date.now() - startTime;
    const result = (await response.json()) as { text?: string; confidence?: number };

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
      error: { code: 'NETWORK_ERROR', message: `Network error during transcription: ${message}` },
    };
  }
}
