import { describe, expect, it, vi, beforeEach } from 'vitest';
import { join } from 'node:path';

// Mock os.platform and os.homedir before importing the module under test.
const mockPlatform = vi.fn<() => NodeJS.Platform>(() => 'darwin');
const mockHomedir = vi.fn(() => '/Users/testuser');

vi.mock('node:os', () => ({
  platform: () => mockPlatform(),
  homedir: () => mockHomedir(),
}));

// Import after mocks are set up
const { getSocketPath, getPidFilePath, getDaemonDir } =
  await import('../../../src/daemon/socket-path.js');

describe('socket-path', () => {
  beforeEach(() => {
    mockPlatform.mockReturnValue('darwin');
    mockHomedir.mockReturnValue('/Users/testuser');
  });

  describe('getDaemonDir', () => {
    it('returns ~/.accomplish', () => {
      expect(getDaemonDir()).toBe('/Users/testuser/.accomplish');
    });
  });

  describe('getSocketPath', () => {
    it('falls back to default dir when no dataDir provided', () => {
      expect(getSocketPath()).toBe('/Users/testuser/.accomplish/daemon.sock');
    });

    it('scopes socket to provided dataDir on macOS/Linux', () => {
      const dataDir = '/custom/data/dir';
      expect(getSocketPath(dataDir)).toBe(join(dataDir, 'daemon.sock'));
    });

    it('different dataDirs produce different socket paths on macOS/Linux', () => {
      const path1 = getSocketPath('/data/profile-a');
      const path2 = getSocketPath('/data/profile-b');
      expect(path1).not.toBe(path2);
    });

    it('produces named pipe with hash on Windows', () => {
      mockPlatform.mockReturnValue('win32');
      const result = getSocketPath('C:\\Users\\test\\AppData\\Accomplish');
      expect(result).toMatch(/^\\\\.\\pipe\\accomplish-daemon-[a-f0-9]{12}$/);
    });

    it('different dataDirs produce different pipe names on Windows', () => {
      mockPlatform.mockReturnValue('win32');
      const pipe1 = getSocketPath('C:\\Users\\test\\profile-a');
      const pipe2 = getSocketPath('C:\\Users\\test\\profile-b');
      expect(pipe1).not.toBe(pipe2);
    });

    it('same dataDir produces same pipe name on Windows (deterministic)', () => {
      mockPlatform.mockReturnValue('win32');
      const dir = 'C:\\Users\\test\\data';
      expect(getSocketPath(dir)).toBe(getSocketPath(dir));
    });

    it('Windows default (no dataDir) produces a valid pipe path', () => {
      mockPlatform.mockReturnValue('win32');
      const result = getSocketPath();
      expect(result).toMatch(/^\\\\.\\pipe\\accomplish-daemon-[a-f0-9]{12}$/);
    });
  });

  describe('getPidFilePath', () => {
    it('falls back to default dir when no dataDir provided', () => {
      expect(getPidFilePath()).toBe('/Users/testuser/.accomplish/daemon.pid');
    });

    it('scopes PID file to provided dataDir', () => {
      const dataDir = '/custom/data/dir';
      expect(getPidFilePath(dataDir)).toBe(join(dataDir, 'daemon.pid'));
    });

    it('different dataDirs produce different PID paths', () => {
      const path1 = getPidFilePath('/data/profile-a');
      const path2 = getPidFilePath('/data/profile-b');
      expect(path1).not.toBe(path2);
    });
  });
});
