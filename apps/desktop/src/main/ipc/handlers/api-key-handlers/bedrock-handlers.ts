import type { IpcMainInvokeEvent } from 'electron';
import { validateBedrockCredentials, fetchBedrockModels } from '@accomplish_ai/agent-core';
import type { BedrockCredentials } from '@accomplish_ai/agent-core';
import { storeApiKey, getApiKey } from '../../../store/secureStorage';
import { normalizeIpcError } from '../../validation';
import { getLogCollector } from '../../../logging';
import { handle } from '../utils';

export function registerBedrockHandlers(): void {
  handle('bedrock:validate', async (_event: IpcMainInvokeEvent, credentials: string) => {
    getLogCollector().logEnv('INFO', '[Bedrock] Validation requested');
    return validateBedrockCredentials(credentials);
  });

  handle('bedrock:fetch-models', async (_event: IpcMainInvokeEvent, credentialsJson: string) => {
    try {
      const credentials = JSON.parse(credentialsJson) as BedrockCredentials;
      const result = await fetchBedrockModels(credentials);
      if (!result.success && result.error) {
        return { success: false, error: normalizeIpcError(result.error), models: [] };
      }
      return result;
    } catch (error) {
      getLogCollector().logEnv('ERROR', '[Bedrock] Failed to fetch models', {
        error: normalizeIpcError(error),
      });
      return { success: false, error: normalizeIpcError(error), models: [] };
    }
  });

  handle('bedrock:save', async (_event: IpcMainInvokeEvent, credentials: string) => {
    const parsed = JSON.parse(credentials);

    if (parsed.authType === 'apiKey') {
      if (!(typeof parsed.apiKey === 'string' && parsed.apiKey.length > 0)) {
        throw new Error('API Key is required');
      }
    } else if (parsed.authType === 'accessKeys') {
      if (
        !(typeof parsed.accessKeyId === 'string' && parsed.accessKeyId.length > 0) ||
        !(typeof parsed.secretAccessKey === 'string' && parsed.secretAccessKey.length > 0)
      ) {
        throw new Error('Access Key ID and Secret Access Key are required');
      }
    } else if (parsed.authType === 'profile') {
      if (!(typeof parsed.profileName === 'string' && parsed.profileName.length > 0)) {
        throw new Error('Profile name is required');
      }
    } else {
      throw new Error('Invalid authentication type');
    }

    storeApiKey('bedrock', credentials);

    let label: string;
    let keyPrefix: string;
    if (parsed.authType === 'apiKey') {
      label = 'Bedrock API Key';
      keyPrefix = `${parsed.apiKey.substring(0, 8)}...`;
    } else if (parsed.authType === 'accessKeys') {
      label = 'AWS Access Keys';
      keyPrefix = `${parsed.accessKeyId.substring(0, 8)}...`;
    } else {
      label = `AWS Profile: ${parsed.profileName}`;
      keyPrefix = parsed.profileName;
    }

    return {
      id: 'local-bedrock',
      provider: 'bedrock',
      label,
      keyPrefix,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
  });

  handle('bedrock:get-credentials', async (_event: IpcMainInvokeEvent) => {
    const stored = getApiKey('bedrock');
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  });
}
