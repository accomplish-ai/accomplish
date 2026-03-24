import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Must use vi.hoisted so the mock fn is available when vi.mock factory runs (hoisted)
const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: mockExecFile,
}));

import {
  validateVertexCredentials,
  fetchVertexModels,
  VertexClient,
} from '../../../src/providers/vertex.js';

/**
 * Helper: make mockExecFile resolve with a given stdout value.
 * promisify(execFile) calls execFile(cmd, args, opts, callback)
 */
function mockExecFileSuccess(stdout: string) {
  mockExecFile.mockImplementation(
    (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      cb(null, stdout, '');
    },
  );
}

/**
 * Helper: make mockExecFile reject with a given error.
 */
function mockExecFileError(error: Error) {
  mockExecFile.mockImplementation(
    (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      cb(error, '', '');
    },
  );
}

function makeAdcCredentialsJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    authType: 'adc',
    projectId: 'my-project',
    location: 'us-central1',
    ...overrides,
  });
}

function makeServiceAccountKey(): string {
  return JSON.stringify({
    type: 'service_account',
    project_id: 'my-project',
    private_key: 'fake-key',
    client_email: 'test@my-project.iam.gserviceaccount.com',
  });
}

function makeServiceAccountCredentialsJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    authType: 'serviceAccount',
    projectId: 'my-project',
    location: 'us-central1',
    serviceAccountJson: makeServiceAccountKey(),
    ...overrides,
  });
}

function mockFetchResponses(
  ...responses: Array<{ ok: boolean; status?: number; json?: unknown; text?: string }>
) {
  for (const resp of responses) {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: resp.ok,
      status: resp.status ?? (resp.ok ? 200 : 500),
      json: async () => resp.json ?? {},
      text: async () => resp.text ?? '',
    } as Response);
  }
}

describe('Vertex AI Provider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    mockExecFile.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('validateVertexCredentials', () => {
    it('should return error for invalid JSON', async () => {
      const result = await validateVertexCredentials('not-json');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Failed to parse credentials');
    });

    it('should return error for missing projectId', async () => {
      const result = await validateVertexCredentials(makeAdcCredentialsJson({ projectId: '' }));
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Project ID is required');
    });

    it('should return error for missing location', async () => {
      const result = await validateVertexCredentials(makeAdcCredentialsJson({ location: '' }));
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Location is required');
    });

    it('should return error for service account with missing JSON key', async () => {
      const result = await validateVertexCredentials(
        JSON.stringify({
          authType: 'serviceAccount',
          projectId: 'my-project',
          location: 'us-central1',
          serviceAccountJson: '',
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Service account JSON key is required');
    });

    it('should return error for service account with invalid JSON key', async () => {
      const result = await validateVertexCredentials(
        JSON.stringify({
          authType: 'serviceAccount',
          projectId: 'my-project',
          location: 'us-central1',
          serviceAccountJson: 'not-json',
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid service account JSON format');
    });

    it('should return error for service account key missing required fields', async () => {
      const result = await validateVertexCredentials(
        JSON.stringify({
          authType: 'serviceAccount',
          projectId: 'my-project',
          location: 'us-central1',
          serviceAccountJson: JSON.stringify({ type: 'service_account' }),
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('missing required fields');
    });

    describe('ADC flow', () => {
      it('should validate successfully with ADC token', async () => {
        mockExecFileSuccess('fake-adc-token\n');
        // testAccess call
        mockFetchResponses({ ok: true, json: { candidates: [] } });

        const result = await validateVertexCredentials(makeAdcCredentialsJson());

        expect(result.valid).toBe(true);
        expect(mockExecFile).toHaveBeenCalledWith(
          'gcloud',
          ['auth', 'application-default', 'print-access-token'],
          expect.objectContaining({ timeout: 15000 }),
          expect.any(Function),
        );
      });

      it('should return error when gcloud CLI is not found', async () => {
        const error = new Error('spawn gcloud ENOENT');
        mockExecFileError(error);

        const result = await validateVertexCredentials(makeAdcCredentialsJson());

        expect(result.valid).toBe(false);
        expect(result.error).toContain('gcloud CLI not found');
      });

      it('should return error when gcloud returns empty token', async () => {
        mockExecFileSuccess('   \n');

        const result = await validateVertexCredentials(makeAdcCredentialsJson());

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Empty token');
      });

      it('should return error when gcloud auth fails', async () => {
        const error = new Error('You do not currently have an active account');
        mockExecFileError(error);

        const result = await validateVertexCredentials(makeAdcCredentialsJson());

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Failed to get ADC token');
      });
    });

    describe('testAccess status codes', () => {
      beforeEach(() => {
        mockExecFileSuccess('fake-token');
      });

      it('should return error for 401 response', async () => {
        mockFetchResponses({ ok: false, status: 401, text: 'Unauthorized' });

        const result = await validateVertexCredentials(makeAdcCredentialsJson());

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Authentication failed');
      });

      it('should return error for 403 response', async () => {
        mockFetchResponses({ ok: false, status: 403, text: 'Forbidden' });

        const result = await validateVertexCredentials(makeAdcCredentialsJson());

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Authentication failed');
      });

      it('should return error for 404 response', async () => {
        mockFetchResponses({ ok: false, status: 404, text: 'Not Found' });

        const result = await validateVertexCredentials(makeAdcCredentialsJson());

        expect(result.valid).toBe(false);
        expect(result.error).toContain('not found');
        expect(result.error).toContain('my-project');
      });

      it('should treat 429 as valid (credentials work, just rate-limited)', async () => {
        mockFetchResponses({
          ok: false,
          status: 429,
          text: '{"error":{"code":429,"message":"Resource exhausted"}}',
        });

        const result = await validateVertexCredentials(makeAdcCredentialsJson());

        expect(result.valid).toBe(true);
      });

      it('should return error for other error status', async () => {
        mockFetchResponses({ ok: false, status: 500, text: 'Internal Server Error' });

        const result = await validateVertexCredentials(makeAdcCredentialsJson());

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Vertex AI API error (500)');
      });

      it('should use regional URL for non-global location', async () => {
        mockFetchResponses({ ok: true, json: { candidates: [] } });

        await validateVertexCredentials(makeAdcCredentialsJson({ location: 'europe-west1' }));

        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('https://europe-west1-aiplatform.googleapis.com'),
          expect.any(Object),
        );
      });

      it('should use global URL for global location', async () => {
        mockFetchResponses({ ok: true, json: { candidates: [] } });

        await validateVertexCredentials(makeAdcCredentialsJson({ location: 'global' }));

        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('https://aiplatform.googleapis.com'),
          expect.any(Object),
        );
      });
    });

    describe('service account flow', () => {
      it('should propagate error when private key is invalid', async () => {
        // crypto.createSign().sign() rejects fake keys before any fetch occurs
        const result = await validateVertexCredentials(makeServiceAccountCredentialsJson());

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        // fetch should never be called since signing fails first
        expect(fetch).not.toHaveBeenCalled();
      });

      it('should not call gcloud for service account auth type', async () => {
        const result = await validateVertexCredentials(makeServiceAccountCredentialsJson());

        expect(result.valid).toBe(false);
        // Should NOT fall back to gcloud for service account auth
        expect(mockExecFile).not.toHaveBeenCalled();
      });
    });
  });

  describe('VertexClient', () => {
    describe('constructor', () => {
      it('should use regional URL for non-global location', () => {
        const client = new VertexClient('my-project', 'us-central1', 'fake-token');
        expect(client.baseUrl).toBe('https://us-central1-aiplatform.googleapis.com');
      });

      it('should use global URL for global location', () => {
        const client = new VertexClient('my-project', 'global', 'fake-token');
        expect(client.baseUrl).toBe('https://aiplatform.googleapis.com');
      });
    });

    describe('create()', () => {
      it('should create client with ADC token', async () => {
        mockExecFileSuccess('adc-token');

        const client = await VertexClient.create({
          authType: 'adc',
          projectId: 'my-project',
          location: 'us-central1',
        });

        expect(client).toBeInstanceOf(VertexClient);
        expect(client.projectId).toBe('my-project');
        expect(client.location).toBe('us-central1');
      });

      it('should throw when token retrieval fails', async () => {
        mockExecFileError(new Error('gcloud failed'));

        await expect(
          VertexClient.create({
            authType: 'adc',
            projectId: 'my-project',
            location: 'us-central1',
          }),
        ).rejects.toThrow('Failed to get ADC token');
      });
    });
  });

  describe('fetchVertexModels', () => {
    it('should return the curated model list', () => {
      const result = fetchVertexModels({
        authType: 'adc',
        projectId: 'my-project',
        location: 'us-central1',
      });

      expect(result.success).toBe(true);
      expect(result.models.length).toBeGreaterThan(0);

      // Verify model ID format
      for (const model of result.models) {
        expect(model.id).toMatch(/^vertex\/.+\/.+$/);
        expect(model.name).toBeTruthy();
        expect(model.provider).toBeTruthy();
      }
    });

    it('should include Google Gemini models', () => {
      const result = fetchVertexModels({
        authType: 'adc',
        projectId: 'my-project',
        location: 'us-central1',
      });

      const googleModels = result.models.filter((m) => m.provider === 'google');
      expect(googleModels.length).toBeGreaterThanOrEqual(4);

      const ids = googleModels.map((m) => m.id);
      expect(ids).toContain('vertex/google/gemini-2.5-pro');
      expect(ids).toContain('vertex/google/gemini-2.5-flash');
      expect(ids).toContain('vertex/google/gemini-3-pro-preview');
      expect(ids).toContain('vertex/google/gemini-3-flash-preview');
    });

    it('should not include Anthropic models (use custom model input instead)', () => {
      const result = fetchVertexModels({
        authType: 'adc',
        projectId: 'my-project',
        location: 'us-central1',
      });

      const anthropicModels = result.models.filter((m) => m.provider === 'anthropic');
      expect(anthropicModels).toHaveLength(0);
    });

    it('should only include Google models (others added via custom input)', () => {
      const result = fetchVertexModels({
        authType: 'adc',
        projectId: 'my-project',
        location: 'us-central1',
      });

      const nonGoogleModels = result.models.filter((m) => m.provider !== 'google');
      expect(nonGoogleModels).toHaveLength(0);
    });

    it('should not make any API calls', () => {
      fetchVertexModels({
        authType: 'adc',
        projectId: 'my-project',
        location: 'us-central1',
      });

      expect(fetch).not.toHaveBeenCalled();
      expect(mockExecFile).not.toHaveBeenCalled();
    });
  });
});
