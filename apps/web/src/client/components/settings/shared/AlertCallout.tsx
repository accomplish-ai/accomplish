import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

interface AlertCalloutProps {
  variant: 'warning' | 'info';
  title: string;
  detail: string;
}

export function AlertCallout({ variant, title, detail }: AlertCalloutProps) {
  const isWarning = variant === 'warning';
  return (
    <Alert variant={isWarning ? 'destructive' : 'default'} className="mt-2">
      <svg
        aria-hidden="true"
        focusable="false"
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        {isWarning ? (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        ) : (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        )}
      </svg>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{detail}</AlertDescription>
    </Alert>
  );
}
