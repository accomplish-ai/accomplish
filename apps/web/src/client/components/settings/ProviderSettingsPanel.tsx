// apps/desktop/src/renderer/components/settings/ProviderSettingsPanel.tsx

import { AnimatePresence, motion } from 'framer-motion';
import type { ProviderId, ConnectedProvider } from '@accomplish_ai/agent-core/common';
import { ProviderFormSelector } from './ProviderFormSelector';
import { settingsVariants, settingsTransitions } from '@/lib/animations';

interface ProviderSettingsPanelProps {
  providerId: ProviderId;
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onUpdateProvider?: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function ProviderSettingsPanel({
  providerId,
  connectedProvider,
  onConnect,
  onUpdateProvider,
  onDisconnect,
  onModelChange,
  showModelError,
}: ProviderSettingsPanelProps) {
  // Wrap in min-height container to prevent layout shifts when switching providers
  // Different forms have different heights; this ensures consistent layout
  return (
    <div className="min-h-[260px]">
      <AnimatePresence mode="wait">
        <motion.div
          key={providerId}
          variants={settingsVariants.slideDown}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={settingsTransitions.enter}
        >
          <ProviderFormSelector
            providerId={providerId}
            connectedProvider={connectedProvider}
            onConnect={onConnect}
            onUpdateProvider={onUpdateProvider}
            onDisconnect={onDisconnect}
            onModelChange={onModelChange}
            showModelError={showModelError}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
