import { useTranslation } from 'react-i18next';

interface NotificationsSectionProps {
  enabled: boolean;
  onToggle: () => void;
}

export function NotificationsSection({ enabled, onToggle }: NotificationsSectionProps) {
  const { t } = useTranslation('settings');

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="font-medium text-foreground">{t('notifications.toggle.label')}</div>
          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
            {t('notifications.toggle.description')}
          </p>
        </div>
        <div className="ml-4">
          <button
            role="switch"
            aria-checked={enabled}
            data-testid="settings-notifications-toggle"
            onClick={onToggle}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-accomplish ${
              enabled ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-accomplish ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
