import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { oauthStatusTextClass, oauthStatusDotClass, getOAuthStatusKey } from './oauth-status';
import { useDatadogServerUrl } from './datadog/useDatadogServerUrl';
import { DATADOG_REGIONS, findDatadogRegionByMcpUrl } from './datadog/regions';
import datadogIcon from '/assets/icons/integrations/datadog.svg';
import type { ConnectorAuthStatus } from '@accomplish_ai/agent-core/common';

interface DatadogConnectorCardProps {
  authState: Pick<ConnectorAuthStatus, 'connected' | 'pendingAuthorization'>;
  actionLoading: boolean;
  onAuthenticate: () => void;
  onDisconnect: () => void;
  refetch: () => Promise<void>;
}

export function DatadogConnectorCard({
  authState,
  actionLoading,
  onAuthenticate,
  onDisconnect,
  refetch,
}: DatadogConnectorCardProps) {
  const { t } = useTranslation('settings');
  const prefix = 'connectors.datadog';

  const {
    serverUrl,
    selectedRegionId,
    setSelectedRegionId,
    saving,
    editing,
    setEditing,
    saveError,
    setSaveError,
    urlLoading,
    handleSaveRegion,
  } = useDatadogServerUrl();

  const statusKey = getOAuthStatusKey(authState);
  const hasUrl = !!serverUrl;
  const showRegionPicker = !hasUrl || editing;
  const currentRegion = findDatadogRegionByMcpUrl(serverUrl);

  const onSave = useCallback(() => {
    void handleSaveRegion({ t, prefix, refetch });
  }, [handleSaveRegion, t, prefix, refetch]);

  function getStatusText(): string {
    if (!hasUrl && !authState.connected) {
      return t(`${prefix}.status.noSite`);
    }
    return t(`${prefix}.status.${statusKey}`);
  }

  function getHintKey(): string {
    if (authState.connected) {
      return `${prefix}.connectedHint`;
    }
    if (authState.pendingAuthorization) {
      return `${prefix}.pendingHint`;
    }
    return `${prefix}.authHint`;
  }

  if (urlLoading) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="datadog-auth-card">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <img src={datadogIcon} alt="" className="h-4 w-4" />
            <h3 className="text-sm font-medium text-foreground">{t(`${prefix}.title`)}</h3>
            <span
              className={`flex items-center gap-1 text-[11px] ${oauthStatusTextClass[statusKey]}`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${oauthStatusDotClass[statusKey]}`}
              />
              {getStatusText()}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{t(`${prefix}.description`)}</p>

          {showRegionPicker ? (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{t(`${prefix}.regionHint`)}</p>
              <div className="flex gap-2">
                <select
                  value={selectedRegionId}
                  onChange={(e) => {
                    setSelectedRegionId(e.target.value);
                    setSaveError(null);
                  }}
                  disabled={saving}
                  data-testid="datadog-region-select"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
                >
                  <option value="" disabled>
                    {t(`${prefix}.regionPlaceholder`)}
                  </option>
                  {DATADOG_REGIONS.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.label} ({region.webUiHost})
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onSave}
                  disabled={saving || !selectedRegionId}
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
                      const region = findDatadogRegionByMcpUrl(serverUrl);
                      setSelectedRegionId(region?.id ?? '');
                      setSaveError(null);
                    }}
                    className="text-xs"
                  >
                    {t(`${prefix}.cancel`)}
                  </Button>
                )}
              </div>
              {saveError && <p className="text-xs text-destructive">{saveError}</p>}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {currentRegion ? `${currentRegion.label} · ${currentRegion.webUiHost}` : serverUrl}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(true);
                  const region = findDatadogRegionByMcpUrl(serverUrl);
                  setSelectedRegionId(region?.id ?? '');
                }}
                className="h-auto p-0 text-xs text-primary hover:underline"
              >
                {t(`${prefix}.edit`)}
              </Button>
              {authState.connected && (
                <span className="text-xs text-amber-600">{t(`${prefix}.reconnectRequired`)}</span>
              )}
            </div>
          )}

          {hasUrl && <p className="text-xs text-muted-foreground">{t(getHintKey())}</p>}
        </div>

        {hasUrl && !showRegionPicker && (
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
                data-testid="datadog-auth-button"
                className="text-xs"
              >
                {authState.pendingAuthorization
                  ? t('connectors.cta.reconnect')
                  : t('connectors.cta.connect')}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
