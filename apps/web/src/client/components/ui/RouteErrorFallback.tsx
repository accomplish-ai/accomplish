import { useRouteError, isRouteErrorResponse, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { WarningCircle } from '@phosphor-icons/react';
import { Button } from './button';

export function RouteErrorFallback() {
  const error = useRouteError();
  const { t } = useTranslation('errors');
  const { t: tCommon } = useTranslation('common');
  const isDev: boolean = import.meta.env.DEV;

  let message = t('boundary.unexpectedError');
  if (isRouteErrorResponse(error)) {
    message = `${error.status} — ${error.statusText}`;
    if (isDev) console.error('[RouteErrorFallback] RouteErrorResponse:', error);
  } else if (error instanceof Error) {
    if (isDev) {
      console.error('[RouteErrorFallback] Error:', error);
      message = error.message?.length > 500 ? error.message.slice(0, 500) + '…' : error.message;
    }
  } else if (isDev) {
    console.error('[RouteErrorFallback] Unknown error:', error);
  }

  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-background p-8">
      <div className="max-w-md w-full text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <WarningCircle className="h-7 w-7 text-destructive" />
          </div>
        </div>
        <h1 className="mb-1 text-lg font-semibold text-foreground">{t('boundary.title')}</h1>
        <p className="mb-6 text-sm text-muted-foreground font-mono break-all">{message}</p>
        <Button asChild>
          <Link to="/">{tCommon('buttons.goHome')}</Link>
        </Button>
      </div>
    </div>
  );
}
