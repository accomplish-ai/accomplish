'use client';

import type { ProviderId, ProviderSettings } from '@accomplish/shared';
import { PROVIDER_META, isProviderReady } from '@accomplish/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { providerLogos } from './provider-logos';
import connectedKeyIcon from '/assets/icons/connected-key.svg';
import {Badge} from "@/components/ui/badge";

const PROVIDER_ORDER: ProviderId[] = [
  'anthropic',
  'openai',
  'google',
  'bedrock',
  'azure-foundry',
  'deepseek',
  'zai',
  'ollama',
  'xai',
  'openrouter',
  'litellm',
];

interface ProviderListProps {
  settings: ProviderSettings;
  selectedProvider: ProviderId | null;
  onSelectProvider: (providerId: ProviderId) => void;
}

export function ProviderList({
  settings,
  selectedProvider,
  onSelectProvider,
}: ProviderListProps) {
  const selectedMeta = selectedProvider ? PROVIDER_META[selectedProvider] : null;
  const selectedConnectedProvider = selectedProvider
    ? settings.connectedProviders?.[selectedProvider]
    : null;
  const selectedIsConnected =
    selectedConnectedProvider?.connectionStatus === 'connected';
  const selectedIsActive = settings.activeProviderId === selectedProvider;
  const selectedProviderReady = isProviderReady(selectedConnectedProvider || undefined);

  return (
    <div className="rounded-xl border border-border bg-card p-4" data-testid="provider-list">
      <div className="mb-4">
        <div className='w-full flex justify-between'>
          <div className="text-sm font-semibold text-foreground">
            Providers
          </div>
          <div className='flex gap-1'>
            {selectedIsConnected && (
                <Badge
                    aria-description={selectedProviderReady ? 'Ready' : 'Connected'}
                >
                  Connected
                </Badge>
            )}
            {selectedIsActive && selectedProviderReady && (
                <Badge>
                  Active
                </Badge>
            )}
          </div>

        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Select a provider to configure credentials and models.
        </div>
      </div>

      <Select
        value={selectedProvider ?? undefined}
        onValueChange={(value) => onSelectProvider(value as ProviderId)}
      >
        <SelectTrigger className="w-full" data-testid="provider-select-trigger">
          <SelectValue placeholder="Select a provider">
            {selectedProvider && selectedMeta && (
              <div className="flex items-center gap-3">
                  <img
                    src={providerLogos[selectedProvider]}
                    alt={`${selectedMeta.name} logo`}
                    className="size-3.5"
                  />
                <span className="text-sm font-medium">{selectedMeta.name}</span>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {PROVIDER_ORDER.map((providerId) => {
            const meta = PROVIDER_META[providerId];
            const connectedProvider = settings.connectedProviders?.[providerId];
            const isConnected = connectedProvider?.connectionStatus === 'connected';
            const isActive = settings.activeProviderId === providerId;
            const providerReady = isProviderReady(connectedProvider);

            return (
              <SelectItem
                key={providerId}
                value={providerId}
                data-testid={`provider-list-item-${providerId}`}
              >
                <div className="flex gap-2">
                    <img
                      src={providerLogos[providerId]}
                      alt={`${meta.name} logo`}
                      className="size-3.5 mt-1"
                    />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{meta.name}</span>
                    <span className="text-xs text-muted-foreground">{meta.label}</span>
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  {isConnected && (
                    <Badge className='text-primary-foreground!'>
                      Connected
                    </Badge>
                  )}
                  {isActive && providerReady && (
                      <Badge className='text-primary-foreground!'>
                        Active
                      </Badge>
                  )}
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
