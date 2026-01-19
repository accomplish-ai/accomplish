// apps/desktop/src/renderer/components/settings/ProviderCard.tsx

import type { ProviderId, ConnectedProvider } from '@accomplish/shared';
import { PROVIDER_META, isProviderReady } from '@accomplish/shared';

interface ProviderCardProps {
  providerId: ProviderId;
  connectedProvider?: ConnectedProvider;
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
}

export function ProviderCard({
  providerId,
  connectedProvider,
  isActive,
  isSelected,
  onClick,
}: ProviderCardProps) {
  const meta = PROVIDER_META[providerId];
  const isConnected = connectedProvider?.connectionStatus === 'connected';

  return (
    <button
      onClick={onClick}
      data-testid={`provider-card-${providerId}`}
      className={`relative flex flex-col items-center justify-center rounded-xl border p-4 transition-all duration-200 min-w-[120px] ${
        isActive
          ? 'border-[#4A7C59] border-2 bg-[#4A7C59]/5'
          : isSelected
          ? 'border-primary bg-muted'
          : 'border-border hover:border-ring'
      }`}
    >
      {/* Connected badge */}
      {isConnected && (
        <div className="absolute top-2 right-2" data-testid={`provider-connected-badge-${providerId}`}>
          <svg className="h-4 w-4 text-[#4A7C59]" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" />
          </svg>
        </div>
      )}

      {/* Logo placeholder - shows first letter */}
      <div className="mb-2 h-10 w-10 flex items-center justify-center">
        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-lg font-bold">
          {meta.name.charAt(0)}
        </div>
      </div>

      {/* Name */}
      <span className={`text-sm font-medium ${isActive ? 'text-[#4A7C59]' : 'text-foreground'}`}>
        {meta.name}
      </span>

      {/* Label */}
      <span className={`text-xs ${isActive ? 'text-[#4A7C59]/70' : 'text-muted-foreground'}`}>
        {meta.label}
      </span>
    </button>
  );
}
