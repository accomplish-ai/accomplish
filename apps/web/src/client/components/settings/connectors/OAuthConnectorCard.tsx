import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { oauthStatusTextClass, oauthStatusDotClass, getOAuthStatusKey } from './oauth-status';
import type { ConnectorAuthStatus } from '@accomplish_ai/agent-core/common';

interface OAuthConnectorCardProps {
  /** Path to the connector's icon, e.g. /assets/icons/integrations/jira.svg */
  iconSrc: string;
  /** Display name shown in the card header */
  displayName: string;
  /** Current auth state for this provider */
  authState: Pick<ConnectorAuthStatus, 'connected' | 'pendingAuthorization'>;
  /** Whether an action (connect/disconnect) is in progress */
  actionLoading: boolean;
  onAuthenticate: () => void;
  onDisconnect: () => void;
  /** Optional link shown below the description (e.g. monday.com marketplace) */
  marketplaceUrl?: string;
  /** data-testid prefix for the card root */
  testId: string;
}

export function OAuthConnectorCard({
  iconSrc,
  displayName,
  authState,
  actionLoading,
  onAuthenticate,
  onDisconnect,
  marketplaceUrl,
  testId,
}: OAuthConnectorCardProps) {
  const { t } = useTranslation('settings');
  const statusKey = getOAuthStatusKey(authState);

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid={testId}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <img src={iconSrc} alt="" className="h-4 w-4" />
            <h3 className="text-sm font-medium text-foreground">{displayName}</h3>
            <span
              className={`flex items-center gap-1 text-[11px] ${oauthStatusTextClass[statusKey]}`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${oauthStatusDotClass[statusKey]}`}
              />
              {t(`connectors.status.${statusKey}`)}
            </span>
          </div>

          {marketplaceUrl && !authState.connected && (
            <p className="text-xs text-muted-foreground">
              {t('connectors.marketplaceHint')}{' '}
              <a
                href={marketplaceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {t('connectors.marketplaceLink')}
              </a>
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            {authState.connected
              ? t('connectors.cta.connectedHint')
              : authState.pendingAuthorization
                ? t('connectors.cta.pendingHint')
                : t('connectors.cta.authHint')}
          </p>
        </div>

        <div className="flex shrink-0 items-center">
          {authState.connected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onDisconnect}
              disabled={actionLoading}
              className="text-xs text-muted-foreground hover:border-destructive hover:text-destructive"
            >
              {actionLoading ? t('connectors.cta.disconnecting') : t('connectors.cta.disconnect')}
            </Button>
          ) : actionLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              <span>{t('connectors.cta.waitingForBrowser')}</span>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={onAuthenticate}
              data-testid={`${testId}-button`}
              className="text-xs"
            >
              {authState.pendingAuthorization
                ? t('connectors.cta.reconnect')
                : t('connectors.cta.connect')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
