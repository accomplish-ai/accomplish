/**
 * Shared types for speech input hooks
 */

/**
 * Speech recognition error
 */
export class SpeechRecognitionError extends Error {
  constructor(
    public code: string,
    message: string,
    public originalError?: Error,
  ) {
    super(message);
    this.name = 'SpeechRecognitionError';
  }
}

export interface UseSpeechInputOptions {
  /**
   * Callback when transcription is complete
   */
  onTranscriptionComplete?: (text: string) => void;

  /**
   * Callback when recording state changes
   */
  onRecordingStateChange?: (isRecording: boolean) => void;

  /**
   * Callback when error occurs
   */
  onError?: (error: SpeechRecognitionError) => void;

  /**
   * Maximum recording duration in milliseconds (default 120000 = 2 minutes)
   */
  maxDuration?: number;
}

export interface UseSpeechInputState {
  /**
   * Is currently recording
   */
  isRecording: boolean;

  /**
   * Is currently transcribing
   */
  isTranscribing: boolean;

  /**
   * Current recording duration in milliseconds
   */
  recordingDuration: number;

  /**
   * Last error that occurred
   */
  error: SpeechRecognitionError | null;

  /**
   * Last transcribed text
   */
  lastTranscription: string | null;

  /**
   * Whether speech input is configured and available
   */
  isConfigured: boolean;
}
