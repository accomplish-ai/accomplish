import { ConnectedControls, ModelSelector } from '../shared';

interface ProviderModelSelectProps {
  models: Array<{ id: string; name: string }>;
  selectedModelId: string | null | undefined;
  onChange: (modelId: string) => void;
  showModelError: boolean;
  onDisconnect: () => void;
}

/** Model selector + disconnect controls shown when a provider is connected. */
export function ProviderModelSelect({
  models,
  selectedModelId,
  onChange,
  showModelError,
  onDisconnect,
}: ProviderModelSelectProps) {
  return (
    <div className="space-y-3">
      <ConnectedControls onDisconnect={onDisconnect} />
      <ModelSelector
        models={models}
        value={selectedModelId || null}
        onChange={onChange}
        error={showModelError && !selectedModelId}
      />
    </div>
  );
}
