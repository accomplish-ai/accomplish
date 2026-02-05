import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  generateConfig,
  getOpenCodeConfigPath,
  ACCOMPLISH_AGENT_NAME,
  ConfigGeneratorOptions,
  ProviderConfig,
} from '../../../src/opencode/config-generator.js';

describe('ConfigGenerator', () => {
  let testDir: string;
  let mcpToolsPath: string;
  let userDataPath: string;

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `config-gen-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mcpToolsPath = path.join(testDir, 'mcp-tools');
    userDataPath = path.join(testDir, 'user-data');

    // Create directories
    fs.mkdirSync(mcpToolsPath, { recursive: true });
    fs.mkdirSync(userDataPath, { recursive: true });

    // Suppress console output
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();

    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('ACCOMPLISH_AGENT_NAME', () => {
    it('should be "accomplish"', () => {
      expect(ACCOMPLISH_AGENT_NAME).toBe('accomplish');
    });
  });

  describe('generateConfig', () => {
    const baseOptions: ConfigGeneratorOptions = {
      platform: 'darwin',
      mcpToolsPath: '',
      isPackaged: false,
      userDataPath: '',
    };

    it('should generate config with required fields', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
      };

      const result = generateConfig(options);

      expect(result.systemPrompt).toBeDefined();
      expect(result.mcpServers).toBeDefined();
      expect(result.environment).toBeDefined();
      expect(result.config).toBeDefined();
      expect(result.configPath).toBeDefined();
    });

    it('should write config file to disk', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
      };

      const result = generateConfig(options);

      expect(fs.existsSync(result.configPath)).toBe(true);

      const fileContent = fs.readFileSync(result.configPath, 'utf8');
      const parsed = JSON.parse(fileContent);
      expect(parsed.$schema).toBeDefined();
    });

    it('should create config directory if it does not exist', () => {
      const newUserDataPath = path.join(testDir, 'new-user-data');
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath: newUserDataPath,
      };

      const result = generateConfig(options);

      expect(fs.existsSync(path.dirname(result.configPath))).toBe(true);
    });

    it('should include environment instructions for darwin', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        platform: 'darwin',
        mcpToolsPath,
        userDataPath,
      };

      const result = generateConfig(options);

      expect(result.systemPrompt).toContain('macOS');
    });

    it('should include environment instructions for win32', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        platform: 'win32',
        mcpToolsPath,
        userDataPath,
      };

      const result = generateConfig(options);

      expect(result.systemPrompt).toContain('Windows');
      expect(result.systemPrompt).toContain('PowerShell');
    });

    it('should include environment instructions for linux', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        platform: 'linux',
        mcpToolsPath,
        userDataPath,
      };

      const result = generateConfig(options);

      expect(result.systemPrompt).toContain('Linux');
    });

    it('should configure MCP servers', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
      };

      const result = generateConfig(options);

      expect(result.mcpServers['file-permission']).toBeDefined();
      expect(result.mcpServers['ask-user-question']).toBeDefined();
      expect(result.mcpServers['dev-browser-mcp']).toBeDefined();
      expect(result.mcpServers['complete-task']).toBeDefined();
      expect(result.mcpServers['start-task']).toBeDefined();
    });

    it('should set permission API port in environment', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
        permissionApiPort: 9999,
      };

      const result = generateConfig(options);

      expect(result.mcpServers['file-permission'].environment?.PERMISSION_API_PORT).toBe('9999');
    });

    it('should set question API port in environment', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
        questionApiPort: 8888,
      };

      const result = generateConfig(options);

      expect(result.mcpServers['ask-user-question'].environment?.QUESTION_API_PORT).toBe('8888');
    });

    it('should use default ports if not specified', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
      };

      const result = generateConfig(options);

      expect(result.mcpServers['file-permission'].environment?.PERMISSION_API_PORT).toBe('9226');
      expect(result.mcpServers['ask-user-question'].environment?.QUESTION_API_PORT).toBe('9227');
    });

    it('should include skills in system prompt when provided', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
        skills: [
          {
            id: 'skill-1',
            name: 'Test Skill',
            command: '/test',
            description: 'A test skill',
            filePath: '/path/to/skill.md',
            isOfficial: true,
            enabled: true,
          },
        ],
      };

      const result = generateConfig(options);

      // Check for the skills section header and content
      expect(result.systemPrompt).toContain('# SKILLS - Include relevant');
      expect(result.systemPrompt).toContain('**Available Skills:**');
      expect(result.systemPrompt).toContain('Test Skill');
      expect(result.systemPrompt).toContain('/test');
      expect(result.systemPrompt).toContain('A test skill');
    });

    it('should not include skills section when no skills provided', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
        skills: [],
      };

      const result = generateConfig(options);

      // The base template references <available-skills> in instructions,
      // but the actual skills section starts with "# SKILLS - Include relevant"
      // and ends with the closing tag. Check for the section header instead.
      expect(result.systemPrompt).not.toContain('# SKILLS - Include relevant');
      expect(result.systemPrompt).not.toContain('**Available Skills:**');
    });

    it('should include bundled node bin path in environment', () => {
      const nodeBinPath = '/path/to/bundled/node/bin';
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
        bundledNodeBinPath: nodeBinPath,
      };

      const result = generateConfig(options);

      expect(result.environment.NODE_BIN_PATH).toBe(nodeBinPath);
    });

    it('should include OPENCODE_CONFIG in environment', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
      };

      const result = generateConfig(options);

      expect(result.environment.OPENCODE_CONFIG).toBeDefined();
      expect(result.environment.OPENCODE_CONFIG_DIR).toBeDefined();
    });

    it('should configure custom provider configs', () => {
      const customProvider: ProviderConfig = {
        id: 'custom-provider',
        npm: '@custom/provider',
        name: 'Custom Provider',
        options: {
          baseURL: 'https://api.custom.com',
          apiKey: 'test-key',
        },
        models: {
          'custom-model': {
            name: 'Custom Model',
            tools: true,
            limit: { context: 100000 },
          },
        },
      };

      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
        providerConfigs: [customProvider],
      };

      const result = generateConfig(options);

      expect(result.config.provider).toBeDefined();
      // Provider config in output has id stripped (used as key)
      const { id: _id, ...expectedProviderConfig } = customProvider;
      expect(result.config.provider?.['custom-provider']).toEqual(expectedProviderConfig);
      expect(result.config.enabled_providers).toContain('custom-provider');
    });

    it('should include base providers in enabled list', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
      };

      const result = generateConfig(options);

      expect(result.config.enabled_providers).toContain('anthropic');
      expect(result.config.enabled_providers).toContain('openai');
      expect(result.config.enabled_providers).toContain('google');
    });

    it('should set default agent to accomplish', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
      };

      const result = generateConfig(options);

      expect(result.config.default_agent).toBe(ACCOMPLISH_AGENT_NAME);
    });

    it('should configure agent with correct mode', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
      };

      const result = generateConfig(options);

      expect(result.config.agent?.[ACCOMPLISH_AGENT_NAME]?.mode).toBe('primary');
    });

    it('should include schema in config', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
      };

      const result = generateConfig(options);

      expect(result.config.$schema).toBe('https://opencode.ai/config.json');
    });

    it('should configure permissions to allow all', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
      };

      const result = generateConfig(options);

      expect(result.config.permission).toEqual({
        '*': 'allow',
        todowrite: 'allow',
      });
    });

    it('should include DCP plugin', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
      };

      const result = generateConfig(options);

      expect(result.config.plugin).toContain('@tarquinen/opencode-dcp@^1.2.7');
    });

    it('should use bundled MCP entry when packaged and dist exists', () => {
      // Create dist file
      const mcpDir = path.join(mcpToolsPath, 'file-permission', 'dist');
      fs.mkdirSync(mcpDir, { recursive: true });
      fs.writeFileSync(path.join(mcpDir, 'index.mjs'), '// bundled');

      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
        isPackaged: true,
        bundledNodeBinPath: '/bundled/node/bin',
      };

      const result = generateConfig(options);

      // Should use node + dist path instead of tsx + src
      const command = result.mcpServers['file-permission'].command;
      expect(command?.[0]).toContain('node');
      expect(command?.[1]).toContain('dist/index.mjs');
    });

    it('should use tsx for MCP entry when not packaged', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
        isPackaged: false,
      };

      const result = generateConfig(options);

      const command = result.mcpServers['file-permission'].command;
      // Should use npx tsx or bundled tsx
      expect(command?.some((arg) => arg.includes('tsx') || arg.includes('npx'))).toBe(true);
    });
  });

  describe('getOpenCodeConfigPath', () => {
    it('should return correct config path', () => {
      const result = getOpenCodeConfigPath(userDataPath);

      expect(result).toBe(path.join(userDataPath, 'opencode', 'opencode.json'));
    });
  });

  describe('system prompt content', () => {
    it('should include identity section', () => {
      const options: ConfigGeneratorOptions = {
        platform: 'darwin',
        mcpToolsPath,
        userDataPath,
        isPackaged: false,
      };

      const result = generateConfig(options);

      expect(result.systemPrompt).toContain('<identity>');
      expect(result.systemPrompt).toContain('Accomplish');
    });

    it('should include task planning behavior', () => {
      const options: ConfigGeneratorOptions = {
        platform: 'darwin',
        mcpToolsPath,
        userDataPath,
        isPackaged: false,
      };

      const result = generateConfig(options);

      expect(result.systemPrompt).toContain('start_task');
      expect(result.systemPrompt).toContain('todowrite');
      expect(result.systemPrompt).toContain('complete_task');
    });

    it('should include filesystem rules', () => {
      const options: ConfigGeneratorOptions = {
        platform: 'darwin',
        mcpToolsPath,
        userDataPath,
        isPackaged: false,
      };

      const result = generateConfig(options);

      expect(result.systemPrompt).toContain('<important name="filesystem-rules">');
      expect(result.systemPrompt).toContain('request_file_permission');
    });

    it('should include capabilities section', () => {
      const options: ConfigGeneratorOptions = {
        platform: 'darwin',
        mcpToolsPath,
        userDataPath,
        isPackaged: false,
      };

      const result = generateConfig(options);

      expect(result.systemPrompt).toContain('<capabilities>');
      expect(result.systemPrompt).toContain('Browser Automation');
      expect(result.systemPrompt).toContain('File Management');
    });

    it('should include user communication rules', () => {
      const options: ConfigGeneratorOptions = {
        platform: 'darwin',
        mcpToolsPath,
        userDataPath,
        isPackaged: false,
      };

      const result = generateConfig(options);

      expect(result.systemPrompt).toContain('AskUserQuestion');
      expect(result.systemPrompt).toContain('user CANNOT see your text output');
    });
  });
});
