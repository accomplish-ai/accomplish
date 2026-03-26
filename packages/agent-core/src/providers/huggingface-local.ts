/**
 * HuggingFace Local provider utilities.
 *
 * Contributions:
 *   - SaaiAravindhRaja (PR #604): HF_LOCAL_DEFAULT_URL, HF_RECOMMENDED_MODELS,
 *     testHuggingFaceLocalConnection(), fetchHuggingFaceLocalModels()
 *   - nancysangani (PR #488): HuggingFaceHubModel type, searchHuggingFaceHubModels(),
 *     getHuggingFaceRecommendedModels() Hub API search
 */

import type { HuggingFaceLocalModelInfo } from '../common/types/provider.js';

/** Default server URL for the local HuggingFace inference server */
export const HF_LOCAL_DEFAULT_URL = 'http://localhost:8787';

/** Default timeout for HuggingFace local server API requests */
const HF_LOCAL_API_TIMEOUT_MS = 15_000;

/** Timeout for HuggingFace Hub search API requests */
const HF_HUB_API_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Recommended models — SaaiAravindhRaja (#604) + nancysangani (#488)
// ---------------------------------------------------------------------------

export const HF_RECOMMENDED_MODELS = [
  // SaaiAravindhRaja (#604) — curated ONNX-web models
  {
    id: 'onnx-community/Llama-3.2-1B-Instruct-q4f16',
    displayName: 'Llama 3.2 1B Instruct (Q4)',
    size: 750_000_000,
    quantization: 'q4f16',
  },
  {
    id: 'onnx-community/Phi-3-mini-4k-instruct-onnx-web',
    displayName: 'Phi-3 Mini 4K Instruct',
    size: 2_300_000_000,
    quantization: 'fp16',
  },
  {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    displayName: 'Qwen 2.5 0.5B Instruct',
    size: 500_000_000,
    quantization: 'q4f16',
  },
  // nancysangani (#488) — Xenova mirror models
  {
    id: 'Xenova/Phi-3-mini-4k-instruct',
    displayName: 'Phi-3 Mini 4K (Xenova)',
    size: 2_200_000_000,
    quantization: 'q4',
  },
  {
    id: 'Xenova/Mistral-7B-Instruct-v0.1',
    displayName: 'Mistral 7B Instruct (Xenova)',
    size: 4_000_000_000,
    quantization: 'q4',
  },
] as const;

// ---------------------------------------------------------------------------
// Hub model search — nancysangani (PR #488)
// ---------------------------------------------------------------------------

/** A model returned from the HuggingFace Hub search API */
export interface HuggingFaceHubModel {
  id: string;
  modelId: string;
  description?: string;
  tags?: string[];
  downloads?: number;
  quantizations?: string[];
}

/**
 * Search the HuggingFace Hub API for ONNX-compatible models.
 * Contributed by nancysangani (PR #488).
 */
export async function searchHuggingFaceHubModels(
  query: string,
  limit = 20,
): Promise<HuggingFaceHubModel[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HF_HUB_API_TIMEOUT_MS);
  try {
    const url = new URL('https://huggingface.co/api/models');
    url.searchParams.set('search', query);
    url.searchParams.set('filter', 'onnx');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('sort', 'downloads');

    const response = await fetch(url.toString(), { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HuggingFace Hub API error: ${response.status}`);
    }
    const raw = (await response.json()) as Array<{
      id?: string;
      modelId?: string;
      description?: string;
      cardData?: { summary?: string };
      tags?: string[];
      downloads?: number;
    }>;
    return raw.map((item) => ({
      id: item.id ?? item.modelId ?? '',
      modelId: item.modelId ?? item.id ?? '',
      description: item.cardData?.summary ?? item.description,
      tags: Array.isArray(item.tags) ? item.tags : undefined,
      downloads: typeof item.downloads === 'number' ? item.downloads : undefined,
    }));
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Connection test — SaaiAravindhRaja (PR #604)
// ---------------------------------------------------------------------------

/**
 * Test connectivity to the local HuggingFace inference server.
 */
export async function testHuggingFaceLocalConnection(serverUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HF_LOCAL_API_TIMEOUT_MS);
  try {
    const response = await fetch(`${serverUrl}/v1/models`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Model list fetch — SaaiAravindhRaja (PR #604)
// ---------------------------------------------------------------------------

/**
 * Fetch available models from the local inference server.
 */
export async function fetchHuggingFaceLocalModels(
  serverUrl: string,
): Promise<HuggingFaceLocalModelInfo[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HF_LOCAL_API_TIMEOUT_MS);
  try {
    const response = await fetch(`${serverUrl}/v1/models`, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    const data = (await response.json()) as { data?: Array<{ id: string }> };
    return (data.data ?? []).map((m) => ({
      id: m.id,
      displayName: m.id,
      downloaded: true,
    }));
  } finally {
    clearTimeout(timeout);
  }
}
