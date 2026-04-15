import { Component, type ReactNode, type ErrorInfo } from 'react';
import { useTranslation } from 'react-i18next';
import { WarningCircle, ArrowCounterClockwise } from '@phosphor-icons/react';
import { Button } from './button';

interface Props {
  children: ReactNode;
  /** Custom fallback. Receives the caught Error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log for debugging — uses console.error intentionally (boundary context, not production logic)
    console.error('[ErrorBoundary] caught:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return <DefaultFallback error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

interface FallbackProps {
  error: Error;
  reset: () => void;
  /** Make it compact for inline use (e.g. inside a conversation) */
  compact?: boolean;
}

export function DefaultFallback({ error, reset, compact = false }: FallbackProps) {
  const { t } = useTranslation('errors');
  const { t: tCommon } = useTranslation('common');
  const isDev: boolean = import.meta.env.DEV;
  let rawMessage = error?.message ?? String(error);
  if (!rawMessage || typeof rawMessage !== 'string' || rawMessage.trim() === '') {
    rawMessage = t('boundary.unexpectedError');
  }

  let safeMessage: string;
  if (isDev) {
    safeMessage = rawMessage.length > 500 ? rawMessage.slice(0, 500) + '...' : rawMessage;
  } else {
    safeMessage = t('boundary.unexpectedError');
  }

  if (compact) {
    return (
      <div
        className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      >
        <WarningCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate">
          {t('boundary.compactMessage')}{' '}
          <span className="opacity-60 font-mono text-xs">{safeMessage}</span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={reset}
          className="shrink-0 gap-1 text-xs text-destructive/80 hover:text-destructive hover:bg-transparent px-1"
        >
          <ArrowCounterClockwise className="h-3.5 w-3.5" />
          {tCommon('buttons.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <WarningCircle className="h-7 w-7 text-destructive" />
          </div>
        </div>
        <h2 className="mb-1 text-base font-semibold text-foreground">{t('boundary.title')}</h2>
        <p className="mb-4 text-sm text-muted-foreground font-mono break-all">{safeMessage}</p>
        <Button type="button" onClick={reset}>
          <ArrowCounterClockwise />
          {t('boundary.tryAgain')}
        </Button>
      </div>
    </div>
  );
}
