/**
 * Model loader for the HuggingFace Local inference server.
 * Handles loading/unloading Transformers.js models into shared state.
 */

import { app } from 'electron';
import path from 'path';
import { getLogCollector } from '../../logging';
import { getStorage } from '../../store/storage';
import {
  state,
  loadModelPromise,
  setLoadModelPromise,
  activeGenerations,
  type ChatMessage,
} from './server-state';

/**
 * Load a model into memory using Transformers.js.
 */
export async function loadModel(modelId: string): Promise<void> {
  // Gate fast-returns on !isStopping — stopServer() keeps the flag set while
  // it disposes the model, so we must not report success while shutdown is active.
  if (!state.isStopping && state.loadedModelId === modelId && state.tokenizer && state.model) {
    getLogCollector().logEnv('INFO', `[HF Server] Model ${modelId} already loaded`);
    return;
  }

  // Prevent concurrent loads — queue onto existing promise.
  // Swallow rejections so a failed/cancelled prior load doesn't abort this
  // caller; re-check state below to decide whether to proceed.
  if (loadModelPromise) {
    try {
      await loadModelPromise;
    } catch {
      // Previous load failed or was cancelled — re-evaluate state below
    }
    if (!state.isStopping && state.loadedModelId === modelId && state.tokenizer && state.model) {
      return;
    }
  }

  const promise = (async () => {
    state.isLoading = true;
    // Capture stop flag at start so we can detect a concurrent stopServer() call
    const stoppedAtStart = state.isStopping;
    getLogCollector().logEnv('INFO', `[HF Server] Loading model: ${modelId}`);

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

      // Get config to determine quantization + device preference
      const config = getStorage().getHuggingFaceLocalConfig();
      const quantization = config?.quantization ?? null;
      const devicePreference = config?.devicePreference ?? null;
      // Pass device only when explicitly set (not 'auto') — let Transformers.js auto-detect otherwise
      const deviceOption =
        devicePreference && devicePreference !== 'auto' ? { device: devicePreference } : {};

      // Use saved quantization, fall back to q4 then fp32
      const dtypesToTry: string[] = quantization ? [quantization] : ['q4'];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let model: any;
      for (const dtype of dtypesToTry) {
        try {
          model = await AutoModelForCausalLM.from_pretrained(modelId, {
            cache_dir: cacheDir,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dtype: dtype as any,
            local_files_only: true,
            ...deviceOption,
          });
          break;
        } catch (err) {
          if (dtype === dtypesToTry[dtypesToTry.length - 1] && dtype !== 'fp32') {
            getLogCollector().logEnv(
              'WARN',
              `[HF Server] Failed to load ${dtype} model, trying fp32: ${err}`,
            );
            // Last fallback: try fp32 (only if we haven't already tried fp32)
            model = await AutoModelForCausalLM.from_pretrained(modelId, {
              cache_dir: cacheDir,
              dtype: 'fp32',
              local_files_only: true,
              ...deviceOption,
            });
          } else {
            throw err;
          }
        }
      }

      // If stopServer() was called while we were loading, dispose the freshly
      // created resources and skip state mutation to avoid stale references.
      if (state.isStopping || stoppedAtStart) {
        getLogCollector().logEnv(
          'INFO',
          `[HF Server] Stop requested during load of ${modelId}; discarding.`,
        );
        try {
          await model?.dispose?.();
        } catch {
          // Ignore dispose errors
        }
        throw new DOMException('Load cancelled by stopServer()', 'AbortError');
      }

      // Successfully loaded new model — drain in-flight generations before
      // disposing the previous model instance to avoid tearing it down while
      // a request is still using it (mirrors the shutdown drain in server-lifecycle).
      if (state.model) {
        const start = Date.now();
        while (activeGenerations > 0 && Date.now() - start < 10000) {
          await new Promise((r) => setTimeout(r, 100));
        }
        try {
          await state.model.dispose?.();
        } catch {
          // Ignore dispose errors
        }
      }

      state.tokenizer = tokenizer;
      state.model = model;

      state.loadedModelId = modelId;
      getLogCollector().logEnv('INFO', `[HF Server] Model loaded: ${modelId}`);
    } catch (error) {
      // AbortError is an expected cancellation (stopServer called during load) — log at INFO
      // to avoid false failure noise; all other errors are real failures logged at ERROR.
      const isAbort = error instanceof DOMException && error.name === 'AbortError';
      getLogCollector().logEnv(
        isAbort ? 'INFO' : 'ERROR',
        `[HF Server] ${isAbort ? 'Load cancelled' : 'Failed to load model'}: ${modelId}`,
        isAbort ? undefined : { error: String(error) },
      );
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
