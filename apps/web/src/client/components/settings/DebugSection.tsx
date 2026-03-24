import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccomplish } from '@/lib/accomplish';

interface DebugSectionProps {
  debugMode: boolean;
  onDebugToggle: () => void;
}

export function DebugSection({ debugMode, onDebugToggle }: DebugSectionProps) {
  const { t } = useTranslation('settings');
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'success' | 'error'>(
    'idle',
  );
  const accomplish = getAccomplish();

  const handleExportLogs = useCallback(async () => {
    setExportStatus('exporting');
    try {
      const result = await accomplish.exportLogs();
      if (result.success) {
        setExportStatus('success');
        setTimeout(() => setExportStatus('idle'), 2000);
      } else if (result.reason === 'cancelled') {
        setExportStatus('idle');
      } else {
        console.error('Failed to export logs:', result.error);
        setExportStatus('error');
        setTimeout(() => setExportStatus('idle'), 3000);
      }
    } catch (error) {
      console.error('Export logs error:', error);
      setExportStatus('error');
      setTimeout(() => setExportStatus('idle'), 3000);
    }
  }, [accomplish]);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="font-medium text-foreground">{t('developer.debugMode')}</div>
          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
            {t('developer.debugDescription')}
          </p>
        </div>
        <div className="ml-4 flex items-center gap-3">
          <button
            data-testid="settings-debug-toggle"
            onClick={onDebugToggle}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-accomplish ${
              debugMode ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-accomplish ${
                debugMode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <button
            onClick={handleExportLogs}
            disabled={exportStatus === 'exporting'}
            title={t('developer.exportLogs')}
            className={`rounded-md p-1.5 transition-colors ${
              exportStatus === 'success'
                ? 'text-green-500'
                : exportStatus === 'error'
                  ? 'text-destructive'
                  : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {exportStatus === 'exporting' ? (
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : exportStatus === 'success' ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
      {debugMode && (
        <div className="mt-4 rounded-xl bg-warning/10 p-3.5">
          <p className="text-sm text-warning">{t('developer.debugEnabled')}</p>
        </div>
      )}
    </div>
  );
}
