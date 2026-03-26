/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { mockSkills, createDomTextareaRef } from '../__helpers__/slashCommandTestUtils';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/accomplish', () => ({
  getAccomplish: () => ({}),
}));

import { SlashCommandPopover } from '@/components/landing/SlashCommandPopover';

describe('SlashCommandPopover – interactions', () => {
  let textareaRef: { current: HTMLTextAreaElement };

  beforeEach(() => {
    vi.clearAllMocks();
    textareaRef = createDomTextareaRef();
  });

  afterEach(() => {
    textareaRef.current?.parentNode?.removeChild(textareaRef.current);
  });

  const defaultProps = {
    query: '',
    triggerStart: 0,
    onSelect: vi.fn(),
    onDismiss: vi.fn(),
  };

  it('should call onSelect when a skill is clicked', () => {
    const onSelect = vi.fn();
    render(
      <SlashCommandPopover
        {...defaultProps}
        isOpen={true}
        skills={mockSkills}
        selectedIndex={0}
        textareaRef={textareaRef}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByText('/code-review'));
    expect(onSelect).toHaveBeenCalledWith(mockSkills[0]);
  });

  it('should call onDismiss when clicking outside', () => {
    const onDismiss = vi.fn();
    render(
      <SlashCommandPopover
        {...defaultProps}
        isOpen={true}
        skills={mockSkills}
        selectedIndex={0}
        textareaRef={textareaRef}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.mouseDown(document.body);
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
