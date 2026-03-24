import { execFile } from 'child_process';
import { validateVertexCredentials, fetchVertexModels } from '@accomplish_ai/agent-core';
import type { VertexCredentials } from '@accomplish_ai/agent-core';
import { storeApiKey, getApiKey } from '../store/secureStorage';
import { normalizeIpcError } from '../ipc/validation';
import type { IpcHandler } from '../ipc/types';
import type { IpcMainInvokeEvent } from 'electron';

function execAsync(command: string, args: string[], timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: timeoutMs, encoding: 'utf-8' }, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

export function registerVertexHandlers(handle: IpcHandler): void {
  handle('vertex:validate', async (_event: IpcMainInvokeEvent, credentials: string) => {
    console.log('[Vertex] Validation requested');
    return validateVertexCredentials(credentials);
  });

  handle('vertex:fetch-models', async (_event: IpcMainInvokeEvent, credentialsJson: string) => {
    try {
      const credentials = JSON.parse(credentialsJson) as VertexCredentials;
      const result = await fetchVertexModels(credentials);
      if (!result.success && result.error) {
        return { success: false, error: normalizeIpcError(result.error), models: [] };
      }
      return result;
    } catch (error) {
      console.error('[Vertex] Failed to fetch models:', error);
      return { success: false, error: normalizeIpcError(error), models: [] };
    }
  });

  handle('vertex:save', async (_event: IpcMainInvokeEvent, credentials: string) => {
    const parsed = JSON.parse(credentials) as VertexCredentials;

    if (!parsed.projectId?.trim()) {
      throw new Error('Project ID is required');
    }
    if (!parsed.location?.trim()) {
      throw new Error('Location is required');
    }

    if (parsed.authType === 'serviceAccount') {
      if (!parsed.serviceAccountJson?.trim()) {
        throw new Error('Service account JSON key is required');
      }
    }

    storeApiKey('vertex', credentials);

    const label =
      parsed.authType === 'serviceAccount' ? 'Service Account' : 'Application Default Credentials';
    const keyPrefix = `${parsed.projectId} (${parsed.location})`;

    return {
      id: 'local-vertex',
      provider: 'vertex',
      label,
      keyPrefix,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
  });

  handle('vertex:get-credentials', async (_event: IpcMainInvokeEvent) => {
    const stored = getApiKey('vertex');
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  });

  handle('vertex:detect-project', async (_event: IpcMainInvokeEvent) => {
    // 1. Check environment variables
    const envProject =
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.CLOUDSDK_CORE_PROJECT ||
      process.env.GCLOUD_PROJECT;
    if (envProject) {
      return { success: true, projectId: envProject };
    }

    // 2. Try gcloud config
    try {
      const project = await execAsync('gcloud', ['config', 'get-value', 'project']);
      if (project) {
        return { success: true, projectId: project };
      }
    } catch {
      // gcloud not available or not configured
    }

    return { success: false, projectId: null };
  });

  handle('vertex:list-projects', async (_event: IpcMainInvokeEvent) => {
    try {
      const token = await execAsync(
        'gcloud',
        ['auth', 'application-default', 'print-access-token'],
        20000,
      );

      if (!token) {
        return { success: false, projects: [], error: 'No ADC token available' };
      }

      const projects: Array<{ projectId: string; name: string }> = [];
      let pageToken: string | undefined;

      // Fetch up to 3 pages (each page has up to 100 projects)
      for (let page = 0; page < 3; page++) {
        const url = new URL('https://cloudresourcemanager.googleapis.com/v1/projects');
        url.searchParams.set('filter', 'lifecycleState:ACTIVE');
        url.searchParams.set('pageSize', '100');
        if (pageToken) url.searchParams.set('pageToken', pageToken);

        const response = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          return {
            success: false,
            projects: [],
            error: `Failed to list projects (${response.status}): ${errorText}`,
          };
        }

        const data = (await response.json()) as {
          projects?: Array<{ projectId: string; name: string }>;
          nextPageToken?: string;
        };

        if (data.projects) {
          for (const p of data.projects) {
            projects.push({ projectId: p.projectId, name: p.name || p.projectId });
          }
        }

        if (!data.nextPageToken) break;
        pageToken = data.nextPageToken;
      }

      projects.sort((a, b) => a.projectId.localeCompare(b.projectId));
      return { success: true, projects };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, projects: [], error: message };
    }
  });
}
