import { useTranslation } from 'react-i18next';

interface SlackAuthState {
  connected: boolean;
  pendingAuthorization?: boolean;
}

interface SlackConnectorSectionProps {
  slackAuth: SlackAuthState;
  slackActionLoading: boolean;
  onAuthenticate: () => void;
  onDisconnect: () => void;
}

const slackStatusClass = {
  connected: 'text-green-600',
  disconnected: 'text-muted-foreground',
  pending: 'text-yellow-600',
};

const slackStatusDotClass = {
  connected: 'bg-green-500',
  disconnected: 'bg-muted-foreground',
  pending: 'bg-yellow-500 animate-pulse',
};

export function SlackConnectorSection({
  slackAuth,
  slackActionLoading,
  onAuthenticate,
  onDisconnect,
}: SlackConnectorSectionProps) {
  const { t } = useTranslation('settings');

  const slackStatusKey: keyof typeof slackStatusClass = slackAuth.connected
    ? 'connected'
    : slackAuth.pendingAuthorization
      ? 'pending'
      : 'disconnected';

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="slack-auth-card">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">{t('connectors.slack.title')}</h3>
            <span
              className={`flex items-center gap-1 text-[11px] ${slackStatusClass[slackStatusKey]}`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${slackStatusDotClass[slackStatusKey]}`}
              />
              {t(`connectors.slack.status.${slackStatusKey}`)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{t('connectors.slack.description')}</p>
          <p className="text-xs text-muted-foreground">
            {slackAuth.connected
              ? t('connectors.slack.connectedHint')
              : slackAuth.pendingAuthorization
                ? t('connectors.slack.pendingHint')
                : t('connectors.slack.authHint')}
          </p>
        </div>

        <div className="flex shrink-0 items-center">
          {slackAuth.connected ? (
            <button
              type="button"
              onClick={onDisconnect}
              disabled={slackActionLoading}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
            >
              {slackActionLoading
                ? t('connectors.slack.disconnecting')
                : t('connectors.slack.disconnect')}
            </button>
          ) : (
            <button
              type="button"
              onClick={onAuthenticate}
              disabled={slackActionLoading}
              data-testid="slack-auth-button"
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {slackActionLoading ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : null}
              {slackActionLoading
                ? t('connectors.slack.authenticating')
                : slackAuth.pendingAuthorization
                  ? t('connectors.slack.restartAuth')
                  : t('connectors.slack.authenticate')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
