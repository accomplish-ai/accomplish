/**
 * Speech-to-Text service wrapper for Electron desktop app.
 *
 * Delegates to the agent-core SpeechService but reads the ElevenLabs API key
 * through the shared secureStorage singleton so keys saved via settings are
 * visible here without a separate storage instance.
 *
 * Audio recording happens in the renderer process (uses browser APIs),
 * then audio data is sent to main process via IPC for transcription.
 *
 * Milestone 3 of the daemon-only-SQLite migration changed this module's
 * shape. Pre-M3 the module held a singleton `SpeechService` built with an
 * adapter that read from a local `SecureStorageAPI`. Post-M3 the key lives
 * in the daemon, and `getApiKey` is async. `SpeechService` expects a
 * synchronous `SecureStorageAPI.getApiKey(provider): string | null`, so
 * instead of caching we pre-fetch the key via RPC at the start of each
 * call and build a one-shot `SpeechService` around a frozen value. That
 * keeps the service API untouched in agent-core (no signature changes
 * rippling through the public surface) and sidesteps cache-staleness: if
 * the user rotates the key mid-session, the next speech invocation reads
 * the new value from the daemon.
 */

import { getApiKey } from '../store/secureStorage';
import {
  createSpeechService,
  type SpeechServiceAPI,
  type SecureStorageAPI,
  type TranscriptionResult,
  type TranscriptionError,
} from '@accomplish_ai/agent-core/desktop-main';

export type {
  TranscriptionResult,
  TranscriptionError,
} from '@accomplish_ai/agent-core/desktop-main';

/**
 * Build a one-shot `SpeechService` pre-seeded with the ElevenLabs API key
 * fetched from the daemon. Any `provider` other than `'elevenlabs'` returns
 * `null` — the service only ever asks for that one.
 */
async function buildServiceFromDaemon(): Promise<SpeechServiceAPI> {
  const elevenlabsKey = await getApiKey('elevenlabs');
  const fakeStorage = {
    getApiKey: (provider: string): string | null =>
      provider === 'elevenlabs' ? elevenlabsKey : null,
  } as unknown as SecureStorageAPI;
  return createSpeechService({ storage: fakeStorage });
}

/**
 * Build a `SpeechService` with a no-storage adapter. Every `getApiKey`
 * lookup returns `null`. Used when the caller supplies an explicit
 * `apiKey` override — the service's `validateElevenLabsApiKey(apiKey)`
 * never asks storage in that case, so making the RPC call would be
 * wasted work AND would fail in degraded startup / mock-daemon modes.
 */
function buildServiceWithoutStorage(): SpeechServiceAPI {
  const nullStorage = {
    getApiKey: (): string | null => null,
  } as unknown as SecureStorageAPI;
  return createSpeechService({ storage: nullStorage });
}

/**
 * Validate ElevenLabs API key by making a test request.
 *
 * The `apiKey` override path — used by the settings "test this key before
 * saving" flow — bypasses the daemon entirely: `SpeechService.validate`
 * uses the explicit param and never touches the adapter's `getApiKey`.
 * Pre-fetching would be both wasted work and a spurious failure in degraded
 * startup / `E2E_MOCK_TASK_EVENTS` paths.
 */
export async function validateElevenLabsApiKey(
  apiKey?: string,
): Promise<{ valid: boolean; error?: string }> {
  if (apiKey) {
    return buildServiceWithoutStorage().validateElevenLabsApiKey(apiKey);
  }
  const service = await buildServiceFromDaemon();
  return service.validateElevenLabsApiKey();
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
  const service = await buildServiceFromDaemon();
  return service.transcribeAudio(audioData, mimeType);
}
