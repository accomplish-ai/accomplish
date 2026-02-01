/**
 * Unit tests for Planning Context module
 *
 * Tests the planning context injection system which prepends planning
 * requirements to the user's first message in a task.
 *
 * NOTE: This is a UNIT test - no external dependencies are mocked
 * since the module is pure TypeScript with no external dependencies.
 *
 * @module __tests__/unit/main/opencode/planning-context.unit.test
 */

import { describe, it, expect } from 'vitest';
import {
  injectPlanningContext,
  PLANNING_CONTEXT,
} from '../../../../src/main/opencode/planning-context';

describe('Planning Context Module', () => {
  describe('injectPlanningContext()', () => {
    it('should prepend planning context for first messages', () => {
      // Arrange
      const prompt = 'Navigate to google.com';

      // Act
      const result = injectPlanningContext(prompt, true);

      // Assert
      expect(result).toContain('[TASK REQUIREMENTS');
      expect(result).toContain('User request: ');
      expect(result.endsWith(prompt)).toBe(true);
    });

    it('should NOT prepend planning context for follow-up messages', () => {
      // Arrange
      const prompt = 'Now click the search button';

      // Act
      const result = injectPlanningContext(prompt, false);

      // Assert
      expect(result).toBe(prompt);
      expect(result).not.toContain('[TASK REQUIREMENTS');
    });

    it('should preserve the original prompt intact', () => {
      // Arrange
      const prompt = 'Do something with special chars: <>&"\'';

      // Act
      const result = injectPlanningContext(prompt, true);

      // Assert
      expect(result).toContain(prompt);
      expect(result.endsWith(prompt)).toBe(true);
    });

    it('should work with empty prompts', () => {
      // Arrange
      const prompt = '';

      // Act
      const result = injectPlanningContext(prompt, true);

      // Assert
      expect(result).toContain('[TASK REQUIREMENTS');
      expect(result).toContain('User request: ');
      expect(result.endsWith('User request: ')).toBe(true);
    });

    it('should work with multiline prompts', () => {
      // Arrange
      const prompt = `First line
Second line
Third line`;

      // Act
      const result = injectPlanningContext(prompt, true);

      // Assert
      expect(result).toContain(prompt);
      expect(result.endsWith(prompt)).toBe(true);
    });

    it('should return exact prompt for follow-up messages without modification', () => {
      // Arrange
      const prompt = '  whitespace preserved  ';

      // Act
      const result = injectPlanningContext(prompt, false);

      // Assert
      expect(result).toBe(prompt);
    });
  });

  describe('PLANNING_CONTEXT constant', () => {
    it('should contain required planning elements', () => {
      // Assert - verify key planning instructions are present
      expect(PLANNING_CONTEXT).toContain('**Plan:**');
      expect(PLANNING_CONTEXT).toContain('todowrite');
      expect(PLANNING_CONTEXT).toContain('Self-check');
      expect(PLANNING_CONTEXT).toContain('CORRECT');
      expect(PLANNING_CONTEXT).toContain('WRONG');
    });

    it('should end with user request marker', () => {
      // Assert
      expect(PLANNING_CONTEXT).toContain('User request: ');
      expect(PLANNING_CONTEXT.endsWith('User request: ')).toBe(true);
    });

    it('should contain task requirements boundary markers', () => {
      // Assert
      expect(PLANNING_CONTEXT).toContain('[TASK REQUIREMENTS');
      expect(PLANNING_CONTEXT).toContain('[END TASK REQUIREMENTS]');
    });

    it('should contain required planning sequence', () => {
      // Assert - verify the numbered steps are present
      expect(PLANNING_CONTEXT).toContain('Required sequence:');
      expect(PLANNING_CONTEXT).toContain('1.');
      expect(PLANNING_CONTEXT).toContain('complete_task');
    });

    it('should contain goal and steps structure', () => {
      // Assert
      expect(PLANNING_CONTEXT).toContain('Goal:');
      expect(PLANNING_CONTEXT).toContain('Steps:');
    });

    it('should be a non-empty string', () => {
      // Assert
      expect(typeof PLANNING_CONTEXT).toBe('string');
      expect(PLANNING_CONTEXT.length).toBeGreaterThan(100);
    });
  });

  describe('Integration with prompt flow', () => {
    it('should produce correct output structure for first message', () => {
      // Arrange
      const userPrompt = 'Go to example.com and click the login button';

      // Act
      const result = injectPlanningContext(userPrompt, true);

      // Assert - verify structure: PLANNING_CONTEXT + prompt
      const expectedPattern = /\[TASK REQUIREMENTS.*User request: Go to example\.com/s;
      expect(result).toMatch(expectedPattern);
    });

    it('should not double-inject context if called multiple times on same prompt', () => {
      // Arrange
      const userPrompt = 'Test prompt';
      const firstInjection = injectPlanningContext(userPrompt, true);

      // Act - inject again (simulating edge case)
      const secondInjection = injectPlanningContext(firstInjection, true);

      // Assert - should have double context (function doesn't prevent this)
      // This test documents the behavior - the function is pure and doesn't track state
      const contextCount = (secondInjection.match(/\[TASK REQUIREMENTS/g) || []).length;
      expect(contextCount).toBe(2);
    });
  });
});
