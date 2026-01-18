/**
 * IPC Handlers for Speech Recognition
 * Bridges between renderer (UI) and speech recognition services
 */

import { ipcMain, app } from 'electron';
import SpeechRecognitionService from '../services/speech-recognition';
import WakeWordDetector from '../services/wake-word-detector';
import { recordAudio } from './audio-recorder';

let speechService: SpeechRecognitionService | null = null;
let wakeWordDetector: WakeWordDetector | null = null;

/**
 * Initialize speech recognition services
 */
export async function initializeSpeechHandlers(): Promise<void> {
  try {
    // Initialize services
    speechService = new SpeechRecognitionService({
      sampleRate: 16000,
      silenceDuration: 800,
    });
    await speechService.initialize();

    wakeWordDetector = new WakeWordDetector({
      keywords: ['hi openwork', 'hey openwork', 'openwork'],
      confidence: 0.75,
    });
    await wakeWordDetector.initialize();

    // Setup event listeners
    setupSpeechServiceListeners();
    setupWakeWordListeners();

    console.log('[SpeechHandlers] Initialized successfully');
  } catch (error) {
    console.error('[SpeechHandlers] Initialization failed:', error);
    throw error;
  }
}

/**
 * Setup listeners for speech recognition service events
 */
function setupSpeechServiceListeners(): void {
  if (!speechService) return;

  speechService.on('listening-started', () => {
    console.log('[SpeechHandlers] Listening started event');
  });

  speechService.on('speech-detected', () => {
    console.log('[SpeechHandlers] Speech detected');
  });

  speechService.on('processing', () => {
    console.log('[SpeechHandlers] Processing audio');
  });

  speechService.on('transcription', (text: string) => {
    console.log('[SpeechHandlers] Transcription:', text);

    // Check for wake word
    if (wakeWordDetector) {
      const result = wakeWordDetector.detectWakeWord(text);
      if (result.detected) {
        // Emit to all renderer windows
        const { BrowserWindow } = require('electron');
        BrowserWindow.getAllWindows().forEach((win: any) => {
          win.webContents.send('speech:wake-word-detected', {
            keyword: result.keyword,
            confidence: result.confidence,
          });
        });
      }
    }
  });

  speechService.on('error', (error: string) => {
    console.error('[SpeechHandlers] Error:', error);
  });
}

/**
 * Setup listeners for wake word detector events
 */
function setupWakeWordListeners(): void {
  if (!wakeWordDetector) return;

  wakeWordDetector.on('wake-word-detected', (data: any) => {
    console.log('[WakeWordDetector] Event:', data);
    const { BrowserWindow } = require('electron');
    BrowserWindow.getAllWindows().forEach((win: any) => {
      win.webContents.send('speech:wake-word-activated', data);
    });
  });
}

/**
 * IPC Handler: Start listening for audio
 */
ipcMain.handle('speech:start-listening', async () => {
  if (!speechService) {
    throw new Error('Speech service not initialized');
  }

  try {
    await speechService.startListening();
    // Start recording audio from microphone
    recordAudio(speechService);
    return { success: true };
  } catch (error) {
    console.error('[SpeechHandlers] Error starting listening:', error);
    throw error;
  }
});

/**
 * IPC Handler: Stop listening and get transcription
 */
ipcMain.handle('speech:stop-listening', async () => {
  if (!speechService) {
    throw new Error('Speech service not initialized');
  }

  try {
    const text = await speechService.stopListening();
    return { success: true, text };
  } catch (error) {
    console.error('[SpeechHandlers] Error stopping listening:', error);
    throw error;
  }
});

/**
 * IPC Handler: Get listening status
 */
ipcMain.handle('speech:get-status', async () => {
  if (!speechService) {
    return { listening: false, ready: false };
  }

  return {
    listening: speechService.isCurrentlyListening(),
    ready: true,
  };
});

/**
 * IPC Handler: Enable/disable wake word detection
 */
ipcMain.handle('speech:set-wake-word-enabled', async (_, enabled: boolean) => {
  console.log('[SpeechHandlers] Wake word detection:', enabled ? 'enabled' : 'disabled');
  return { success: true, enabled };
});

/**
 * IPC Handler: Process transcription for wake word
 */
ipcMain.handle('speech:check-wake-word', async (_, text: string) => {
  if (!wakeWordDetector) {
    return { detected: false, keyword: null };
  }

  const result = wakeWordDetector.detectWakeWord(text);
  return result;
});

/**
 * Cleanup
 */
export function cleanupSpeechHandlers(): void {
  if (speechService) {
    speechService.destroy();
    speechService = null;
  }

  if (wakeWordDetector) {
    wakeWordDetector.destroy();
    wakeWordDetector = null;
  }
}
