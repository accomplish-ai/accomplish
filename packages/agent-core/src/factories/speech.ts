import { SpeechService } from '../internal/classes/SpeechService.js';
import type {
  SpeechServiceAPI,
  SpeechServiceOptions,
} from '../types/speech.js';

export function createSpeechService(options: SpeechServiceOptions): SpeechServiceAPI {
  return new SpeechService(options.storage as any);
}
