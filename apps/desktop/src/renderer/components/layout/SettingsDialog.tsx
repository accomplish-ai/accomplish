'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState, useEffect, useCallback } from 'react';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { getAccomplish } from '@/lib/accomplish';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ProviderId, ConnectedProvider } from '@accomplish_ai/agent-core/common';
import { hasAnyReadyProvider, isProviderReady } from '@accomplish_ai/agent-core/common';
import { useProviderSettings } from '@/components/settings/hooks/useProviderSettings';
import { ProviderGrid } from '@/components/settings/ProviderGrid';
import { ProviderSettingsPanel } from '@/components/settings/ProviderSettingsPanel';
import { SpeechSettingsForm } from '@/components/settings/SpeechSettingsForm';
import { SkillsPanel, AddSkillDropdown } from '@/components/settings/skills';
import { ConnectorsPanel } from '@/components/settings/connectors';

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
  initialTab?: 'providers' | 'connectors' | 'voice' | 'skills' | 'about';
}

export default function SettingsDialog({
  open,
  onOpenChange,
  onApiKeySaved,
  initialProvider,
  initialTab = 'providers',
}: SettingsDialogProps) {
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null);
  const [gridExpanded, setGridExpanded] = useState(false);
  const [closeWarning, setCloseWarning] = useState(false);
  const [showModelError, setShowModelError] = useState(false);
  const [activeTab, setActiveTab] = useState<'providers' | 'connectors' | 'voice' | 'skills' | 'about'>(initialTab);
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
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'success' | 'error'>('idle');
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

  // Auto-select active provider (or initialProvider) and expand grid if needed when dialog opens
  useEffect(() => {
    if (!open || loading) return;

    // Use initialProvider if provided, otherwise fall back to activeProviderId
    const providerToSelect = initialProvider || settings?.activeProviderId;
    if (!providerToSelect) return;

    // Auto-select the provider to show its connection details immediately
    setSelectedProvider(providerToSelect);

    // Auto-expand grid if selected provider is not in the first 4 visible providers
    if (!FIRST_FOUR_PROVIDERS.includes(providerToSelect)) {
      setGridExpanded(true);
    }
  }, [open, loading, initialProvider, settings?.activeProviderId]);

  // Reset state when dialog closes, set initial tab when it opens
  useEffect(() => {
    if (!open) {
      setSelectedProvider(null);
      setGridExpanded(false);
      setCloseWarning(false);
      setShowModelError(false);
    } else {
      // Set the tab when dialog opens based on initialTab prop
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  // Handle close attempt
  const handleOpenChange = useCallback((newOpen: boolean) => {
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
  }, [settings, onOpenChange]);

  // Handle provider selection
  const handleSelectProvider = useCallback(async (providerId: ProviderId) => {
    setSelectedProvider(providerId);
    setCloseWarning(false);
    setShowModelError(false);

    // Auto-set as active if the selected provider is ready
    const provider = settings?.connectedProviders?.[providerId];
    if (provider && isProviderReady(provider)) {
      await setActiveProvider(providerId);
    }
  }, [settings?.connectedProviders, setActiveProvider]);

  // Handle provider connection
  const handleConnect = useCallback(async (provider: ConnectedProvider) => {
    await connectProvider(provider.providerId, provider);

    // Auto-set as active if the new provider is ready (connected + has model selected)
    // This ensures newly connected ready providers become active, regardless of
    // whether another provider was already active
    if (isProviderReady(provider)) {
      await setActiveProvider(provider.providerId);
      onApiKeySaved?.();
    }
  }, [connectProvider, setActiveProvider, onApiKeySaved]);

  // Handle provider disconnection
  const handleDisconnect = useCallback(async () => {
    if (!selectedProvider) return;
    const wasActiveProvider = settings?.activeProviderId === selectedProvider;
    await disconnectProvider(selectedProvider);
    setSelectedProvider(null);

    // If we just removed the active provider, auto-select another ready provider
    if (wasActiveProvider && settings?.connectedProviders) {
      const readyProviderId = Object.keys(settings.connectedProviders).find(
        (id) => id !== selectedProvider && isProviderReady(settings.connectedProviders[id as ProviderId])
      ) as ProviderId | undefined;
      if (readyProviderId) {
        await setActiveProvider(readyProviderId);
      }
    }
  }, [selectedProvider, disconnectProvider, settings?.activeProviderId, settings?.connectedProviders, setActiveProvider]);

  // Handle model change
  const handleModelChange = useCallback(async (modelId: string) => {
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
  }, [selectedProvider, updateModel, settings, setActiveProvider, onApiKeySaved]);

  // Handle debug mode toggle - writes to appSettings (correct store)
  const handleDebugToggle = useCallback(async () => {
    const newValue = !debugMode;
    await accomplish.setDebugMode(newValue);
    setDebugModeState(newValue);
  }, [debugMode, accomplish]);

  // Handle log export
  const handleExportLogs = useCallback(async () => {
    setExportStatus('exporting');
    try {
      const result = await accomplish.exportLogs();
      if (result.success) {
        setExportStatus('success');
        // Reset to idle after 2 seconds
        setTimeout(() => setExportStatus('idle'), 2000);
      } else if (result.reason === 'cancelled') {
        setExportStatus('idle');
      } else {
        console.error('Failed to export logs:', result.error);
        setExportStatus('error');
        setTimeout(() => setExportStatus('idle'), 3000);
      }
    } catch (error) {
      console.error('Export logs error:', error);
      setExportStatus('error');
      setTimeout(() => setExportStatus('idle'), 3000);
    }
  }, [accomplish]);

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
        const readyProviderId = Object.keys(settings.connectedProviders).find(
          (id) => isProviderReady(settings.connectedProviders[id as ProviderId])
        ) as ProviderId | undefined;
        if (readyProviderId) {
          setActiveProvider(readyProviderId);
        }
      }
    } else {
      // No active provider set - auto-select first ready provider
      const readyProviderId = Object.keys(settings.connectedProviders).find(
        (id) => isProviderReady(settings.connectedProviders[id as ProviderId])
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
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          data-testid="settings-dialog"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Set up Accomplish</DialogTitle>
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
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        data-testid="settings-dialog"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Set up Accomplish</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Tab Navigation */}
          <div className="flex items-end justify-between border-b border-border">
            <div className="flex gap-4">
              <button
                onClick={() => setActiveTab('providers')}
                className={`pb-3 px-1 font-medium text-sm transition-colors ${
                  activeTab === 'providers'
                    ? 'text-foreground border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Providers
              </button>
              <button
                onClick={() => setActiveTab('connectors')}
                className={`pb-3 px-1 font-medium text-sm transition-colors ${
                  activeTab === 'connectors'
                    ? 'text-foreground border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Connectors
              </button>
              <button
                onClick={() => setActiveTab('skills')}
                className={`pb-3 px-1 font-medium text-sm transition-colors ${
                  activeTab === 'skills'
                    ? 'text-foreground border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Skills
              </button>
              <button
                onClick={() => setActiveTab('voice')}
                className={`pb-3 px-1 font-medium text-sm transition-colors ${
                  activeTab === 'voice'
                    ? 'text-foreground border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Voice Input
              </button>
              <button
                onClick={() => setActiveTab('about')}
                className={`pb-3 px-1 font-medium text-sm transition-colors ${
                  activeTab === 'about'
                    ? 'text-foreground border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                About
              </button>
            </div>
            {activeTab === 'skills' && (
              <div className="pb-2">
                <AddSkillDropdown
                  onSkillAdded={() => setSkillsRefreshTrigger(t => t + 1)}
                  onClose={() => onOpenChange(false)}
                />
              </div>
            )}
          </div>

          {/* Close Warning - shown on all tabs when no provider ready */}
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
                  <svg className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-warning">No provider ready</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      You need to connect a provider and select a model before you can run tasks.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={handleForceClose}
                        className="rounded-md px-3 py-1.5 text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80"
                      >
                        Close Anyway
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
              {/* Provider Grid Section */}
              <section>
                <ProviderGrid
                  settings={settings}
                  selectedProvider={selectedProvider}
                  onSelectProvider={handleSelectProvider}
                  expanded={gridExpanded}
                  onToggleExpanded={() => setGridExpanded(!gridExpanded)}
                />
              </section>

              {/* Provider Settings Panel (shown when a provider is selected) */}
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

              {/* Debug Mode Section - only shown when a provider is selected */}
              <AnimatePresence>
                {selectedProvider && (
                  <motion.section
                    variants={settingsVariants.slideDown}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={{ ...settingsTransitions.enter, delay: 0.05 }}
                  >
                    <div className="rounded-lg border border-border bg-card p-5">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-foreground">Debug Mode</div>
                          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                            Show detailed backend logs in the task view.
                          </p>
                        </div>
                        <div className="ml-4 flex items-center gap-3">
                          {/* Debug Toggle */}
                          <button
                            data-testid="settings-debug-toggle"
                            onClick={handleDebugToggle}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-accomplish ${debugMode ? 'bg-primary' : 'bg-muted'
                              }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-accomplish ${debugMode ? 'translate-x-6' : 'translate-x-1'
                                }`}
                            />
                          </button>
                          {/* Export Logs Button */}
                          <button
                            onClick={handleExportLogs}
                            disabled={exportStatus === 'exporting'}
                            title="Export Logs"
                            className={`rounded-md p-1.5 transition-colors ${
                              exportStatus === 'success'
                                ? 'text-green-500'
                                : exportStatus === 'error'
                                ? 'text-destructive'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {exportStatus === 'exporting' ? (
                              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            ) : exportStatus === 'success' ? (
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                      {debugMode && (
                        <div className="mt-4 rounded-xl bg-warning/10 p-3.5">
                          <p className="text-sm text-warning">
                            Debug mode is enabled. Backend logs will appear in the task view
                            when running tasks.
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.section>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Connectors Tab */}
          {activeTab === 'connectors' && (
            <div className="space-y-6">
              <ConnectorsPanel />
            </div>
          )}

          {/* Skills Tab */}
          {activeTab === 'skills' && (
            <div className="space-y-6">
              <SkillsPanel refreshTrigger={skillsRefreshTrigger} />
            </div>
          )}

          {/* Voice Input Tab */}
          {activeTab === 'voice' && (
            <div className="space-y-6">
              <SpeechSettingsForm onSave={() => {}} onChange={() => {}} />
            </div>
          )}

          {/* About Tab */}
          {activeTab === 'about' && (
            <div className="space-y-6">
              <div className="rounded-lg border border-border bg-card p-6">
                <div className="space-y-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Visit us</div>
                    <a
                      href="https://www.accomplish.ai"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      www.accomplish.ai
                    </a>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Have a question?</div>
                    <a
                      href="mailto:support@accomplish.ai"
                      className="text-primary hover:underline"
                    >
                      support@accomplish.ai
                    </a>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Version</div>
                    <div className="font-medium">{appVersion || 'Loading...'}</div>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-border text-xs text-muted-foreground">
                  Accomplish™ All rights reserved.
                </div>
              </div>
            </div>
          )}

          {/* Done Button */}
          <div className="flex justify-end">
            <button
              onClick={handleDone}
              className="flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              data-testid="settings-done-button"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Done
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
