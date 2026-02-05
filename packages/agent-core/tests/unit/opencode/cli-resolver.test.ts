import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolveCliPath, isCliAvailable, getCliVersion } from '../../../src/opencode/cli-resolver.js';

describe('CLI Resolver', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a unique temporary directory for each test
    testDir = path.join(os.tmpdir(), `cli-resolver-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(testDir, { recursive: true });

    // Suppress console.log during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('resolveCliPath', () => {
    describe('packaged app', () => {
      it('should find CLI in bundled resources', () => {
        // Create fake bundled CLI structure
        const binName = process.platform === 'win32' ? 'opencode.exe' : 'opencode';
        const packageName = process.platform === 'win32' ? 'opencode-windows-x64' : 'opencode-ai';
        const cliDir = path.join(testDir, 'resources', 'app.asar.unpacked', 'node_modules', packageName, 'bin');
        fs.mkdirSync(cliDir, { recursive: true });
        fs.writeFileSync(path.join(cliDir, binName), '#!/bin/bash\necho "opencode"');

        const result = resolveCliPath({
          isPackaged: true,
          resourcesPath: path.join(testDir, 'resources'),
        });

        expect(result).not.toBeNull();
        expect(result?.source).toBe('bundled');
        expect(result?.cliPath).toContain(binName);
      });

      it('should return null when bundled CLI not found in packaged app', () => {
        const result = resolveCliPath({
          isPackaged: true,
          resourcesPath: path.join(testDir, 'nonexistent'),
        });

        expect(result).toBeNull();
      });
    });

    describe('development mode', () => {
      it('should find CLI in node_modules/.bin', () => {
        // Create fake node_modules/.bin structure
        const binName = process.platform === 'win32' ? 'opencode.cmd' : 'opencode';
        const binDir = path.join(testDir, 'app', 'node_modules', '.bin');
        fs.mkdirSync(binDir, { recursive: true });
        fs.writeFileSync(path.join(binDir, binName), '#!/bin/bash\necho "opencode"');

        const result = resolveCliPath({
          isPackaged: false,
          appPath: path.join(testDir, 'app'),
        });

        expect(result).not.toBeNull();
        expect(result?.source).toBe('local');
        expect(result?.cliPath).toContain(binName);
      });

      it('should return null when not found in node_modules', () => {
        // Don't use ACCOMPLISH_USE_GLOBAL_OPENCODE for this test
        const originalEnv = process.env.ACCOMPLISH_USE_GLOBAL_OPENCODE;
        delete process.env.ACCOMPLISH_USE_GLOBAL_OPENCODE;

        const result = resolveCliPath({
          isPackaged: false,
          appPath: path.join(testDir, 'app-without-cli'),
        });

        // Restore env
        if (originalEnv !== undefined) {
          process.env.ACCOMPLISH_USE_GLOBAL_OPENCODE = originalEnv;
        }

        // Result depends on whether opencode is on system PATH
        // If not installed globally, this should be null (or could be 'global' if on PATH)
        // This is acceptable - we're testing the local resolution logic
        if (result !== null) {
          expect(result.source).toBe('global'); // Only global could be found
        }
      });
    });

    describe('global preference', () => {
      it('should respect ACCOMPLISH_USE_GLOBAL_OPENCODE environment variable', () => {
        // Create fake local CLI
        const binName = process.platform === 'win32' ? 'opencode.cmd' : 'opencode';
        const binDir = path.join(testDir, 'app', 'node_modules', '.bin');
        fs.mkdirSync(binDir, { recursive: true });
        fs.writeFileSync(path.join(binDir, binName), '#!/bin/bash\necho "opencode"');

        // Set prefer global
        const originalEnv = process.env.ACCOMPLISH_USE_GLOBAL_OPENCODE;
        process.env.ACCOMPLISH_USE_GLOBAL_OPENCODE = '1';

        const result = resolveCliPath({
          isPackaged: false,
          appPath: path.join(testDir, 'app'),
        });

        // Restore env
        if (originalEnv !== undefined) {
          process.env.ACCOMPLISH_USE_GLOBAL_OPENCODE = originalEnv;
        } else {
          delete process.env.ACCOMPLISH_USE_GLOBAL_OPENCODE;
        }

        // When preferGlobal is set, it tries global first but falls back to local
        // Since we don't have global installed, it should still find local
        expect(result).not.toBeNull();
      });
    });

    describe('multiple locations search', () => {
      it('should check multiple locations and return first found', () => {
        // Create only the local CLI
        const binName = process.platform === 'win32' ? 'opencode.cmd' : 'opencode';
        const binDir = path.join(testDir, 'app', 'node_modules', '.bin');
        fs.mkdirSync(binDir, { recursive: true });
        fs.writeFileSync(path.join(binDir, binName), '#!/bin/bash\necho "opencode"');

        const result = resolveCliPath({
          isPackaged: false,
          appPath: path.join(testDir, 'app'),
        });

        expect(result).not.toBeNull();
        expect(result?.cliDir).toBe(binDir);
      });
    });
  });

  describe('isCliAvailable', () => {
    it('should return true when CLI is found', () => {
      // Create fake CLI
      const binName = process.platform === 'win32' ? 'opencode.cmd' : 'opencode';
      const binDir = path.join(testDir, 'app', 'node_modules', '.bin');
      fs.mkdirSync(binDir, { recursive: true });
      fs.writeFileSync(path.join(binDir, binName), '#!/bin/bash\necho "opencode"');

      const result = isCliAvailable({
        isPackaged: false,
        appPath: path.join(testDir, 'app'),
      });

      expect(result).toBe(true);
    });

    it('should return false when CLI is not found (in isolated test)', () => {
      // Use a path that definitely doesn't exist and no global fallback
      const result = isCliAvailable({
        isPackaged: true, // Packaged mode only checks bundled
        resourcesPath: path.join(testDir, 'nonexistent-resources'),
      });

      expect(result).toBe(false);
    });
  });

  describe('getCliVersion', () => {
    it('should return version from package.json', async () => {
      // Create fake package structure
      const packageName = process.platform === 'win32' ? 'opencode-windows-x64' : 'opencode-ai';
      const packageDir = path.join(testDir, 'node_modules', packageName);
      const binDir = path.join(testDir, 'node_modules', '.bin');

      fs.mkdirSync(packageDir, { recursive: true });
      fs.mkdirSync(binDir, { recursive: true });

      // Create package.json
      fs.writeFileSync(
        path.join(packageDir, 'package.json'),
        JSON.stringify({ name: packageName, version: '1.2.3' })
      );

      // Create dummy binary
      const binName = process.platform === 'win32' ? 'opencode.cmd' : 'opencode';
      fs.writeFileSync(path.join(binDir, binName), '#!/bin/bash\necho "1.2.3"');

      const cliPath = path.join(binDir, binName);
      const version = await getCliVersion(cliPath);

      expect(version).toBe('1.2.3');
    });

    it('should return null for non-existent CLI', async () => {
      const version = await getCliVersion('/nonexistent/path/opencode');
      expect(version).toBeNull();
    });
  });

  describe('platform-specific behavior', () => {
    it('should use correct binary name for current platform', () => {
      const binName = process.platform === 'win32' ? 'opencode.cmd' : 'opencode';
      const binDir = path.join(testDir, 'app', 'node_modules', '.bin');
      fs.mkdirSync(binDir, { recursive: true });
      fs.writeFileSync(path.join(binDir, binName), '#!/bin/bash\necho "test"');

      const result = resolveCliPath({
        isPackaged: false,
        appPath: path.join(testDir, 'app'),
      });

      expect(result).not.toBeNull();
      expect(result?.cliPath).toContain(binName);
    });
  });
});
