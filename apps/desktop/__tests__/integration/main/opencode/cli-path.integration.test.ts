import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import path from 'path';

const originalAppRoot = process.env.APP_ROOT;

const mockApp = {
  isPackaged: false,
  getAppPath: vi.fn(() => '/mock/app/path'),
};

vi.mock('electron', () => ({
  app: mockApp,
}));

const mockFs = {
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
};

vi.mock('fs', () => ({
  default: mockFs,
  existsSync: mockFs.existsSync,
  readdirSync: mockFs.readdirSync,
  readFileSync: mockFs.readFileSync,
}));

const mockExecSync = vi.fn();

vi.mock('child_process', () => ({
  execSync: mockExecSync,
}));

vi.mock('@accomplish_ai/agent-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@accomplish_ai/agent-core')>();
  return {
    ...actual,
    getSelectedModel: vi.fn(() => null),
    getAzureFoundryConfig: vi.fn(() => null),
    getActiveProviderModel: vi.fn(() => null),
    getConnectedProvider: vi.fn(() => null),
    getAzureEntraToken: vi.fn(() => ({ success: true, token: 'mock-token' })),
    getModelDisplayName: vi.fn(() => 'Mock Model'),
    ensureDevBrowserServer: vi.fn(),
    getOpenAiBaseUrl: vi.fn(() => ''),
  };
});

describe('OpenCode CLI Path Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockApp.isPackaged = false;
    delete process.env.APP_ROOT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalAppRoot === undefined) {
      delete process.env.APP_ROOT;
    } else {
      process.env.APP_ROOT = originalAppRoot;
    }
  });

  describe('getOpenCodeCliPath()', () => {
    it('resolves local CLI from appPath in development mode', async () => {
      const appPath = '/mock/app/path';
      const localCliPath =
        process.platform === 'win32'
          ? path.join(appPath, 'node_modules', 'opencode-windows-x64', 'bin', 'opencode.exe')
          : path.join(appPath, 'node_modules', '.bin', 'opencode');
      mockApp.getAppPath.mockReturnValue(appPath);
      mockFs.existsSync.mockImplementation((p: string) => p === localCliPath);

      const { getOpenCodeCliPath } = await import('@main/opencode/electron-options');
      const result = getOpenCodeCliPath();

      expect(result.command).toBe(localCliPath);
      expect(result.args).toEqual([]);
    });

    it('resolves local CLI from APP_ROOT when appPath lookup fails', async () => {
      const appPath = '/mock/app/path';
      const appRoot = '/mock/app/root';
      process.env.APP_ROOT = appRoot;
      const localCliPath =
        process.platform === 'win32'
          ? path.join(appRoot, 'node_modules', 'opencode-windows-x64', 'bin', 'opencode.exe')
          : path.join(appRoot, 'node_modules', '.bin', 'opencode');
      mockApp.getAppPath.mockReturnValue(appPath);
      mockFs.existsSync.mockImplementation((p: string) => p === localCliPath);

      const { getOpenCodeCliPath } = await import('@main/opencode/electron-options');
      const result = getOpenCodeCliPath();

      expect(result.command).toBe(localCliPath);
      expect(result.args).toEqual([]);
    });

    it('throws when local CLI is missing in development mode', async () => {
      mockFs.existsSync.mockReturnValue(false);
      const { getOpenCodeCliPath } = await import('@main/opencode/electron-options');

      expect(() => getOpenCodeCliPath()).toThrow('OpenCode CLI executable not found');
    });

    it('resolves bundled CLI from packaged resources', async () => {
      mockApp.isPackaged = true;
      const resourcesPath = '/Applications/Accomplish.app/Contents/Resources';
      (process as NodeJS.Process & { resourcesPath: string }).resourcesPath = resourcesPath;
      let packageName: string;
      if (process.platform === 'win32') {
        packageName = 'opencode-windows-x64';
      } else if (process.platform === 'linux') {
        packageName = process.arch === 'arm64' ? 'opencode-linux-arm64' : 'opencode-linux-x64';
      } else {
        packageName = 'opencode-ai';
      }
      const binaryName = process.platform === 'win32' ? 'opencode.exe' : 'opencode';
      const bundledCliPath = path.join(
        resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        packageName,
        'bin',
        binaryName,
      );

      mockFs.existsSync.mockImplementation((p: string) => p === bundledCliPath);

      const { getOpenCodeCliPath } = await import('@main/opencode/electron-options');
      const result = getOpenCodeCliPath();

      expect(result.command).toBe(bundledCliPath);
      expect(result.args).toEqual([]);
    });
  });

  describe('isOpenCodeBundled()', () => {
    it('returns true when local workspace CLI is available', async () => {
      const appPath = '/mock/app/path';
      const localCliPath =
        process.platform === 'win32'
          ? path.join(appPath, 'node_modules', 'opencode-windows-x64', 'bin', 'opencode.exe')
          : path.join(appPath, 'node_modules', '.bin', 'opencode');
      mockApp.getAppPath.mockReturnValue(appPath);
      mockFs.existsSync.mockImplementation((p: string) => p === localCliPath);

      const { isOpenCodeBundled } = await import('@main/opencode/electron-options');
      expect(isOpenCodeBundled()).toBe(true);
    });

    it('returns false when no local workspace CLI is available', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { isOpenCodeBundled } = await import('@main/opencode/electron-options');
      expect(isOpenCodeBundled()).toBe(false);
    });
  });
});
