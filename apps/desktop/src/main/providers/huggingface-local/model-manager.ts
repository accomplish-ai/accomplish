/**
 * HuggingFace Local Model Manager
 *
 * Downloads, caches, and manages ONNX-format HuggingFace models
 * for local inference via Transformers.js.
 */

import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { HuggingFaceLocalModelInfo } from '@accomplish_ai/agent-core/common';

/**
 * Tracking information for an active model download.
 */
export interface DownloadProgress {
  modelId: string;
  status: 'downloading' | 'complete' | 'error';
  progress: number; // 0-100
  downloadedBytes?: number;
  totalBytes?: number;
  error?: string;
}

/**
 * Callback function to receive download progress updates.
 */
export type ProgressCallback = (progress: DownloadProgress) => void;

/** Default cache directory for HuggingFace models */
function getDefaultCachePath(): string {
  return path.join(app.getPath('userData'), 'hf-models');
}

/** Ensure cache directory exists */
function ensureCacheDir(cachePath?: string): string {
  const dir = cachePath || getDefaultCachePath();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Suggested ONNX-compatible models for quick setup.
 * These are small models known to work well with Transformers.js.
 */
export const SUGGESTED_MODELS: HuggingFaceLocalModelInfo[] = [
  {
    id: 'onnx-community/Llama-3.2-1B-Instruct-ONNX',
    displayName: 'Llama 3.2 1B Instruct (ONNX)',
    downloaded: false,
  },
  {
    id: 'onnx-community/Phi-3.5-mini-instruct-onnx',
    displayName: 'Phi-3.5 Mini Instruct (ONNX)',
    downloaded: false,
  },
  {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    displayName: 'Qwen2.5 0.5B Instruct (ONNX)',
    downloaded: false,
  },
  {
    id: 'Xenova/distilgpt2',
    displayName: 'DistilGPT-2 (Tiny, for testing)',
    downloaded: false,
  },
];

// Track active downloads
const activeDownloads = new Map<string, { abort: AbortController }>();

/**
 * Download a model from HuggingFace Hub using Transformers.js auto-download.
 * Transformers.js handles model file resolution and caching internally.
 */
export async function downloadModel(
  modelId: string,
  onProgress?: ProgressCallback,
  cachePath?: string,
): Promise<{ success: boolean; error?: string }> {
  const cacheDir = ensureCacheDir(cachePath);
  // Note: Transformers.js does not currently support abort signals for from_pretrained.
  // The AbortController is stored for potential future cancellation support.
  const abortController = new AbortController();
  activeDownloads.set(modelId, { abort: abortController });

  try {
    onProgress?.({
      modelId,
      status: 'downloading',
      progress: 0,
    });

    // Dynamically import Transformers.js (it's ESM-only)
    const { env, AutoTokenizer, AutoModelForCausalLM } = await import('@huggingface/transformers');

    // Configure cache directory
    env.cacheDir = cacheDir;
    env.allowLocalModels = true;

    // Download tokenizer + model via Transformers.js auto-download
    onProgress?.({
      modelId,
      status: 'downloading',
      progress: 10,
    });

    await AutoTokenizer.from_pretrained(modelId, {
      cache_dir: cacheDir,
    });

    onProgress?.({
      modelId,
      status: 'downloading',
      progress: 30,
    });

    try {
      await AutoModelForCausalLM.from_pretrained(modelId, {
        cache_dir: cacheDir,
        dtype: 'q4', // Try quantized first
      });
    } catch (err) {
      console.warn(`[HF Manager] Failed to download q4 model, trying fp32: ${err}`);
      onProgress?.({
        modelId,
        status: 'downloading',
        progress: 50,
      });
      await AutoModelForCausalLM.from_pretrained(modelId, {
        cache_dir: cacheDir,
        dtype: 'fp32', // Fallback to fp32
      });
    }

    onProgress?.({
      modelId,
      status: 'complete',
      progress: 100,
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown download error';
    onProgress?.({
      modelId,
      status: 'error',
      progress: 0,
      error: message,
    });
    return { success: false, error: message };
  } finally {
    activeDownloads.delete(modelId);
  }
}

/**
 * Cancel an active download.
 *
 * Note: Transformers.js does not currently support aborting in-progress downloads.
 * This function marks the download as cancelled but the underlying network request
 * will continue until completion. The downloaded files will remain in the cache.
 */
export function cancelDownload(modelId: string): void {
  const download = activeDownloads.get(modelId);
  if (download) {
    download.abort.abort();
    activeDownloads.delete(modelId);
  }
}

/**
 * List all cached models in the cache directory.
 */
export function listCachedModels(cachePath?: string): HuggingFaceLocalModelInfo[] {
  const cacheDir = cachePath || getDefaultCachePath();
  if (!fs.existsSync(cacheDir)) {
    return [];
  }

  const models: HuggingFaceLocalModelInfo[] = [];

  try {
    // Transformers.js caches models in subdirectories named after the model
    // Structure: cacheDir/<org>/<model>/
    const entries = fs.readdirSync(cacheDir, { withFileTypes: true });
    for (const orgEntry of entries) {
      if (!orgEntry.isDirectory()) {
        continue;
      }
      const orgDir = path.join(cacheDir, orgEntry.name);
      const modelEntries = fs.readdirSync(orgDir, { withFileTypes: true });
      for (const modelEntry of modelEntries) {
        if (!modelEntry.isDirectory()) {
          continue;
        }
        const modelDir = path.join(orgDir, modelEntry.name);
        const modelId = `${orgEntry.name}/${modelEntry.name}`;
        const sizeBytes = getDirSize(modelDir);
        models.push({
          id: modelId,
          displayName: modelEntry.name,
          sizeBytes,
          downloaded: true,
        });
      }
    }
  } catch (error) {
    console.warn('[HF Local] Error listing cached models:', error);
  }

  return models;
}

/**
 * Delete a cached model.
 */
export function deleteModel(
  modelId: string,
  cachePath?: string,
): { success: boolean; error?: string } {
  const cacheDir = cachePath || getDefaultCachePath();
  const resolvedCache = path.resolve(cacheDir);

  // Normalize and pre-validate modelId to block path-traversal sequences
  const normalizedId = path.normalize(modelId);
  if (
    !normalizedId ||
    normalizedId.includes('\0') ||
    path.isAbsolute(normalizedId) ||
    normalizedId.split(path.sep).includes('..')
  ) {
    return { success: false, error: 'Invalid model ID' };
  }

  const modelDir = path.resolve(resolvedCache, normalizedId);

  // Guard against path traversal: modelDir must be strictly inside cacheDir
  const rel = path.relative(resolvedCache, modelDir);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return { success: false, error: 'Invalid model ID' };
  }

  if (!fs.existsSync(modelDir)) {
    return { success: false, error: 'Model not found in cache' };
  }

  try {
    fs.rmSync(modelDir, { recursive: true, force: true });

    // Clean up empty parent org directory
    const orgDir = path.dirname(modelDir);
    const remaining = fs.readdirSync(orgDir);
    if (remaining.length === 0) {
      fs.rmdirSync(orgDir);
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/** Recursively compute directory size in bytes */
function getDirSize(dirPath: string): number {
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isFile()) {
        total += fs.statSync(fullPath).size;
      } else if (entry.isDirectory()) {
        total += getDirSize(fullPath);
      }
    }
  } catch {
    // Ignore errors (permission issues etc.)
  }
  return total;
}

/**
 * Get the absolute path to the local model cache directory.
 */
export function getCachePath(): string {
  return getDefaultCachePath();
}
