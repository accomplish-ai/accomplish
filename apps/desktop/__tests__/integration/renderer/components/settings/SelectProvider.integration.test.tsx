/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode }) => <div {...props}>{children}</div>,
  },
}));

import SelectProvider from '@/components/layout/settings/SelectProvider';

describe('SelectProvider', () => {
  describe('rendering', () => {
    it('should render all four providers', () => {
      render(<SelectProvider onSelect={vi.fn()} onBack={vi.fn()} />);

      expect(screen.getByText('Anthropic')).toBeInTheDocument();
      expect(screen.getByText('OpenAI')).toBeInTheDocument();
      expect(screen.getByText('Google AI')).toBeInTheDocument();
      expect(screen.getByText('xAI (Grok)')).toBeInTheDocument();
    });

    it('should render Select Provider title', () => {
      render(<SelectProvider onSelect={vi.fn()} onBack={vi.fn()} />);

      expect(screen.getByText('Select Provider')).toBeInTheDocument();
    });
  });

  describe('selection behavior', () => {
    it('should call onSelect with provider id when clicked', () => {
      const onSelect = vi.fn();
      render(<SelectProvider onSelect={onSelect} onBack={vi.fn()} />);

      fireEvent.click(screen.getByText('Anthropic'));

      expect(onSelect).toHaveBeenCalledWith('anthropic');
    });

    it('should call onBack when Back button is clicked', () => {
      const onBack = vi.fn();
      render(<SelectProvider onSelect={vi.fn()} onBack={onBack} />);

      fireEvent.click(screen.getByRole('button', { name: /back/i }));

      expect(onBack).toHaveBeenCalled();
    });
  });
});
