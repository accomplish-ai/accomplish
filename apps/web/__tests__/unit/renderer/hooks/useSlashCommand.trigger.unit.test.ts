import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { mockSkillsWithHidden, createTextareaRef } from '../__helpers__/slashCommandTestUtils';
import type { UseSlashCommandReturn } from '@/hooks/useSlashCommand';

const mockGetEnabledSkills = vi.fn().mockResolvedValue(mockSkillsWithHidden);

vi.mock('@/lib/accomplish', () => ({
  getAccomplish: () => ({
    getEnabledSkills: mockGetEnabledSkills,
  }),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { useSlashCommand } from '@/hooks/useSlashCommand';

async function renderSlashHook(initialValue = '', ref?: ReturnType<typeof createTextareaRef>) {
  const onChange = vi.fn();
  const textareaRef = ref ?? createTextareaRef({ selectionStart: initialValue.length });
  const hook = renderHook(() => useSlashCommand({ value: initialValue, textareaRef, onChange }));
  await act(async () => {});
  return { hook, onChange, ref: textareaRef };
}

async function openPopover(
  hook: ReturnType<typeof renderHook<UseSlashCommandReturn, unknown>>,
  value = '/',
  cursor?: number,
) {
  await act(async () => {
    hook.result.current.handleChange(value, cursor ?? value.length);
  });
}

describe('useSlashCommand – trigger detection & filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEnabledSkills.mockResolvedValue(mockSkillsWithHidden);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should start with popover closed', async () => {
      const { hook } = await renderSlashHook();
      expect(hook.result.current.state.isOpen).toBe(false);
      expect(hook.result.current.state.filteredSkills).toEqual([]);
    });

    it('should load skills on mount', async () => {
      await renderSlashHook();
      expect(mockGetEnabledSkills).toHaveBeenCalledOnce();
    });

    it('should filter out hidden skills', async () => {
      const { hook } = await renderSlashHook();
      await openPopover(hook);
      const { filteredSkills } = hook.result.current.state;
      expect(filteredSkills).toHaveLength(2);
      expect(filteredSkills.every((s) => !s.isHidden)).toBe(true);
    });
  });

  describe('slash trigger detection', () => {
    it('should open popover when "/" is typed at start of input', async () => {
      const { hook } = await renderSlashHook();
      await openPopover(hook, '/', 1);
      expect(hook.result.current.state.isOpen).toBe(true);
      expect(hook.result.current.state.triggerStart).toBe(0);
    });

    it('should open popover when "/" is typed after a space', async () => {
      const { hook } = await renderSlashHook();
      await openPopover(hook, 'hello /', 7);
      expect(hook.result.current.state.isOpen).toBe(true);
      expect(hook.result.current.state.triggerStart).toBe(6);
    });

    it('should open popover when "/" is typed after a newline', async () => {
      const { hook } = await renderSlashHook();
      await openPopover(hook, 'hello\n/', 7);
      expect(hook.result.current.state.isOpen).toBe(true);
      expect(hook.result.current.state.triggerStart).toBe(6);
    });

    it('should not open popover for "/" in the middle of a word', async () => {
      const { hook } = await renderSlashHook();
      await act(async () => {
        hook.result.current.handleChange('http://example.com', 18);
      });
      expect(hook.result.current.state.isOpen).toBe(false);
    });

    it('should not open popover when no "/" is present', async () => {
      const { hook } = await renderSlashHook();
      await act(async () => {
        hook.result.current.handleChange('hello world', 11);
      });
      expect(hook.result.current.state.isOpen).toBe(false);
    });

    it('should close popover when space is typed after slash query', async () => {
      const { hook } = await renderSlashHook();
      await openPopover(hook, '/code', 5);
      expect(hook.result.current.state.isOpen).toBe(true);
      act(() => {
        hook.result.current.handleChange('/code ', 6);
      });
      expect(hook.result.current.state.isOpen).toBe(false);
    });
  });

  describe('filtering', () => {
    it('should show all visible skills when "/" is typed with no query', async () => {
      const { hook } = await renderSlashHook();
      await openPopover(hook);
      expect(hook.result.current.state.filteredSkills).toHaveLength(2);
      expect(hook.result.current.state.query).toBe('');
    });

    it('should filter skills by command', async () => {
      const { hook } = await renderSlashHook();
      await openPopover(hook, '/code', 5);
      expect(hook.result.current.state.filteredSkills).toHaveLength(1);
      expect(hook.result.current.state.filteredSkills[0].command).toBe('/code-review');
    });

    it('should filter skills by name', async () => {
      const { hook } = await renderSlashHook();
      await openPopover(hook, '/git', 4);
      expect(hook.result.current.state.filteredSkills).toHaveLength(1);
      expect(hook.result.current.state.filteredSkills[0].name).toBe('Git Helper');
    });

    it('should filter skills by description', async () => {
      const { hook } = await renderSlashHook();
      await openPopover(hook, '/bugs', 5);
      expect(hook.result.current.state.filteredSkills).toHaveLength(1);
      expect(hook.result.current.state.filteredSkills[0].command).toBe('/code-review');
    });

    it('should be case-insensitive', async () => {
      const { hook } = await renderSlashHook();
      await openPopover(hook, '/CODE', 5);
      expect(hook.result.current.state.filteredSkills).toHaveLength(1);
      expect(hook.result.current.state.filteredSkills[0].command).toBe('/code-review');
    });

    it('should return empty list when no skills match', async () => {
      const { hook } = await renderSlashHook();
      await openPopover(hook, '/xyz', 4);
      expect(hook.result.current.state.filteredSkills).toHaveLength(0);
    });
  });
});
