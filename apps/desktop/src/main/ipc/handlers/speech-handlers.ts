import type { IpcMainInvokeEvent } from 'electron';
import { getApiKey } from '../../store/secureStorage';
import {
  validateElevenLabsApiKey,
  transcribeAudio,
  isElevenLabsConfigured,
} from '../../services/speechToText';
import { getLogCollector } from '../../logging';
import { handle } from './utils';

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25 MB

export function registerSpeechHandlers(): void {
  handle('speech:is-configured', async (_event: IpcMainInvokeEvent) => {
    return isElevenLabsConfigured();
  });

  handle('speech:get-config', async (_event: IpcMainInvokeEvent) => {
    const apiKey = getApiKey('elevenlabs');
    return {
      enabled: Boolean(apiKey && apiKey.trim()),
      hasApiKey: Boolean(apiKey),
      apiKeyPrefix: apiKey ? apiKey.substring(0, 8) + '...' : undefined,
    };
  });

  handle('speech:validate', async (_event: IpcMainInvokeEvent, apiKey?: string) => {
    return validateElevenLabsApiKey(apiKey);
  });

  handle(
    'speech:transcribe',
    async (_event: IpcMainInvokeEvent, audioData: ArrayBuffer, mimeType?: string) => {
      const logger = getLogCollector();
      logger.logEnv('INFO', '[IPC] speech:transcribe received', {
        audioDataType: typeof audioData,
        audioDataByteLength: audioData?.byteLength,
        mimeType,
      });
      if (audioData?.byteLength > MAX_AUDIO_SIZE) {
        throw new Error(
          `Audio payload exceeds maximum allowed size of ${MAX_AUDIO_SIZE / 1024 / 1024} MB`,
        );
      }
      const buffer = Buffer.from(audioData);
      logger.logEnv('INFO', '[IPC] Converted to buffer', { bufferLength: buffer.length });
      return transcribeAudio(buffer, mimeType);
    },
  );
}
