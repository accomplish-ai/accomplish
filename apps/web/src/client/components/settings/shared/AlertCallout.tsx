interface AlertCalloutProps {
  variant: 'warning' | 'info';
  title: string;
  detail: string;
}

export function AlertCallout({ variant, title, detail }: AlertCalloutProps) {
  const isWarning = variant === 'warning';
  return (
    <div
      className={`mt-2 flex items-start gap-2 rounded-md border p-3 text-sm ${
        isWarning
          ? 'border-red-500/30 bg-red-500/10 text-red-400'
          : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
      }`}
    >
      <svg
        className="h-5 w-5 flex-shrink-0 mt-0.5"
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
      <div>
        <p className="font-medium">{title}</p>
        <p className={`mt-1 ${isWarning ? 'text-red-400/80' : 'text-yellow-400/80'}`}>{detail}</p>
      </div>
    </div>
  );
}
