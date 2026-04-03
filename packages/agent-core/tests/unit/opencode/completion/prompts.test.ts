import { describe, it, expect } from 'vitest';
import {
  getContinuationPrompt,
  getPartialContinuationPrompt,
} from '../../../../src/opencode/completion/prompts.js';

describe('Completion Prompts', () => {
  describe('getContinuationPrompt', () => {
    it('should return a reminder prompt', () => {
      const prompt = getContinuationPrompt();

      expect(prompt).toContain('You stopped without calling complete_task');
      expect(prompt).toContain('have you finished everything the user asked');
    });

    it('should include all status options', () => {
      const prompt = getContinuationPrompt();

      expect(prompt).toContain('status: "success"');
      expect(prompt).toContain('status: "blocked"');
    });

    it('should encourage continuing work', () => {
      const prompt = getContinuationPrompt();

      expect(prompt).toContain('keep working on the remaining items');
    });
  });

  describe('getPartialContinuationPrompt', () => {
    it('should include remaining work', () => {
      const prompt = getPartialContinuationPrompt(
        'Item 1\nItem 2',
        'Original request here',
        'Summary of completed work',
      );

      expect(prompt).toContain('Item 1');
      expect(prompt).toContain('Item 2');
    });

    it('should include original request', () => {
      const prompt = getPartialContinuationPrompt(
        'Remaining items',
        'Build a web application',
        'Started setup',
      );

      expect(prompt).toContain('Build a web application');
      expect(prompt).toContain('## Original Request');
    });

    it('should include completed summary', () => {
      const prompt = getPartialContinuationPrompt(
        'Remaining items',
        'Original request',
        'Created project structure and installed dependencies',
      );

      expect(prompt).toContain('Created project structure and installed dependencies');
      expect(prompt).toContain('## What You Completed');
    });

    it('should include continuation instructions', () => {
      const prompt = getPartialContinuationPrompt('Remaining', 'Original', 'Completed');

      expect(prompt).toContain('## Continue Working');
      expect(prompt).toContain('Create a TODO list');
    });

    it('should instruct to use blocked for technical blockers', () => {
      const prompt = getPartialContinuationPrompt('Remaining', 'Original', 'Completed');

      expect(prompt).toContain('login wall, CAPTCHA, rate limit, site error');
      expect(prompt).toContain('"blocked" status');
    });

    it('should encourage completing the task', () => {
      const prompt = getPartialContinuationPrompt('Remaining', 'Original', 'Completed');

      expect(prompt).toContain('Keep working until the task is complete');
    });
  });

  describe('getPartialContinuationPrompt with incompleteTodos', () => {
    it('should return a focused todowrite prompt when incompleteTodos provided', () => {
      const prompt = getPartialContinuationPrompt(
        'Remaining',
        'Original',
        'Completed',
        '- Task 1\n- Task 2',
      );

      expect(prompt).toContain('still incomplete');
      expect(prompt).toContain('- Task 1');
      expect(prompt).toContain('- Task 2');
      expect(prompt).toContain('todowrite');
      expect(prompt).toContain('"completed"');
      expect(prompt).toContain('"cancelled"');
    });

    it('should not include generic continuation plan when incompleteTodos provided', () => {
      const prompt = getPartialContinuationPrompt('Remaining', 'Original', 'Completed', '- Task 1');

      expect(prompt).not.toContain('## Continue Working');
      expect(prompt).not.toContain('## Original Request');
      expect(prompt).not.toContain('## What You Completed');
      expect(prompt).not.toContain('## What Remains');
    });

    it('should not include incomplete todos section when not provided', () => {
      const prompt = getPartialContinuationPrompt('Remaining', 'Original', 'Completed');

      expect(prompt).not.toContain('still incomplete');
      expect(prompt).toContain('## Continue Working');
    });
  });
});
