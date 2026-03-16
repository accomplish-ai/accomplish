import { AnimatePresence, motion } from 'framer-motion';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { getAccomplish } from '@/lib/accomplish';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ProviderId, ConnectedProvider } from '@accomplish_ai/agent-core/common';
import { hasAnyReadyProvider, isProviderReady } from '@accomplish_ai/agent-core/common';
import { useProviderSettings } from '@/components/settings/hooks/useProviderSettings';
import { ProviderGrid } from '@/components/settings/ProviderGrid';
import { ProviderSettingsPanel } from '@/components/settings/ProviderSettingsPanel';
import { SpeechSettingsForm } from '@/components/settings/SpeechSettingsForm';
import { SkillsPanel, AddSkillDropdown } from '@/components/settings/skills';
import { AboutTab } from '@/components/settings/AboutTab';
import { DebugSection } from '@/components/settings/DebugSection';
import { SandboxSection } from '@/components/settings/SandboxSection';
import { ConnectorsPanel } from '@/components/settings/connectors';
import { Key, Lightning, Microphone, Info, Plugs } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import logoImage from '/assets/logo-1.png';

const TABS = [
  { id: 'providers' as const, labelKey: 'tabs.providers', icon: Key },
  { id: 'skills' as const, labelKey: 'tabs.skills', icon: Lightning },
  { id: 'connectors' as const, labelKey: 'tabs.connectors', icon: Plugs },
  { id: 'voice' as const, labelKey: 'tabs.voiceInput', icon: Microphone },
  { id: 'about' as const, labelKey: 'tabs.about', icon: Info },
];

// First 4 providers shown in collapsed view (matches PROVIDER_ORDER in ProviderGrid)
const FIRST_FOUR_PROVIDERS: ProviderId[] = ['openai', 'anthropic', 'google', 'bedrock'];

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApiKeySaved?: () => void;
  initialProvider?: ProviderId;
  /**
   * Initial tab to show when dialog opens ('providers' or 'voice')
   */
  initialTab?: 'providers' | 'voice' | 'skills' | 'connectors' | 'about';
}

export function SettingsDialog({
  open,
  onOpenChange,
  onApiKeySaved,
  initialProvider,
  initialTab = 'providers',
}: SettingsDialogProps) {
  const { t } = useTranslation('settings');
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null);
  const [gridExpanded, setGridExpanded] = useState(false);
  const [closeWarning, setCloseWarning] = useState(false);
  const [showModelError, setShowModelError] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'providers' | 'voice' | 'skills' | 'connectors' | 'about'
  >(initialTab);
  const [appVersion, setAppVersion] = useState<string>('');
  const [skillsRefreshTrigger, setSkillsRefreshTrigger] = useState(0);

  const {
    settings,
    loading,
    setActiveProvider,
    connectProvider,
    disconnectProvider,
    updateModel,
    refetch,
  } = useProviderSettings();

  // Debug mode state - stored in appSettings, not providerSettings
  const [debugMode, setDebugModeState] = useState(false);
  const accomplish = getAccomplish();

  // Refetch settings and debug mode when dialog opens
  useEffect(() => {
    if (!open) return;
    refetch();
    // Load debug mode from appSettings (correct store)
    accomplish.getDebugMode().then(setDebugModeState);
    // Load app version
    accomplish.getVersion().then(setAppVersion);
  }, [open, refetch, accomplish]);

  // Reset/initialize state when dialog opens or closes
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset on close
      setSelectedProvider(null);
      setGridExpanded(false);
      setCloseWarning(false);
      setShowModelError(false);
    } else {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  // Auto-select active provider (or initialProvider) and expand grid if needed when dialog opens
  useEffect(() => {
    if (!open || loading) return;

    const providerToSelect = initialProvider || settings?.activeProviderId;
    if (!providerToSelect) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: auto-select on open
    setSelectedProvider(providerToSelect);

    if (!FIRST_FOUR_PROVIDERS.includes(providerToSelect)) {
      setGridExpanded(true);
    }
  }, [open, loading, initialProvider, settings?.activeProviderId]);

  // Handle close attempt
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen && settings) {
        // Check if user is trying to close
        if (!hasAnyReadyProvider(settings)) {
          // No ready provider - show warning
          setCloseWarning(true);
          return;
        }
      }
      setCloseWarning(false);
      onOpenChange(newOpen);
    },
    [settings, onOpenChange],
  );

  // Handle provider selection
  const handleSelectProvider = useCallback(
    async (providerId: ProviderId) => {
      setSelectedProvider(providerId);
      setCloseWarning(false);
      setShowModelError(false);

      // Auto-set as active if the selected provider is ready
      const provider = settings?.connectedProviders?.[providerId];
      if (provider && isProviderReady(provider)) {
        await setActiveProvider(providerId);
      }
    },
    [settings?.connectedProviders, setActiveProvider],
  );

  // Handle provider connection
  const handleConnect = useCallback(
    async (provider: ConnectedProvider) => {
      await connectProvider(provider.providerId, provider);

      // Auto-set as active if the new provider is ready (connected + has model selected)
      // This ensures newly connected ready providers become active, regardless of
      // whether another provider was already active
      if (isProviderReady(provider)) {
        await setActiveProvider(provider.providerId);
        onApiKeySaved?.();
      }
    },
    [connectProvider, setActiveProvider, onApiKeySaved],
  );

  // Handle provider disconnection
  const handleDisconnect = useCallback(async () => {
    if (!selectedProvider) return;
    const wasActiveProvider = settings?.activeProviderId === selectedProvider;
    await disconnectProvider(selectedProvider);
    setSelectedProvider(null);

    // If we just removed the active provider, auto-select another ready provider
    if (wasActiveProvider && settings?.connectedProviders) {
      const readyProviderId = Object.keys(settings.connectedProviders).find(
        (id) =>
          id !== selectedProvider && isProviderReady(settings.connectedProviders[id as ProviderId]),
      ) as ProviderId | undefined;
      if (readyProviderId) {
        await setActiveProvider(readyProviderId);
      }
    }
  }, [selectedProvider, disconnectProvider, settings, setActiveProvider]);

  // Handle model change
  const handleModelChange = useCallback(
    async (modelId: string) => {
      if (!selectedProvider) return;
      await updateModel(selectedProvider, modelId);

      // Auto-set as active if this provider is now ready
      const provider = settings?.connectedProviders[selectedProvider];
      if (provider && isProviderReady({ ...provider, selectedModelId: modelId })) {
        if (!settings?.activeProviderId || settings.activeProviderId !== selectedProvider) {
          await setActiveProvider(selectedProvider);
        }
      }

      setShowModelError(false);
      onApiKeySaved?.();
    },
    [selectedProvider, updateModel, settings, setActiveProvider, onApiKeySaved],
  );

  // Handle debug mode toggle - writes to appSettings (correct store)
  const handleDebugToggle = useCallback(async () => {
    const newValue = !debugMode;
    await accomplish.setDebugMode(newValue);
    setDebugModeState(newValue);
  }, [debugMode, accomplish]);

  // Handle done button (close with validation)
  const handleDone = useCallback(() => {
    if (!settings) return;

    // Check if selected provider needs a model
    if (selectedProvider) {
      const provider = settings.connectedProviders[selectedProvider];
      if (provider?.connectionStatus === 'connected' && !provider.selectedModelId) {
        setShowModelError(true);
        return;
      }
    }

    // Check if any provider is ready
    if (!hasAnyReadyProvider(settings)) {
      setActiveTab('providers'); // Switch to providers tab to show warning
      setCloseWarning(true);
      return;
    }

    // Validate active provider is still connected and ready
    // This handles the case where the active provider was removed
    if (settings.activeProviderId) {
      const activeProvider = settings.connectedProviders[settings.activeProviderId];
      if (!isProviderReady(activeProvider)) {
        // Active provider is no longer ready - find a ready provider to set as active
        const readyProviderId = Object.keys(settings.connectedProviders).find((id) =>
          isProviderReady(settings.connectedProviders[id as ProviderId]),
        ) as ProviderId | undefined;
        if (readyProviderId) {
          setActiveProvider(readyProviderId);
        }
      }
    } else {
      // No active provider set - auto-select first ready provider
      const readyProviderId = Object.keys(settings.connectedProviders).find((id) =>
        isProviderReady(settings.connectedProviders[id as ProviderId]),
      ) as ProviderId | undefined;
      if (readyProviderId) {
        setActiveProvider(readyProviderId);
      }
    }

    onOpenChange(false);
  }, [settings, selectedProvider, onOpenChange, setActiveProvider]);

  // Force close (dismiss warning)
  const handleForceClose = useCallback(() => {
    setCloseWarning(false);
    onOpenChange(false);
  }, [onOpenChange]);

  if (loading || !settings) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="max-w-4xl w-full h-[80vh] flex flex-col overflow-hidden p-0"
          data-testid="settings-dialog"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t('title')}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-4xl w-full h-[65vh] flex overflow-hidden p-0"
        data-testid="settings-dialog"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        {/* Left sidebar navigation */}
        <nav className="w-48 shrink-0 border-r border-border bg-muted/30 p-3 flex flex-col gap-1">
          <div className="px-3 py-2 mb-1">
            <img
              src={logoImage}
              alt="Accomplish"
              className="dark:invert"
              style={{ height: '20px', paddingLeft: '6px' }}
            />
          </div>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left',
                activeTab === tab.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50',
              )}
            >
              <tab.icon className="h-4 w-4 shrink-0" />
              {t(tab.labelKey)}
            </button>
          ))}
        </nav>

        {/* Right content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Content header with title + optional actions */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <h3 className="text-sm font-semibold text-foreground">
              {TABS.find((tab) => tab.id === activeTab)?.labelKey &&
                t(TABS.find((tab) => tab.id === activeTab)!.labelKey)}
            </h3>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div className="space-y-6">
              {/* Close Warning */}
              <AnimatePresence>
                {closeWarning && (
                  <motion.div
                    className="rounded-lg border border-warning bg-warning/10 p-4 mb-6"
                    variants={settingsVariants.fadeSlide}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={settingsTransitions.enter}
                  >
                    <div className="flex items-start gap-3">
                      <svg
                        className="h-5 w-5 text-warning flex-shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-warning">
                          {t('warnings.noProviderReady')}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('warnings.noProviderReadyDescription')}
                        </p>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={handleForceClose}
                            className="rounded-md px-3 py-1.5 text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80"
                          >
                            {t('warnings.closeAnyway')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Providers Tab */}
              {activeTab === 'providers' && (
                <div className="space-y-6">
                  <section>
                    <ProviderGrid
                      settings={settings}
                      selectedProvider={selectedProvider}
                      onSelectProvider={handleSelectProvider}
                      expanded={gridExpanded}
                      onToggleExpanded={() => setGridExpanded(!gridExpanded)}
                    />
                  </section>

                  <AnimatePresence>
                    {selectedProvider && (
                      <motion.section
                        variants={settingsVariants.slideDown}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={settingsTransitions.enter}
                      >
                        <ProviderSettingsPanel
                          key={selectedProvider}
                          providerId={selectedProvider}
                          connectedProvider={settings?.connectedProviders?.[selectedProvider]}
                          onConnect={handleConnect}
                          onDisconnect={handleDisconnect}
                          onModelChange={handleModelChange}
                          showModelError={showModelError}
                        />
                      </motion.section>
                    )}
                  </AnimatePresence>

                  <AnimatePresence>
                    {selectedProvider && (
                      <motion.section
                        variants={settingsVariants.slideDown}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ ...settingsTransitions.enter, delay: 0.05 }}
                      >
                        <DebugSection debugMode={debugMode} onDebugToggle={handleDebugToggle} />
                      </motion.section>
                    )}
                  </AnimatePresence>

                  {/* Sandbox Toggle - always visible in providers tab */}
                  <SandboxSection visible={!!selectedProvider} />
                </div>
              )}

              {/* Skills Tab */}
              {activeTab === 'skills' && (
                <div className="space-y-4">
                  <SkillsPanel refreshTrigger={skillsRefreshTrigger} />
                </div>
              )}

              {/* Connectors Tab */}
              {activeTab === 'connectors' && (
                <div className="space-y-6">
                  <ConnectorsPanel />
                </div>
              )}

              {/* Voice Input Tab */}
              {activeTab === 'voice' && (
                <div className="space-y-6">
                  <SpeechSettingsForm />
                </div>
              )}

              {/* About Tab */}
              {activeTab === 'about' && <AboutTab appVersion={appVersion} />}

              {/* Footer: Add (skills only) + Done */}
              <div className="mt-4 flex items-center justify-between">
                <div>
                  {activeTab === 'skills' && (
                    <AddSkillDropdown
                      onSkillAdded={() => setSkillsRefreshTrigger((prev) => prev + 1)}
                      onClose={() => onOpenChange(false)}
                    />
                  )}
                </div>
                <button
                  onClick={handleDone}
                  className="flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  data-testid="settings-done-button"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  {t('buttons.done')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SettingsDialog;
