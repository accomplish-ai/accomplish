import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  mockSkillsWithHidden,
  createTextareaRef,
  createKeyboardEvent,
} from '../__helpers__/slashCommandTestUtils';
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

describe('useSlashCommand – keyboard navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEnabledSkills.mockResolvedValue(mockSkillsWithHidden);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should not handle keys when popover is closed', async () => {
    const { hook } = await renderSlashHook();
    const event = createKeyboardEvent('ArrowDown');
    let handled: boolean;
    act(() => {
      handled = hook.result.current.handleKeyDown(event);
    });
    expect(handled!).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('should move selection down with ArrowDown', async () => {
    const { hook } = await renderSlashHook();
    await openPopover(hook);
    expect(hook.result.current.state.selectedIndex).toBe(0);
    const event = createKeyboardEvent('ArrowDown');
    act(() => {
      hook.result.current.handleKeyDown(event);
    });
    expect(hook.result.current.state.selectedIndex).toBe(1);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('should wrap around when ArrowDown reaches the end', async () => {
    const { hook } = await renderSlashHook();
    await openPopover(hook);
    act(() => {
      hook.result.current.handleKeyDown(createKeyboardEvent('ArrowDown'));
    });
    act(() => {
      hook.result.current.handleKeyDown(createKeyboardEvent('ArrowDown'));
    });
    expect(hook.result.current.state.selectedIndex).toBe(0);
  });

  it('should move selection up with ArrowUp', async () => {
    const { hook } = await renderSlashHook();
    await openPopover(hook);
    act(() => {
      hook.result.current.handleKeyDown(createKeyboardEvent('ArrowDown'));
    });
    expect(hook.result.current.state.selectedIndex).toBe(1);
    act(() => {
      hook.result.current.handleKeyDown(createKeyboardEvent('ArrowUp'));
    });
    expect(hook.result.current.state.selectedIndex).toBe(0);
  });

  it('should wrap around when ArrowUp goes below 0', async () => {
    const { hook } = await renderSlashHook();
    await openPopover(hook);
    act(() => {
      hook.result.current.handleKeyDown(createKeyboardEvent('ArrowUp'));
    });
    expect(hook.result.current.state.selectedIndex).toBe(1);
  });

  it('should dismiss popover on Escape', async () => {
    const { hook } = await renderSlashHook();
    await openPopover(hook);
    expect(hook.result.current.state.isOpen).toBe(true);
    const event = createKeyboardEvent('Escape');
    act(() => {
      hook.result.current.handleKeyDown(event);
    });
    expect(hook.result.current.state.isOpen).toBe(false);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('should select skill on Enter', async () => {
    const { hook, onChange } = await renderSlashHook();
    await openPopover(hook);
    const event = createKeyboardEvent('Enter');
    act(() => {
      hook.result.current.handleKeyDown(event);
    });
    expect(onChange).toHaveBeenCalledWith('/code-review');
    expect(hook.result.current.state.isOpen).toBe(false);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('should select skill on Tab', async () => {
    const { hook, onChange } = await renderSlashHook();
    await openPopover(hook);
    const event = createKeyboardEvent('Tab');
    act(() => {
      hook.result.current.handleKeyDown(event);
    });
    expect(onChange).toHaveBeenCalledWith('/code-review');
    expect(hook.result.current.state.isOpen).toBe(false);
  });

  it('should not handle unrelated keys', async () => {
    const { hook } = await renderSlashHook();
    await openPopover(hook);
    const event = createKeyboardEvent('a');
    let handled: boolean;
    act(() => {
      handled = hook.result.current.handleKeyDown(event);
    });
    expect(handled!).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
