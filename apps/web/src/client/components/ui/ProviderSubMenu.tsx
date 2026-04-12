import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import {
  DEFAULT_PROVIDERS,
  PROVIDER_META,
  getModelDisplayName,
} from '@accomplish_ai/agent-core/common';
import type { ConnectedProvider, ProviderId } from '@accomplish_ai/agent-core/common';

interface ProviderSubMenuProps {
  providerId: ProviderId;
  provider: ConnectedProvider;
  onSelectModel: (providerId: ProviderId, modelId: string) => Promise<void>;
  disabled: boolean;
}

export function ProviderSubMenu({
  providerId,
  provider,
  onSelectModel,
  disabled,
}: ProviderSubMenuProps) {
  const providerName = PROVIDER_META[providerId]?.name ?? providerId;

  // If availableModels is defined (even empty) use it; only fall back to static config when undefined
  const models: Array<{ id: string; displayName: string }> =
    provider.availableModels !== undefined
      ? provider.availableModels.map((m) => ({ id: m.id, displayName: m.name }))
      : (DEFAULT_PROVIDERS.find((p) => p.id === providerId)?.models ?? []).map((m) => ({
          id: m.fullId,
          displayName: getModelDisplayName(m.fullId),
        }));

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        disabled={disabled}
        className="gap-2 px-3 py-2 text-sm cursor-pointer"
      >
        {providerName}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-48">
        {models.length === 0 ? (
          <DropdownMenuItem disabled className="px-3 py-2 text-sm text-muted-foreground">
            No models available
          </DropdownMenuItem>
        ) : (
          models.map((model) => (
            <DropdownMenuItem
              key={model.id}
              disabled={disabled}
              className="px-3 py-2 text-sm cursor-pointer"
              onClick={() => void onSelectModel(providerId, model.id)}
            >
              {model.displayName}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
