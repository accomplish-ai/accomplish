import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { oauthStatusTextClass, oauthStatusDotClass, getOAuthStatusKey } from './oauth-status';
import { useLightdashServerUrl } from './lightdash/useLightdashServerUrl';
import type { ConnectorAuthStatus } from '@accomplish_ai/agent-core/common';
import lightdashIcon from '/assets/icons/integrations/lightdash.svg';

interface LightdashConnectorCardProps {
  authState: Pick<ConnectorAuthStatus, 'connected' | 'pendingAuthorization'>;
  actionLoading: boolean;
  onAuthenticate: () => void;
  onDisconnect: () => void;
  refetch: () => Promise<void>;
}

export function LightdashConnectorCard({
  authState,
  actionLoading,
  onAuthenticate,
  onDisconnect,
  refetch,
}: LightdashConnectorCardProps) {
  const { t } = useTranslation('settings');
  const prefix = 'connectors.lightdash';

  const {
    serverUrl,
    urlInput,
    setUrlInput,
    saving,
    editing,
    setEditing,
    urlError,
    setUrlError,
    urlLoading,
    handleSaveUrl,
  } = useLightdashServerUrl();

  const statusKey = getOAuthStatusKey(authState);
  const hasUrl = !!serverUrl;
  const showUrlInput = !hasUrl || editing;

  const onSave = useCallback(() => {
    void handleSaveUrl({ t, prefix, refetch });
  }, [handleSaveUrl, t, prefix, refetch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !saving) {
        onSave();
      }
    },
    [onSave, saving],
  );

  function getHintKey(): string {
    if (authState.connected) {
      return `${prefix}.connectedHint`;
    }
    if (authState.pendingAuthorization) {
      return `${prefix}.pendingHint`;
    }
    return `${prefix}.authHint`;
  }

  function renderActionButton() {
    if (authState.connected) {
      return (
        <Button
          variant="outline"
          size="sm"
          onClick={onDisconnect}
          disabled={actionLoading}
          className="text-xs text-muted-foreground hover:border-destructive hover:text-destructive"
        >
          {actionLoading ? t('connectors.cta.disconnecting') : t('connectors.cta.disconnect')}
        </Button>
      );
    }
    if (actionLoading) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>{t('connectors.cta.waitingForBrowser')}</span>
        </div>
      );
    }
    return (
      <Button
        size="sm"
        onClick={onAuthenticate}
        data-testid="lightdash-auth-button"
        className="text-xs"
      >
        {authState.pendingAuthorization
          ? t('connectors.cta.reconnect')
          : t('connectors.cta.connect')}
      </Button>
    );
  }

  if (urlLoading) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="lightdash-auth-card">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <img src={lightdashIcon} alt="" className="h-4 w-4" />
            <h3 className="text-sm font-medium text-foreground">{t(`${prefix}.title`)}</h3>
            <span
              className={`flex items-center gap-1 text-[11px] ${oauthStatusTextClass[statusKey]}`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${oauthStatusDotClass[statusKey]}`}
              />
              {!hasUrl && !authState.connected
                ? t(`${prefix}.status.noInstance`)
                : t(`${prefix}.status.${statusKey}`)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{t(`${prefix}.description`)}</p>

          {showUrlInput ? (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{t(`${prefix}.instanceUrlHint`)}</p>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder={t(`${prefix}.instanceUrlPlaceholder`)}
                  value={urlInput}
                  onChange={(e) => {
                    setUrlInput(e.target.value);
                    setUrlError(null);
                  }}
                  onKeyDown={handleKeyDown}
                  className="flex-1"
                  disabled={saving || authState.connected}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onSave}
                  disabled={saving || !urlInput.trim()}
                  className="text-xs"
                >
                  {saving ? (
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : null}
                  {editing ? t(`${prefix}.update`) : t(`${prefix}.save`)}
                </Button>
                {editing && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(false);
                      setUrlInput(serverUrl ?? '');
                      setUrlError(null);
                    }}
                    className="text-xs"
                  >
                    {t(`${prefix}.cancel`)}
                  </Button>
                )}
              </div>
              {urlError && <p className="text-xs text-destructive">{urlError}</p>}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">{serverUrl}</p>
              {!authState.connected && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(true);
                    setUrlInput(serverUrl ?? '');
                  }}
                  className="h-auto p-0 text-xs text-primary hover:underline"
                >
                  {t(`${prefix}.edit`)}
                </Button>
              )}
            </div>
          )}

          {hasUrl && <p className="text-xs text-muted-foreground">{t(getHintKey())}</p>}
        </div>

        {hasUrl && !showUrlInput && (
          <div className="flex shrink-0 items-center">{renderActionButton()}</div>
        )}
      </div>
    </div>
  );
}
