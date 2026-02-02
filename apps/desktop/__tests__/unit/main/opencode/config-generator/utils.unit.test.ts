/**
 * Unit tests for config-generator utils module
 *
 * Tests utility functions for path resolution, directory management,
 * and MCP command resolution used by the config generator.
 *
 * NOTE: This is a UNIT test, not an integration test.
 * External dependencies (electron, fs, path) are mocked to test
 * utils logic in isolation.
 *
 * Mocked external services:
 * - electron: app module for path resolution and packaging state
 * - fs: File system operations (existsSync, mkdirSync)
 * - bundled-node: getNodePath for MCP command resolution
 *
 * @module __tests__/unit/main/opencode/config-generator/utils.unit.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ============================================================================
// Mock Setup - Must be before imports
// ============================================================================

// Mock electron app module
const mockApp = {
  isPackaged: false,
  getAppPath: vi.fn(() => '/mock/app/path'),
  getPath: vi.fn((name: string) => {
    if (name === 'userData') return '/mock/userData';
    if (name === 'home') return '/mock/home';
    return `/mock/path/${name}`;
  }),
};

vi.mock('electron', () => ({
  app: mockApp,
}));

// Mock fs module
const mockFs = {
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
};

vi.mock('fs', () => ({
  default: mockFs,
  existsSync: mockFs.existsSync,
  mkdirSync: mockFs.mkdirSync,
}));

// Mock bundled-node module
const mockGetNodePath = vi.fn(() => '/bundled/node');

vi.mock('@main/utils/bundled-node', () => ({
  getNodePath: mockGetNodePath,
}));

// Store original platform and resourcesPath
const originalPlatform = process.platform;
const originalResourcesPath = process.resourcesPath;

// Helper to mock process.platform
function mockPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    value: platform,
    writable: true,
    configurable: true,
  });
}

// Helper to mock process.resourcesPath
function mockResourcesPath(resourcesPath: string): void {
  Object.defineProperty(process, 'resourcesPath', {
    value: resourcesPath,
    writable: true,
    configurable: true,
  });
}

describe('Config Generator Utils Module', () => {
  // Import module under test - will be re-imported in beforeEach for fresh state
  let getMcpToolsPath: typeof import('@main/opencode/config-generator/utils').getMcpToolsPath;
  let getOpenCodeConfigDir: typeof import('@main/opencode/config-generator/utils').getOpenCodeConfigDir;
  let getOpenCodeConfigPath: typeof import('@main/opencode/config-generator/utils').getOpenCodeConfigPath;
  let getOpenCodeAuthPath: typeof import('@main/opencode/config-generator/utils').getOpenCodeAuthPath;
  let ensureConfigDirectory: typeof import('@main/opencode/config-generator/utils').ensureConfigDirectory;
  let resolveBundledTsxCommand: typeof import('@main/opencode/config-generator/utils').resolveBundledTsxCommand;
  let resolveMcpCommand: typeof import('@main/opencode/config-generator/utils').resolveMcpCommand;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Reset mocks to default state
    mockApp.isPackaged = false;
    mockApp.getAppPath.mockReturnValue('/mock/app/path');
    mockApp.getPath.mockImplementation((name: string) => {
      if (name === 'userData') return '/mock/userData';
      if (name === 'home') return '/mock/home';
      return `/mock/path/${name}`;
    });
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockClear();
    mockGetNodePath.mockReturnValue('/bundled/node');
    mockResourcesPath('/mock/resources');
    mockPlatform('darwin');

    // Clear environment variable
    delete process.env.OPENWORK_BUNDLED_MCP;

    // Re-import module to get fresh state
    const module = await import('@main/opencode/config-generator/utils');
    getMcpToolsPath = module.getMcpToolsPath;
    getOpenCodeConfigDir = module.getOpenCodeConfigDir;
    getOpenCodeConfigPath = module.getOpenCodeConfigPath;
    getOpenCodeAuthPath = module.getOpenCodeAuthPath;
    ensureConfigDirectory = module.ensureConfigDirectory;
    resolveBundledTsxCommand = module.resolveBundledTsxCommand;
    resolveMcpCommand = module.resolveMcpCommand;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore original platform and resourcesPath
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true,
      configurable: true,
    });
    if (originalResourcesPath !== undefined) {
      Object.defineProperty(process, 'resourcesPath', {
        value: originalResourcesPath,
        writable: true,
        configurable: true,
      });
    }
    delete process.env.OPENWORK_BUNDLED_MCP;
  });

  // ==========================================================================
  // getMcpToolsPath() Tests
  // ==========================================================================
  describe('getMcpToolsPath()', () => {
    it('should return mcp-tools in app path for development mode', () => {
      // Arrange
      mockApp.isPackaged = false;
      mockApp.getAppPath.mockReturnValue('/dev/apps/desktop');

      // Act
      const result = getMcpToolsPath();

      // Assert
      expect(result).toBe('/dev/apps/desktop/mcp-tools');
      expect(mockApp.getAppPath).toHaveBeenCalled();
    });

    it('should return mcp-tools in resources path when packaged', () => {
      // Arrange
      mockApp.isPackaged = true;
      mockResourcesPath('/Applications/Openwork.app/Contents/Resources');

      // Act
      const result = getMcpToolsPath();

      // Assert
      expect(result).toBe('/Applications/Openwork.app/Contents/Resources/mcp-tools');
    });

    it('should not call getAppPath when packaged', () => {
      // Arrange
      mockApp.isPackaged = true;
      mockResourcesPath('/mock/resources');

      // Act
      getMcpToolsPath();

      // Assert
      expect(mockApp.getAppPath).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // getOpenCodeConfigDir() Tests
  // ==========================================================================
  describe('getOpenCodeConfigDir()', () => {
    it('should return app path in development mode', () => {
      // Arrange
      mockApp.isPackaged = false;
      mockApp.getAppPath.mockReturnValue('/dev/apps/desktop');

      // Act
      const result = getOpenCodeConfigDir();

      // Assert
      expect(result).toBe('/dev/apps/desktop');
      expect(mockApp.getAppPath).toHaveBeenCalled();
    });

    it('should return resources path when packaged', () => {
      // Arrange
      mockApp.isPackaged = true;
      mockResourcesPath('/Applications/Openwork.app/Contents/Resources');

      // Act
      const result = getOpenCodeConfigDir();

      // Assert
      expect(result).toBe('/Applications/Openwork.app/Contents/Resources');
    });
  });

  // ==========================================================================
  // getOpenCodeConfigPath() Tests
  // ==========================================================================
  describe('getOpenCodeConfigPath()', () => {
    it('should return correct path under userData directory', () => {
      // Arrange
      mockApp.getPath.mockImplementation((name: string) => {
        if (name === 'userData') return '/Users/test/Library/Application Support/Openwork';
        return `/mock/path/${name}`;
      });

      // Act
      const result = getOpenCodeConfigPath();

      // Assert
      expect(result).toBe('/Users/test/Library/Application Support/Openwork/opencode/opencode.json');
      expect(mockApp.getPath).toHaveBeenCalledWith('userData');
    });

    it('should handle Windows-style paths', () => {
      // Arrange
      mockApp.getPath.mockImplementation((name: string) => {
        if (name === 'userData') return 'C:\\Users\\test\\AppData\\Roaming\\Openwork';
        return `C:\\mock\\path\\${name}`;
      });

      // Act
      const result = getOpenCodeConfigPath();

      // Assert
      // path.join handles platform-specific separators
      expect(result).toContain('opencode');
      expect(result).toContain('opencode.json');
    });
  });

  // ==========================================================================
  // getOpenCodeAuthPath() Tests
  // ==========================================================================
  describe('getOpenCodeAuthPath()', () => {
    it('should return Windows path on win32 platform', async () => {
      // Arrange
      mockPlatform('win32');
      mockApp.getPath.mockImplementation((name: string) => {
        if (name === 'home') return 'C:\\Users\\testuser';
        return `C:\\mock\\path\\${name}`;
      });

      // Re-import to pick up platform change
      vi.resetModules();
      const module = await import('@main/opencode/config-generator/utils');

      // Act
      const result = module.getOpenCodeAuthPath();

      // Assert
      expect(result).toContain('AppData');
      expect(result).toContain('Local');
      expect(result).toContain('opencode');
      expect(result).toContain('auth.json');
    });

    it('should return Unix path on darwin platform', async () => {
      // Arrange
      mockPlatform('darwin');
      mockApp.getPath.mockImplementation((name: string) => {
        if (name === 'home') return '/Users/testuser';
        return `/mock/path/${name}`;
      });

      // Re-import to pick up platform change
      vi.resetModules();
      const module = await import('@main/opencode/config-generator/utils');

      // Act
      const result = module.getOpenCodeAuthPath();

      // Assert
      expect(result).toBe('/Users/testuser/.local/share/opencode/auth.json');
    });

    it('should return Unix path on linux platform', async () => {
      // Arrange
      mockPlatform('linux');
      mockApp.getPath.mockImplementation((name: string) => {
        if (name === 'home') return '/home/testuser';
        return `/mock/path/${name}`;
      });

      // Re-import to pick up platform change
      vi.resetModules();
      const module = await import('@main/opencode/config-generator/utils');

      // Act
      const result = module.getOpenCodeAuthPath();

      // Assert
      expect(result).toBe('/home/testuser/.local/share/opencode/auth.json');
    });
  });

  // ==========================================================================
  // ensureConfigDirectory() Tests
  // ==========================================================================
  describe('ensureConfigDirectory()', () => {
    it('should create directory if it does not exist', () => {
      // Arrange
      mockApp.getPath.mockImplementation((name: string) => {
        if (name === 'userData') return '/mock/userData';
        return `/mock/path/${name}`;
      });
      mockFs.existsSync.mockReturnValue(false);

      // Act
      const result = ensureConfigDirectory();

      // Assert
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('opencode'),
        { recursive: true }
      );
      expect(result).toContain('opencode');
    });

    it('should return existing directory without creating', () => {
      // Arrange
      mockApp.getPath.mockImplementation((name: string) => {
        if (name === 'userData') return '/mock/userData';
        return `/mock/path/${name}`;
      });
      mockFs.existsSync.mockReturnValue(true);

      // Act
      const result = ensureConfigDirectory();

      // Assert
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
      expect(result).toContain('opencode');
    });

    it('should use recursive option when creating directory', () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(false);

      // Act
      ensureConfigDirectory();

      // Assert
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ recursive: true })
      );
    });
  });

  // ==========================================================================
  // resolveBundledTsxCommand() Tests
  // ==========================================================================
  describe('resolveBundledTsxCommand()', () => {
    it('should return first existing tsx binary found', () => {
      // Arrange
      const mcpToolsPath = '/mock/mcp-tools';
      // First candidate exists
      mockFs.existsSync.mockImplementation((p: unknown) => {
        const pathStr = String(p);
        return pathStr.includes('file-permission') && pathStr.includes('tsx');
      });

      // Act
      const result = resolveBundledTsxCommand(mcpToolsPath);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('file-permission');
      expect(result[0]).toContain('tsx');
    });

    it('should check file-permission node_modules first', () => {
      // Arrange
      const mcpToolsPath = '/mock/mcp-tools';
      const checkedPaths: string[] = [];
      mockFs.existsSync.mockImplementation((p: unknown) => {
        checkedPaths.push(String(p));
        return false;
      });

      // Act
      resolveBundledTsxCommand(mcpToolsPath);

      // Assert
      expect(checkedPaths[0]).toContain('file-permission');
    });

    it('should check ask-user-question node_modules second', () => {
      // Arrange
      const mcpToolsPath = '/mock/mcp-tools';
      const checkedPaths: string[] = [];
      mockFs.existsSync.mockImplementation((p: unknown) => {
        checkedPaths.push(String(p));
        return false;
      });

      // Act
      resolveBundledTsxCommand(mcpToolsPath);

      // Assert
      expect(checkedPaths.length).toBeGreaterThan(1);
      expect(checkedPaths[1]).toContain('ask-user-question');
    });

    it('should fall back to npx tsx when no bundled tsx found', () => {
      // Arrange
      const mcpToolsPath = '/mock/mcp-tools';
      mockFs.existsSync.mockReturnValue(false);

      // Act
      const result = resolveBundledTsxCommand(mcpToolsPath);

      // Assert
      expect(result).toEqual(['npx', 'tsx']);
    });

    it('should use tsx.cmd on Windows platform', async () => {
      // Arrange
      mockPlatform('win32');
      const mcpToolsPath = '/mock/mcp-tools';

      // Re-import to pick up platform change
      vi.resetModules();
      const module = await import('@main/opencode/config-generator/utils');

      // First candidate exists
      mockFs.existsSync.mockImplementation((p: unknown) => {
        const pathStr = String(p);
        return pathStr.includes('file-permission') && pathStr.includes('tsx.cmd');
      });

      // Act
      const result = module.resolveBundledTsxCommand(mcpToolsPath);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('tsx.cmd');
    });

    it('should use tsx (no extension) on Unix platforms', async () => {
      // Arrange
      mockPlatform('darwin');
      const mcpToolsPath = '/mock/mcp-tools';

      // Re-import to pick up platform change
      vi.resetModules();
      const module = await import('@main/opencode/config-generator/utils');

      // Check what paths are being tested
      const checkedPaths: string[] = [];
      mockFs.existsSync.mockImplementation((p: unknown) => {
        checkedPaths.push(String(p));
        return false;
      });

      // Act
      module.resolveBundledTsxCommand(mcpToolsPath);

      // Assert - paths should not contain .cmd extension
      checkedPaths.forEach((p) => {
        expect(p).not.toContain('.cmd');
      });
    });
  });

  // ==========================================================================
  // resolveMcpCommand() Tests
  // ==========================================================================
  describe('resolveMcpCommand()', () => {
    it('should return node + dist path when packaged and dist exists', () => {
      // Arrange
      mockApp.isPackaged = true;
      mockGetNodePath.mockReturnValue('/bundled/node');
      mockFs.existsSync.mockImplementation((p: unknown) => {
        const pathStr = String(p);
        return pathStr.includes('dist/index.js');
      });

      const tsxCommand = ['npx', 'tsx'];
      const mcpToolsPath = '/mock/mcp-tools';
      const mcpName = 'test-mcp';
      const sourceRelPath = 'src/index.ts';
      const distRelPath = 'dist/index.js';

      // Act
      const result = resolveMcpCommand(tsxCommand, mcpToolsPath, mcpName, sourceRelPath, distRelPath);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('/bundled/node');
      expect(result[1]).toContain('dist/index.js');
    });

    it('should return tsx + source path in development mode', () => {
      // Arrange
      mockApp.isPackaged = false;
      mockFs.existsSync.mockReturnValue(false);

      const tsxCommand = ['/mock/tsx'];
      const mcpToolsPath = '/mock/mcp-tools';
      const mcpName = 'test-mcp';
      const sourceRelPath = 'src/index.ts';
      const distRelPath = 'dist/index.js';

      // Act
      const result = resolveMcpCommand(tsxCommand, mcpToolsPath, mcpName, sourceRelPath, distRelPath);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('/mock/tsx');
      expect(result[1]).toContain('src/index.ts');
    });

    it('should respect OPENWORK_BUNDLED_MCP env var', () => {
      // Arrange
      mockApp.isPackaged = false; // Not packaged
      process.env.OPENWORK_BUNDLED_MCP = '1'; // But env var set
      mockGetNodePath.mockReturnValue('/bundled/node');
      mockFs.existsSync.mockImplementation((p: unknown) => {
        const pathStr = String(p);
        return pathStr.includes('dist/index.js');
      });

      const tsxCommand = ['npx', 'tsx'];
      const mcpToolsPath = '/mock/mcp-tools';
      const mcpName = 'test-mcp';
      const sourceRelPath = 'src/index.ts';
      const distRelPath = 'dist/index.js';

      // Act
      const result = resolveMcpCommand(tsxCommand, mcpToolsPath, mcpName, sourceRelPath, distRelPath);

      // Assert - should use bundled path even though not packaged
      expect(result[0]).toBe('/bundled/node');
      expect(result[1]).toContain('dist/index.js');
    });

    it('should build correct source path from mcpToolsPath and mcpName', () => {
      // Arrange
      mockApp.isPackaged = false;
      mockFs.existsSync.mockReturnValue(false);

      const tsxCommand = ['/mock/tsx'];
      const mcpToolsPath = '/custom/mcp-tools';
      const mcpName = 'my-custom-mcp';
      const sourceRelPath = 'src/main.ts';
      const distRelPath = 'dist/main.js';

      // Act
      const result = resolveMcpCommand(tsxCommand, mcpToolsPath, mcpName, sourceRelPath, distRelPath);

      // Assert
      expect(result[1]).toBe('/custom/mcp-tools/my-custom-mcp/src/main.ts');
    });

    it('should build correct dist path from mcpToolsPath and mcpName', () => {
      // Arrange
      mockApp.isPackaged = true;
      mockGetNodePath.mockReturnValue('/bundled/node');
      mockFs.existsSync.mockImplementation((p: unknown) => {
        const pathStr = String(p);
        return pathStr.includes('dist');
      });

      const tsxCommand = ['npx', 'tsx'];
      const mcpToolsPath = '/custom/mcp-tools';
      const mcpName = 'my-custom-mcp';
      const sourceRelPath = 'src/main.ts';
      const distRelPath = 'dist/main.js';

      // Act
      const result = resolveMcpCommand(tsxCommand, mcpToolsPath, mcpName, sourceRelPath, distRelPath);

      // Assert
      expect(result[1]).toBe('/custom/mcp-tools/my-custom-mcp/dist/main.js');
    });

    it('should fall back to source when dist does not exist in packaged mode', () => {
      // Arrange
      mockApp.isPackaged = true;
      mockFs.existsSync.mockReturnValue(false); // dist does not exist

      const tsxCommand = ['/mock/tsx'];
      const mcpToolsPath = '/mock/mcp-tools';
      const mcpName = 'test-mcp';
      const sourceRelPath = 'src/index.ts';
      const distRelPath = 'dist/index.js';

      // Act
      const result = resolveMcpCommand(tsxCommand, mcpToolsPath, mcpName, sourceRelPath, distRelPath);

      // Assert - should fall back to tsx + source
      expect(result[0]).toBe('/mock/tsx');
      expect(result[1]).toContain('src/index.ts');
    });

    it('should spread tsx command array correctly', () => {
      // Arrange
      mockApp.isPackaged = false;
      mockFs.existsSync.mockReturnValue(false);

      const tsxCommand = ['npx', 'tsx']; // Two-element command
      const mcpToolsPath = '/mock/mcp-tools';
      const mcpName = 'test-mcp';
      const sourceRelPath = 'src/index.ts';
      const distRelPath = 'dist/index.js';

      // Act
      const result = resolveMcpCommand(tsxCommand, mcpToolsPath, mcpName, sourceRelPath, distRelPath);

      // Assert
      expect(result).toHaveLength(3);
      expect(result[0]).toBe('npx');
      expect(result[1]).toBe('tsx');
      expect(result[2]).toContain('src/index.ts');
    });
  });
});
