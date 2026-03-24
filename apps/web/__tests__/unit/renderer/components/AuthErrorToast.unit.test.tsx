/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import errorsEn from '../../../../locales/en/errors.json';

// Simple i18n mock that resolves keys from the English locale
function translateErrorsKey(key: string, options?: Record<string, unknown>): string {
  const value = key.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, errorsEn);

  if (typeof value !== 'string') {
    return key;
  }

  return Object.entries(options ?? {}).reduce((message, [name, replacement]) => {
    return message.replace(new RegExp(`{{\\s*${name}\\s*}}`, 'g'), String(replacement));
  }, value);
}

vi.mock('react-i18next', () => ({
  useTranslation: (ns: string) => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (ns === 'errors') return translateErrorsKey(key, opts);
      return key;
    },
  }),
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import { AuthErrorToast } from '../../../../src/client/components/AuthErrorToast';

describe('AuthErrorToast', () => {
  it('should not render when error is null', () => {
    const { container } = render(
      <AuthErrorToast error={null} onReLogin={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('should render error with provider name', () => {
    render(
      <AuthErrorToast
        error={{ providerId: 'anthropic', message: 'Session expired' }}
        onReLogin={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText('Anthropic Session Expired')).toBeInTheDocument();
    expect(screen.getByText('Session expired')).toBeInTheDocument();
  });

  it('should call onReLogin when re-login button is clicked', () => {
    const onReLogin = vi.fn();
    render(
      <AuthErrorToast
        error={{ providerId: 'openai', message: 'Token expired' }}
        onReLogin={onReLogin}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('auth-error-toast-relogin'));
    expect(onReLogin).toHaveBeenCalledOnce();
  });

  it('should call onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <AuthErrorToast
        error={{ providerId: 'openai', message: 'Token expired' }}
        onReLogin={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByTestId('auth-error-toast-dismiss'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('uses the explicit connectors path for Slack auth fallback', () => {
    render(
      <AuthErrorToast
        error={{ providerId: 'slack', message: 'Slack needs attention.' }}
        onReLogin={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText('Slack needs attention')).toBeInTheDocument();
    expect(screen.getByText('Open Settings -> Connectors -> Slack')).toBeInTheDocument();
  });
});
