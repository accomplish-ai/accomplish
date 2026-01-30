// apps/desktop/src/renderer/components/settings/ProviderSettingsPanel.tsx

import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import type { ProviderId, ConnectedProvider } from '@accomplish/shared';
import { PROVIDER_META } from '@accomplish/shared';
import {
  ClassicProviderForm,
  BedrockProviderForm,
  AzureFoundryProviderForm,
  OllamaProviderForm,
  OpenRouterProviderForm,
  LiteLLMProviderForm,
  LMStudioProviderForm,
} from './providers';
import { ZaiProviderForm } from './providers/ZaiProviderForm';
import { settingsVariants, settingsTransitions } from '@/lib/animations';

interface ProviderSettingsPanelProps {
  providerId: ProviderId;
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function ProviderSettingsPanel({
  providerId,
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: ProviderSettingsPanelProps) {
  const { t } = useTranslation('settings');
  const meta = PROVIDER_META[providerId];

  // Render form content based on provider category
  const renderForm = () => {
    // Handle Z.AI separately (has region selector)
    if (providerId === 'zai') {
      return (
        <ZaiProviderForm
          connectedProvider={connectedProvider}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          onModelChange={onModelChange}
          showModelError={showModelError}
        />
      );
    }

    // Then continue with switch for other providers
    switch (meta.category) {
      case 'classic':
        return (
          <ClassicProviderForm
            providerId={providerId}
            connectedProvider={connectedProvider}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            onModelChange={onModelChange}
            showModelError={showModelError}
          />
        );

      case 'aws':
        return (
          <BedrockProviderForm
            connectedProvider={connectedProvider}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            onModelChange={onModelChange}
            showModelError={showModelError}
          />
        );

      case 'azure':
        return (
          <AzureFoundryProviderForm
            connectedProvider={connectedProvider}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            onModelChange={onModelChange}
            showModelError={showModelError}
          />
        );

      case 'local':
        // Handle different local providers
        if (providerId === 'lmstudio') {
          return (
            <LMStudioProviderForm
              connectedProvider={connectedProvider}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
              onModelChange={onModelChange}
              showModelError={showModelError}
            />
          );
        }
        // Default to Ollama for other local providers
        return (
          <OllamaProviderForm
            connectedProvider={connectedProvider}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            onModelChange={onModelChange}
            showModelError={showModelError}
          />
        );

      case 'proxy':
        return (
          <OpenRouterProviderForm
            connectedProvider={connectedProvider}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            onModelChange={onModelChange}
            showModelError={showModelError}
          />
        );

      case 'hybrid':
        return (
          <LiteLLMProviderForm
            connectedProvider={connectedProvider}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            onModelChange={onModelChange}
            showModelError={showModelError}
          />
        );

      default:
        return <div>{t('providers.unknownType')}</div>;
    }
  };

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
          {renderForm()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
