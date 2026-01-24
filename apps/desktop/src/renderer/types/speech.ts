/**
 * Shared speech-to-text types for renderer process
 * Duplicated from main process to avoid importing Node.js modules
 */

export interface SpeechRecognitionResult {
  text: string;
  confidence?: number;
  duration: number; // milliseconds
  timestamp: number;
}

export class SpeechRecognitionError extends Error {
  constructor(
    public code: string,
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'SpeechRecognitionError';
  }
}
