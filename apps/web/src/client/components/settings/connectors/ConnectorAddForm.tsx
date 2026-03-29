import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';

interface ConnectorAddFormProps {
  url: string;
  adding: boolean;
  onUrlChange: (value: string) => void;
  onAdd: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function ConnectorAddForm({
  url,
  adding,
  onUrlChange,
  onAdd,
  onKeyDown,
}: ConnectorAddFormProps) {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground">{t('connectors.customTitle')}</h3>
        <p className="text-xs text-muted-foreground">{t('connectors.customDescription')}</p>
      </div>

      <div className="flex gap-2">
        <Input
          type="url"
          placeholder={t('connectors.placeholder')}
          value={url}
          onChange={(e) => {
            onUrlChange(e.target.value);
          }}
          onKeyDown={onKeyDown}
          className="flex-1"
          disabled={adding}
        />
        <button
          onClick={onAdd}
          disabled={adding || !url.trim()}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {adding ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          )}
          {t('connectors.add')}
        </button>
      </div>
    </div>
  );
}
