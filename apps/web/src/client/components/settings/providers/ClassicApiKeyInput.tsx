import { useTranslation } from 'react-i18next';

interface ClassicApiKeyInputProps {
  apiKey: string;
  onChange: (value: string) => void;
  onClear: () => void;
  connecting: boolean;
}

export function ClassicApiKeyInput({
  apiKey,
  onChange,
  onClear,
  connecting,
}: ClassicApiKeyInputProps) {
  const { t } = useTranslation('settings');
  return (
    <div className="flex gap-2">
      <input
        type="password"
        value={apiKey}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('apiKey.enterKey')}
        disabled={connecting}
        data-testid="api-key-input"
        className="flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm disabled:opacity-50"
      />
      <button
        onClick={onClear}
        className="rounded-md border border-border p-2.5 text-muted-foreground hover:text-foreground transition-colors"
        type="button"
        aria-label="Clear API key"
        disabled={!apiKey || connecting}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    </div>
  );
}
