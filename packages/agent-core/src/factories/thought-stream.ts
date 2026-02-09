import { ThoughtStreamHandler } from '../internal/classes/ThoughtStreamHandler.js';
import type {
  ThoughtStreamAPI,
  ThoughtStreamOptions,
} from '../types/thought-stream.js';

export function createThoughtStreamHandler(
  _options?: ThoughtStreamOptions
): ThoughtStreamAPI {
  return new ThoughtStreamHandler();
}
