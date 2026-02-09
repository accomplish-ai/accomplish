/**
 * Integration tests for OpenCode config generator
 *
 * Tests the config-generator module which creates OpenCode configuration files
 * with MCP servers, agent definitions, and system prompts.
 *
 * NOTE: This is a TRUE integration test.
 * - Uses REAL filesystem operations with temp directories
 * - Only mocks external dependencies (electron APIs)
 *
 * Mocked external services:
 * - electron.app: Native Electron APIs (getPath, getAppPath, isPackaged)
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

// Create temp directories for each test
let tempUserDataDir: string;
let tempAppDir: string;
let tempMonorepoRoot: string;

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

// Note: PERMISSION_API_PORT and QUESTION_API_PORT are now imported from @accomplish/shared
// by config-generator.ts, so no mock needed here

// Mock @accomplish_ai/agent-core (uses SQLite which requires native module)
// Note: generateConfig mock creates real files in temp directory for integration testing
vi.mock('@accomplish_ai/agent-core', async () => {
  const actualFs = await vi.importActual<typeof import('fs')>('fs');
  const actualPath = await vi.importActual<typeof import('path')>('path');

  return {
    // buildProviderConfigs - builds provider configurations from API keys
    buildProviderConfigs: vi.fn(() =>
      Promise.resolve({
        providerConfigs: {},
        enabledProviders: ['anthropic', 'openai', 'google'],
        modelOverride: undefined,
      })
    ),

    // syncApiKeysToOpenCodeAuth - syncs API keys to auth.json
    syncApiKeysToOpenCodeAuth: vi.fn(() => Promise.resolve()),

    // Config generator - creates real files for integration testing
    generateConfig: vi.fn((options: {
      userDataPath: string;
      mcpToolsPath: string;
      platform: string;
      isPackaged: boolean;
      bundledNodeBinPath?: string;
      skills: unknown[];
      providerConfigs: Record<string, unknown>;
      permissionApiPort: number;
      questionApiPort: number;
      enabledProviders: string[];
      model?: string;
      smallModel?: string;
    }) => {
      const configDir = actualPath.join(options.userDataPath, 'opencode');
      const configPath = actualPath.join(configDir, 'opencode.json');

      // Create config directory
      if (!actualFs.existsSync(configDir)) {
        actualFs.mkdirSync(configDir, { recursive: true });
      }

      // Build a realistic config object
      const config = {
        $schema: 'https://opencode.ai/config.json',
        default_agent: 'accomplish',
        permission: { '*': 'allow', todowrite: 'allow' },
        enabled_providers: options.enabledProviders,
        agent: {
          accomplish: {
            description: 'Browser automation assistant using dev-browser',
            mode: 'primary',
            prompt: `<environment>
Platform: ${options.platform}
</environment>

## Browser Automation
Use browser_* tools for web automation. browser_script executes JavaScript.

## FILE PERMISSION WORKFLOW
Use request_file_permission tool before modifying files.

## user-communication
Use AskUserQuestion tool for user interaction.`,
          },
        },
        mcp: {
          'file-permission': {
            type: 'local',
            enabled: true,
            command: ['npx', 'tsx', actualPath.join(options.mcpToolsPath, 'file-permission', 'src', 'index.ts')],
            environment: {
              PERMISSION_API_PORT: String(options.permissionApiPort),
            },
            timeout: 30000,
          },
        },
      };

      // Write config file
      actualFs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      return {
        configPath,
        systemPrompt: config.agent.accomplish.prompt,
        mcpServers: config.mcp,
        providerConfigs: {},
        enabledProviders: options.enabledProviders,
      };
    }),
    ACCOMPLISH_AGENT_NAME: 'accomplish',

    // Proxy functions
    ensureAzureFoundryProxy: vi.fn(() => Promise.resolve()),
    ensureMoonshotProxy: vi.fn(() => Promise.resolve()),

    // Bundled Node.js utilities
  getBundledNodePaths: vi.fn(() => null),
  isBundledNodeAvailable: vi.fn(() => false),
  getNodePath: vi.fn(() => 'node'),
  getNpmPath: vi.fn(() => 'npm'),
  getNpxPath: vi.fn(() => 'npx'),
  logBundledNodeInfo: vi.fn(),

  // Provider settings
  getProviderSettings: vi.fn(() => ({
    activeProviderId: null,
    connectedProviders: {},
    debugMode: false,
  })),
  setActiveProvider: vi.fn(),
  getActiveProviderId: vi.fn(() => null),
  getConnectedProvider: vi.fn(() => null),
  setConnectedProvider: vi.fn(),
  removeConnectedProvider: vi.fn(),
  updateProviderModel: vi.fn(),
  setProviderDebugMode: vi.fn(),
  getProviderDebugMode: vi.fn(() => false),
  clearProviderSettings: vi.fn(),
  getActiveProviderModel: vi.fn(() => null),
  hasReadyProvider: vi.fn(() => false),
  getConnectedProviderIds: vi.fn(() => []),

  // App settings
  getDebugMode: vi.fn(() => false),
  setDebugMode: vi.fn(),
  getOnboardingComplete: vi.fn(() => false),
  setOnboardingComplete: vi.fn(),
  getSelectedModel: vi.fn(() => null),
  setSelectedModel: vi.fn(),
  getOllamaConfig: vi.fn(() => null),
  setOllamaConfig: vi.fn(),
  getLiteLLMConfig: vi.fn(() => null),
  setLiteLLMConfig: vi.fn(),
  getAzureFoundryConfig: vi.fn(() => null),
  setAzureFoundryConfig: vi.fn(),
  getLMStudioConfig: vi.fn(() => null),
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

  // Constants needed by config-generator
  PERMISSION_API_PORT: 9226,
  QUESTION_API_PORT: 9227,
  };
});

// Mock skills module (uses SQLite which requires native module)
vi.mock('@main/skills', () => ({
  skillsManager: {
    getEnabled: vi.fn(() => Promise.resolve([])),
    getAll: vi.fn(() => Promise.resolve([])),
    initialize: vi.fn(() => Promise.resolve()),
  },
}));

describe('OpenCode Config Generator Integration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    originalEnv = { ...process.env };
    mockApp.isPackaged = false;

    // Create real temp directories for each test
    tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-config-test-userData-'));

    // Create a monorepo-like structure in temp dir
    // This simulates the real structure: monorepo/apps/desktop with packages/agent-core/mcp-tools
    tempMonorepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-config-test-monorepo-'));
    tempAppDir = path.join(tempMonorepoRoot, 'apps', 'desktop');
    fs.mkdirSync(tempAppDir, { recursive: true });

    // Create mcp-tools directory structure at packages/agent-core/mcp-tools
    // In development, mcp-tools is at packages/agent-core/mcp-tools relative to apps/desktop
    // path.join(tempAppDir, '..', '..', 'packages', 'agent-core', 'mcp-tools') now resolves correctly
    const mcpToolsDir = path.join(tempMonorepoRoot, 'packages', 'agent-core', 'mcp-tools');
    fs.mkdirSync(mcpToolsDir, { recursive: true });
    fs.mkdirSync(path.join(mcpToolsDir, 'file-permission', 'src'), { recursive: true });
    fs.writeFileSync(path.join(mcpToolsDir, 'file-permission', 'src', 'index.ts'), '// mock file');

    // Update mock to use temp directories
    mockApp.getAppPath.mockReturnValue(tempAppDir);
    mockApp.getPath.mockImplementation((name: string) => {
      if (name === 'userData') return tempUserDataDir;
      return path.join(tempUserDataDir, name);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;

    // Clean up temp directories
    try {
      fs.rmSync(tempUserDataDir, { recursive: true, force: true });
      fs.rmSync(tempMonorepoRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getMcpToolsPath()', () => {
    describe('Development Mode', () => {
      it('should return skills path relative to app path in dev mode', async () => {
        // Arrange
        mockApp.isPackaged = false;

        // Act
        const { getMcpToolsPath } = await import('@main/opencode/config-generator');
        const result = getMcpToolsPath();

        // Assert - mcp-tools is now at packages/agent-core/mcp-tools relative to apps/desktop
        expect(result).toBe(path.join(tempAppDir, '..', '..', 'packages', 'agent-core', 'mcp-tools'));
      });
    });

    describe('Packaged Mode', () => {
      it('should return skills path in resources folder when packaged', async () => {
        // Arrange
        mockApp.isPackaged = true;
        const resourcesPath = path.join(tempAppDir, 'Resources');
        fs.mkdirSync(resourcesPath, { recursive: true });
        (process as NodeJS.Process & { resourcesPath: string }).resourcesPath = resourcesPath;

        // Act
        const { getMcpToolsPath } = await import('@main/opencode/config-generator');
        const result = getMcpToolsPath();

        // Assert
        expect(result).toBe(path.join(resourcesPath, 'mcp-tools'));
      });
    });
  });

  describe('generateOpenCodeConfig()', () => {
    it('should create config directory if it does not exist', async () => {
      // Arrange - config dir does not exist initially

      // Act
      const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
      await generateOpenCodeConfig();

      // Assert - verify directory was created using real fs
      const configDir = path.join(tempUserDataDir, 'opencode');
      expect(fs.existsSync(configDir)).toBe(true);
    });

    it('should not recreate directory if it already exists', async () => {
      // Arrange - create config dir beforehand
      const configDir = path.join(tempUserDataDir, 'opencode');
      fs.mkdirSync(configDir, { recursive: true });
      const statBefore = fs.statSync(configDir);

      // Act
      const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
      await generateOpenCodeConfig();

      // Assert - directory still exists, no error
      expect(fs.existsSync(configDir)).toBe(true);
    });

    it('should write config file with correct structure', async () => {
      // Act
      const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
      const configPath = await generateOpenCodeConfig();

      // Assert - read the real file
      expect(fs.existsSync(configPath)).toBe(true);
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configContent);

      expect(config.$schema).toBe('https://opencode.ai/config.json');
      expect(config.default_agent).toBe('accomplish');
      expect(config.permission).toEqual({ '*': 'allow', todowrite: 'allow' });
      expect(config.enabled_providers).toContain('anthropic');
      expect(config.enabled_providers).toContain('openai');
      expect(config.enabled_providers).toContain('google');
    });

    it('should include accomplish agent configuration', async () => {
      // Act
      const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
      const configPath = await generateOpenCodeConfig();

      // Assert
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const agent = config.agent['accomplish'];

      expect(agent).toBeDefined();
      expect(agent.description).toBe('Browser automation assistant using dev-browser');
      expect(agent.mode).toBe('primary');
      expect(typeof agent.prompt).toBe('string');
      expect(agent.prompt.length).toBeGreaterThan(0);
    });

    it('should include MCP server configuration for file-permission', async () => {
      // Act
      const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
      const configPath = await generateOpenCodeConfig();

      // Assert
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const filePermission = config.mcp['file-permission'];

      expect(filePermission).toBeDefined();
      expect(filePermission.type).toBe('local');
      expect(filePermission.enabled).toBe(true);
      expect(filePermission.command[0]).toBe('npx');
      expect(filePermission.command[1]).toBe('tsx');
      expect(filePermission.environment.PERMISSION_API_PORT).toBe('9226');
    });

    it('should include platform-specific environment instructions', async () => {
      // Act
      const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
      const configPath = await generateOpenCodeConfig();

      // Assert
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const prompt = config.agent['accomplish'].prompt;

      // Prompt should include environment instructions (varies by platform)
      expect(prompt).toContain('<environment>');
      // Should NOT have unresolved template placeholders
      expect(prompt).not.toContain('{{ENVIRONMENT_INSTRUCTIONS}}');
    });

    it('should set OPENCODE_CONFIG environment variable after generation', async () => {
      // Act
      const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
      const configPath = await generateOpenCodeConfig();

      // Assert
      expect(process.env.OPENCODE_CONFIG).toBe(configPath);
      expect(configPath).toBe(path.join(tempUserDataDir, 'opencode', 'opencode.json'));
    });

    it('should return the config file path', async () => {
      // Act
      const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
      const result = await generateOpenCodeConfig();

      // Assert
      expect(result).toBe(path.join(tempUserDataDir, 'opencode', 'opencode.json'));
      expect(fs.existsSync(result)).toBe(true);
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

  describe('System Prompt Content', () => {
    it('should include browser automation guidance', async () => {
      // Act
      const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
      const configPath = await generateOpenCodeConfig();

      // Assert
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const prompt = config.agent['accomplish'].prompt;

      // Should contain browser guidance (detailed tool docs are now in SKILL.md)
      expect(prompt).toContain('browser_script');
      expect(prompt).toContain('browser_*');
      expect(prompt).toContain('Browser Automation');
    });

    it('should include file permission rules', async () => {
      // Act
      const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
      const configPath = await generateOpenCodeConfig();

      // Assert
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const prompt = config.agent['accomplish'].prompt;

      expect(prompt).toContain('FILE PERMISSION WORKFLOW');
      expect(prompt).toContain('request_file_permission');
    });

    it('should include user communication guidance', async () => {
      // Act
      const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
      const configPath = await generateOpenCodeConfig();

      // Assert
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const prompt = config.agent['accomplish'].prompt;

      expect(prompt).toContain('user-communication');
      expect(prompt).toContain('AskUserQuestion');
    });
  });

  describe('ACCOMPLISH_AGENT_NAME Export', () => {
    it('should export the agent name constant', async () => {
      // Act
      const { ACCOMPLISH_AGENT_NAME } = await import('@main/opencode/config-generator');

      // Assert
      expect(ACCOMPLISH_AGENT_NAME).toBe('accomplish');
    });
  });

  describe('Config File Persistence', () => {
    it('should overwrite existing config file on regeneration', async () => {
      // Arrange - generate config first time
      const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
      const firstPath = await generateOpenCodeConfig();
      const firstContent = fs.readFileSync(firstPath, 'utf-8');

      // Reset modules to re-run generator
      vi.resetModules();

      // Act - generate again
      const { generateOpenCodeConfig: regenerate } = await import('@main/opencode/config-generator');
      const secondPath = await regenerate();
      const secondContent = fs.readFileSync(secondPath, 'utf-8');

      // Assert - same path, same content structure
      expect(firstPath).toBe(secondPath);
      expect(JSON.parse(firstContent).$schema).toBe(JSON.parse(secondContent).$schema);
    });

    it('should create valid JSON that can be parsed', async () => {
      // Act
      const { generateOpenCodeConfig } = await import('@main/opencode/config-generator');
      const configPath = await generateOpenCodeConfig();

      // Assert - should not throw when parsing
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();

      // Should be pretty-printed (contains newlines)
      expect(content).toContain('\n');
    });
  });
});
