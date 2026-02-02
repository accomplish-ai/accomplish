/**
 * Unit tests for System Prompt Module
 *
 * Tests the system prompt generation including:
 * - Platform-specific environment instructions (Windows, macOS, Linux)
 * - Full system prompt building with/without skills
 * - BASE_SYSTEM_PROMPT_TEMPLATE content validation
 *
 * NOTE: This is a UNIT test, not an integration test.
 * We mock process.platform to test platform-specific behavior.
 *
 * @module __tests__/unit/main/opencode/config-generator/system-prompt.unit.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Skill } from '@accomplish/shared';

describe('System Prompt Module', () => {
  // Store original platform to restore after tests
  const originalPlatform = process.platform;

  // Helper to mock platform
  const mockPlatform = (platform: NodeJS.Platform) => {
    Object.defineProperty(process, 'platform', {
      value: platform,
      writable: true,
      configurable: true,
    });
  };

  afterEach(() => {
    // Restore original platform
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true,
      configurable: true,
    });
    vi.resetModules();
  });

  describe('getPlatformEnvironmentInstructions()', () => {
    describe('Windows (win32)', () => {
      beforeEach(() => {
        mockPlatform('win32');
      });

      it('should return Windows instructions when platform is win32', async () => {
        // Re-import after platform change
        const { getPlatformEnvironmentInstructions } = await import(
          '@main/opencode/config-generator/system-prompt'
        );

        const result = getPlatformEnvironmentInstructions();

        expect(result).toContain('Windows');
      });

      it('should mention PowerShell in Windows instructions', async () => {
        const { getPlatformEnvironmentInstructions } = await import(
          '@main/opencode/config-generator/system-prompt'
        );

        const result = getPlatformEnvironmentInstructions();

        expect(result).toContain('PowerShell');
      });

      it('should mention $env:TEMP in Windows instructions', async () => {
        const { getPlatformEnvironmentInstructions } = await import(
          '@main/opencode/config-generator/system-prompt'
        );

        const result = getPlatformEnvironmentInstructions();

        expect(result).toContain('$env:TEMP');
      });

      it('should mention semicolon separator in Windows instructions', async () => {
        const { getPlatformEnvironmentInstructions } = await import(
          '@main/opencode/config-generator/system-prompt'
        );

        const result = getPlatformEnvironmentInstructions();

        expect(result).toContain('semicolon');
        expect(result).toContain(';');
      });

      it('should mention $env:VAR syntax in Windows instructions', async () => {
        const { getPlatformEnvironmentInstructions } = await import(
          '@main/opencode/config-generator/system-prompt'
        );

        const result = getPlatformEnvironmentInstructions();

        expect(result).toContain('$env:VAR');
      });

      it('should wrap Windows instructions in <environment> tags', async () => {
        const { getPlatformEnvironmentInstructions } = await import(
          '@main/opencode/config-generator/system-prompt'
        );

        const result = getPlatformEnvironmentInstructions();

        expect(result).toMatch(/^<environment>/);
        expect(result).toMatch(/<\/environment>$/);
      });
    });

    describe('macOS (darwin)', () => {
      beforeEach(() => {
        mockPlatform('darwin');
      });

      it('should return macOS instructions when platform is darwin', async () => {
        const { getPlatformEnvironmentInstructions } = await import(
          '@main/opencode/config-generator/system-prompt'
        );

        const result = getPlatformEnvironmentInstructions();

        expect(result).toContain('macOS');
      });

      it('should wrap macOS instructions in <environment> tags', async () => {
        const { getPlatformEnvironmentInstructions } = await import(
          '@main/opencode/config-generator/system-prompt'
        );

        const result = getPlatformEnvironmentInstructions();

        expect(result).toMatch(/^<environment>/);
        expect(result).toMatch(/<\/environment>$/);
      });

      it('should NOT contain Windows-specific instructions for macOS', async () => {
        const { getPlatformEnvironmentInstructions } = await import(
          '@main/opencode/config-generator/system-prompt'
        );

        const result = getPlatformEnvironmentInstructions();

        expect(result).not.toContain('PowerShell');
        expect(result).not.toContain('$env:TEMP');
      });
    });

    describe('Linux', () => {
      beforeEach(() => {
        mockPlatform('linux');
      });

      it('should return Linux instructions when platform is linux', async () => {
        const { getPlatformEnvironmentInstructions } = await import(
          '@main/opencode/config-generator/system-prompt'
        );

        const result = getPlatformEnvironmentInstructions();

        expect(result).toContain('Linux');
      });

      it('should wrap Linux instructions in <environment> tags', async () => {
        const { getPlatformEnvironmentInstructions } = await import(
          '@main/opencode/config-generator/system-prompt'
        );

        const result = getPlatformEnvironmentInstructions();

        expect(result).toMatch(/^<environment>/);
        expect(result).toMatch(/<\/environment>$/);
      });

      it('should NOT contain Windows-specific instructions for Linux', async () => {
        const { getPlatformEnvironmentInstructions } = await import(
          '@main/opencode/config-generator/system-prompt'
        );

        const result = getPlatformEnvironmentInstructions();

        expect(result).not.toContain('PowerShell');
        expect(result).not.toContain('$env:TEMP');
      });

      it('should NOT contain macOS text for Linux', async () => {
        const { getPlatformEnvironmentInstructions } = await import(
          '@main/opencode/config-generator/system-prompt'
        );

        const result = getPlatformEnvironmentInstructions();

        expect(result).not.toContain('macOS');
      });
    });

    describe('Other platforms (fallback to Linux)', () => {
      beforeEach(() => {
        // Use freebsd as an example of "other" platform
        mockPlatform('freebsd');
      });

      it('should return Linux instructions for unknown platforms', async () => {
        const { getPlatformEnvironmentInstructions } = await import(
          '@main/opencode/config-generator/system-prompt'
        );

        const result = getPlatformEnvironmentInstructions();

        expect(result).toContain('Linux');
      });
    });
  });

  describe('buildFullSystemPrompt()', () => {
    beforeEach(() => {
      // Use darwin for consistent test results
      mockPlatform('darwin');
    });

    it('should replace placeholder with platform instructions', async () => {
      const { buildFullSystemPrompt } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      const result = buildFullSystemPrompt();

      // Should NOT contain the placeholder
      expect(result).not.toContain('{{ENVIRONMENT_INSTRUCTIONS}}');
      // Should contain the actual environment tag
      expect(result).toContain('<environment>');
      expect(result).toContain('macOS');
    });

    it('should return prompt without skills section when no skills provided', async () => {
      const { buildFullSystemPrompt } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      const result = buildFullSystemPrompt();

      // The dynamic skills section includes "**Available Skills:**" header
      // Note: The base template references <available-skills> in instructions,
      // so we check for the actual dynamic content marker instead
      expect(result).not.toContain('**Available Skills:**');
      expect(result).not.toContain('# SKILLS - Include relevant ones');
    });

    it('should return prompt without skills section when skills is undefined', async () => {
      const { buildFullSystemPrompt } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      const result = buildFullSystemPrompt(undefined);

      expect(result).not.toContain('**Available Skills:**');
    });

    it('should return prompt without skills section when skills array is empty', async () => {
      const { buildFullSystemPrompt } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      const result = buildFullSystemPrompt([]);

      expect(result).not.toContain('**Available Skills:**');
      expect(result).not.toContain('# SKILLS - Include relevant ones');
    });

    it('should include <available-skills> section when skills are provided', async () => {
      const { buildFullSystemPrompt } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      const skills: Skill[] = [
        {
          id: 'skill-1',
          name: 'Test Skill',
          command: '/test-skill',
          description: 'A test skill for testing',
          source: 'official',
          isEnabled: true,
          isVerified: true,
          isHidden: false,
          filePath: '/path/to/SKILL.md',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const result = buildFullSystemPrompt(skills);

      expect(result).toContain('<available-skills>');
      expect(result).toContain('</available-skills>');
    });

    it('should list all skill names in the skills section', async () => {
      const { buildFullSystemPrompt } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      const skills: Skill[] = [
        {
          id: 'skill-1',
          name: 'First Skill',
          command: '/first',
          description: 'First skill description',
          source: 'official',
          isEnabled: true,
          isVerified: true,
          isHidden: false,
          filePath: '/path/to/first/SKILL.md',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'skill-2',
          name: 'Second Skill',
          command: '/second',
          description: 'Second skill description',
          source: 'community',
          isEnabled: true,
          isVerified: false,
          isHidden: false,
          filePath: '/path/to/second/SKILL.md',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      const result = buildFullSystemPrompt(skills);

      expect(result).toContain('First Skill');
      expect(result).toContain('Second Skill');
    });

    it('should include skill commands in the skills section', async () => {
      const { buildFullSystemPrompt } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      const skills: Skill[] = [
        {
          id: 'skill-1',
          name: 'Browser Dev',
          command: '/dev-browser',
          description: 'Development browser skill',
          source: 'official',
          isEnabled: true,
          isVerified: true,
          isHidden: false,
          filePath: '/skills/dev-browser/SKILL.md',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const result = buildFullSystemPrompt(skills);

      expect(result).toContain('/dev-browser');
    });

    it('should include skill descriptions in the skills section', async () => {
      const { buildFullSystemPrompt } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      const skills: Skill[] = [
        {
          id: 'skill-1',
          name: 'File Organizer',
          command: '/organize',
          description: 'Organizes files by type and date',
          source: 'custom',
          isEnabled: true,
          isVerified: false,
          isHidden: false,
          filePath: '/skills/organize/SKILL.md',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const result = buildFullSystemPrompt(skills);

      expect(result).toContain('Organizes files by type and date');
    });

    it('should include skill file paths in the skills section', async () => {
      const { buildFullSystemPrompt } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      const skills: Skill[] = [
        {
          id: 'skill-1',
          name: 'Custom Skill',
          command: '/custom',
          description: 'A custom skill',
          source: 'custom',
          isEnabled: true,
          isVerified: false,
          isHidden: false,
          filePath: '/Users/test/skills/custom/SKILL.md',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const result = buildFullSystemPrompt(skills);

      expect(result).toContain('/Users/test/skills/custom/SKILL.md');
    });

    it('should format multiple skills correctly', async () => {
      const { buildFullSystemPrompt } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      const skills: Skill[] = [
        {
          id: 'skill-1',
          name: 'Skill One',
          command: '/one',
          description: 'First skill',
          source: 'official',
          isEnabled: true,
          isVerified: true,
          isHidden: false,
          filePath: '/skills/one/SKILL.md',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'skill-2',
          name: 'Skill Two',
          command: '/two',
          description: 'Second skill',
          source: 'official',
          isEnabled: true,
          isVerified: true,
          isHidden: false,
          filePath: '/skills/two/SKILL.md',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'skill-3',
          name: 'Skill Three',
          command: '/three',
          description: 'Third skill',
          source: 'community',
          isEnabled: true,
          isVerified: false,
          isHidden: false,
          filePath: '/skills/three/SKILL.md',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const result = buildFullSystemPrompt(skills);

      // All skills should be present
      expect(result).toContain('Skill One');
      expect(result).toContain('Skill Two');
      expect(result).toContain('Skill Three');
      expect(result).toContain('/one');
      expect(result).toContain('/two');
      expect(result).toContain('/three');
    });

    it('should include instructions to read SKILL.md files', async () => {
      const { buildFullSystemPrompt } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      const skills: Skill[] = [
        {
          id: 'skill-1',
          name: 'Test Skill',
          command: '/test',
          description: 'Test',
          source: 'official',
          isEnabled: true,
          isVerified: true,
          isHidden: false,
          filePath: '/path/SKILL.md',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const result = buildFullSystemPrompt(skills);

      expect(result).toContain('MUST read the SKILL.md file');
    });

    it('should include instruction about empty skills array', async () => {
      const { buildFullSystemPrompt } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      const skills: Skill[] = [
        {
          id: 'skill-1',
          name: 'Test Skill',
          command: '/test',
          description: 'Test',
          source: 'official',
          isEnabled: true,
          isVerified: true,
          isHidden: false,
          filePath: '/path/SKILL.md',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const result = buildFullSystemPrompt(skills);

      expect(result).toContain('empty array []');
    });
  });

  describe('BASE_SYSTEM_PROMPT_TEMPLATE', () => {
    it('should contain <identity> section', async () => {
      const { BASE_SYSTEM_PROMPT_TEMPLATE } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('<identity>');
      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('</identity>');
      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('Accomplish');
    });

    it('should contain <behavior name="task-planning"> section', async () => {
      const { BASE_SYSTEM_PROMPT_TEMPLATE } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('<behavior name="task-planning">');
      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('start_task');
    });

    it('should contain <capabilities> section', async () => {
      const { BASE_SYSTEM_PROMPT_TEMPLATE } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('<capabilities>');
      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('</capabilities>');
      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('Browser Automation');
    });

    it('should contain <important name="filesystem-rules"> section', async () => {
      const { BASE_SYSTEM_PROMPT_TEMPLATE } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('<important name="filesystem-rules">');
      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('FILE PERMISSION WORKFLOW');
      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('request_file_permission');
    });

    it('should contain <tool name="request_file_permission"> section', async () => {
      const { BASE_SYSTEM_PROMPT_TEMPLATE } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('<tool name="request_file_permission">');
      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('</tool>');
      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('operation');
      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('filePath');
    });

    it('should contain <important name="user-communication"> section', async () => {
      const { BASE_SYSTEM_PROMPT_TEMPLATE } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('<important name="user-communication">');
      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('AskUserQuestion');
    });

    it('should contain complete_task behavior documentation', async () => {
      const { BASE_SYSTEM_PROMPT_TEMPLATE } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('complete_task');
      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('status: "success"');
      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('status: "blocked"');
      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('status: "partial"');
    });

    it('should contain {{ENVIRONMENT_INSTRUCTIONS}} placeholder', async () => {
      const { BASE_SYSTEM_PROMPT_TEMPLATE } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('{{ENVIRONMENT_INSTRUCTIONS}}');
    });

    it('should contain todowrite instructions', async () => {
      const { BASE_SYSTEM_PROMPT_TEMPLATE } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('todowrite');
      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('in_progress');
      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('completed');
    });

    it('should contain browser automation instructions', async () => {
      const { BASE_SYSTEM_PROMPT_TEMPLATE } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('browser_script');
      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('browser_batch_actions');
      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('browser_sequence');
    });

    it('should warn against using shell commands for browser opening', async () => {
      const { BASE_SYSTEM_PROMPT_TEMPLATE } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('NEVER use shell commands');
      expect(BASE_SYSTEM_PROMPT_TEMPLATE).toContain('open, xdg-open, start');
    });
  });

  describe('Platform-specific buildFullSystemPrompt integration', () => {
    it('should include Windows instructions in full prompt for win32', async () => {
      mockPlatform('win32');
      vi.resetModules();

      const { buildFullSystemPrompt } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      const result = buildFullSystemPrompt();

      expect(result).toContain('Windows');
      expect(result).toContain('PowerShell');
      expect(result).not.toContain('{{ENVIRONMENT_INSTRUCTIONS}}');
    });

    it('should include macOS instructions in full prompt for darwin', async () => {
      mockPlatform('darwin');
      vi.resetModules();

      const { buildFullSystemPrompt } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      const result = buildFullSystemPrompt();

      expect(result).toContain('macOS');
      expect(result).not.toContain('PowerShell');
      expect(result).not.toContain('{{ENVIRONMENT_INSTRUCTIONS}}');
    });

    it('should include Linux instructions in full prompt for linux', async () => {
      mockPlatform('linux');
      vi.resetModules();

      const { buildFullSystemPrompt } = await import(
        '@main/opencode/config-generator/system-prompt'
      );

      const result = buildFullSystemPrompt();

      expect(result).toContain('Linux');
      expect(result).not.toContain('macOS');
      expect(result).not.toContain('PowerShell');
    });
  });
});
