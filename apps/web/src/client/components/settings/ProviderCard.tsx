import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProviderId, ConnectedProvider } from '@accomplish_ai/agent-core/common';
import { PROVIDER_META, isProviderReady } from '@accomplish_ai/agent-core/common';
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { PROVIDER_LOGOS, DARK_INVERT_PROVIDERS } from '@/lib/provider-logos';
import { cn } from '@/lib/utils';
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
  const { t } = useTranslation('settings');
  const meta = PROVIDER_META[providerId];
  const isConnected = connectedProvider?.connectionStatus === 'connected';
  const providerReady = isProviderReady(connectedProvider);
  const logoSrc = PROVIDER_LOGOS[providerId];

  // Get translated provider name and label
  const providerName = t(`providers.${providerId}`, { defaultValue: meta.name });
  const providerLabel = t(`providerLabels.${providerId}`, { defaultValue: meta.label });

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
          ? 'border-provider-border-active border-2 bg-provider-bg-active'
          : isSelected
            ? 'border-provider-border-active border-2 bg-provider-bg-hover'
            : 'border-border bg-provider-bg-hover hover:border-ring'
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
              alt={providerReady ? t('status.ready') : t('status.connected')}
              className="h-5 w-5"
              title={providerReady ? undefined : t('status.selectModelToComplete')}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-2 h-10 w-10 flex items-center justify-center">
        <img
          src={logoSrc}
          alt={t('providers.formLogo', { provider: providerName })}
          className={cn(
            'h-8 w-8 object-contain',
            DARK_INVERT_PROVIDERS.has(providerId) && 'dark:invert',
          )}
        />
      </div>

      <span className="text-sm font-medium text-foreground">{providerName}</span>

      <span className="text-xs text-muted-foreground">{providerLabel}</span>
    </button>
  );
});
