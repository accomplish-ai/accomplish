import { describe, it, expect } from 'vitest';
import { detectPackageManager, isChromiumInstalled } from '../installer.js';

describe('installer', () => {
  describe('detectPackageManager', () => {
    it('returns a package manager or null', () => {
      const pm = detectPackageManager();
      expect(pm === null || ['bun', 'pnpm', 'npm'].includes(pm)).toBe(true);
    });
  });

  describe('isChromiumInstalled', () => {
    it('returns boolean', async () => {
      const result = await isChromiumInstalled();
      expect(typeof result).toBe('boolean');
    });
  });
});
