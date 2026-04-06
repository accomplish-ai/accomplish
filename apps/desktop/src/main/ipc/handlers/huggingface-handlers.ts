/**
 * HuggingFace Local LLM IPC handlers (ENG-687)
 *
 * Contributed by feat/huggingface-local-eng-687.
 * Manages the local Transformers.js inference server lifecycle and model management.
 */
import type { IpcMainInvokeEvent } from 'electron';
import { getStorage } from '../../store/storage';
import { handle } from './utils';
import type { HuggingFaceLocalConfig } from '@accomplish_ai/agent-core';
import {
  startHuggingFaceServer,
  stopHuggingFaceServer,
  getHuggingFaceServerStatus,
  testHuggingFaceConnection,
  HF_RECOMMENDED_MODELS as HF_SUGGESTED_MODELS,
  deleteHuggingFaceModel,
} from '../../providers/huggingface-local';
import {
  listCachedModels as hfListCachedModels,
  downloadModel,
  getCachePath,
} from '../../providers/huggingface-local/model-manager';

export function registerHuggingFaceHandlers(): void {
  const storage = getStorage();

  handle('huggingface-local:start-server', async (_event: IpcMainInvokeEvent, modelId: string) => {
    if (typeof modelId !== 'string' || !modelId.trim()) {
      return { success: false, error: 'Invalid model ID' };
    }
    return startHuggingFaceServer(modelId.trim());
  });

  handle('huggingface-local:stop-server', async () => {
    await stopHuggingFaceServer();
    return { success: true };
  });

  handle('huggingface-local:server-status', async () => {
    return getHuggingFaceServerStatus();
  });

  handle('huggingface-local:test-connection', async () => {
    return testHuggingFaceConnection();
  });

  handle('huggingface-local:download-model', async (event: IpcMainInvokeEvent, modelId: string) => {
    if (typeof modelId !== 'string' || !modelId.trim()) {
      return { success: false, error: 'Invalid model ID' };
    }
    return downloadModel(
      modelId.trim(),
      (progress: unknown) => {
        try {
          event.sender.send('huggingface-local:download-progress', progress);
        } catch {
          // Window may have been closed
        }
      },
      getCachePath(),
    );
  });

  handle('huggingface-local:list-models', async () => {
    const cached = await hfListCachedModels();
    return { cached, suggested: HF_SUGGESTED_MODELS };
  });

  handle('huggingface-local:delete-model', async (_event: IpcMainInvokeEvent, modelId: string) => {
    if (typeof modelId !== 'string' || !modelId.trim()) {
      return { success: false, error: 'Invalid model ID' };
    }
    // Stop server before deleting to avoid file-lock issues
    await stopHuggingFaceServer().catch(() => {});
    return deleteHuggingFaceModel(modelId.trim());
  });

  handle('huggingface-local:get-config', async () => {
    return storage.getHuggingFaceLocalConfig();
  });

  const VALID_QUANTIZATIONS = ['q4', 'fp32'];
  const VALID_DEVICE_PREFS = ['auto', 'cpu', 'cuda', 'webgpu'];

  handle(
    'huggingface-local:set-config',
    async (_event: IpcMainInvokeEvent, config: HuggingFaceLocalConfig | null) => {
      if (config !== null) {
        if (
          typeof config !== 'object' ||
          (config.selectedModelId !== null && typeof config.selectedModelId !== 'string') ||
          (config.serverPort !== null &&
            !(
              Number.isInteger(config.serverPort) &&
              isFinite(config.serverPort) &&
              config.serverPort >= 1 &&
              config.serverPort <= 65535
            )) ||
          typeof config.enabled !== 'boolean' ||
          (config.quantization !== null && !VALID_QUANTIZATIONS.includes(config.quantization)) ||
          (config.devicePreference !== null &&
            !VALID_DEVICE_PREFS.includes(config.devicePreference))
        ) {
          throw new Error('Invalid HuggingFace config: unexpected field types');
        }
      }
      storage.setHuggingFaceLocalConfig(config);
    },
  );
}
