import { describe, it, expect } from 'vitest';
import { LaunchModeLauncher } from '../launcher.js';

describe('launcher', () => {
  describe('LaunchModeLauncher', () => {
    it('has correct name', () => {
      const launcher = new LaunchModeLauncher();
      expect(launcher.name).toBe('launch');
    });

    it('canUse returns boolean', async () => {
      const launcher = new LaunchModeLauncher();
      const result = await launcher.canUse();
      expect(typeof result).toBe('boolean');
    });
  });
});
