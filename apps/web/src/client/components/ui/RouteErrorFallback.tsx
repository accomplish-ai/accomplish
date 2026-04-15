import { useRouteError, isRouteErrorResponse, Link } from 'react-router';
import { WarningCircle } from '@phosphor-icons/react';
import { Button } from './button';

export function RouteErrorFallback() {
  const error = useRouteError();
  const isDev = process.env.NODE_ENV === 'development';

  let message = 'An unexpected error occurred.';
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
        <h1 className="mb-1 text-lg font-semibold text-foreground">Something went wrong</h1>
        <p className="mb-6 text-sm text-muted-foreground font-mono break-all">{message}</p>
        <Button asChild>
          <Link to="/">Go home</Link>
        </Button>
      </div>
    </div>
  );
}
