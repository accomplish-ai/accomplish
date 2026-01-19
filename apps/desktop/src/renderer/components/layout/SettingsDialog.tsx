'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import { analytics } from '@/lib/analytics';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ProviderId, ConnectedProvider } from '@accomplish/shared';
import { hasAnyReadyProvider, isProviderReady } from '@accomplish/shared';
import { useProviderSettings } from '@/components/settings/hooks/useProviderSettings';
import { ProviderGrid } from '@/components/settings/ProviderGrid';
import { ProviderSettingsPanel } from '@/components/settings/ProviderSettingsPanel';
import logoImage from '/assets/logo.png';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApiKeySaved?: () => void;
}

export default function SettingsDialog({ open, onOpenChange, onApiKeySaved }: SettingsDialogProps) {
  const [appVersion, setAppVersion] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null);
  const [gridExpanded, setGridExpanded] = useState(false);
  const [closeWarning, setCloseWarning] = useState(false);
  const [showModelError, setShowModelError] = useState(false);

  const {
    settings,
    loading,
    setActiveProvider,
    connectProvider,
    disconnectProvider,
    updateModel,
    setDebugMode,
    refetch,
  } = useProviderSettings();

  // Fetch app version on dialog open
  useEffect(() => {
    if (!open) return;

    const fetchVersion = async () => {
      try {
        const accomplish = getAccomplish();
        const version = await accomplish.getVersion();
        setAppVersion(version);
      } catch (err) {
        console.error('Failed to fetch version:', err);
      }
    };

    fetchVersion();
    refetch();
  }, [open, refetch]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedProvider(null);
      setGridExpanded(false);
      setCloseWarning(false);
      setShowModelError(false);
    }
  }, [open]);

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
  const handleSelectProvider = useCallback((providerId: ProviderId) => {
    setSelectedProvider(providerId);
    setGridExpanded(true);
    setCloseWarning(false);
    setShowModelError(false);
  }, []);

  // Handle provider connection
  const handleConnect = useCallback(async (provider: ConnectedProvider) => {
    await connectProvider(provider.providerId, provider);
    analytics.trackSaveApiKey(provider.providerId);

    // Auto-set as active if no active provider
    if (!settings?.activeProviderId) {
      await setActiveProvider(provider.providerId);
    }

    onApiKeySaved?.();
  }, [connectProvider, settings?.activeProviderId, setActiveProvider, onApiKeySaved]);

  // Handle provider disconnection
  const handleDisconnect = useCallback(async () => {
    if (!selectedProvider) return;
    await disconnectProvider(selectedProvider);
    setSelectedProvider(null);
  }, [selectedProvider, disconnectProvider]);

  // Handle model change
  const handleModelChange = useCallback(async (modelId: string) => {
    if (!selectedProvider) return;
    await updateModel(selectedProvider, modelId);
    analytics.trackSelectModel(modelId);

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

  // Handle debug mode toggle
  const handleDebugToggle = useCallback(async () => {
    const newValue = !settings?.debugMode;
    await setDebugMode(newValue);
    analytics.trackToggleDebugMode(newValue);
  }, [settings?.debugMode, setDebugMode]);

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
      setCloseWarning(true);
      return;
    }

    onOpenChange(false);
  }, [settings, selectedProvider, onOpenChange]);

  // Force close (dismiss warning)
  const handleForceClose = useCallback(() => {
    setCloseWarning(false);
    onOpenChange(false);
  }, [onOpenChange]);

  if (loading || !settings) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="settings-dialog">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="settings-dialog">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Close Warning */}
          {closeWarning && (
            <div className="rounded-lg border border-warning bg-warning/10 p-4">
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
            </div>
          )}

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

          {/* Provider Settings Panel (shown when a provider is selected and grid is expanded) */}
          {selectedProvider && gridExpanded && (
            <section>
              <ProviderSettingsPanel
                providerId={selectedProvider}
                connectedProvider={settings.connectedProviders[selectedProvider]}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onModelChange={handleModelChange}
                showModelError={showModelError}
              />
            </section>
          )}

          {/* Done Button */}
          <div className="flex justify-end">
            <button
              onClick={handleDone}
              className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              data-testid="settings-done-button"
            >
              Done
            </button>
          </div>

          {/* Developer Section */}
          <section>
            <h2 className="mb-4 text-base font-medium text-foreground">Developer</h2>
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium text-foreground">Debug Mode</div>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                    Show detailed backend logs including Claude CLI commands, flags,
                    and stdout/stderr output in the task view.
                  </p>
                </div>
                <div className="ml-4">
                  <button
                    data-testid="settings-debug-toggle"
                    onClick={handleDebugToggle}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-accomplish ${settings.debugMode ? 'bg-primary' : 'bg-muted'
                      }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-accomplish ${settings.debugMode ? 'translate-x-6' : 'translate-x-1'
                        }`}
                    />
                  </button>
                </div>
              </div>
              {settings.debugMode && (
                <div className="mt-4 rounded-xl bg-warning/10 p-3.5">
                  <p className="text-sm text-warning">
                    Debug mode is enabled. Backend logs will appear in the task view
                    when running tasks.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* About Section */}
          <section>
            <h2 className="mb-4 text-base font-medium text-foreground">About</h2>
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-4">
                <img
                  src={logoImage}
                  alt="Openwork"
                  className="h-12 w-12 rounded-xl"
                />
                <div>
                  <div className="font-medium text-foreground">Openwork</div>
                  <div className="text-sm text-muted-foreground">Version {appVersion || 'Error: unavailable'}</div>
                </div>
              </div>
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                Openwork is a local computer-use AI agent for your Mac that reads your files, creates documents, and automates repetitive knowledge work—all open-source with your AI models of choice.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Any questions or feedback? <a href="mailto:openwork-support@accomplish.ai" className="text-primary hover:underline">Click here to contact us</a>.
              </p>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
