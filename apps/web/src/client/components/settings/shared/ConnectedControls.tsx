// apps/desktop/src/renderer/components/settings/shared/ConnectedControls.tsx

import { useTranslation } from 'react-i18next';
import connectedIcon from '/assets/icons/connected.svg';

interface ConnectedControlsProps {
  onDisconnect: () => void;
}

export function ConnectedControls({ onDisconnect }: ConnectedControlsProps) {
  const { t } = useTranslation('settings');

  return (
    <div className="flex gap-4">
      <button
        data-testid="connection-status"
        data-status="connected"
        className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-border bg-provider-bg-active px-4 py-2.5 text-sm font-semibold text-provider-accent-text shadow-sm"
        disabled
      >
        <img src={connectedIcon} alt="" className="h-4 w-4" />
        {t('status.connected')}
      </button>
      <button
        onClick={onDisconnect}
        data-testid="disconnect-button"
        className="rounded-lg border border-border bg-provider-bg-hover p-2.5 text-muted-foreground shadow-sm hover:bg-destructive/10 hover:text-destructive transition-colors"
        title={t('buttons.disconnect')}
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
