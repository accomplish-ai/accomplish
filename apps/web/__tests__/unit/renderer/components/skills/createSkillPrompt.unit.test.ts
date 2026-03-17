import { describe, expect, it } from 'vitest';
import { buildCreateSkillPrompt } from '@/components/skills/createSkillPrompt';

describe('createSkillPrompt', () => {
  describe('buildCreateSkillPrompt', () => {
    it('pins only the deterministic base path for unix paths', () => {
      const prompt = buildCreateSkillPrompt({
        name: 'My Skill',
        description: 'Does useful work',
        skillsBasePath: '/Users/test/Library/Application Support/Accomplish/skills/',
        platform: 'darwin',
      });

      expect(prompt).toContain('/skill-creator');
      expect(prompt).toContain(
        'Use this exact base directory: `/Users/test/Library/Application Support/Accomplish/skills`',
      );
      expect(prompt).toContain(
        'Create exactly one new subdirectory under that base directory for this skill.',
      );
      expect(prompt).toContain(
        'End your final message with exactly: Created skill at: <absolute path to SKILL.md>',
      );
      expect(prompt).not.toContain('Use this exact skill directory name');
      expect(prompt).not.toContain('/my-skill/SKILL.md');
    });

    it('normalizes windows base path when platform is win32', () => {
      const prompt = buildCreateSkillPrompt({
        name: 'Windows Skill',
        description: 'Works on Windows',
        skillsBasePath: 'C:/Users/Test/AppData/Roaming/Accomplish/skills/',
        platform: 'win32',
      });

      expect(prompt).toContain(
        'Use this exact base directory: `C:\\Users\\Test\\AppData\\Roaming\\Accomplish\\skills`',
      );
      expect(prompt).not.toContain('C:\\\\Users');
    });

    it('keeps unix paths with spaces in user home segments', () => {
      const prompt = buildCreateSkillPrompt({
        name: 'Linux Skill',
        description: 'Works on Linux',
        skillsBasePath: '/home/Jane Doe/.local/share/Accomplish/skills/',
        platform: 'linux',
      });

      expect(prompt).toContain(
        'Use this exact base directory: `/home/Jane Doe/.local/share/Accomplish/skills`',
      );
    });

    it('keeps windows paths with spaces in user names', () => {
      const prompt = buildCreateSkillPrompt({
        name: 'Windows Skill',
        description: 'Works on Windows',
        skillsBasePath: 'C:/Users/Jane Doe/AppData/Roaming/Accomplish/skills/',
        platform: 'win32',
      });

      expect(prompt).toContain(
        'Use this exact base directory: `C:\\Users\\Jane Doe\\AppData\\Roaming\\Accomplish\\skills`',
      );
    });

    it('preserves tilde-prefixed paths without expansion', () => {
      const prompt = buildCreateSkillPrompt({
        name: 'Home Skill',
        description: 'Works with home shorthand',
        skillsBasePath: '~/.config/Accomplish/skills/',
        platform: 'linux',
      });

      expect(prompt).toContain('Use this exact base directory: `~/.config/Accomplish/skills`');
    });

    it('normalizes windows UNC network paths', () => {
      const prompt = buildCreateSkillPrompt({
        name: 'Network Skill',
        description: 'Works on network share',
        skillsBasePath: '//Server01/Accomplish/skills/',
        platform: 'win32',
      });

      expect(prompt).toContain('Use this exact base directory: `\\\\Server01\\Accomplish\\skills`');
    });

    it('preserves unix root base path', () => {
      const prompt = buildCreateSkillPrompt({
        name: 'Root Skill',
        description: 'Works at root',
        skillsBasePath: '/',
        platform: 'darwin',
      });

      expect(prompt).toContain('Use this exact base directory: `/`');
    });

    it('preserves windows root base path', () => {
      const prompt = buildCreateSkillPrompt({
        name: 'Root Skill',
        description: 'Works at root',
        skillsBasePath: '\\',
        platform: 'win32',
      });

      expect(prompt).toContain('Use this exact base directory: `\\`');
    });

    it('preserves windows drive root base path', () => {
      const prompt = buildCreateSkillPrompt({
        name: 'Drive Root Skill',
        description: 'Works at drive root',
        skillsBasePath: 'C:/',
        platform: 'win32',
      });

      expect(prompt).toContain('Use this exact base directory: `C:\\`');
    });

    it('accepts non-ascii skill names without enforcing a fixed slug', () => {
      const prompt = buildCreateSkillPrompt({
        name: 'שלום',
        description: 'Does useful work',
        skillsBasePath: '/Users/test/Library/Application Support/Accomplish/skills/',
        platform: 'darwin',
      });

      expect(prompt).toContain('- Name: "שלום"');
      expect(prompt).not.toContain('Use this exact skill directory name');
    });
  });
});
