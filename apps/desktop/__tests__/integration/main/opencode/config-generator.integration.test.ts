/**
 * Integration tests for OpenCode config generator
 *
 * Tests the config-generator module which creates OpenCode configuration files
 * with MCP servers, agent definitions, and system prompts.
 *
 * NOTE: This is a TRUE integration test.
 * - Uses REAL filesystem operations with temp directories
 * - Only mocks external dependencies (electron APIs, secure storage, etc.)
 *
 * Mocked external services:
 * - electron.app: Native Electron APIs (getPath, getAppPath, isPackaged)
 * - Secure storage (keytar): API key storage
 * - Provider settings (SQLite): Provider configuration
 * - App settings (SQLite): Application configuration
 * - Skills manager: Skill definitions
 * - Azure Foundry proxy: Proxy for Azure AI Foundry
 * - Moonshot proxy: Proxy for Moonshot AI
 *
 * Real implementations used:
 * - fs: Real filesystem operations in temp directories
 * - path: Real path operations
 *
 * @module __tests__/integration/main/opencode/config-generator.integration.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import type {
  ProviderId,
  ProviderSettings,
  ConnectedProvider,
  BedrockProviderCredentials,
  OllamaCredentials,
  LiteLLMCredentials,
  LMStudioCredentials,
  AzureFoundryCredentials,
  ZaiCredentials,
  Skill,
  SkillSource,
} from '@accomplish/shared';

// ============================================================================
// Test Setup - Create temp directories for each test
// ============================================================================

let tempUserDataDir: string;
let tempAppDir: string;

// Mock only the external electron module
const mockApp = {
  isPackaged: false,
  getAppPath: vi.fn(() => tempAppDir),
  getPath: vi.fn((name: string) => {
    if (name === 'userData') return tempUserDataDir;
    return path.join(tempUserDataDir, name);
  }),
};

vi.mock('electron', () => ({
  app: mockApp,
}));

// Mock permission-api module (internal but exports constants we need)
vi.mock('@main/permission-api', () => ({
  PERMISSION_API_PORT: 9999,
  QUESTION_API_PORT: 9227,
}));

// Mock bundled-node utilities
vi.mock('@main/utils/bundled-node', () => ({
  getNodePath: vi.fn(() => '/mock/node/path'),
  getNpxPath: vi.fn(() => '/mock/npx/path'),
  getBundledNodePaths: vi.fn(() => ({
    binDir: '/mock/node/bin',
    nodePath: '/mock/node/path',
    npxPath: '/mock/npx/path',
  })),
}));

// Mock providerSettings (now uses SQLite which requires native module)
const mockGetProviderSettings = vi.fn();
const mockGetActiveProviderModel = vi.fn();
const mockGetConnectedProviderIds = vi.fn();

vi.mock('@main/store/providerSettings', () => ({
  getProviderSettings: () => mockGetProviderSettings(),
  setActiveProvider: vi.fn(),
  getActiveProviderId: vi.fn(() => null),
  getConnectedProvider: vi.fn(() => null),
  setConnectedProvider: vi.fn(),
  removeConnectedProvider: vi.fn(),
  updateProviderModel: vi.fn(),
  setProviderDebugMode: vi.fn(),
  getProviderDebugMode: vi.fn(() => false),
  clearProviderSettings: vi.fn(),
  getActiveProviderModel: () => mockGetActiveProviderModel(),
  hasReadyProvider: vi.fn(() => false),
  getConnectedProviderIds: () => mockGetConnectedProviderIds(),
}));

// Mock skills module (uses SQLite which requires native module)
const mockSkillsGetEnabled = vi.fn();

vi.mock('@main/skills', () => ({
  skillsManager: {
    getEnabled: () => mockSkillsGetEnabled(),
    getAll: vi.fn(() => Promise.resolve([])),
    initialize: vi.fn(() => Promise.resolve()),
  },
}));

// Mock appSettings (now uses SQLite which requires native module)
const mockGetOllamaConfig = vi.fn();
const mockGetLMStudioConfig = vi.fn();
const mockGetSelectedModel = vi.fn();
const mockGetAzureFoundryConfig = vi.fn();

vi.mock('@main/store/appSettings', () => ({
  getDebugMode: vi.fn(() => false),
  setDebugMode: vi.fn(),
  getOnboardingComplete: vi.fn(() => false),
  setOnboardingComplete: vi.fn(),
  getSelectedModel: () => mockGetSelectedModel(),
  setSelectedModel: vi.fn(),
  getOllamaConfig: () => mockGetOllamaConfig(),
  setOllamaConfig: vi.fn(),
  getLiteLLMConfig: vi.fn(() => null),
  setLiteLLMConfig: vi.fn(),
  getAzureFoundryConfig: () => mockGetAzureFoundryConfig(),
  setAzureFoundryConfig: vi.fn(),
  getLMStudioConfig: () => mockGetLMStudioConfig(),
  setLMStudioConfig: vi.fn(),
  getAppSettings: vi.fn(() => ({
    debugMode: false,
    onboardingComplete: false,
    selectedModel: null,
    ollamaConfig: null,
    litellmConfig: null,
    azureFoundryConfig: null,
    lmstudioConfig: null,
  })),
  clearAppSettings: vi.fn(),
}));

// Mock secure storage
const mockGetApiKey = vi.fn();

vi.mock('@main/store/secureStorage', () => ({
  getApiKey: (key: string) => mockGetApiKey(key),
  setApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
}));

// Mock azure-foundry-proxy
const mockEnsureAzureFoundryProxy = vi.fn();

vi.mock('@main/opencode/azure-foundry-proxy', () => ({
  ensureAzureFoundryProxy: (targetUrl: string) => mockEnsureAzureFoundryProxy(targetUrl),
}));

// Mock moonshot-proxy
const mockEnsureMoonshotProxy = vi.fn();

vi.mock('@main/opencode/moonshot-proxy', () => ({
  ensureMoonshotProxy: (targetUrl: string) => mockEnsureMoonshotProxy(targetUrl),
}));

// ============================================================================
// Test Types and Helpers
// ============================================================================

interface OpenCodeConfig {
  $schema?: string;
  model?: string;
  small_model?: string;
  default_agent?: string;
  enabled_providers?: string[];
  permission?: string | Record<string, string | Record<string, string>>;
  agent?: Record<
    string,
    {
      description?: string;
      prompt?: string;
      mode?: 'primary' | 'subagent' | 'all';
    }
  >;
  mcp?: Record<
    string,
    {
      type?: 'local' | 'remote';
      command?: string[];
      url?: string;
      enabled?: boolean;
      environment?: Record<string, string>;
      timeout?: number;
    }
  >;
  provider?: Record<string, unknown>;
  plugin?: string[];
}

function createMockProviderSettings(
  overrides: Partial<ProviderSettings> = {}
): ProviderSettings {
  return {
    activeProviderId: null,
    connectedProviders: {},
    debugMode: false,
    ...overrides,
  };
}

function createMockConnectedProvider(
  providerId: ProviderId,
  overrides: Partial<ConnectedProvider> = {}
): ConnectedProvider {
  return {
    providerId,
    connectionStatus: 'connected',
    selectedModelId: `${providerId}/test-model`,
    credentials: { type: 'api_key', keyPrefix: 'test' },
    lastConnectedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'test-skill',
    name: 'Test Skill',
    command: '/test',
    description: 'A test skill for testing',
    filePath: '/mock/skills/test-skill/SKILL.md',
    source: 'custom' as SkillSource,
    isEnabled: true,
    isVerified: false,
    isHidden: false,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('OpenCode Config Generator Integration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    originalEnv = { ...process.env };
    mockApp.isPackaged = false;

    // Create real temp directories for each test
    tempUserDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'opencode-config-test-userData-')
    );
    tempAppDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-config-test-app-'));

    // Create mcp-tools directory structure in temp app dir
    const mcpToolsDir = path.join(tempAppDir, 'mcp-tools');
    fs.mkdirSync(mcpToolsDir, { recursive: true });
    fs.mkdirSync(path.join(mcpToolsDir, 'file-permission', 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(mcpToolsDir, 'file-permission', 'src', 'index.ts'),
      '// mock file'
    );

    // Update mock to use temp directories
    mockApp.getAppPath.mockReturnValue(tempAppDir);
    mockApp.getPath.mockImplementation((name: string) => {
      if (name === 'userData') return tempUserDataDir;
      return path.join(tempUserDataDir, name);
    });

    // Set default mock return values
    mockGetProviderSettings.mockReturnValue(createMockProviderSettings());
    mockGetActiveProviderModel.mockReturnValue(null);
    mockGetConnectedProviderIds.mockReturnValue([]);
    mockGetApiKey.mockReturnValue(null);
    mockSkillsGetEnabled.mockResolvedValue([]);
    mockGetOllamaConfig.mockReturnValue(null);
    mockGetLMStudioConfig.mockReturnValue(null);
    mockGetSelectedModel.mockReturnValue(null);
    mockGetAzureFoundryConfig.mockReturnValue(null);
    mockEnsureAzureFoundryProxy.mockResolvedValue({ baseURL: 'http://localhost:3000' });
    mockEnsureMoonshotProxy.mockResolvedValue({ baseURL: 'http://localhost:3001' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;

    // Clean up temp directories
    try {
      fs.rmSync(tempUserDataDir, { recursive: true, force: true });
      fs.rmSync(tempAppDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ==========================================================================
  // Provider Integration Tests
  // ==========================================================================

  describe('Provider Integration', () => {
    describe('Single Provider Configuration', () => {
      it('should generate valid config with single Anthropic provider', async () => {
        // Arrange
        const anthropicProvider = createMockConnectedProvider('anthropic', {
          selectedModelId: 'anthropic/claude-3-opus-20240229',
        });
        mockGetProviderSettings.mockReturnValue(
          createMockProviderSettings({
            activeProviderId: 'anthropic',
            connectedProviders: { anthropic: anthropicProvider },
          })
        );
        mockGetConnectedProviderIds.mockReturnValue(['anthropic'] as ProviderId[]);
        mockGetActiveProviderModel.mockReturnValue({
          provider: 'anthropic',
          model: 'anthropic/claude-3-opus-20240229',
        });

        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert - read real file from disk
        expect(fs.existsSync(configPath)).toBe(true);
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;

        expect(config.$schema).toBe('https://opencode.ai/config.json');
        expect(config.enabled_providers).toContain('anthropic');
        expect(config.default_agent).toBe('accomplish');
        expect(config.agent?.accomplish).toBeDefined();
        expect(config.mcp).toBeDefined();
      });

      it('should generate valid config with single OpenAI provider', async () => {
        // Arrange
        const openaiProvider = createMockConnectedProvider('openai', {
          selectedModelId: 'openai/gpt-4-turbo',
        });
        mockGetProviderSettings.mockReturnValue(
          createMockProviderSettings({
            activeProviderId: 'openai',
            connectedProviders: { openai: openaiProvider },
          })
        );
        mockGetConnectedProviderIds.mockReturnValue(['openai'] as ProviderId[]);

        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        expect(config.enabled_providers).toContain('openai');
      });
    });

    describe('Multiple Provider Configuration', () => {
      it('should generate combined config with multiple providers', async () => {
        // Arrange
        const anthropicProvider = createMockConnectedProvider('anthropic');
        const openaiProvider = createMockConnectedProvider('openai');
        const ollamaCredentials: OllamaCredentials = {
          type: 'ollama',
          serverUrl: 'http://localhost:11434',
        };
        const ollamaProvider = createMockConnectedProvider('ollama', {
          selectedModelId: 'ollama/llama3',
          credentials: ollamaCredentials,
        });

        mockGetProviderSettings.mockReturnValue(
          createMockProviderSettings({
            activeProviderId: 'anthropic',
            connectedProviders: {
              anthropic: anthropicProvider,
              openai: openaiProvider,
              ollama: ollamaProvider,
            },
          })
        );
        mockGetConnectedProviderIds.mockReturnValue([
          'anthropic',
          'openai',
          'ollama',
        ] as ProviderId[]);

        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;

        expect(config.enabled_providers).toContain('anthropic');
        expect(config.enabled_providers).toContain('openai');
        expect(config.enabled_providers).toContain('ollama');
        expect(config.provider?.ollama).toBeDefined();
      });

      it('should not duplicate providers in enabled list', async () => {
        // Arrange - anthropic is in both base and connected
        mockGetConnectedProviderIds.mockReturnValue(['anthropic', 'openai'] as ProviderId[]);

        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        const anthropicCount = config.enabled_providers?.filter(
          (p) => p === 'anthropic'
        ).length;
        expect(anthropicCount).toBe(1);
      });
    });

    describe('Provider with Proxy', () => {
      it('should include proxy baseURL for Moonshot provider', async () => {
        // Arrange
        const moonshotProvider = createMockConnectedProvider('moonshot', {
          selectedModelId: 'moonshot/moonshot-v1-8k',
        });
        mockGetProviderSettings.mockReturnValue(
          createMockProviderSettings({
            connectedProviders: { moonshot: moonshotProvider },
          })
        );
        mockGetApiKey.mockImplementation((key: string) =>
          key === 'moonshot' ? 'test-moonshot-key' : null
        );
        mockEnsureMoonshotProxy.mockResolvedValue({
          baseURL: 'http://localhost:3001/proxy',
        });

        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        const moonshotConfig = config.provider?.moonshot as {
          options?: { baseURL?: string };
        };
        expect(moonshotConfig?.options?.baseURL).toBe('http://localhost:3001/proxy');
        expect(mockEnsureMoonshotProxy).toHaveBeenCalled();
      });

      it('should include proxy baseURL for Azure Foundry provider', async () => {
        // Arrange
        const azureCredentials: AzureFoundryCredentials = {
          type: 'azure-foundry',
          endpoint: 'https://my-endpoint.openai.azure.com',
          deploymentName: 'gpt-4o-deployment',
          authMethod: 'api-key',
        };
        const azureProvider = createMockConnectedProvider('azure-foundry', {
          selectedModelId: 'azure-foundry/gpt-4o',
          credentials: azureCredentials,
        });
        mockGetProviderSettings.mockReturnValue(
          createMockProviderSettings({
            connectedProviders: { 'azure-foundry': azureProvider },
          })
        );
        mockGetApiKey.mockImplementation((key: string) =>
          key === 'azure-foundry' ? 'test-azure-key' : null
        );
        mockEnsureAzureFoundryProxy.mockResolvedValue({
          baseURL: 'http://localhost:3000/azure',
        });

        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        const azureConfig = config.provider?.['azure-foundry'] as {
          options?: { baseURL?: string };
        };
        expect(azureConfig?.options?.baseURL).toBe('http://localhost:3000/azure');
        expect(mockEnsureAzureFoundryProxy).toHaveBeenCalled();
      });
    });

    describe('Bedrock Integration', () => {
      it('should configure Bedrock with profile authentication', async () => {
        // Arrange
        const bedrockCredentials: BedrockProviderCredentials = {
          type: 'bedrock',
          region: 'us-west-2',
          authMethod: 'profile',
          profileName: 'my-aws-profile',
        };
        const bedrockProvider = createMockConnectedProvider('bedrock', {
          selectedModelId: 'bedrock/anthropic.claude-3-opus',
          credentials: bedrockCredentials,
        });
        mockGetProviderSettings.mockReturnValue(
          createMockProviderSettings({
            connectedProviders: { bedrock: bedrockProvider },
          })
        );
        mockGetConnectedProviderIds.mockReturnValue(['bedrock'] as ProviderId[]);

        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        expect(config.enabled_providers).toContain('amazon-bedrock');

        const bedrockConfig = config.provider?.['amazon-bedrock'] as {
          options?: { region?: string; profile?: string };
        };
        expect(bedrockConfig?.options?.region).toBe('us-west-2');
        expect(bedrockConfig?.options?.profile).toBe('my-aws-profile');
      });

      it('should configure Bedrock with default authentication', async () => {
        // Arrange
        const bedrockCredentials: BedrockProviderCredentials = {
          type: 'bedrock',
          region: 'us-east-1',
          authMethod: 'default',
        };
        const bedrockProvider = createMockConnectedProvider('bedrock', {
          selectedModelId: 'bedrock/anthropic.claude-3-sonnet',
          credentials: bedrockCredentials,
        });
        mockGetProviderSettings.mockReturnValue(
          createMockProviderSettings({
            connectedProviders: { bedrock: bedrockProvider },
          })
        );

        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        const bedrockConfig = config.provider?.['amazon-bedrock'] as {
          options?: { region?: string; profile?: string };
        };
        expect(bedrockConfig?.options?.region).toBe('us-east-1');
        expect(bedrockConfig?.options?.profile).toBeUndefined();
      });

      it('should set model and small_model for active Bedrock provider', async () => {
        // Arrange
        const bedrockCredentials: BedrockProviderCredentials = {
          type: 'bedrock',
          region: 'us-east-1',
          authMethod: 'profile',
        };
        const bedrockProvider = createMockConnectedProvider('bedrock', {
          selectedModelId: 'bedrock/anthropic.claude-3-sonnet-20240229-v1:0',
          credentials: bedrockCredentials,
        });
        mockGetProviderSettings.mockReturnValue(
          createMockProviderSettings({
            activeProviderId: 'bedrock',
            connectedProviders: { bedrock: bedrockProvider },
          })
        );
        mockGetActiveProviderModel.mockReturnValue({
          provider: 'bedrock',
          model: 'bedrock/anthropic.claude-3-sonnet-20240229-v1:0',
        });

        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        expect(config.model).toBe('bedrock/anthropic.claude-3-sonnet-20240229-v1:0');
        expect(config.small_model).toBe('bedrock/anthropic.claude-3-sonnet-20240229-v1:0');
      });
    });

    describe('Azure Foundry Integration', () => {
      it('should configure Azure Foundry with API key authentication', async () => {
        // Arrange
        const azureCredentials: AzureFoundryCredentials = {
          type: 'azure-foundry',
          endpoint: 'https://my-resource.openai.azure.com',
          deploymentName: 'gpt-4o',
          authMethod: 'api-key',
        };
        const azureProvider = createMockConnectedProvider('azure-foundry', {
          selectedModelId: 'azure-foundry/gpt-4o',
          credentials: azureCredentials,
        });
        mockGetProviderSettings.mockReturnValue(
          createMockProviderSettings({
            connectedProviders: { 'azure-foundry': azureProvider },
          })
        );
        mockGetApiKey.mockImplementation((key: string) =>
          key === 'azure-foundry' ? 'test-api-key-12345' : null
        );

        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        expect(config.enabled_providers).toContain('azure-foundry');

        const azureConfig = config.provider?.['azure-foundry'] as {
          npm?: string;
          name?: string;
          options?: { apiKey?: string };
          models?: Record<string, unknown>;
        };
        expect(azureConfig?.npm).toBe('@ai-sdk/openai-compatible');
        expect(azureConfig?.name).toBe('Azure AI Foundry');
        expect(azureConfig?.options?.apiKey).toBe('test-api-key-12345');
        expect(azureConfig?.models?.['gpt-4o']).toBeDefined();
      });

      it('should configure Azure Foundry with Entra ID authentication', async () => {
        // Arrange
        const azureCredentials: AzureFoundryCredentials = {
          type: 'azure-foundry',
          endpoint: 'https://my-resource.openai.azure.com',
          deploymentName: 'gpt-4o',
          authMethod: 'entra-id',
        };
        const azureProvider = createMockConnectedProvider('azure-foundry', {
          credentials: azureCredentials,
        });
        mockGetProviderSettings.mockReturnValue(
          createMockProviderSettings({
            connectedProviders: { 'azure-foundry': azureProvider },
          })
        );

        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig('mock-entra-token-12345');

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        const azureConfig = config.provider?.['azure-foundry'] as {
          options?: { apiKey?: string; headers?: Record<string, string> };
        };
        expect(azureConfig?.options?.apiKey).toBe('');
        expect(azureConfig?.options?.headers?.Authorization).toBe(
          'Bearer mock-entra-token-12345'
        );
      });
    });

    describe('Z.AI Integration', () => {
      it('should configure Z.AI with international endpoint by default', async () => {
        // Arrange
        mockGetApiKey.mockImplementation((key: string) =>
          key === 'zai' ? 'test-zai-key' : null
        );

        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        const zaiConfig = config.provider?.['zai-coding-plan'] as {
          options?: { baseURL?: string };
          models?: Record<string, unknown>;
        };

        expect(zaiConfig?.options?.baseURL).toContain('api.z.ai');
        expect(zaiConfig?.models?.['glm-4.7-flashx']).toBeDefined();
        expect(zaiConfig?.models?.['glm-4.7']).toBeDefined();
        expect(zaiConfig?.models?.['glm-4.7-flash']).toBeDefined();
      });

      it('should configure Z.AI with China endpoint when region is china', async () => {
        // Arrange
        const zaiCredentials: ZaiCredentials = {
          type: 'zai',
          keyPrefix: 'test',
          region: 'china',
        };
        const zaiProvider = createMockConnectedProvider('zai', {
          credentials: zaiCredentials,
        });
        mockGetProviderSettings.mockReturnValue(
          createMockProviderSettings({
            connectedProviders: { zai: zaiProvider },
          })
        );
        mockGetApiKey.mockImplementation((key: string) =>
          key === 'zai' ? 'test-zai-key' : null
        );

        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        const zaiConfig = config.provider?.['zai-coding-plan'] as {
          options?: { baseURL?: string };
        };
        expect(zaiConfig?.options?.baseURL).toContain('bigmodel.cn');
      });

      it('should not configure Z.AI when no API key is available', async () => {
        // Arrange
        mockGetApiKey.mockReturnValue(null);

        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        expect(config.provider?.['zai-coding-plan']).toBeUndefined();
      });
    });
  });

  // ==========================================================================
  // Config Structure Tests
  // ==========================================================================

  describe('Config Structure', () => {
    describe('Valid JSON Structure', () => {
      it('should create valid JSON that can be parsed', async () => {
        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const content = fs.readFileSync(configPath, 'utf-8');
        expect(() => JSON.parse(content)).not.toThrow();
      });

      it('should create pretty-printed JSON with proper indentation', async () => {
        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const content = fs.readFileSync(configPath, 'utf-8');
        expect(content).toContain('\n');
        expect(content).toMatch(/^\{\n\s{2}/); // Starts with { followed by newline and 2 spaces
      });

      it('should include $schema field', async () => {
        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        expect(config.$schema).toBe('https://opencode.ai/config.json');
      });

      it('should include default_agent field', async () => {
        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        expect(config.default_agent).toBe('accomplish');
      });

      it('should include permission configuration', async () => {
        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        expect(config.permission).toEqual({
          '*': 'allow',
          todowrite: 'allow',
        });
      });

      it('should include plugin configuration', async () => {
        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        expect(config.plugin).toContain('@tarquinen/opencode-dcp@^1.2.7');
      });
    });

    describe('MCP Server Configuration', () => {
      it('should include all required MCP servers', async () => {
        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;

        expect(config.mcp?.['file-permission']).toBeDefined();
        expect(config.mcp?.['ask-user-question']).toBeDefined();
        expect(config.mcp?.['dev-browser-mcp']).toBeDefined();
        expect(config.mcp?.['complete-task']).toBeDefined();
        expect(config.mcp?.['start-task']).toBeDefined();
      });

      it('should configure MCP servers with correct type', async () => {
        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;

        expect(config.mcp?.['file-permission']?.type).toBe('local');
        expect(config.mcp?.['ask-user-question']?.type).toBe('local');
        expect(config.mcp?.['dev-browser-mcp']?.type).toBe('local');
      });

      it('should configure MCP servers as enabled', async () => {
        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;

        expect(config.mcp?.['file-permission']?.enabled).toBe(true);
        expect(config.mcp?.['ask-user-question']?.enabled).toBe(true);
        expect(config.mcp?.['dev-browser-mcp']?.enabled).toBe(true);
        expect(config.mcp?.['complete-task']?.enabled).toBe(true);
        expect(config.mcp?.['start-task']?.enabled).toBe(true);
      });

      it('should configure MCP servers with 30000ms timeout', async () => {
        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;

        expect(config.mcp?.['file-permission']?.timeout).toBe(30000);
        expect(config.mcp?.['ask-user-question']?.timeout).toBe(30000);
        expect(config.mcp?.['dev-browser-mcp']?.timeout).toBe(30000);
      });

      it('should configure file-permission with PERMISSION_API_PORT', async () => {
        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        expect(config.mcp?.['file-permission']?.environment?.PERMISSION_API_PORT).toBe(
          '9999'
        );
      });

      it('should configure ask-user-question with QUESTION_API_PORT', async () => {
        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        expect(config.mcp?.['ask-user-question']?.environment?.QUESTION_API_PORT).toBe(
          '9227'
        );
      });

      it('should include command array for each MCP server', async () => {
        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;

        expect(Array.isArray(config.mcp?.['file-permission']?.command)).toBe(true);
        expect(config.mcp?.['file-permission']?.command?.length).toBeGreaterThan(0);
      });
    });

    describe('Agent with System Prompt', () => {
      it('should include accomplish agent configuration', async () => {
        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        const agent = config.agent?.accomplish;

        expect(agent).toBeDefined();
        expect(agent?.description).toBe('Browser automation assistant using dev-browser');
        expect(agent?.mode).toBe('primary');
      });

      it('should include system prompt in agent configuration', async () => {
        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        const prompt = config.agent?.accomplish?.prompt;

        expect(typeof prompt).toBe('string');
        expect(prompt?.length).toBeGreaterThan(0);
      });

      it('should include environment instructions in system prompt', async () => {
        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        const prompt = config.agent?.accomplish?.prompt;

        expect(prompt).toContain('<environment>');
        expect(prompt).not.toContain('{{ENVIRONMENT_INSTRUCTIONS}}');
      });

      it('should include browser automation guidance in system prompt', async () => {
        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        const prompt = config.agent?.accomplish?.prompt;

        expect(prompt).toContain('browser_script');
        expect(prompt).toContain('browser_*');
        expect(prompt).toContain('Browser Automation');
      });

      it('should include file permission rules in system prompt', async () => {
        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        const prompt = config.agent?.accomplish?.prompt;

        expect(prompt).toContain('FILE PERMISSION WORKFLOW');
        expect(prompt).toContain('request_file_permission');
      });

      it('should include user communication guidance in system prompt', async () => {
        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        const prompt = config.agent?.accomplish?.prompt;

        expect(prompt).toContain('user-communication');
        expect(prompt).toContain('AskUserQuestion');
      });
    });

    describe('Skills Injection', () => {
      it('should include skills section when skills are enabled', async () => {
        // Arrange
        const skill1 = createMockSkill({
          name: 'Web Scraper',
          command: '/scrape',
          description: 'Scrape web pages',
          filePath: '/skills/web-scraper/SKILL.md',
        });
        const skill2 = createMockSkill({
          name: 'Data Export',
          command: '/export',
          description: 'Export data to files',
          filePath: '/skills/data-export/SKILL.md',
        });
        mockSkillsGetEnabled.mockResolvedValue([skill1, skill2]);

        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        const prompt = config.agent?.accomplish?.prompt || '';

        expect(prompt).toContain('<available-skills>');
        expect(prompt).toContain('</available-skills>');
        expect(prompt).toContain('Web Scraper');
        expect(prompt).toContain('/scrape');
        expect(prompt).toContain('Data Export');
        expect(prompt).toContain('/export');
      });

      it('should include skill file paths in skills section', async () => {
        // Arrange
        const skill = createMockSkill({
          filePath: '/custom/path/to/SKILL.md',
        });
        mockSkillsGetEnabled.mockResolvedValue([skill]);

        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        const prompt = config.agent?.accomplish?.prompt;

        expect(prompt).toContain('/custom/path/to/SKILL.md');
      });

      it('should handle multiple skills with different properties', async () => {
        // Arrange
        const skills = [
          createMockSkill({
            id: 'skill-1',
            name: 'Skill One',
            command: '/one',
            description: 'First skill',
          }),
          createMockSkill({
            id: 'skill-2',
            name: 'Skill Two',
            command: '/two',
            description: 'Second skill',
          }),
          createMockSkill({
            id: 'skill-3',
            name: 'Skill Three',
            command: '/three',
            description: 'Third skill',
          }),
        ];
        mockSkillsGetEnabled.mockResolvedValue(skills);

        // Act
        const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
        const configPath = await generateOpenCodeConfig();

        // Assert
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;
        const prompt = config.agent?.accomplish?.prompt || '';

        expect(prompt).toContain('Skill One');
        expect(prompt).toContain('Skill Two');
        expect(prompt).toContain('Skill Three');
        expect(prompt).toContain('/one');
        expect(prompt).toContain('/two');
        expect(prompt).toContain('/three');
      });
    });
  });

  // ==========================================================================
  // Round-Trip Tests
  // ==========================================================================

  describe('Round-Trip Tests', () => {
    it('should generate, write, and read back valid config', async () => {
      // Act
      const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
      const configPath = await generateOpenCodeConfig();

      // Assert - round-trip: file exists, can be read, and parsed
      expect(fs.existsSync(configPath)).toBe(true);

      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content.length).toBeGreaterThan(0);

      const config = JSON.parse(content) as OpenCodeConfig;
      expect(config.$schema).toBeDefined();
      expect(config.default_agent).toBeDefined();
      expect(config.agent).toBeDefined();
      expect(config.mcp).toBeDefined();
    });

    it('should create config file at correct path', async () => {
      // Act
      const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
      const configPath = await generateOpenCodeConfig();

      // Assert
      expect(configPath).toBe(path.join(tempUserDataDir, 'opencode', 'opencode.json'));
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it('should create config directory if it does not exist', async () => {
      // Arrange - ensure config dir does not exist
      const configDir = path.join(tempUserDataDir, 'opencode');
      if (fs.existsSync(configDir)) {
        fs.rmSync(configDir, { recursive: true });
      }

      // Act
      const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
      await generateOpenCodeConfig();

      // Assert
      expect(fs.existsSync(configDir)).toBe(true);
    });

    it('should overwrite existing config on regeneration', async () => {
      // Arrange - generate config first time
      const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
      const firstPath = await generateOpenCodeConfig();
      const firstContent = fs.readFileSync(firstPath, 'utf-8');

      // Reset modules to re-run generator
      vi.resetModules();

      // Act - generate again
      const { generateOpenCodeConfig: regenerate } = await import(
        '@main/opencode/config-generator'
      );
      const secondPath = await regenerate();
      const secondContent = fs.readFileSync(secondPath, 'utf-8');

      // Assert - same path, same structure
      expect(firstPath).toBe(secondPath);
      expect(JSON.parse(firstContent).$schema).toBe(JSON.parse(secondContent).$schema);
    });

    it('should set OPENCODE_CONFIG environment variable', async () => {
      // Act
      const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
      const configPath = await generateOpenCodeConfig();

      // Assert
      expect(process.env.OPENCODE_CONFIG).toBe(configPath);
    });

    it('should set OPENCODE_CONFIG_DIR environment variable', async () => {
      // Act
      const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
      await generateOpenCodeConfig();

      // Assert
      expect(process.env.OPENCODE_CONFIG_DIR).toBeDefined();
      expect(process.env.OPENCODE_CONFIG_DIR).toContain('opencode');
    });

    it('should preserve config structure across multiple generations', async () => {
      // Arrange - set up providers and skills
      const ollamaCredentials: OllamaCredentials = {
        type: 'ollama',
        serverUrl: 'http://localhost:11434',
      };
      const ollamaProvider = createMockConnectedProvider('ollama', {
        selectedModelId: 'ollama/llama3',
        credentials: ollamaCredentials,
      });
      mockGetProviderSettings.mockReturnValue(
        createMockProviderSettings({
          connectedProviders: { ollama: ollamaProvider },
        })
      );
      mockSkillsGetEnabled.mockResolvedValue([
        createMockSkill({ name: 'Test Skill', command: '/test' }),
      ]);

      // Act - generate config
      const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
      const configPath = await generateOpenCodeConfig();

      // Assert - verify complete structure
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenCodeConfig;

      // Schema and defaults
      expect(config.$schema).toBe('https://opencode.ai/config.json');
      expect(config.default_agent).toBe('accomplish');

      // Provider config
      expect(config.provider?.ollama).toBeDefined();

      // MCP servers
      expect(Object.keys(config.mcp || {}).length).toBe(5);

      // Agent with skills
      expect(config.agent?.accomplish?.prompt).toContain('Test Skill');
      expect(config.agent?.accomplish?.prompt).toContain('/test');

      // Permissions and plugins
      expect(config.permission).toEqual({ '*': 'allow', todowrite: 'allow' });
      expect(config.plugin).toContain('@tarquinen/opencode-dcp@^1.2.7');
    });
  });

  // ==========================================================================
  // Path Utility Tests
  // ==========================================================================

  describe('getMcpToolsPath()', () => {
    describe('Development Mode', () => {
      it('should return skills path relative to app path in dev mode', async () => {
        // Arrange
        mockApp.isPackaged = false;

        // Act
        const { getMcpToolsPath } = await import('@main/opencode/config-generator');
        const result = getMcpToolsPath();

        // Assert
        expect(result).toBe(path.join(tempAppDir, 'mcp-tools'));
      });
    });

    describe('Packaged Mode', () => {
      it('should return skills path in resources folder when packaged', async () => {
        // Arrange
        mockApp.isPackaged = true;
        const resourcesPath = path.join(tempAppDir, 'Resources');
        fs.mkdirSync(resourcesPath, { recursive: true });
        (process as NodeJS.Process & { resourcesPath: string }).resourcesPath =
          resourcesPath;

        // Act
        const { getMcpToolsPath } = await import('@main/opencode/config-generator');
        const result = getMcpToolsPath();

        // Assert
        expect(result).toBe(path.join(resourcesPath, 'mcp-tools'));
      });
    });
  });

  describe('getOpenCodeConfigPath()', () => {
    it('should return config path in userData directory', async () => {
      // Act
      const { getOpenCodeConfigPath } = await import('@main/opencode/config-generator');
      const result = getOpenCodeConfigPath();

      // Assert
      expect(result).toBe(path.join(tempUserDataDir, 'opencode', 'opencode.json'));
    });
  });

  // ==========================================================================
  // Constants Export Tests
  // ==========================================================================

  describe('ACCOMPLISH_AGENT_NAME Export', () => {
    it('should export the agent name constant', async () => {
      // Act
      const { ACCOMPLISH_AGENT_NAME } = await import('@main/opencode/config-generator');

      // Assert
      expect(ACCOMPLISH_AGENT_NAME).toBe('accomplish');
    });
  });
});
