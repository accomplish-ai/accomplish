import { describe, it, expect } from 'vitest';
import { getProfileDir, getPlatformDataDir } from '../profile.js';

describe('profile', () => {
  describe('getPlatformDataDir', () => {
    it('returns platform-specific path', () => {
      const dir = getPlatformDataDir();
      expect(dir).toContain('Accomplish');
      expect(dir).toContain('dev-browser');
    });
  });

  describe('getProfileDir', () => {
    it('returns chrome-profile subdir for system chrome', () => {
      const dir = getProfileDir('chrome');
      expect(dir).toContain('chrome-profile');
    });

    it('returns playwright-profile subdir for playwright', () => {
      const dir = getProfileDir('playwright');
      expect(dir).toContain('playwright-profile');
    });
  });
});
