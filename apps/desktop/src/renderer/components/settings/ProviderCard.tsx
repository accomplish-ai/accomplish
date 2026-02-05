import { memo, useCallback } from 'react';
import type { ProviderId, ConnectedProvider } from '@accomplish/agent-core/browser';
import { PROVIDER_META, isProviderReady } from '@accomplish/agent-core/browser';
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { PROVIDER_LOGOS } from '@/lib/provider-logos';
import connectedKeyIcon from '/assets/icons/connected-key.svg';

interface ProviderCardProps {
  providerId: ProviderId;
  connectedProvider?: ConnectedProvider;
  isActive: boolean;
  isSelected: boolean;
  onSelect: (providerId: ProviderId) => void;
}

export const ProviderCard = memo(function ProviderCard({
  providerId,
  connectedProvider,
  isActive,
  isSelected,
  onSelect,
}: ProviderCardProps) {
  const meta = PROVIDER_META[providerId];
  const isConnected = connectedProvider?.connectionStatus === 'connected';
  const providerReady = isProviderReady(connectedProvider);
  const logoSrc = PROVIDER_LOGOS[providerId];

  // Green background = active provider that is ready (connected + model selected)
  // isSelected = card clicked for viewing settings (border only, not green background)
  const showGreenBackground = isActive && providerReady;

  const handleClick = useCallback(() => {
    onSelect(providerId);
  }, [onSelect, providerId]);

  return (
    <button
      onClick={handleClick}
      data-testid={`provider-card-${providerId}`}
      className={`relative flex flex-col items-center justify-center rounded-xl border p-4 w-[130px] h-[110px] transition-[background-color,border-color] duration-150 ${
        showGreenBackground
          ? 'border-[#4a4330] border-2 bg-[#e9f7e7]'
          : isSelected
            ? 'border-[#4a4330] border-2 bg-[#f9f8f6]'
            : 'border-border bg-[#f9f8f6] hover:border-ring'
      }`}
    >
      <AnimatePresence>
        {isConnected && (
          <motion.div
            className="absolute top-2 right-2"
            data-testid={`provider-connected-badge-${providerId}`}
            variants={settingsVariants.fadeSlide}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={settingsTransitions.enter}
          >
            <img
              src={connectedKeyIcon}
              alt={providerReady ? "Ready" : "Connected"}
              className="h-5 w-5"
              title={providerReady ? undefined : "Select a model to complete setup"}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-2 h-10 w-10 flex items-center justify-center">
        <img
          src={logoSrc}
          alt={`${meta.name} logo`}
          className="h-8 w-8 object-contain"
        />
      </div>

      <span className="text-sm font-medium text-foreground">
        {meta.name}
      </span>

      <span className="text-xs text-muted-foreground">
        {meta.label}
      </span>
    </button>
  );
});
