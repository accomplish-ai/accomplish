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
import type { BrowserConfig } from '../../../src/opencode/generator-mcp.js';

describe('ConfigGenerator', () => {
  let testDir: string;
  let mcpToolsPath: string;
  let userDataPath: string;
  const sharedBundledNodeBinPath = path.join(os.tmpdir(), 'config-gen-test-bundled-node', 'bin');
  // Phase 3 of the SDK cutover port deleted the `file-permission` and
  // `ask-user-question` MCP shims — the SDK's `permission.asked` /
  // `question.asked` events replace them. Those entries are no longer
  // expected in the generated config.
  const requiredMcpDistEntries = [
    ['request-connector-auth', 'dist/index.mjs'],
    ['complete-task', 'dist/index.mjs'],
    ['start-task', 'dist/index.mjs'],
    ['dev-browser-mcp', 'dist/index.mjs'],
  ] as const;

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `config-gen-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mcpToolsPath = path.join(testDir, 'mcp-tools');
    userDataPath = path.join(testDir, 'user-data');

    // Create directories
    fs.mkdirSync(mcpToolsPath, { recursive: true });
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.mkdirSync(sharedBundledNodeBinPath, { recursive: true });
    fs.writeFileSync(path.join(sharedBundledNodeBinPath, 'node'), '');
    fs.writeFileSync(path.join(sharedBundledNodeBinPath, 'node.exe'), '');

    for (const [toolName, relEntry] of requiredMcpDistEntries) {
      const entryPath = path.join(mcpToolsPath, toolName, relEntry);
      fs.mkdirSync(path.dirname(entryPath), { recursive: true });
      fs.writeFileSync(entryPath, `// ${toolName} bundled entry`);
    }

    // Suppress console output
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();

    const sharedBundledNodeRoot = path.dirname(sharedBundledNodeBinPath);
    if (fs.existsSync(sharedBundledNodeRoot)) {
      fs.rmSync(sharedBundledNodeRoot, { recursive: true, force: true });
    }

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
      bundledNodeBinPath: sharedBundledNodeBinPath,
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

      expect(result.mcpServers.slack).toBeDefined();
      // file-permission / ask-user-question removed in Phase 3 of the SDK
      // cutover port — their HTTP-callback role is now handled natively by
      // the SDK's permission.asked / question.asked events.
      expect(result.mcpServers['file-permission']).toBeUndefined();
      expect(result.mcpServers['ask-user-question']).toBeUndefined();
      expect(result.mcpServers['desktop-control']).toBeUndefined();
      expect(result.mcpServers['request-connector-auth']).toBeDefined();
      expect(result.mcpServers['dev-browser-mcp']).toBeDefined();
      expect(result.mcpServers['complete-task']).toBeDefined();
      expect(result.mcpServers['start-task']).toBeDefined();
    });

    it('should include the Slack MCP with OpenCode-compatible OAuth config', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
      };

      const result = generateConfig(options);

      expect(result.mcpServers.slack).toEqual({
        type: 'remote',
        url: 'https://mcp.slack.com/mcp',
        oauth: {
          clientId: '1601185624273.8899143856786',
        },
      });
      expect(result.config.mcp?.slack).toEqual(result.mcpServers.slack);
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
      const nodeBinPath = sharedBundledNodeBinPath;
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

    // Permission policy regression guard.
    //
    // The old MCP-shim implementation emitted `{ '*': 'allow', todowrite:
    // 'allow' }` because file permissions and user questions were handled by
    // separate MCP tools (`file-permission`, `ask-user-question`). The SDK
    // cutover removed those shims, so native OpenCode permissions now need a
    // narrow policy:
    //
    //   1. No top-level `*` override: OpenCode's defaults already allow
    //      non-mutating tools, and its built-in `external_directory: ask`
    //      must remain active for paths like ~/Desktop.
    //   2. Native file mutation tools are explicit `ask`.
    //   3. Bash allows read-only utilities by default, but asks for obvious
    //      file mutation patterns and arbitrary interpreters.
    //   4. `question` stays `allow` so OpenCode can emit `question.asked`
    //      and the renderer can show the QuestionCard.
    //   5. `todowrite` stays `allow` (internal bookkeeping; fires on
    //      every agent turn, prompting would be deafening).
    it('allows non-mutating tools by default and asks for file mutations', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
      };

      const result = generateConfig(options);

      expect(result.config.permission).toEqual({
        bash: {
          '*': 'allow',
          '* > *': 'ask',
          '* >> *': 'ask',
          '* 2> *': 'ask',
          '* | tee *': 'ask',
          '* && tee *': 'ask',
          'tee *': 'ask',
          'cat > *': 'ask',
          'rm *': 'ask',
          'mv *': 'ask',
          'cp *': 'ask',
          'mkdir *': 'ask',
          'touch *': 'ask',
          'chmod *': 'ask',
          'chown *': 'ask',
          'ln *': 'ask',
          'install *': 'ask',
          'truncate *': 'ask',
          'sed -i*': 'ask',
          'python*': 'ask',
          'node *': 'ask',
          'ruby *': 'ask',
          'perl *': 'ask',
          'sh *': 'ask',
          'bash *': 'ask',
          'zsh *': 'ask',
          'osascript *': 'ask',
          'curl * -o *': 'ask',
          'curl * --output *': 'ask',
          'wget *': 'ask',
          'tar *x*': 'ask',
          'unzip *': 'ask',
          'rsync *': 'ask',
        },
        edit: 'ask',
        write: 'ask',
        patch: 'ask',
        multiedit: 'ask',
        modify: 'ask',
        delete: 'ask',
        question: 'allow',
        todowrite: 'allow',
      });
    });

    it('does not pre-authorize native file-mutating tools', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
      };

      const result = generateConfig(options);
      const permission = result.config.permission as Record<string, unknown>;

      expect(permission).not.toHaveProperty('*');
      for (const tool of ['write', 'edit', 'patch', 'multiedit', 'modify', 'delete']) {
        expect(permission).toHaveProperty(tool, 'ask');
      }
    });

    it('asks for file-mutating bash patterns without prompting for read-only utilities', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
      };

      const result = generateConfig(options);
      const permission = result.config.permission as Record<string, unknown>;
      const bash = permission.bash as Record<string, unknown>;

      expect(bash['*']).toBe('allow');
      for (const pattern of ['* > *', '* >> *', 'rm *', 'mv *', 'touch *', 'python*']) {
        expect(bash[pattern]).toBe('ask');
      }
    });

    it('does not prompt for non-mutating tools', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
      };

      const result = generateConfig(options);
      const permission = result.config.permission as Record<string, unknown>;

      for (const tool of [
        'read',
        'list',
        'glob',
        'grep',
        'webfetch',
        'websearch',
        'task',
        'skill',
      ]) {
        expect(permission[tool]).not.toBe('ask');
      }
    });

    it('syncs stale default config permission policy when writing a task config', () => {
      const configDir = path.join(userDataPath, 'opencode');
      const defaultConfigPath = path.join(configDir, 'opencode.json');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        defaultConfigPath,
        JSON.stringify(
          {
            $schema: 'https://opencode.ai/config.json',
            permission: {
              '*': 'allow',
              question: 'allow',
              todowrite: 'allow',
            },
            plugin: ['keep-this-plugin'],
          },
          null,
          2,
        ),
      );

      const result = generateConfig({
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
        configFileName: 'opencode-task_test.json',
      });

      const defaultConfig = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf8'));
      const taskConfig = JSON.parse(fs.readFileSync(result.configPath, 'utf8'));

      expect(defaultConfig.permission).not.toHaveProperty('*');
      expect(defaultConfig.permission).toMatchObject({
        bash: {
          '*': 'allow',
          '* > *': 'ask',
          'rm *': 'ask',
          'python*': 'ask',
        },
        edit: 'ask',
        write: 'ask',
        patch: 'ask',
        multiedit: 'ask',
        modify: 'ask',
        delete: 'ask',
        question: 'allow',
        todowrite: 'allow',
      });
      expect(defaultConfig.plugin).toEqual(['keep-this-plugin']);
      expect(taskConfig.permission).not.toHaveProperty('*');
      expect(taskConfig.permission).toMatchObject({
        bash: {
          '*': 'allow',
          '* > *': 'ask',
          'rm *': 'ask',
          'python*': 'ask',
        },
        edit: 'ask',
        write: 'ask',
        patch: 'ask',
        multiedit: 'ask',
        modify: 'ask',
        delete: 'ask',
        question: 'allow',
        todowrite: 'allow',
      });
    });

    it('repairs default configs left by earlier missing-wildcard hotfixes', () => {
      const configDir = path.join(userDataPath, 'opencode');
      const defaultConfigPath = path.join(configDir, 'opencode.json');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        defaultConfigPath,
        JSON.stringify(
          {
            $schema: 'https://opencode.ai/config.json',
            permission: {
              todowrite: 'allow',
            },
          },
          null,
          2,
        ),
      );

      generateConfig({
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
        configFileName: 'opencode-task_test.json',
      });

      const defaultConfig = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf8'));
      expect(defaultConfig.permission).not.toHaveProperty('*');
      expect(defaultConfig.permission).toMatchObject({
        bash: expect.objectContaining({
          '*': 'allow',
          '* > *': 'ask',
          'rm *': 'ask',
          'python*': 'ask',
        }),
        edit: 'ask',
        write: 'ask',
        patch: 'ask',
        multiedit: 'ask',
        modify: 'ask',
        delete: 'ask',
        question: 'allow',
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

      expect(result.config.plugin).toContain('@tarquinen/opencode-dcp@^2.0.0');
    });

    it('should use bundled MCP entry when packaged and dist exists', () => {
      const bundledNodeBinPath = path.join(testDir, 'bundled-node', 'bin');
      fs.mkdirSync(bundledNodeBinPath, { recursive: true });
      fs.writeFileSync(path.join(bundledNodeBinPath, 'node'), '');

      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
        isPackaged: true,
        bundledNodeBinPath,
      };

      const result = generateConfig(options);

      // Should use node + dist path instead of tsx + src
      // file-permission MCP removed in Phase 3 of the SDK cutover port;
      // assert on a retained MCP entry (request-connector-auth) instead.
      const command = result.mcpServers['request-connector-auth'].command;
      expect(command?.[0]).toContain('node');
      expect(command?.[1]).toContain('dist/index.mjs');
    });

    it('should throw when bundled node is missing in packaged mode', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
        isPackaged: true,
        bundledNodeBinPath: path.join(testDir, 'missing-bundled-node'),
      };

      expect(() => generateConfig(options)).toThrow(/Missing bundled Node\.js executable/);
    });

    it('should use node and dist MCP entry when not packaged', () => {
      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
        isPackaged: false,
      };

      const result = generateConfig(options);

      // file-permission MCP removed in Phase 3 of the SDK cutover port;
      // assert on a retained MCP entry (request-connector-auth) instead.
      const command = result.mcpServers['request-connector-auth'].command;
      expect(command?.[0]).toContain('node');
      expect(command?.[1]).toContain('dist/index.mjs');
    });

    it('should throw when MCP dist entry is missing', () => {
      // Pick any still-bundled MCP — request-connector-auth is the simplest
      // always-present entry post-Phase-3. Removing its dist entry should
      // trip the generator's validation.
      fs.rmSync(path.join(mcpToolsPath, 'request-connector-auth', 'dist', 'index.mjs'));

      const options: ConfigGeneratorOptions = {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
        isPackaged: false,
      };

      expect(() => generateConfig(options)).toThrow(/Missing MCP dist entry/);
    });
  });

  // Phase 4b of the OpenCode SDK cutover port deleted the `buildCliArgs`
  // helper. Z.AI model normalization for SDK calls now happens inside
  // `model-runtime-mapping.ts` (`normalizeSelectedModelForSdk`). Tests for
  // that mapping live in `model-runtime-mapping.unit.test.ts`.

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
        bundledNodeBinPath: sharedBundledNodeBinPath,
      };

      const result = generateConfig(options);

      expect(result.systemPrompt).toContain('<identity>');
      expect(result.systemPrompt).toContain('Accomplish');
    });

    it('should include task planning behavior with needs_planning', () => {
      const options: ConfigGeneratorOptions = {
        platform: 'darwin',
        mcpToolsPath,
        userDataPath,
        isPackaged: false,
        bundledNodeBinPath: sharedBundledNodeBinPath,
      };

      const result = generateConfig(options);

      expect(result.systemPrompt).toContain('start_task');
      expect(result.systemPrompt).toContain('needs_planning');
      expect(result.systemPrompt).toContain('complete_task');
    });

    it('should include needs_planning true and false instructions', () => {
      const options: ConfigGeneratorOptions = {
        platform: 'darwin',
        mcpToolsPath,
        userDataPath,
        isPackaged: false,
        bundledNodeBinPath: sharedBundledNodeBinPath,
      };

      const result = generateConfig(options);

      expect(result.systemPrompt).toContain('needs_planning: true');
      expect(result.systemPrompt).toContain('needs_planning: false');
    });

    it('should include filesystem rules', () => {
      const options: ConfigGeneratorOptions = {
        platform: 'darwin',
        mcpToolsPath,
        userDataPath,
        isPackaged: false,
        bundledNodeBinPath: sharedBundledNodeBinPath,
      };

      const result = generateConfig(options);

      expect(result.systemPrompt).toContain('<important name="filesystem-rules">');
      expect(result.systemPrompt).toContain('OpenCode will automatically pause');
      expect(result.systemPrompt).toContain('There is no request_file_permission tool');
      expect(result.systemPrompt).toContain('file-capable tool directly');
      expect(result.systemPrompt).toContain('Do not use connector authentication');
      expect(result.systemPrompt).toContain('"Desktop" means "$HOME/Desktop"');
      expect(result.systemPrompt).not.toContain('<tool name="request_file_permission">');
    });

    it('should include capabilities section', () => {
      const options: ConfigGeneratorOptions = {
        platform: 'darwin',
        mcpToolsPath,
        userDataPath,
        isPackaged: false,
        bundledNodeBinPath: sharedBundledNodeBinPath,
      };

      const result = generateConfig(options);

      expect(result.systemPrompt).toContain('<capabilities>');
      expect(result.systemPrompt).toContain('Browser Automation');
      expect(result.systemPrompt).toContain('File Management');
      expect(result.systemPrompt).toContain('Slack');
      expect(result.systemPrompt).toContain('built-in Slack connector');
    });

    it('should instruct agent NOT to call complete_task for conversational responses', () => {
      const options: ConfigGeneratorOptions = {
        platform: 'darwin',
        mcpToolsPath,
        userDataPath,
        isPackaged: false,
        bundledNodeBinPath: sharedBundledNodeBinPath,
      };

      const result = generateConfig(options);

      expect(result.systemPrompt).toContain('do NOT call complete_task');
      expect(result.systemPrompt).toContain('needs_planning');
    });

    it('should include user communication rules', () => {
      const options: ConfigGeneratorOptions = {
        platform: 'darwin',
        mcpToolsPath,
        userDataPath,
        isPackaged: false,
        bundledNodeBinPath: sharedBundledNodeBinPath,
      };

      const result = generateConfig(options);

      expect(result.systemPrompt).toContain('OpenCode `question` tool');
      expect(result.systemPrompt).toContain('does not create the Accomplish QuestionCard');
      expect(result.systemPrompt).toContain('user CANNOT see your text output');
      expect(result.systemPrompt).not.toContain('AskUserQuestion');
      expect(result.systemPrompt).not.toContain('ask-user-question');
    });

    it('should include Slack usage and authentication guidance', () => {
      const options: ConfigGeneratorOptions = {
        platform: 'darwin',
        mcpToolsPath,
        userDataPath,
        isPackaged: false,
        bundledNodeBinPath: sharedBundledNodeBinPath,
      };

      const result = generateConfig(options);

      expect(result.systemPrompt).toContain('For Slack-related requests, use the Slack MCP tools');
      expect(result.systemPrompt).toContain('the built-in Slack connector is the default path');
      expect(result.systemPrompt).toContain('Never invent Slack tool names');
      expect(result.systemPrompt).toContain(
        'Never answer a Slack access request with generic advice',
      );
      expect(result.systemPrompt).toContain(
        'If the user asks you to connect or authenticate Slack',
      );
      expect(result.systemPrompt).toContain('If Slack authentication is required');
      expect(result.systemPrompt).toContain('request-connector-auth_request_connector_auth');
      expect(result.systemPrompt).toContain('ONLY for connector authentication');
      expect(result.systemPrompt).toContain('Never use it for filesystem permission');
      expect(result.systemPrompt).toContain('Authenticate Slack');
      expect(result.systemPrompt).toContain('Settings -> Connectors -> Slack');
      expect(result.systemPrompt).toContain('Authenticate button');
      expect(result.systemPrompt).toContain('Do not claim a Slack message was sent');
      expect(result.systemPrompt).toContain('confirm where you sent it');
    });
  });

  describe('browser config option', () => {
    const baseOptions: ConfigGeneratorOptions = {
      platform: 'darwin',
      mcpToolsPath: '',
      isPackaged: false,
      userDataPath: '',
      bundledNodeBinPath: sharedBundledNodeBinPath,
    };

    function makeOptions(overrides: Partial<ConfigGeneratorOptions> = {}): ConfigGeneratorOptions {
      return {
        ...baseOptions,
        mcpToolsPath,
        userDataPath,
        ...overrides,
      };
    }

    it('should register dev-browser-mcp by default (builtin mode)', () => {
      const result = generateConfig(makeOptions());

      expect(result.mcpServers['dev-browser-mcp']).toBeDefined();
      expect(result.mcpServers['dev-browser-mcp'].enabled).toBe(true);
    });

    it('should register dev-browser-mcp when browser mode is builtin', () => {
      const result = generateConfig(makeOptions({ browser: { mode: 'builtin' } }));

      expect(result.mcpServers['dev-browser-mcp']).toBeDefined();
      expect(result.mcpServers['dev-browser-mcp'].enabled).toBe(true);
    });

    it('should omit dev-browser-mcp when browser mode is none', () => {
      const result = generateConfig(makeOptions({ browser: { mode: 'none' } }));

      expect(result.mcpServers['dev-browser-mcp']).toBeUndefined();
      expect(result.config.mcp?.['dev-browser-mcp']).toBeUndefined();
    });

    it('should pass CDP_ENDPOINT env to dev-browser-mcp in remote mode', () => {
      const browser: BrowserConfig = {
        mode: 'remote',
        cdpEndpoint: 'http://remote:9222',
      };
      const result = generateConfig(makeOptions({ browser }));

      const mcpConfig = result.mcpServers['dev-browser-mcp'];
      expect(mcpConfig).toBeDefined();
      expect(mcpConfig.environment?.CDP_ENDPOINT).toBe('http://remote:9222');
    });

    it('should pass CDP_SECRET env when cdpHeaders includes X-CDP-Secret', () => {
      const browser: BrowserConfig = {
        mode: 'remote',
        cdpEndpoint: 'http://remote:9222',
        cdpHeaders: { 'X-CDP-Secret': 'test-secret' },
      };
      const result = generateConfig(makeOptions({ browser }));

      const mcpConfig = result.mcpServers['dev-browser-mcp'];
      expect(mcpConfig).toBeDefined();
      expect(mcpConfig.environment?.CDP_SECRET).toBe('test-secret');
    });

    it('should not include environment on dev-browser-mcp in builtin mode', () => {
      const result = generateConfig(makeOptions({ browser: { mode: 'builtin' } }));

      const mcpConfig = result.mcpServers['dev-browser-mcp'];
      expect(mcpConfig).toBeDefined();
      expect(mcpConfig.environment).toBeUndefined();
    });

    it('should strip all browser references from prompt when mode is none', () => {
      const result = generateConfig(makeOptions({ browser: { mode: 'none' } }));

      expect(result.systemPrompt).toContain('task automation assistant');
      expect(result.systemPrompt).not.toContain('browser automation assistant');
      expect(result.systemPrompt).not.toContain('browser_sequence');
      expect(result.systemPrompt).not.toContain('browser_batch_actions');
      expect(result.systemPrompt).not.toContain('browser_script');
      expect(result.systemPrompt).not.toContain('browser_* MCP tools');
      expect(result.systemPrompt).not.toContain('BROWSER ACTION VERBOSITY');
      expect(result.systemPrompt).not.toContain('Browser Automation');
    });

    it('should keep browser identity in prompt for builtin mode', () => {
      const result = generateConfig(makeOptions({ browser: { mode: 'builtin' } }));

      expect(result.systemPrompt).toContain('browser automation assistant');
      expect(result.systemPrompt).not.toContain('task automation assistant');
    });

    it('should keep browser identity in prompt for remote mode', () => {
      const browser: BrowserConfig = {
        mode: 'remote',
        cdpEndpoint: 'ws://remote:9222',
      };
      const result = generateConfig(makeOptions({ browser }));

      expect(result.systemPrompt).toContain('browser automation assistant');
    });
  });

  describe('needs_planning decision framework', () => {
    let prompt: string;

    beforeEach(() => {
      const result = generateConfig({
        platform: 'darwin',
        mcpToolsPath,
        userDataPath,
        isPackaged: false,
        bundledNodeBinPath: sharedBundledNodeBinPath,
      });
      prompt = result.systemPrompt;
    });

    it('should contain needs_planning: true for multi-step tasks', () => {
      expect(prompt).toContain('needs_planning: true');
      expect(prompt).toContain('will require tools beyond start_task and complete_task');
      expect(prompt).toContain('file operations');
      expect(prompt).toContain('browser actions');
      expect(prompt).toContain('bash commands');
    });

    it('should contain needs_planning: false for conversational messages', () => {
      expect(prompt).toContain('needs_planning: false');
      expect(prompt).toContain('conversational responses that do not require tools');
    });

    it('should contain explicit instruction not to call complete_task for conversational responses', () => {
      expect(prompt).toContain('Do NOT call complete_task for conversational responses');
    });

    it('should require complete_task when needs_planning was true', () => {
      expect(prompt).toContain(
        'You MUST call the `complete_task` tool when `needs_planning` was true',
      );
    });

    it('should instruct providing goal/steps/verification when needs_planning is true', () => {
      expect(prompt).toContain('needs_planning is TRUE');
      expect(prompt).toContain('goal, steps, verification');
    });

    it('should instruct skipping goal/steps/verification when needs_planning is false', () => {
      expect(prompt).toContain('needs_planning is FALSE');
      expect(prompt).toContain('skip goal, steps, verification');
    });

    it('should mention greetings/questions/knowledge as needs_planning=false examples', () => {
      expect(prompt).toContain('greetings');
      expect(prompt).toContain('knowledge questions');
      expect(prompt).toContain('conversational messages');
    });

    it('should mention file operations/browser/bash as needs_planning=true indicators', () => {
      expect(prompt).toContain('file operations');
      expect(prompt).toContain('browser actions');
      expect(prompt).toContain('bash commands');
    });

    it('should still contain start_task as mandatory first tool for non-conversational tasks', () => {
      expect(prompt).toContain('For non-conversational tasks, you MUST call start_task');
      expect(prompt).toContain('TASK WORKFLOW (NON-CONVERSATIONAL TASKS)');
    });

    it('should still contain todowrite instructions under needs_planning=true path', () => {
      expect(prompt).toContain('Mark completed steps as "completed"');
      expect(prompt).toContain('Mark the current step as "in_progress"');
      expect(prompt).toContain(
        'All todos must be "completed" or "cancelled" before calling complete_task',
      );
    });

    it('should contain todo update instructions under needs_planning=true path', () => {
      expect(prompt).toContain('UPDATE TODOS AS YOU PROGRESS');
      expect(prompt).toContain('COMPLETE ALL TODOS BEFORE FINISHING');
    });
  });

  describe('needs_planning regression checks', () => {
    let prompt: string;

    beforeEach(() => {
      const result = generateConfig({
        platform: 'darwin',
        mcpToolsPath,
        userDataPath,
        isPackaged: false,
        bundledNodeBinPath: sharedBundledNodeBinPath,
      });
      prompt = result.systemPrompt;
    });

    it('should still contain complete_task instructions', () => {
      expect(prompt).toContain('complete_task');
      expect(prompt).toContain('status: "success"');
      expect(prompt).toContain('status: "blocked"');
      expect(prompt).toContain('status: "partial"');
    });

    it('should still contain verification behavior', () => {
      expect(prompt).toContain("You verified EVERY part of the user's request is done");
      expect(prompt).toContain('original_request_summary');
    });

    it('should include skills section when skills are configured', () => {
      const result = generateConfig({
        platform: 'darwin',
        mcpToolsPath,
        userDataPath,
        isPackaged: false,
        bundledNodeBinPath: sharedBundledNodeBinPath,
        skills: [
          {
            name: 'test-skill',
            command: '/test',
            description: 'A test skill',
            filePath: '/tmp/skill',
          },
        ],
      });
      expect(result.systemPrompt).toContain('available-skills');
      expect(result.systemPrompt).toContain('test-skill');
    });
  });
});
