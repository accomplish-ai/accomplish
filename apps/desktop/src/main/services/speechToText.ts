/**
 * Speech-to-Text service wrapper for Electron desktop app.
 *
 * This module provides a thin wrapper around the core SpeechService,
 * initializing it with the desktop app's secure storage.
 *
 * Audio recording happens in the renderer process (uses browser APIs),
 * then audio data is sent to main process via IPC for transcription.
 */

import { app } from 'electron';
import {
  SpeechService,
  createSpeechService,
  createSecureStorage,
  type TranscriptionResult,
  type TranscriptionError,
} from '@accomplish/agent-core';

// Re-export types from core
export type { TranscriptionResult, TranscriptionError };

const getFileName = () =>
  app.isPackaged ? 'secure-storage.json' : 'secure-storage-dev.json';

let _speechService: SpeechService | null = null;

function getSpeechService(): SpeechService {
  if (!_speechService) {
    const storage = createSecureStorage({
      storagePath: app.getPath('userData'),
      appId: 'ai.accomplish.desktop',
      fileName: getFileName(),
    });
    _speechService = createSpeechService(storage);
  }
  return _speechService;
}

/**
 * Get the configured ElevenLabs API key
 */
export function getElevenLabsApiKey(): string | null {
  return getSpeechService().getElevenLabsApiKey();
}

/**
 * Check if ElevenLabs is configured
 */
export function isElevenLabsConfigured(): boolean {
  return getSpeechService().isElevenLabsConfigured();
}

/**
 * Validate ElevenLabs API key by making a test request
 */
export async function validateElevenLabsApiKey(
  apiKey?: string
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
  mimeType: string = 'audio/webm'
): Promise<
  | { success: true; result: TranscriptionResult }
  | { success: false; error: TranscriptionError }
> {
  return getSpeechService().transcribeAudio(audioData, mimeType);
}
