/**
 * Unit tests for MCP Server Builder
 *
 * Tests the mcp-servers/builder module which constructs MCP server configurations
 * for OpenCode config generation. Each MCP server provides specific functionality
 * (file permissions, user questions, browser automation, task lifecycle).
 *
 * NOTE: This is a UNIT test, not an integration test.
 * All external dependencies (fs, path) are mocked to test builder logic in isolation.
 *
 * Mocked external services:
 * - fs: Filesystem operations
 * - path: Path operations (uses real implementation for consistency)
 *
 * @module __tests__/unit/main/opencode/config-generator/mcp-servers/builder.unit.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock fs module
const mockFs = {
  existsSync: vi.fn(() => false),
};

vi.mock('fs', () => ({
  default: mockFs,
  existsSync: mockFs.existsSync,
}));

// Mock electron module
const mockApp = {
  isPackaged: false,
  getAppPath: vi.fn(() => '/mock/app/path'),
  getPath: vi.fn((name: string) => `/mock/path/${name}`),
};

vi.mock('electron', () => ({
  app: mockApp,
}));

// Mock bundled-node utility
vi.mock('@main/utils/bundled-node', () => ({
  getNodePath: vi.fn(() => '/mock/bundled/node'),
}));

// Test constants matching production values
const MCP_CONFIG = {
  TIMEOUT_MS: 30000,
  TYPE: 'local' as const,
  ENABLED: true,
  SOURCE_FILE: 'src/index.ts',
  DIST_FILE: 'dist/index.mjs',
};

const MCP_SERVER_NAMES = [
  'file-permission',
  'ask-user-question',
  'dev-browser-mcp',
  'complete-task',
  'start-task',
] as const;

type McpServerName = (typeof MCP_SERVER_NAMES)[number];

// Expected interface for MCP server config
interface McpServerConfig {
  type: 'local';
  command: string[];
  enabled: boolean;
  timeout: number;
  environment?: Record<string, string>;
}

type McpServerConfigs = Record<McpServerName, McpServerConfig>;

describe('MCP Server Builder', () => {
  let buildMcpServerConfigs: (
    mcpToolsPath: string,
    tsxCommand: string[],
    permissionPort: number,
    questionPort: number
  ) => McpServerConfigs;

  let resolveMcpCommand: (
    tsxCommand: string[],
    mcpToolsPath: string,
    mcpName: string,
    sourceRelPath: string,
    distRelPath: string
  ) => string[];

  // Test fixtures
  const testMcpToolsPath = '/test/mcp-tools';
  const testTsxCommand = ['npx', 'tsx'];
  const testPermissionPort = 9999;
  const testQuestionPort = 9227;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset packaged state
    mockApp.isPackaged = false;

    // Default: dist files do not exist (development mode)
    mockFs.existsSync.mockReturnValue(false);

    // Import module (will be created)
    const module = await import(
      '@main/opencode/config-generator/mcp-servers/builder'
    );
    buildMcpServerConfigs = module.buildMcpServerConfigs;
    resolveMcpCommand = module.resolveMcpCommand;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe('buildMcpServerConfigs()', () => {
    describe('Server Configuration Structure', () => {
      it('should return config for all 5 MCP servers', () => {
        // Act
        const configs = buildMcpServerConfigs(
          testMcpToolsPath,
          testTsxCommand,
          testPermissionPort,
          testQuestionPort
        );

        // Assert
        expect(Object.keys(configs)).toHaveLength(5);
        expect(configs['file-permission']).toBeDefined();
        expect(configs['ask-user-question']).toBeDefined();
        expect(configs['dev-browser-mcp']).toBeDefined();
        expect(configs['complete-task']).toBeDefined();
        expect(configs['start-task']).toBeDefined();
      });

      it('should set type to "local" for all servers', () => {
        // Act
        const configs = buildMcpServerConfigs(
          testMcpToolsPath,
          testTsxCommand,
          testPermissionPort,
          testQuestionPort
        );

        // Assert
        for (const serverName of MCP_SERVER_NAMES) {
          expect(configs[serverName].type).toBe('local');
        }
      });

      it('should set enabled to true for all servers', () => {
        // Act
        const configs = buildMcpServerConfigs(
          testMcpToolsPath,
          testTsxCommand,
          testPermissionPort,
          testQuestionPort
        );

        // Assert
        for (const serverName of MCP_SERVER_NAMES) {
          expect(configs[serverName].enabled).toBe(true);
        }
      });

      it('should set timeout to 30000ms (MCP_CONFIG.TIMEOUT_MS) for all servers', () => {
        // Act
        const configs = buildMcpServerConfigs(
          testMcpToolsPath,
          testTsxCommand,
          testPermissionPort,
          testQuestionPort
        );

        // Assert
        for (const serverName of MCP_SERVER_NAMES) {
          expect(configs[serverName].timeout).toBe(MCP_CONFIG.TIMEOUT_MS);
        }
      });
    });

    describe('Environment Variables', () => {
      it('should set PERMISSION_API_PORT environment for file-permission server', () => {
        // Act
        const configs = buildMcpServerConfigs(
          testMcpToolsPath,
          testTsxCommand,
          testPermissionPort,
          testQuestionPort
        );

        // Assert
        expect(configs['file-permission'].environment).toBeDefined();
        expect(configs['file-permission'].environment!.PERMISSION_API_PORT).toBe(
          String(testPermissionPort)
        );
      });

      it('should set QUESTION_API_PORT environment for ask-user-question server', () => {
        // Act
        const configs = buildMcpServerConfigs(
          testMcpToolsPath,
          testTsxCommand,
          testPermissionPort,
          testQuestionPort
        );

        // Assert
        expect(configs['ask-user-question'].environment).toBeDefined();
        expect(configs['ask-user-question'].environment!.QUESTION_API_PORT).toBe(
          String(testQuestionPort)
        );
      });

      it('should not set environment for dev-browser-mcp server', () => {
        // Act
        const configs = buildMcpServerConfigs(
          testMcpToolsPath,
          testTsxCommand,
          testPermissionPort,
          testQuestionPort
        );

        // Assert
        expect(configs['dev-browser-mcp'].environment).toBeUndefined();
      });

      it('should not set environment for complete-task server', () => {
        // Act
        const configs = buildMcpServerConfigs(
          testMcpToolsPath,
          testTsxCommand,
          testPermissionPort,
          testQuestionPort
        );

        // Assert
        expect(configs['complete-task'].environment).toBeUndefined();
      });

      it('should not set environment for start-task server', () => {
        // Act
        const configs = buildMcpServerConfigs(
          testMcpToolsPath,
          testTsxCommand,
          testPermissionPort,
          testQuestionPort
        );

        // Assert
        expect(configs['start-task'].environment).toBeUndefined();
      });

      it('should convert port numbers to strings in environment', () => {
        // Act
        const configs = buildMcpServerConfigs(
          testMcpToolsPath,
          testTsxCommand,
          12345,
          67890
        );

        // Assert
        expect(typeof configs['file-permission'].environment!.PERMISSION_API_PORT).toBe(
          'string'
        );
        expect(configs['file-permission'].environment!.PERMISSION_API_PORT).toBe('12345');
        expect(typeof configs['ask-user-question'].environment!.QUESTION_API_PORT).toBe(
          'string'
        );
        expect(configs['ask-user-question'].environment!.QUESTION_API_PORT).toBe('67890');
      });
    });

    describe('Command Array Construction', () => {
      it('should use resolveMcpCommand result for each server command', () => {
        // Arrange - development mode uses tsx
        mockFs.existsSync.mockReturnValue(false);

        // Act
        const configs = buildMcpServerConfigs(
          testMcpToolsPath,
          testTsxCommand,
          testPermissionPort,
          testQuestionPort
        );

        // Assert - each server should have a command array
        for (const serverName of MCP_SERVER_NAMES) {
          expect(Array.isArray(configs[serverName].command)).toBe(true);
          expect(configs[serverName].command.length).toBeGreaterThan(0);
        }
      });

      it('should use source paths (src/index.ts) in development mode', () => {
        // Arrange - development mode
        mockApp.isPackaged = false;
        mockFs.existsSync.mockReturnValue(false);

        // Act
        const configs = buildMcpServerConfigs(
          testMcpToolsPath,
          testTsxCommand,
          testPermissionPort,
          testQuestionPort
        );

        // Assert - commands should reference src/index.ts
        const filePermissionCommand = configs['file-permission'].command;
        expect(filePermissionCommand.some((arg) => arg.includes('src/index.ts'))).toBe(
          true
        );
      });

      it('should use dist paths (dist/index.mjs) in packaged mode when dist exists', () => {
        // Arrange - packaged mode with dist files
        mockApp.isPackaged = true;
        mockFs.existsSync.mockReturnValue(true);

        // Act
        const configs = buildMcpServerConfigs(
          testMcpToolsPath,
          testTsxCommand,
          testPermissionPort,
          testQuestionPort
        );

        // Assert - commands should reference dist/index.mjs and use node
        const filePermissionCommand = configs['file-permission'].command;
        expect(filePermissionCommand.some((arg) => arg.includes('dist/index.mjs'))).toBe(
          true
        );
        expect(filePermissionCommand[0]).toContain('node');
      });
    });
  });

  describe('resolveMcpCommand()', () => {
    describe('Development Mode', () => {
      it('should return tsx command with source path in development', () => {
        // Arrange
        mockApp.isPackaged = false;
        mockFs.existsSync.mockReturnValue(false);

        // Act
        const command = resolveMcpCommand(
          testTsxCommand,
          testMcpToolsPath,
          'file-permission',
          'src/index.ts',
          'dist/index.mjs'
        );

        // Assert
        expect(command).toEqual([
          'npx',
          'tsx',
          '/test/mcp-tools/file-permission/src/index.ts',
        ]);
      });

      it('should use provided tsx command array', () => {
        // Arrange
        mockApp.isPackaged = false;
        const customTsxCommand = ['/custom/path/to/tsx'];

        // Act
        const command = resolveMcpCommand(
          customTsxCommand,
          testMcpToolsPath,
          'dev-browser-mcp',
          'src/index.ts',
          'dist/index.mjs'
        );

        // Assert
        expect(command[0]).toBe('/custom/path/to/tsx');
      });
    });

    describe('Packaged Mode', () => {
      it('should return node command with dist path when packaged and dist exists', () => {
        // Arrange
        mockApp.isPackaged = true;
        mockFs.existsSync.mockReturnValue(true);

        // Act
        const command = resolveMcpCommand(
          testTsxCommand,
          testMcpToolsPath,
          'complete-task',
          'src/index.ts',
          'dist/index.mjs'
        );

        // Assert
        expect(command).toEqual([
          '/mock/bundled/node',
          '/test/mcp-tools/complete-task/dist/index.mjs',
        ]);
      });

      it('should fall back to tsx with source path if dist does not exist in packaged mode', () => {
        // Arrange
        mockApp.isPackaged = true;
        mockFs.existsSync.mockReturnValue(false);

        // Act
        const command = resolveMcpCommand(
          testTsxCommand,
          testMcpToolsPath,
          'start-task',
          'src/index.ts',
          'dist/index.mjs'
        );

        // Assert
        expect(command).toEqual([
          'npx',
          'tsx',
          '/test/mcp-tools/start-task/src/index.ts',
        ]);
      });
    });

    describe('OPENWORK_BUNDLED_MCP Environment Variable', () => {
      it('should use dist path when OPENWORK_BUNDLED_MCP=1 and dist exists', () => {
        // Arrange
        mockApp.isPackaged = false;
        process.env.OPENWORK_BUNDLED_MCP = '1';
        mockFs.existsSync.mockReturnValue(true);

        // Act
        const command = resolveMcpCommand(
          testTsxCommand,
          testMcpToolsPath,
          'file-permission',
          'src/index.ts',
          'dist/index.mjs'
        );

        // Assert
        expect(command[0]).toContain('node');
        expect(command[1]).toContain('dist/index.mjs');

        // Cleanup
        delete process.env.OPENWORK_BUNDLED_MCP;
      });
    });

    describe('Path Construction', () => {
      it('should correctly join mcpToolsPath with server name and source path', () => {
        // Arrange
        mockApp.isPackaged = false;

        // Act
        const command = resolveMcpCommand(
          testTsxCommand,
          '/custom/mcp/tools',
          'ask-user-question',
          'src/index.ts',
          'dist/index.mjs'
        );

        // Assert
        expect(command[command.length - 1]).toBe(
          '/custom/mcp/tools/ask-user-question/src/index.ts'
        );
      });

      it('should correctly join mcpToolsPath with server name and dist path', () => {
        // Arrange
        mockApp.isPackaged = true;
        mockFs.existsSync.mockReturnValue(true);

        // Act
        const command = resolveMcpCommand(
          testTsxCommand,
          '/custom/mcp/tools',
          'dev-browser-mcp',
          'src/index.ts',
          'dist/index.mjs'
        );

        // Assert
        expect(command[1]).toBe('/custom/mcp/tools/dev-browser-mcp/dist/index.mjs');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty tsx command array gracefully', () => {
      // This tests defensive coding - passing empty array shouldn't crash
      // Act & Assert - should not throw
      expect(() =>
        buildMcpServerConfigs(testMcpToolsPath, [], testPermissionPort, testQuestionPort)
      ).not.toThrow();
    });

    it('should handle special characters in mcpToolsPath', () => {
      // Arrange
      const pathWithSpaces = '/path with spaces/mcp-tools';

      // Act
      const configs = buildMcpServerConfigs(
        pathWithSpaces,
        testTsxCommand,
        testPermissionPort,
        testQuestionPort
      );

      // Assert - should preserve path as-is
      expect(
        configs['file-permission'].command.some((arg) =>
          arg.includes('path with spaces')
        )
      ).toBe(true);
    });

    it('should handle zero port numbers', () => {
      // Act
      const configs = buildMcpServerConfigs(testMcpToolsPath, testTsxCommand, 0, 0);

      // Assert
      expect(configs['file-permission'].environment!.PERMISSION_API_PORT).toBe('0');
      expect(configs['ask-user-question'].environment!.QUESTION_API_PORT).toBe('0');
    });
  });
});
