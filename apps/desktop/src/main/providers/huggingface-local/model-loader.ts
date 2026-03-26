/**
 * Model loader for the HuggingFace Local inference server.
 * Handles loading/unloading Transformers.js models into shared state.
 */

import { app } from 'electron';
import path from 'path';
import { getLogCollector } from '../../logging';
import { state, loadModelPromise, setLoadModelPromise, type ChatMessage } from './server-state';

/**
 * Load a model into memory using Transformers.js.
 */
export async function loadModel(modelId: string): Promise<void> {
  if (state.loadedModelId === modelId && state.tokenizer && state.model) {
    getLogCollector().logEnv('INFO', '[HF Server] Model ${modelId} already loaded');
    return;
  }

  // Prevent concurrent loads — queue onto existing promise
  if (loadModelPromise) {
    await loadModelPromise;
    if (state.loadedModelId === modelId && state.tokenizer && state.model) {
      return;
    }
  }

  const promise = (async () => {
    state.isLoading = true;
    // Capture stop flag at start so we can detect a concurrent stopServer() call
    const stoppedAtStart = state.isStopping;
    getLogCollector().logEnv('INFO', '[HF Server] Loading model: ${modelId}');

    try {
      const { env, AutoTokenizer, AutoModelForCausalLM } =
        await import('@huggingface/transformers');

      const cacheDir = path.join(app.getPath('userData'), 'hf-models');
      env.cacheDir = cacheDir;
      env.allowLocalModels = true;

      // Stage new model and tokenizer
      const tokenizer = await AutoTokenizer.from_pretrained(modelId, {
        cache_dir: cacheDir,
        local_files_only: true,
      });

      let model;
      try {
        model = await AutoModelForCausalLM.from_pretrained(modelId, {
          cache_dir: cacheDir,
          dtype: 'q4',
          local_files_only: true,
        });
      } catch (err) {
        getLogCollector().logEnv(
          'WARN',
          `[HF Server] Failed to load q4 model, trying fp32: ${err}`,
        );
        model = await AutoModelForCausalLM.from_pretrained(modelId, {
          cache_dir: cacheDir,
          dtype: 'fp32',
          local_files_only: true,
        });
      }

      // If stopServer() was called while we were loading, dispose the freshly
      // created resources and skip state mutation to avoid stale references.
      if (state.isStopping || stoppedAtStart) {
        getLogCollector().logEnv(
          'INFO',
          '[HF Server] Stop requested during load of ${modelId}; discarding.',
        );
        try {
          await model.dispose?.();
        } catch {
          // Ignore dispose errors
        }
        return;
      }

      // Successfully loaded new model, safe to dispose old one
      if (state.model) {
        try {
          await state.model.dispose?.();
        } catch {
          // Ignore dispose errors
        }
      }

      state.tokenizer = tokenizer;
      state.model = model;

      state.loadedModelId = modelId;
      getLogCollector().logEnv('INFO', '[HF Server] Model loaded: ${modelId}');
    } catch (error) {
      getLogCollector().logEnv('ERROR', `[HF Server] Failed to load model: ${modelId}`, {
        error: String(error),
      });
      throw error;
    } finally {
      state.isLoading = false;
      setLoadModelPromise(null);
    }
  })();

  setLoadModelPromise(promise);
  return promise;
}

/**
 * Format chat messages into a prompt string.
 * Uses the tokenizer's chat template if available.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatChatPrompt(messages: ChatMessage[], tokenizer: any): string {
  try {
    if (tokenizer.apply_chat_template) {
      const formatted = tokenizer.apply_chat_template(messages, {
        tokenize: false,
        add_generation_prompt: true,
      });
      return formatted;
    }
  } catch {
    // Fall through to manual formatting
  }

  // Manual fallback
  return (
    messages
      .map((m) => {
        if (m.role === 'system') {
          return `System: ${m.content}`;
        }
        if (m.role === 'user') {
          return `User: ${m.content}`;
        }
        return `Assistant: ${m.content}`;
      })
      .join('\n') + '\nAssistant:'
  );
}
