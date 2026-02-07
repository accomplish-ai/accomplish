import { afterEach, describe, expect, it } from 'vitest';
import { getPlatformShell, getShellArgs, quoteForShell } from '../../../src/utils/shell.js';

const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

afterEach(() => {
  setPlatform(originalPlatform);
});

describe('shell utilities', () => {
  describe('Windows PowerShell behavior', () => {
    it('uses PowerShell on win32', () => {
      setPlatform('win32');
      expect(getPlatformShell()).toBe('powershell.exe');
    });

    it('uses PowerShell startup args optimized for cold starts', () => {
      setPlatform('win32');
      expect(getShellArgs('echo hello')).toEqual([
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        'echo hello',
      ]);
    });

    it('quotes Windows args for PowerShell safely', () => {
      setPlatform('win32');
      expect(quoteForShell("C:\\Users\\O'Brien\\Accomplish")).toBe("'C:\\Users\\O''Brien\\Accomplish'");
    });
  });

  describe('POSIX behavior', () => {
    it('uses -c on non-Windows shells', () => {
      setPlatform('linux');
      expect(getShellArgs('echo hello')).toEqual(['-c', 'echo hello']);
    });
  });
});
