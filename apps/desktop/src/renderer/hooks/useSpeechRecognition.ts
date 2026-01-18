/**
 * React Hook for Speech Recognition
 * Manages speech recognition state and interactions
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { getAccomplish } from '../lib/accomplish';

interface UseSpeechRecognitionOptions {
  autoStartAfterWakeWord?: boolean;
  onWakeWordDetected?: (keyword: string) => void;
  onTranscription?: (text: string) => void;
  onError?: (error: string) => void;
}

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastTranscription, setLastTranscription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const accomplish = getAccomplish();
  const ipcRenderer = window.require?.('electron')?.ipcRenderer;

  // Subscribe to IPC events
  useEffect(() => {
    if (!ipcRenderer) return;

    // Listen for wake word detected events
    const unsubscribeWakeWord = ipcRenderer.on(
      'speech:wake-word-detected',
      (event: any, data: any) => {
        console.log('[useSpeechRecognition] Wake word detected:', data);
        setWakeWordDetected(true);

        if (options.onWakeWordDetected) {
          options.onWakeWordDetected(data.keyword);
        }

        // Auto-start listening if enabled
        if (options.autoStartAfterWakeWord) {
          startListening();
        }
      }
    );

    const unsubscribeWakeWordActivated = ipcRenderer.on(
      'speech:wake-word-activated',
      (event: any, data: any) => {
        console.log('[useSpeechRecognition] Wake word activated:', data);
        setWakeWordDetected(true);

        if (options.onWakeWordDetected) {
          options.onWakeWordDetected(data.keyword);
        }

        if (options.autoStartAfterWakeWord) {
          startListening();
        }
      }
    );

    return () => {
      unsubscribeWakeWord?.();
      unsubscribeWakeWordActivated?.();
    };
  }, [ipcRenderer, options]);

  const startListening = useCallback(async () => {
    if (!ipcRenderer) {
      setError('IPC not available');
      return;
    }

    try {
      setError(null);
      setIsListening(true);
      setLastTranscription('');

      const result = await ipcRenderer.invoke('speech:start-listening');
      console.log('[useSpeechRecognition] Started listening:', result);

      accomplish.logEvent({
        level: 'info',
        message: 'Speech recognition started',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      setIsListening(false);

      accomplish.logEvent({
        level: 'error',
        message: 'Failed to start speech recognition',
        context: { error: errorMessage },
      });
    }
  }, [ipcRenderer, accomplish]);

  const stopListening = useCallback(async () => {
    if (!ipcRenderer) {
      setError('IPC not available');
      return;
    }

    try {
      setIsProcessing(true);
      const result = await ipcRenderer.invoke('speech:stop-listening');

      if (result.text) {
        setLastTranscription(result.text);

        if (options.onTranscription) {
          options.onTranscription(result.text);
        }

        accomplish.logEvent({
          level: 'info',
          message: 'Speech transcription completed',
          context: { text: result.text },
        });
      }

      setIsListening(false);
      setWakeWordDetected(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);

      if (options.onError) {
        options.onError(errorMessage);
      }

      accomplish.logEvent({
        level: 'error',
        message: 'Speech transcription failed',
        context: { error: errorMessage },
      });
    } finally {
      setIsProcessing(false);
    }
  }, [ipcRenderer, options, accomplish]);

  const toggleListening = useCallback(async () => {
    if (isListening) {
      await stopListening();
    } else {
      await startListening();
    }
  }, [isListening, startListening, stopListening]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearTranscription = useCallback(() => {
    setLastTranscription('');
  }, []);

  return {
    // States
    isListening,
    isProcessing,
    lastTranscription,
    error,
    wakeWordDetected,

    // Methods
    startListening,
    stopListening,
    toggleListening,
    clearError,
    clearTranscription,
  };
}

export default useSpeechRecognition;
