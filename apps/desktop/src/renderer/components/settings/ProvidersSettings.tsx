'use client';

import type { ProviderId, ConnectedProvider, ProviderSettings } from '@accomplish/shared';
import { ProviderList } from './ProviderList';
import { ProviderSettingsPanel } from './ProviderSettingsPanel';

interface ProvidersSettingsProps {
  settings: ProviderSettings;
  selectedProvider: ProviderId | null;
  onSelectProvider: (providerId: ProviderId) => void;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function ProvidersSettings({
  settings,
  selectedProvider,
  onSelectProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: ProvidersSettingsProps) {
  return (
    <div className="space-y-6">
      <ProviderList
        settings={settings}
        selectedProvider={selectedProvider}
        onSelectProvider={onSelectProvider}
      />

        {selectedProvider ? (
            <ProviderSettingsPanel
              providerId={selectedProvider}
              connectedProvider={settings?.connectedProviders?.[selectedProvider]}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
              onModelChange={onModelChange}
              showModelError={showModelError}
            />
        ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
              Select a provider to view and manage its settings.
            </div>
        )}
    </div>
  );
}
