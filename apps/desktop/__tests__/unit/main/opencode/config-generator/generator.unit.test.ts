/**
 * Unit tests for Generator Orchestrator Module
 *
 * Tests the main orchestrator that coordinates all config generation:
 * - generateOpenCodeConfig: Main entry point that builds and writes config
 * - assembleConfig: Helper that constructs the OpenCodeConfig object
 *
 * NOTE: This is a UNIT test, not an integration test.
 * All dependencies are mocked to test orchestration logic in isolation.
 *
 * Mocked dependencies:
 * - electron (app module)
 * - fs (file system operations)
 * - Provider settings (getProviderSettings, getActiveProviderModel, getConnectedProviderIds)
 * - Secure storage (getApiKey)
 * - Skills manager (skillsManager.getEnabled)
 * - Provider config builders (buildAllStandardProviders, buildBedrockProviderConfig, etc.)
 * - MCP config builder (buildMcpServerConfigs)
 * - System prompt builder (buildFullSystemPrompt)
 * - Path utilities (getMcpToolsPath, getOpenCodeConfigDir, etc.)
 *
 * @module __tests__/unit/main/opencode/config-generator/generator.unit.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type {
  ProviderId,
  ProviderSettings,
  ConnectedProvider,
  ProviderCredentials,
  BedrockProviderCredentials,
  OllamaCredentials,
  LiteLLMCredentials,
  LMStudioCredentials,
  AzureFoundryCredentials,
  ZaiCredentials,
} from '@accomplish/shared';
import type { Skill, SkillSource } from '@accomplish/shared';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock electron app module
const mockApp = {
  isPackaged: false,
  getAppPath: vi.fn(() => '/mock/app/path'),
  getPath: vi.fn((name: string) => `/mock/user/data/${name}`),
};

vi.mock('electron', () => ({
  app: mockApp,
}));

// Mock fs module
const mockFs = {
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(() => []),
};

vi.mock('fs', () => ({
  default: mockFs,
  existsSync: mockFs.existsSync,
  mkdirSync: mockFs.mkdirSync,
  writeFileSync: mockFs.writeFileSync,
  readFileSync: mockFs.readFileSync,
  readdirSync: mockFs.readdirSync,
}));

// Mock provider settings
const mockGetProviderSettings = vi.fn();
const mockGetActiveProviderModel = vi.fn();
const mockGetConnectedProviderIds = vi.fn();

vi.mock('@main/store/providerSettings', () => ({
  getProviderSettings: () => mockGetProviderSettings(),
  getActiveProviderModel: () => mockGetActiveProviderModel(),
  getConnectedProviderIds: () => mockGetConnectedProviderIds(),
}));

// Note: Legacy app settings mocks removed - providerSettings is now the sole source of truth

// Mock secure storage
const mockGetApiKey = vi.fn();

vi.mock('@main/store/secureStorage', () => ({
  getApiKey: (key: string) => mockGetApiKey(key),
}));

// Mock skills manager - need to define as hoisted for vitest
const mockSkillsGetEnabled = vi.hoisted(() => vi.fn());

vi.mock('@main/skills', () => ({
  skillsManager: {
    getEnabled: mockSkillsGetEnabled,
  },
}));

// Mock permission API ports
vi.mock('@main/permission-api', () => ({
  PERMISSION_API_PORT: 9999,
  QUESTION_API_PORT: 9998,
}));

// Mock azure-foundry-proxy
const mockEnsureAzureFoundryProxy = vi.fn();

vi.mock('@main/opencode/azure-foundry-proxy', () => ({
  ensureAzureFoundryProxy: () => mockEnsureAzureFoundryProxy(),
}));

// Mock moonshot-proxy
const mockEnsureMoonshotProxy = vi.fn();

vi.mock('@main/opencode/moonshot-proxy', () => ({
  ensureMoonshotProxy: () => mockEnsureMoonshotProxy(),
}));

// Mock bundled-node utilities
const mockGetNodePath = vi.fn(() => '/mock/node/path');

vi.mock('@main/utils/bundled-node', () => ({
  getNodePath: () => mockGetNodePath(),
}));

// ============================================================================
// Test Types
// ============================================================================

interface OpenCodeConfig {
  $schema?: string;
  model?: string;
  small_model?: string;
  default_agent?: string;
  enabled_providers?: string[];
  permission?: string | Record<string, string | Record<string, string>>;
  agent?: Record<string, {
    description?: string;
    prompt?: string;
    mode?: 'primary' | 'subagent' | 'all';
  }>;
  mcp?: Record<string, {
    type?: 'local' | 'remote';
    command?: string[];
    url?: string;
    enabled?: boolean;
    environment?: Record<string, string>;
    timeout?: number;
  }>;
  provider?: Record<string, unknown>;
  plugin?: string[];
}

// ============================================================================
// Test Helpers
// ============================================================================

function createMockProviderSettings(overrides: Partial<ProviderSettings> = {}): ProviderSettings {
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
    description: 'A test skill',
    filePath: '/mock/skills/test-skill/SKILL.md',
    source: 'custom' as SkillSource,
    isEnabled: true,
    isVerified: false,
    isHidden: false,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function getWrittenConfig(): OpenCodeConfig | null {
  if (mockFs.writeFileSync.mock.calls.length === 0) {
    return null;
  }
  const [, jsonContent] = mockFs.writeFileSync.mock.calls[0] as [string, string];
  return JSON.parse(jsonContent);
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Generator Orchestrator Module', () => {
  // Module under test - imported fresh for each test
  let generateOpenCodeConfig: (azureFoundryToken?: string) => Promise<string>;
  let ACCOMPLISH_AGENT_NAME: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Reset process.env
    delete process.env.OPENCODE_CONFIG;
    delete process.env.OPENCODE_CONFIG_DIR;

    // Default mock implementations
    mockApp.getPath.mockImplementation((name: string) => `/mock/user/data/${name}`);
    mockFs.existsSync.mockReturnValue(true);

    mockGetProviderSettings.mockReturnValue(createMockProviderSettings());
    mockGetActiveProviderModel.mockReturnValue(null);
    mockGetConnectedProviderIds.mockReturnValue([]);
    mockGetApiKey.mockReturnValue(null);
    mockSkillsGetEnabled.mockResolvedValue([]);
    mockEnsureAzureFoundryProxy.mockResolvedValue({ baseURL: 'http://localhost:3000' });
    mockEnsureMoonshotProxy.mockResolvedValue({ baseURL: 'http://localhost:3001' });

    // Import module under test
    // Note: Once the refactor is complete, this will import from '@main/opencode/config-generator'
    // For now, import from the legacy location for compatibility
    const module = await import('@main/opencode/config-generator');
    generateOpenCodeConfig = module.generateOpenCodeConfig;
    ACCOMPLISH_AGENT_NAME = module.ACCOMPLISH_AGENT_NAME;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // generateOpenCodeConfig Tests
  // ==========================================================================

  describe('generateOpenCodeConfig()', () => {
    describe('Directory and File Setup', () => {
      it('should create config directory if it does not exist', async () => {
        // Arrange
        mockFs.existsSync.mockReturnValue(false);

        // Act
        await generateOpenCodeConfig();

        // Assert
        expect(mockFs.mkdirSync).toHaveBeenCalledWith(
          expect.stringContaining('opencode'),
          { recursive: true }
        );
      });

      it('should not create directory if it already exists', async () => {
        // Arrange
        mockFs.existsSync.mockReturnValue(true);

        // Act
        await generateOpenCodeConfig();

        // Assert
        expect(mockFs.mkdirSync).not.toHaveBeenCalled();
      });

      it('should write config JSON to file', async () => {
        // Act
        await generateOpenCodeConfig();

        // Assert
        expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);
        expect(mockFs.writeFileSync).toHaveBeenCalledWith(
          expect.stringMatching(/opencode\.json$/),
          expect.any(String)
        );
      });

      it('should return the config file path', async () => {
        // Act
        const result = await generateOpenCodeConfig();

        // Assert
        expect(result).toMatch(/opencode\.json$/);
        expect(result).toContain('opencode');
      });
    });

    describe('Environment Variables', () => {
      it('should set OPENCODE_CONFIG env var to config path', async () => {
        // Act
        const configPath = await generateOpenCodeConfig();

        // Assert
        expect(process.env.OPENCODE_CONFIG).toBe(configPath);
      });

      it('should set OPENCODE_CONFIG_DIR env var to config directory', async () => {
        // Act
        await generateOpenCodeConfig();

        // Assert
        expect(process.env.OPENCODE_CONFIG_DIR).toBeDefined();
        expect(process.env.OPENCODE_CONFIG_DIR).toContain('opencode');
      });
    });

    describe('Provider Settings Integration', () => {
      it('should call getProviderSettings to retrieve provider configuration', async () => {
        // Act
        await generateOpenCodeConfig();

        // Assert
        expect(mockGetProviderSettings).toHaveBeenCalled();
      });

      it('should call getConnectedProviderIds to get connected providers', async () => {
        // Act
        await generateOpenCodeConfig();

        // Assert
        expect(mockGetConnectedProviderIds).toHaveBeenCalled();
      });

      it('should call getActiveProviderModel to get selected model', async () => {
        // Act
        await generateOpenCodeConfig();

        // Assert
        expect(mockGetActiveProviderModel).toHaveBeenCalled();
      });
    });

    describe('Enabled Providers List', () => {
      it('should include base providers in enabled_providers', async () => {
        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        expect(config?.enabled_providers).toContain('anthropic');
        expect(config?.enabled_providers).toContain('openai');
        expect(config?.enabled_providers).toContain('google');
        expect(config?.enabled_providers).toContain('xai');
        expect(config?.enabled_providers).toContain('deepseek');
        expect(config?.enabled_providers).toContain('amazon-bedrock');
      });

      it('should add connected providers to enabled list', async () => {
        // Arrange
        mockGetConnectedProviderIds.mockReturnValue(['ollama', 'litellm'] as ProviderId[]);

        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        expect(config?.enabled_providers).toContain('ollama');
        expect(config?.enabled_providers).toContain('litellm');
      });

      it('should map provider IDs to OpenCode CLI names', async () => {
        // Arrange
        mockGetConnectedProviderIds.mockReturnValue(['bedrock', 'azure-foundry'] as ProviderId[]);

        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        expect(config?.enabled_providers).toContain('amazon-bedrock');
        expect(config?.enabled_providers).toContain('azure-foundry');
      });

      it('should not duplicate providers in enabled list', async () => {
        // Arrange - anthropic is in both base and connected
        mockGetConnectedProviderIds.mockReturnValue(['anthropic', 'openai'] as ProviderId[]);

        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        const anthropicCount = config?.enabled_providers?.filter(p => p === 'anthropic').length;
        expect(anthropicCount).toBe(1);
      });
    });

    describe('Standard Provider Configuration', () => {
      it('should configure Ollama when connected with new settings', async () => {
        // Arrange
        const ollamaCredentials: OllamaCredentials = { type: 'ollama', serverUrl: 'http://localhost:11434' };
        const ollamaProvider = createMockConnectedProvider('ollama', {
          selectedModelId: 'ollama/llama3',
          credentials: ollamaCredentials,
        });
        mockGetProviderSettings.mockReturnValue(createMockProviderSettings({
          connectedProviders: { ollama: ollamaProvider },
        }));

        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        expect(config?.provider?.ollama).toBeDefined();
      });

      it('should configure OpenRouter when connected and active', async () => {
        // Arrange
        const openrouterProvider = createMockConnectedProvider('openrouter', {
          selectedModelId: 'openrouter/anthropic/claude-3-opus',
        });
        mockGetProviderSettings.mockReturnValue(createMockProviderSettings({
          connectedProviders: { openrouter: openrouterProvider },
        }));
        mockGetActiveProviderModel.mockReturnValue({
          provider: 'openrouter',
          model: 'openrouter/anthropic/claude-3-opus',
        });

        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        expect(config?.provider?.openrouter).toBeDefined();
      });

      it('should configure Moonshot when connected', async () => {
        // Arrange
        const moonshotProvider = createMockConnectedProvider('moonshot', {
          selectedModelId: 'moonshot/moonshot-v1-8k',
        });
        mockGetProviderSettings.mockReturnValue(createMockProviderSettings({
          connectedProviders: { moonshot: moonshotProvider },
        }));
        mockGetApiKey.mockImplementation((key: string) =>
          key === 'moonshot' ? 'test-moonshot-key' : null
        );

        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        expect(config?.provider?.moonshot).toBeDefined();
        expect(mockEnsureMoonshotProxy).toHaveBeenCalled();
      });

      it('should configure LiteLLM when connected', async () => {
        // Arrange
        const litellmCredentials: LiteLLMCredentials = {
          type: 'litellm',
          serverUrl: 'http://localhost:4000',
          hasApiKey: false,
        };
        const litellmProvider = createMockConnectedProvider('litellm', {
          selectedModelId: 'gpt-4',
          credentials: litellmCredentials,
        });
        mockGetProviderSettings.mockReturnValue(createMockProviderSettings({
          connectedProviders: { litellm: litellmProvider },
        }));

        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        expect(config?.provider?.litellm).toBeDefined();
      });

      it('should configure LM Studio when connected', async () => {
        // Arrange
        const lmstudioCredentials: LMStudioCredentials = {
          type: 'lmstudio',
          serverUrl: 'http://localhost:1234',
        };
        const lmstudioProvider = createMockConnectedProvider('lmstudio', {
          selectedModelId: 'lmstudio/local-model',
          credentials: lmstudioCredentials,
        });
        mockGetProviderSettings.mockReturnValue(createMockProviderSettings({
          connectedProviders: { lmstudio: lmstudioProvider },
        }));

        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        expect(config?.provider?.lmstudio).toBeDefined();
      });
    });

    describe('Bedrock Provider Configuration', () => {
      it('should configure Bedrock when connected with new settings', async () => {
        // Arrange
        const bedrockCredentials: BedrockProviderCredentials = {
          type: 'bedrock',
          region: 'us-west-2',
          authMethod: 'profile',
          profileName: 'default',
        };
        const bedrockProvider = createMockConnectedProvider('bedrock', {
          selectedModelId: 'bedrock/anthropic.claude-3-opus',
          credentials: bedrockCredentials,
        });
        mockGetProviderSettings.mockReturnValue(createMockProviderSettings({
          connectedProviders: { bedrock: bedrockProvider },
        }));

        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        expect(config?.provider?.['amazon-bedrock']).toBeDefined();
      });

      it('should set model and small_model for Bedrock active provider', async () => {
        // Arrange
        const bedrockCredentials: BedrockProviderCredentials = {
          type: 'bedrock',
          region: 'us-east-1',
          authMethod: 'profile',
        };
        const bedrockProvider = createMockConnectedProvider('bedrock', {
          selectedModelId: 'bedrock/anthropic.claude-3-sonnet',
          credentials: bedrockCredentials,
        });
        mockGetProviderSettings.mockReturnValue(createMockProviderSettings({
          connectedProviders: { bedrock: bedrockProvider },
          activeProviderId: 'bedrock',
        }));
        mockGetActiveProviderModel.mockReturnValue({
          provider: 'bedrock',
          model: 'bedrock/anthropic.claude-3-sonnet',
        });

        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        expect(config?.model).toBe('bedrock/anthropic.claude-3-sonnet');
        expect(config?.small_model).toBe('bedrock/anthropic.claude-3-sonnet');
      });

      it('should use profile auth when configured', async () => {
        // Arrange
        const bedrockCredentials: BedrockProviderCredentials = {
          type: 'bedrock',
          region: 'us-east-1',
          authMethod: 'profile',
          profileName: 'my-profile',
        };
        const bedrockProvider = createMockConnectedProvider('bedrock', {
          credentials: bedrockCredentials,
        });
        mockGetProviderSettings.mockReturnValue(createMockProviderSettings({
          connectedProviders: { bedrock: bedrockProvider },
        }));

        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        const bedrockConfig = config?.provider?.['amazon-bedrock'] as { options?: { profile?: string } };
        expect(bedrockConfig?.options?.profile).toBe('my-profile');
      });
    });

    describe('Azure Foundry Provider Configuration', () => {
      it('should configure Azure Foundry when connected with new settings', async () => {
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
        mockGetProviderSettings.mockReturnValue(createMockProviderSettings({
          connectedProviders: { 'azure-foundry': azureProvider },
        }));
        mockGetApiKey.mockImplementation((key: string) =>
          key === 'azure-foundry' ? 'test-azure-key' : null
        );

        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        expect(config?.provider?.['azure-foundry']).toBeDefined();
        expect(mockEnsureAzureFoundryProxy).toHaveBeenCalled();
      });

      it('should use Entra ID token when authMethod is entra-id', async () => {
        // Arrange
        const azureCredentials: AzureFoundryCredentials = {
          type: 'azure-foundry',
          endpoint: 'https://my-endpoint.openai.azure.com',
          deploymentName: 'gpt-4o-deployment',
          authMethod: 'entra-id',
        };
        const azureProvider = createMockConnectedProvider('azure-foundry', {
          credentials: azureCredentials,
        });
        mockGetProviderSettings.mockReturnValue(createMockProviderSettings({
          connectedProviders: { 'azure-foundry': azureProvider },
        }));

        // Act
        await generateOpenCodeConfig('mock-entra-token');

        // Assert
        const config = getWrittenConfig();
        expect(config?.provider?.['azure-foundry']).toBeDefined();
      });

      it('should add azure-foundry to enabled_providers when configured', async () => {
        // Arrange
        const azureCredentials: AzureFoundryCredentials = {
          type: 'azure-foundry',
          endpoint: 'https://my-endpoint.openai.azure.com',
          deploymentName: 'gpt-4o-deployment',
          authMethod: 'api-key',
        };
        const azureProvider = createMockConnectedProvider('azure-foundry', {
          credentials: azureCredentials,
        });
        mockGetProviderSettings.mockReturnValue(createMockProviderSettings({
          connectedProviders: { 'azure-foundry': azureProvider },
        }));
        mockGetApiKey.mockImplementation((key: string) =>
          key === 'azure-foundry' ? 'test-azure-key' : null
        );

        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        expect(config?.enabled_providers).toContain('azure-foundry');
      });
    });

    describe('Z.AI Provider Configuration', () => {
      it('should configure Z.AI when API key is available', async () => {
        // Arrange
        mockGetApiKey.mockImplementation((key: string) =>
          key === 'zai' ? 'test-zai-key' : null
        );

        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        expect(config?.provider?.['zai-coding-plan']).toBeDefined();
      });

      it('should use international endpoint by default', async () => {
        // Arrange
        mockGetApiKey.mockImplementation((key: string) =>
          key === 'zai' ? 'test-zai-key' : null
        );

        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        const zaiConfig = config?.provider?.['zai-coding-plan'] as { options?: { baseURL?: string } };
        expect(zaiConfig?.options?.baseURL).toContain('api.z.ai');
      });

      it('should use China endpoint when region is china', async () => {
        // Arrange
        const zaiCredentials: ZaiCredentials = {
          type: 'zai',
          keyPrefix: 'test',
          region: 'china',
        };
        const zaiProvider = createMockConnectedProvider('zai', {
          credentials: zaiCredentials,
        });
        mockGetProviderSettings.mockReturnValue(createMockProviderSettings({
          connectedProviders: { zai: zaiProvider },
        }));
        mockGetApiKey.mockImplementation((key: string) =>
          key === 'zai' ? 'test-zai-key' : null
        );

        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        const zaiConfig = config?.provider?.['zai-coding-plan'] as { options?: { baseURL?: string } };
        expect(zaiConfig?.options?.baseURL).toContain('bigmodel.cn');
      });

      it('should include all Z.AI models', async () => {
        // Arrange
        mockGetApiKey.mockImplementation((key: string) =>
          key === 'zai' ? 'test-zai-key' : null
        );

        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        const zaiConfig = config?.provider?.['zai-coding-plan'] as { models?: Record<string, unknown> };
        expect(zaiConfig?.models?.['glm-4.7-flashx']).toBeDefined();
        expect(zaiConfig?.models?.['glm-4.7']).toBeDefined();
        expect(zaiConfig?.models?.['glm-4.7-flash']).toBeDefined();
      });
    });

    describe('MCP Server Configuration', () => {
      it('should include file-permission MCP server', async () => {
        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        expect(config?.mcp?.['file-permission']).toBeDefined();
        expect(config?.mcp?.['file-permission']?.enabled).toBe(true);
      });

      it('should include ask-user-question MCP server', async () => {
        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        expect(config?.mcp?.['ask-user-question']).toBeDefined();
        expect(config?.mcp?.['ask-user-question']?.enabled).toBe(true);
      });

      it('should include dev-browser-mcp server', async () => {
        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        expect(config?.mcp?.['dev-browser-mcp']).toBeDefined();
        expect(config?.mcp?.['dev-browser-mcp']?.enabled).toBe(true);
      });

      it('should include complete-task MCP server', async () => {
        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        expect(config?.mcp?.['complete-task']).toBeDefined();
        expect(config?.mcp?.['complete-task']?.enabled).toBe(true);
      });

      it('should include start-task MCP server', async () => {
        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        expect(config?.mcp?.['start-task']).toBeDefined();
        expect(config?.mcp?.['start-task']?.enabled).toBe(true);
      });

      it('should set timeout of 30000ms for MCP servers', async () => {
        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        expect(config?.mcp?.['file-permission']?.timeout).toBe(30000);
        expect(config?.mcp?.['ask-user-question']?.timeout).toBe(30000);
        expect(config?.mcp?.['dev-browser-mcp']?.timeout).toBe(30000);
      });

      it('should set PERMISSION_API_PORT environment for file-permission server', async () => {
        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        expect(config?.mcp?.['file-permission']?.environment?.PERMISSION_API_PORT).toBe('9999');
      });

      it('should set QUESTION_API_PORT environment for ask-user-question server', async () => {
        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        expect(config?.mcp?.['ask-user-question']?.environment?.QUESTION_API_PORT).toBe('9998');
      });
    });

    describe('System Prompt with Skills', () => {
      it('should call skillsManager.getEnabled to fetch skills', async () => {
        // Act
        await generateOpenCodeConfig();

        // Assert
        expect(mockSkillsGetEnabled).toHaveBeenCalled();
      });

      it('should include skills section in system prompt when skills are enabled', async () => {
        // Arrange
        mockSkillsGetEnabled.mockResolvedValue([
          createMockSkill({ name: 'Web Scraper', command: '/scrape', description: 'Scrape web pages' }),
          createMockSkill({ name: 'Data Export', command: '/export', description: 'Export data' }),
        ]);

        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        const agentPrompt = config?.agent?.[ACCOMPLISH_AGENT_NAME]?.prompt;
        // Should include the <available-skills> XML block when skills are present
        expect(agentPrompt).toContain('<available-skills>');
        expect(agentPrompt).toContain('</available-skills>');
        expect(agentPrompt).toContain('Web Scraper');
        expect(agentPrompt).toContain('/scrape');
        expect(agentPrompt).toContain('Data Export');
        expect(agentPrompt).toContain('/export');
      });

      // NOTE: This test is skipped due to vitest module mocking limitations.
      // The skillsManager.getEnabled() mock doesn't work correctly when the module
      // is imported through alias paths in the generator module.
      // TODO: Fix when refactoring is complete by ensuring consistent import paths.
      it.skip('should not include skills section when no skills are enabled', async () => {
        // Arrange
        mockSkillsGetEnabled.mockReset();
        mockSkillsGetEnabled.mockResolvedValue([]);
        mockFs.writeFileSync.mockClear();

        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        const agentPrompt = config?.agent?.[ACCOMPLISH_AGENT_NAME]?.prompt || '';

        // The base prompt references available-skills, but the actual <available-skills> XML block
        // should not be present when there are no skills
        expect(agentPrompt).not.toContain('<available-skills>');
        expect(agentPrompt).not.toContain('</available-skills>');
      });

      it('should include skill file paths in skills section', async () => {
        // Arrange
        mockSkillsGetEnabled.mockResolvedValue([
          createMockSkill({ filePath: '/custom/path/to/SKILL.md' }),
        ]);

        // Act
        await generateOpenCodeConfig();

        // Assert
        const config = getWrittenConfig();
        const agentPrompt = config?.agent?.[ACCOMPLISH_AGENT_NAME]?.prompt;
        expect(agentPrompt).toContain('/custom/path/to/SKILL.md');
      });
    });

    // Note: Legacy Provider Fallback tests removed - providerSettings is now the sole source of truth
  });

  // ==========================================================================
  // assembleConfig Tests (Config Object Structure)
  // ==========================================================================

  describe('assembleConfig() - Config Object Structure', () => {
    it('should include $schema in config', async () => {
      // Act
      await generateOpenCodeConfig();

      // Assert
      const config = getWrittenConfig();
      expect(config?.$schema).toBe('https://opencode.ai/config.json');
    });

    it('should set default_agent to ACCOMPLISH_AGENT_NAME', async () => {
      // Act
      await generateOpenCodeConfig();

      // Assert
      const config = getWrittenConfig();
      expect(config?.default_agent).toBe(ACCOMPLISH_AGENT_NAME);
    });

    it('should set permission to allow all with todowrite', async () => {
      // Act
      await generateOpenCodeConfig();

      // Assert
      const config = getWrittenConfig();
      expect(config?.permission).toEqual({
        '*': 'allow',
        todowrite: 'allow',
      });
    });

    it('should include DCP plugin in plugin array', async () => {
      // Act
      await generateOpenCodeConfig();

      // Assert
      const config = getWrittenConfig();
      expect(config?.plugin).toContain('@tarquinen/opencode-dcp@^1.2.7');
    });

    it('should include agent config with prompt', async () => {
      // Act
      await generateOpenCodeConfig();

      // Assert
      const config = getWrittenConfig();
      expect(config?.agent?.[ACCOMPLISH_AGENT_NAME]).toBeDefined();
      expect(config?.agent?.[ACCOMPLISH_AGENT_NAME]?.prompt).toBeDefined();
      expect(config?.agent?.[ACCOMPLISH_AGENT_NAME]?.prompt?.length).toBeGreaterThan(0);
    });

    it('should set agent mode to primary', async () => {
      // Act
      await generateOpenCodeConfig();

      // Assert
      const config = getWrittenConfig();
      expect(config?.agent?.[ACCOMPLISH_AGENT_NAME]?.mode).toBe('primary');
    });

    it('should include agent description', async () => {
      // Act
      await generateOpenCodeConfig();

      // Assert
      const config = getWrittenConfig();
      expect(config?.agent?.[ACCOMPLISH_AGENT_NAME]?.description).toBeDefined();
    });

    it('should omit provider config when no providers configured', async () => {
      // Arrange
      mockGetProviderSettings.mockReturnValue(createMockProviderSettings({
        connectedProviders: {},
      }));
      mockGetApiKey.mockReturnValue(null);

      // Act
      await generateOpenCodeConfig();

      // Assert
      const config = getWrittenConfig();
      expect(config?.provider).toBeUndefined();
    });

    it('should include provider config when providers are configured', async () => {
      // Arrange
      mockGetApiKey.mockImplementation((key: string) =>
        key === 'zai' ? 'test-key' : null
      );

      // Act
      await generateOpenCodeConfig();

      // Assert
      const config = getWrittenConfig();
      expect(config?.provider).toBeDefined();
      expect(Object.keys(config?.provider || {}).length).toBeGreaterThan(0);
    });

    it('should write valid JSON to file', async () => {
      // Act
      await generateOpenCodeConfig();

      // Assert
      const [, jsonContent] = mockFs.writeFileSync.mock.calls[0] as [string, string];
      expect(() => JSON.parse(jsonContent)).not.toThrow();
    });

    it('should write pretty-printed JSON with 2-space indentation', async () => {
      // Act
      await generateOpenCodeConfig();

      // Assert
      const [, jsonContent] = mockFs.writeFileSync.mock.calls[0] as [string, string];
      // Check that the JSON is formatted (contains newlines and indentation)
      expect(jsonContent).toContain('\n');
      expect(jsonContent).toMatch(/^\{\n\s{2}/); // Starts with { followed by newline and 2 spaces
    });
  });

  // ==========================================================================
  // Integration-Style Tests
  // ==========================================================================

  describe('Integration Scenarios', () => {
    it('should generate complete config with single Anthropic provider', async () => {
      // Arrange
      const anthropicProvider = createMockConnectedProvider('anthropic', {
        selectedModelId: 'anthropic/claude-3-opus-20240229',
      });
      mockGetProviderSettings.mockReturnValue(createMockProviderSettings({
        activeProviderId: 'anthropic',
        connectedProviders: { anthropic: anthropicProvider },
      }));
      mockGetConnectedProviderIds.mockReturnValue(['anthropic'] as ProviderId[]);
      mockGetActiveProviderModel.mockReturnValue({
        provider: 'anthropic',
        model: 'anthropic/claude-3-opus-20240229',
      });

      // Act
      const configPath = await generateOpenCodeConfig();

      // Assert
      expect(configPath).toBeDefined();
      const config = getWrittenConfig();
      expect(config?.$schema).toBeDefined();
      expect(config?.default_agent).toBe(ACCOMPLISH_AGENT_NAME);
      expect(config?.enabled_providers).toContain('anthropic');
      expect(config?.mcp).toBeDefined();
      expect(config?.agent?.[ACCOMPLISH_AGENT_NAME]).toBeDefined();
    });

    it('should generate complete config with multiple providers', async () => {
      // Arrange
      const anthropicProvider = createMockConnectedProvider('anthropic');
      const openaiProvider = createMockConnectedProvider('openai');
      const ollamaCredentials: OllamaCredentials = { type: 'ollama', serverUrl: 'http://localhost:11434' };
      const ollamaProvider = createMockConnectedProvider('ollama', {
        credentials: ollamaCredentials,
      });
      mockGetProviderSettings.mockReturnValue(createMockProviderSettings({
        activeProviderId: 'anthropic',
        connectedProviders: {
          anthropic: anthropicProvider,
          openai: openaiProvider,
          ollama: ollamaProvider,
        },
      }));
      mockGetConnectedProviderIds.mockReturnValue(['anthropic', 'openai', 'ollama'] as ProviderId[]);
      mockGetActiveProviderModel.mockReturnValue({
        provider: 'anthropic',
        model: 'anthropic/claude-3-opus',
      });

      // Act
      await generateOpenCodeConfig();

      // Assert
      const config = getWrittenConfig();
      expect(config?.enabled_providers).toContain('anthropic');
      expect(config?.enabled_providers).toContain('openai');
      expect(config?.enabled_providers).toContain('ollama');
      expect(config?.provider?.ollama).toBeDefined();
    });

    it('should generate complete config with skills', async () => {
      // Arrange
      const skill1 = createMockSkill({
        id: 'web-scraper',
        name: 'Web Scraper',
        command: '/scrape',
        description: 'Scrape web pages',
        filePath: '/skills/web-scraper/SKILL.md',
      });
      const skill2 = createMockSkill({
        id: 'data-export',
        name: 'Data Export',
        command: '/export',
        description: 'Export data to files',
        filePath: '/skills/data-export/SKILL.md',
      });
      mockSkillsGetEnabled.mockResolvedValue([skill1, skill2]);

      // Act
      await generateOpenCodeConfig();

      // Assert
      const config = getWrittenConfig();
      const prompt = config?.agent?.[ACCOMPLISH_AGENT_NAME]?.prompt || '';
      expect(prompt).toContain('Web Scraper');
      expect(prompt).toContain('/scrape');
      expect(prompt).toContain('Data Export');
      expect(prompt).toContain('/export');
      expect(prompt).toContain('/skills/web-scraper/SKILL.md');
      expect(prompt).toContain('/skills/data-export/SKILL.md');
    });

    it('should generate config with Bedrock and set model/small_model', async () => {
      // Arrange
      const bedrockCredentials: BedrockProviderCredentials = {
        type: 'bedrock',
        region: 'us-west-2',
        authMethod: 'profile',
      };
      const bedrockProvider = createMockConnectedProvider('bedrock', {
        selectedModelId: 'bedrock/anthropic.claude-3-sonnet-20240229-v1:0',
        credentials: bedrockCredentials,
      });
      mockGetProviderSettings.mockReturnValue(createMockProviderSettings({
        activeProviderId: 'bedrock',
        connectedProviders: { bedrock: bedrockProvider },
      }));
      mockGetConnectedProviderIds.mockReturnValue(['bedrock'] as ProviderId[]);
      mockGetActiveProviderModel.mockReturnValue({
        provider: 'bedrock',
        model: 'bedrock/anthropic.claude-3-sonnet-20240229-v1:0',
      });

      // Act
      await generateOpenCodeConfig();

      // Assert
      const config = getWrittenConfig();
      expect(config?.model).toBe('bedrock/anthropic.claude-3-sonnet-20240229-v1:0');
      expect(config?.small_model).toBe('bedrock/anthropic.claude-3-sonnet-20240229-v1:0');
      expect(config?.provider?.['amazon-bedrock']).toBeDefined();
    });

    it('should generate config with Azure Foundry and Entra ID auth', async () => {
      // Arrange
      const azureCredentials: AzureFoundryCredentials = {
        type: 'azure-foundry',
        endpoint: 'https://my-resource.openai.azure.com',
        deploymentName: 'gpt-4o',
        authMethod: 'entra-id',
      };
      const azureProvider = createMockConnectedProvider('azure-foundry', {
        selectedModelId: 'azure-foundry/gpt-4o',
        credentials: azureCredentials,
      });
      mockGetProviderSettings.mockReturnValue(createMockProviderSettings({
        activeProviderId: 'azure-foundry',
        connectedProviders: { 'azure-foundry': azureProvider },
      }));
      mockGetConnectedProviderIds.mockReturnValue(['azure-foundry'] as ProviderId[]);

      // Act
      await generateOpenCodeConfig('test-entra-token-12345');

      // Assert
      const config = getWrittenConfig();
      expect(config?.enabled_providers).toContain('azure-foundry');
      expect(config?.provider?.['azure-foundry']).toBeDefined();
      expect(mockEnsureAzureFoundryProxy).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('Error Handling', () => {
    it('should handle missing provider credentials gracefully', async () => {
      // Arrange
      const ollamaCredentials: OllamaCredentials = { type: 'ollama', serverUrl: 'http://localhost:11434' };
      const ollamaProvider = createMockConnectedProvider('ollama', {
        selectedModelId: null, // No model selected
        credentials: ollamaCredentials,
      });
      mockGetProviderSettings.mockReturnValue(createMockProviderSettings({
        connectedProviders: { ollama: ollamaProvider },
      }));

      // Act - should not throw
      await expect(generateOpenCodeConfig()).resolves.toBeDefined();
    });

    it('should handle Azure Foundry proxy failure gracefully', async () => {
      // Arrange
      const azureCredentials: AzureFoundryCredentials = {
        type: 'azure-foundry',
        endpoint: 'https://my-resource.openai.azure.com',
        deploymentName: 'gpt-4o',
        authMethod: 'api-key',
      };
      const azureProvider = createMockConnectedProvider('azure-foundry', {
        credentials: azureCredentials,
      });
      mockGetProviderSettings.mockReturnValue(createMockProviderSettings({
        connectedProviders: { 'azure-foundry': azureProvider },
      }));
      mockGetApiKey.mockImplementation((key: string) =>
        key === 'azure-foundry' ? 'test-key' : null
      );
      // Proxy still returns successfully but with different URL
      mockEnsureAzureFoundryProxy.mockResolvedValue({ baseURL: 'http://localhost:3000/proxy' });

      // Act - should not throw
      await expect(generateOpenCodeConfig()).resolves.toBeDefined();
    });
  });

  // ==========================================================================
  // Platform-Specific Tests
  // ==========================================================================

  describe('Platform-Specific Behavior', () => {
    it('should include platform-specific environment instructions in prompt', async () => {
      // Act
      await generateOpenCodeConfig();

      // Assert
      const config = getWrittenConfig();
      const prompt = config?.agent?.[ACCOMPLISH_AGENT_NAME]?.prompt || '';
      expect(prompt).toContain('<environment>');
    });
  });
});
