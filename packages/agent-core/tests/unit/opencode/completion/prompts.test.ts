import { describe, it, expect } from 'vitest';
import {
  getContinuationPrompt,
  getPartialContinuationPrompt,
  getIncompleteTodosPrompt,
} from '../../../../src/opencode/completion/prompts.js';

describe('Completion Prompts', () => {
  describe('getContinuationPrompt', () => {
    it('should return a reminder prompt', () => {
      const prompt = getContinuationPrompt();

      expect(prompt).toContain('REMINDER: You must call complete_task when finished');
      expect(prompt).toContain('Have I actually finished everything the user asked?');
    });

    it('should include all status options', () => {
      const prompt = getContinuationPrompt();

      expect(prompt).toContain('status: "success"');
      expect(prompt).toContain('status: "blocked"');
      expect(prompt).toContain('status: "partial"');
    });

    it('should encourage continuing work', () => {
      const prompt = getContinuationPrompt();

      expect(prompt).toContain('CONTINUE WORKING');
      expect(prompt).toContain('Keep working if there\'s more to do');
    });
  });

  describe('getPartialContinuationPrompt', () => {
    it('should include remaining work', () => {
      const prompt = getPartialContinuationPrompt(
        'Item 1\nItem 2',
        'Original request here',
        'Summary of completed work'
      );

      expect(prompt).toContain('Item 1');
      expect(prompt).toContain('Item 2');
    });

    it('should include original request', () => {
      const prompt = getPartialContinuationPrompt(
        'Remaining items',
        'Build a web application',
        'Started setup'
      );

      expect(prompt).toContain('Build a web application');
      expect(prompt).toContain('## Original Request');
    });

    it('should include completed summary', () => {
      const prompt = getPartialContinuationPrompt(
        'Remaining items',
        'Original request',
        'Created project structure and installed dependencies'
      );

      expect(prompt).toContain('Created project structure and installed dependencies');
      expect(prompt).toContain('## What You Completed');
    });

    it('should include continuation plan instructions', () => {
      const prompt = getPartialContinuationPrompt(
        'Remaining',
        'Original',
        'Completed'
      );

      expect(prompt).toContain('## REQUIRED: Create a Continuation Plan');
      expect(prompt).toContain('Create a TODO list');
    });

    it('should warn against using partial status again', () => {
      const prompt = getPartialContinuationPrompt(
        'Remaining',
        'Original',
        'Completed'
      );

      expect(prompt).toContain('Do NOT call complete_task with "partial" again');
      expect(prompt).toContain('"partial" is NOT an acceptable final status');
    });

    it('should instruct to use blocked for technical blockers', () => {
      const prompt = getPartialContinuationPrompt(
        'Remaining',
        'Original',
        'Completed'
      );

      expect(prompt).toContain('login wall, CAPTCHA, rate limit, site error');
      expect(prompt).toContain('"blocked" status');
    });
  });

  describe('getIncompleteTodosPrompt', () => {
    it('should include incomplete todos', () => {
      const incompleteTodos = '- Task 1\n- Task 2\n- Task 3';
      const prompt = getIncompleteTodosPrompt(incompleteTodos);

      expect(prompt).toContain('- Task 1');
      expect(prompt).toContain('- Task 2');
      expect(prompt).toContain('- Task 3');
    });

    it('should ask to complete or cancel items', () => {
      const prompt = getIncompleteTodosPrompt('- Incomplete item');

      expect(prompt).toContain('complete these items');
      expect(prompt).toContain('mark them as cancelled');
    });

    it('should instruct to call complete_task again', () => {
      const prompt = getIncompleteTodosPrompt('- Item');

      expect(prompt).toContain('call complete_task again');
    });

    it('should mention incomplete todos in message', () => {
      const prompt = getIncompleteTodosPrompt('- Item');

      expect(prompt).toContain('marked the task complete but have incomplete todos');
    });
  });
});
