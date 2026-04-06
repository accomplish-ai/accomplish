import { describe, expect, it, vi } from 'vitest';

// Mock the storage-dependent modules before importing
vi.mock('../../../src/connectors/oauth-tokens.js', () => ({
  isTokenExpired: vi.fn(() => false),
  refreshAccessToken: vi.fn(),
}));

vi.mock('../../../src/storage/repositories/knowledgeNotes.js', () => ({
  getKnowledgeNotesForPrompt: vi.fn(() => null),
}));

vi.mock('../../../src/opencode/config-builder.js', () => ({
  buildProviderConfigs: vi.fn(async () => ({
    providerConfigs: [{ id: 'anthropic', options: {} }],
    enabledProviders: ['anthropic'],
    modelOverride: { model: 'claude-sonnet', smallModel: 'claude-haiku' },
  })),
}));

const { resolveTaskConfig } = await import('../../../src/opencode/resolve-task-config.js');
const { getKnowledgeNotesForPrompt } =
  await import('../../../src/storage/repositories/knowledgeNotes.js');

function createMockStorage() {
  return {
    getEnabledConnectors: vi.fn(() => []),
    getConnectorTokens: vi.fn(() => null),
    setConnectorStatus: vi.fn(),
    storeConnectorTokens: vi.fn(),
    getCloudBrowserConfig: vi.fn(() => null),
  } as unknown as Parameters<typeof resolveTaskConfig>[0]['storage'];
}

describe('resolveTaskConfig', () => {
  it('returns configOptions with provider configs', async () => {
    const storage = createMockStorage();
    const result = await resolveTaskConfig({
      storage,
      platform: 'darwin',
      mcpToolsPath: '/tools',
      userDataPath: '/data',
      isPackaged: false,
      getApiKey: () => null,
    });

    expect(result.configOptions.providerConfigs).toHaveLength(1);
    expect(result.configOptions.providerConfigs![0].id).toBe('anthropic');
    expect(result.configOptions.model).toBe('claude-sonnet');
    expect(result.configOptions.smallModel).toBe('claude-haiku');
  });

  it('injects store:false for OpenAI when key exists', async () => {
    const storage = createMockStorage();
    const result = await resolveTaskConfig({
      storage,
      platform: 'darwin',
      mcpToolsPath: '/tools',
      userDataPath: '/data',
      isPackaged: false,
      getApiKey: (p) => (p === 'openai' ? 'sk-test' : null),
    });

    const openai = result.configOptions.providerConfigs!.find((p) => p.id === 'openai');
    expect(openai).toBeDefined();
    expect(openai!.options.store).toBe(false);
  });

  it('passes skills through to configOptions', async () => {
    const storage = createMockStorage();
    const skills = [
      {
        id: 'skill-1',
        name: 'Test Skill',
        command: 'test',
        description: 'A test',
        source: 'custom' as const,
        isEnabled: true,
        isVerified: false,
        isHidden: false,
        filePath: '/skills/test/SKILL.md',
      },
    ];
    const result = await resolveTaskConfig({
      storage,
      platform: 'darwin',
      mcpToolsPath: '/tools',
      userDataPath: '/data',
      isPackaged: false,
      getApiKey: () => null,
      skills,
    });

    expect(result.configOptions.skills).toEqual(skills);
  });

  it('resolves workspace knowledge notes when workspaceId provided', async () => {
    const storage = createMockStorage();
    const mockGetNotes = vi.mocked(getKnowledgeNotesForPrompt);
    mockGetNotes.mockReturnValue('## Notes\nSome workspace notes');

    const result = await resolveTaskConfig({
      storage,
      platform: 'darwin',
      mcpToolsPath: '/tools',
      userDataPath: '/data',
      isPackaged: false,
      getApiKey: () => null,
      workspaceId: 'ws-123',
    });

    expect(mockGetNotes).toHaveBeenCalledWith('ws-123');
    expect(result.configOptions.knowledgeNotes).toBe('## Notes\nSome workspace notes');
  });

  it('handles missing workspace notes gracefully', async () => {
    const storage = createMockStorage();
    const mockGetNotes = vi.mocked(getKnowledgeNotesForPrompt);
    mockGetNotes.mockImplementation(() => {
      throw new Error('DB error');
    });

    const log = vi.fn();
    const result = await resolveTaskConfig({
      storage,
      platform: 'darwin',
      mcpToolsPath: '/tools',
      userDataPath: '/data',
      isPackaged: false,
      getApiKey: () => null,
      workspaceId: 'ws-broken',
      log,
    });

    expect(result.configOptions.knowledgeNotes).toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      'WARN',
      expect.stringContaining('Failed to load workspace knowledge notes'),
      expect.objectContaining({ workspaceId: 'ws-broken' }),
    );
  });

  it('does not include connectors when none are enabled', async () => {
    const storage = createMockStorage();
    const result = await resolveTaskConfig({
      storage,
      platform: 'darwin',
      mcpToolsPath: '/tools',
      userDataPath: '/data',
      isPackaged: false,
      getApiKey: () => null,
    });

    expect(result.configOptions.connectors).toBeUndefined();
  });

  it('passes through authToken and port overrides', async () => {
    const storage = createMockStorage();
    const result = await resolveTaskConfig({
      storage,
      platform: 'darwin',
      mcpToolsPath: '/tools',
      userDataPath: '/data',
      isPackaged: false,
      getApiKey: () => null,
      authToken: 'tok-123',
      permissionApiPort: 9999,
      questionApiPort: 8888,
    });

    expect(result.configOptions.authToken).toBe('tok-123');
    expect(result.configOptions.permissionApiPort).toBe(9999);
    expect(result.configOptions.questionApiPort).toBe(8888);
  });
});
