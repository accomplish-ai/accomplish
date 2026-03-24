import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import path from 'path';

const originalPlatform = process.platform;
const originalArch = process.arch;
const originalAppRoot = process.env.APP_ROOT;
const processWithResources = process as NodeJS.Process & { resourcesPath?: string };
const originalResourcesPath = processWithResources.resourcesPath;

const { mockApp, mockFs } = vi.hoisted(() => ({
  mockApp: {
    isPackaged: false,
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return '/mock/userData';
      if (name === 'temp') return '/mock/temp';
      return '/mock/path';
    }),
    getAppPath: vi.fn(() => '/mock/appPath'),
  },
  mockFs: {
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  app: mockApp,
}));

vi.mock('fs', () => ({
  default: mockFs,
  existsSync: mockFs.existsSync,
  readdirSync: mockFs.readdirSync,
}));

describe('Bundled Node.js Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockApp.isPackaged = false;
    delete process.env.APP_ROOT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    Object.defineProperty(process, 'arch', { value: originalArch });
    if (originalResourcesPath === undefined) {
      delete processWithResources.resourcesPath;
    } else {
      processWithResources.resourcesPath = originalResourcesPath;
    }
    if (originalAppRoot === undefined) {
      delete process.env.APP_ROOT;
    } else {
      process.env.APP_ROOT = originalAppRoot;
    }
  });

  it('resolves development bundled node paths from local resources', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    Object.defineProperty(process, 'arch', { value: 'arm64' });
    const devNodeRoot = path.join('/mock/appPath', 'resources', 'nodejs', 'darwin-arm64');
    const nodePath = path.join(devNodeRoot, 'bin', 'node');
    const npmPath = path.join(devNodeRoot, 'bin', 'npm');
    const npxPath = path.join(devNodeRoot, 'bin', 'npx');

    mockFs.existsSync.mockImplementation((input: string) => {
      return input === devNodeRoot || input === nodePath || input === npmPath || input === npxPath;
    });

    const module = await import('@main/utils/bundled-node');
    const paths = module.getBundledNodePaths();

    expect(paths).not.toBeNull();
    expect(paths?.nodeDir).toBe(devNodeRoot);
    expect(paths?.binDir).toBe(path.join(devNodeRoot, 'bin'));
    expect(paths?.nodePath).toBe(nodePath);
  });

  it('returns null when bundled node runtime is missing in development', async () => {
    mockFs.existsSync.mockReturnValue(false);
    const module = await import('@main/utils/bundled-node');

    expect(module.getBundledNodePaths()).toBeNull();
    expect(module.isBundledNodeAvailable()).toBe(false);
  });

  it('resolves packaged bundled node paths from resources', async () => {
    mockApp.isPackaged = true;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    Object.defineProperty(process, 'arch', { value: 'x64' });
    const resourcesPath = 'C:\\Program Files\\Accomplish\\resources';
    processWithResources.resourcesPath = resourcesPath;
    const nodePath = path.join(resourcesPath, 'nodejs', 'x64', 'node.exe');

    mockFs.existsSync.mockImplementation((input: string) => input === nodePath);

    const module = await import('@main/utils/bundled-node');
    const paths = module.getBundledNodePaths();

    expect(paths).not.toBeNull();
    expect(paths?.nodePath).toBe(nodePath);
    expect(module.isBundledNodeAvailable()).toBe(true);
  });

  it('getNodePath throws when bundled node is unavailable in development', async () => {
    mockFs.existsSync.mockReturnValue(false);
    const module = await import('@main/utils/bundled-node');

    expect(() => module.getNodePath()).toThrow(/Bundled Node\.js not found/);
  });

  it('getNodePath/getNpmPath/getNpxPath return bundled executable paths when available', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    Object.defineProperty(process, 'arch', { value: 'x64' });
    const devNodeRoot = path.join('/mock/appPath', 'resources', 'nodejs', 'darwin-x64');
    const nodePath = path.join(devNodeRoot, 'bin', 'node');
    const npmPath = path.join(devNodeRoot, 'bin', 'npm');
    const npxPath = path.join(devNodeRoot, 'bin', 'npx');

    mockFs.existsSync.mockImplementation((input: string) => {
      return input === devNodeRoot || input === nodePath || input === npmPath || input === npxPath;
    });

    const module = await import('@main/utils/bundled-node');
    expect(module.getNodePath()).toBe(nodePath);
    expect(module.getNpmPath()).toBe(npmPath);
    expect(module.getNpxPath()).toBe(npxPath);
  });

  it('logBundledNodeInfo warns when bundled node runtime is missing', async () => {
    mockFs.existsSync.mockReturnValue(false);
    const module = await import('@main/utils/bundled-node');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    module.logBundledNodeInfo();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('runtime artifacts are missing'));
  });
});
