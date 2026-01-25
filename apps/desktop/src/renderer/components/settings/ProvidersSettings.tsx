'use client';

import type { ProviderId, ConnectedProvider, ProviderSettings } from '@accomplish/shared';
import { ProviderList } from './ProviderList';
import { ProviderSettingsPanel } from './ProviderSettingsPanel';
import {Card, CardContent} from "@/components/ui/card";
import {FieldDescription, FieldGroup, FieldLegend, FieldSet} from "@/components/ui/field";

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
      <FieldGroup>
        <FieldSet>
          <FieldLegend>Providers</FieldLegend>
          <FieldDescription>
            Manage providers selection and configuration
          </FieldDescription>
        </FieldSet>

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
            <Card>
              <CardContent className='text-muted-foreground text-center'>
                Select a provider to view and manage its settings.
              </CardContent>
            </Card>
        )}
      </FieldGroup>
  );
}
