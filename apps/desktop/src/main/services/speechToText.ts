/**
 * Speech-to-Text service wrapper for Electron desktop app.
 *
 * Delegates to the agent-core SpeechService but reads the ElevenLabs API key
 * through the shared secureStorage singleton so keys saved via settings are
 * visible here without a separate storage instance.
 *
 * Audio recording happens in the renderer process (uses browser APIs),
 * then audio data is sent to main process via IPC for transcription.
 */

import { getApiKey } from '../store/secureStorage';
import {
  createSpeechService,
  type SpeechServiceAPI,
  type SecureStorageAPI,
  type TranscriptionResult,
  type TranscriptionError,
} from '@accomplish_ai/agent-core';

export type { TranscriptionResult, TranscriptionError } from '@accomplish_ai/agent-core';

let _speechService: SpeechServiceAPI | null = null;

function getSpeechService(): SpeechServiceAPI {
  if (!_speechService) {
    // Minimal adapter — SpeechService only calls getApiKey() on this object.
    const storage = {
      getApiKey: (provider: string) => getApiKey(provider),
    } as unknown as SecureStorageAPI;
    _speechService = createSpeechService({ storage });
  }
  return _speechService;
}

/**
 * Validate ElevenLabs API key by making a test request
 */
export async function validateElevenLabsApiKey(
  apiKey?: string,
): Promise<{ valid: boolean; error?: string }> {
  return getSpeechService().validateElevenLabsApiKey(apiKey);
}

/**
 * Transcribe audio using ElevenLabs Speech-to-Text API
 *
 * @param audioData - Audio data as Buffer (from renderer via IPC)
 * @param mimeType - MIME type of the audio (e.g., 'audio/webm')
 * @returns Transcription result or error
 */
export async function transcribeAudio(
  audioData: Buffer,
  mimeType: string = 'audio/webm',
): Promise<
  { success: true; result: TranscriptionResult } | { success: false; error: TranscriptionError }
> {
  return getSpeechService().transcribeAudio(audioData, mimeType);
}
