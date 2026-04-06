/**
 * Speech Transcription
 *
 * Core transcription logic for the SpeechService using the ElevenLabs STT API.
 * Extracted to keep SpeechService under the 200-line limit.
 */

import { fetchWithTimeout } from '../../utils/fetch.js';
import { createConsoleLogger } from '../../utils/logging.js';

const log = createConsoleLogger({ prefix: 'SpeechService' });

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

function parseElevenLabsErrorMessage(
  errorData: Record<string, unknown>,
  errorText: string,
  statusText: string,
): string {
  const detail = (errorData as { detail?: unknown })?.detail;

  if (typeof detail === 'string') {
    return detail;
  }

  if (detail && typeof detail === 'object') {
    const detailObj = detail as Record<string, unknown>;
    const detailMessage = detailObj.message ?? detailObj.status;
    if (typeof detailMessage === 'string') {
      return detailMessage;
    }
    if (detailMessage !== undefined) {
      return JSON.stringify(detailMessage);
    }
    return JSON.stringify(detail);
  }

  if ((errorData as { error?: { message?: unknown } })?.error?.message) {
    const nestedMessage = (errorData as { error: { message: unknown } }).error.message;
    return typeof nestedMessage === 'string' ? nestedMessage : JSON.stringify(nestedMessage);
  }

  if ((errorData as { message?: unknown })?.message) {
    const rootMessage = (errorData as { message: unknown }).message;
    return typeof rootMessage === 'string' ? rootMessage : JSON.stringify(rootMessage);
  }

  if (errorText) {
    return errorText.substring(0, 200);
  }

  return statusText || 'Unknown API error';
}

/**
 * Transcribe audio using ElevenLabs Speech-to-Text API.
 *
 * @param apiKey - ElevenLabs API key
 * @param audioData - Audio data as Buffer
 * @param mimeType - MIME type of the audio (e.g., 'audio/webm')
 * @returns Transcription result or error
 */
export async function transcribeWithElevenLabs(
  apiKey: string,
  audioData: Buffer,
  mimeType: string,
): Promise<
  { success: true; result: TranscriptionResult } | { success: false; error: TranscriptionError }
> {
  const modelId = process.env.ELEVENLABS_STT_MODEL_ID?.trim() || DEFAULT_ELEVENLABS_STT_MODEL_ID;
  const startTime = Date.now();

  log.info('[ElevenLabs] Starting transcription:', {
    audioSize: audioData.length,
    mimeType,
    modelId,
  });

  const uint8Array = new Uint8Array(audioData);
  const blob = new Blob([uint8Array], { type: mimeType });

  log.info('[ElevenLabs] Created blob:', { blobSize: blob.size, blobType: blob.type });
  const formData = new FormData();
  formData.append('file', blob, 'audio.webm');
  formData.append('model_id', modelId);

  const response = await fetchWithTimeout(
    'https://api.elevenlabs.io/v1/speech-to-text',
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
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

    const errorMessage = parseElevenLabsErrorMessage(errorData, errorText, response.statusText);
    return {
      success: false,
      error: { code: 'TRANSCRIPTION_FAILED', message: `Transcription failed: ${errorMessage}` },
    };
  }

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
}

/**
 * Validate an ElevenLabs API key by making a test request.
 */
export async function validateElevenLabsKey(
  key: string,
): Promise<{ valid: boolean; error?: string }> {
  const response = await fetchWithTimeout(
    'https://api.elevenlabs.io/v1/models',
    { method: 'GET', headers: { 'xi-api-key': key.trim() } },
    ELEVENLABS_API_TIMEOUT_MS,
  );

  if (response.ok) {
    return { valid: true };
  }

  if (response.status === 401 || response.status === 403) {
    return { valid: false, error: 'Invalid API key. Please check your ElevenLabs API key.' };
  }

  const errorData = await response.json().catch(() => ({}));
  const errorMessage =
    (errorData as { error?: { message?: string } })?.error?.message ||
    `API returned status ${response.status}`;
  return { valid: false, error: `API error: ${errorMessage}` };
}
