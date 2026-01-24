'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState, useEffect, useCallback } from 'react';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { analytics } from '@/lib/analytics';
import { getAccomplish } from '@/lib/accomplish';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ProviderId, ConnectedProvider } from '@accomplish/shared';
import { hasAnyReadyProvider, isProviderReady } from '@accomplish/shared';
import { useProviderSettings } from '@/components/settings/hooks/useProviderSettings';
import { GeneralSettings } from '@/components/settings/GeneralSettings';
import { ProvidersSettings } from '@/components/settings/ProvidersSettings';
import { SettingsNav } from '@/components/settings/SettingsNav';
import {Check, InfoIcon} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Label} from "@/components/ui/label";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApiKeySaved?: () => void;
}

export default function SettingsDialog({ open, onOpenChange, onApiKeySaved }: SettingsDialogProps) {
  type SettingsTab = 'general' | 'providers';
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('providers');
  const [closeWarning, setCloseWarning] = useState(false);
  const [showModelError, setShowModelError] = useState(false);

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
  }, [open, refetch, accomplish]);

  // Auto-select active provider and expand grid if needed when dialog opens
  useEffect(() => {
    if (!open || loading || !settings?.activeProviderId) return;

    // Auto-select the active provider to show its connection details immediately
    setSelectedProvider(settings.activeProviderId);
  }, [open, loading, settings?.activeProviderId]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      // Differ it to 'next-tik' so it will not change the ui while closing the dialog.
      const cleanUp = setTimeout(() => {
        setSelectedProvider(null);
        setCloseWarning(false);
        setShowModelError(false);
        setActiveTab('providers');
      }, 200)

      return () => clearTimeout(cleanUp);
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
    analytics.trackSaveApiKey(provider.providerId);

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

  // Handle debug mode toggle - writes to appSettings (correct store)
  const handleDebugToggle = useCallback(async () => {
    const newValue = !debugMode;
    await accomplish.setDebugMode(newValue);
    setDebugModeState(newValue);
    analytics.trackToggleDebugMode(newValue);
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

  const closeWarningContent = (
    <AnimatePresence>
      {closeWarning && (
        <motion.div
          className="rounded-lg border border-warning bg-warning/10 p-4 mb-4"
          variants={settingsVariants.fadeSlide}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={settingsTransitions.enter}
        >
          <div className='flex flex-col gap-1'>
            <div className='flex items-center gap-1'>
              <InfoIcon className='size-3.5 text-muted-foreground' />
              <Label>No Provider ready</Label>
            </div>
            <p>
              You need to connect a provider and select a model before you can run tasks.
            </p>

            <Button className='max-w-max' onClick={handleForceClose}>
              Close anyway
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (loading || !settings) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-5xl h-[70vh] overflow-hidden p-0" data-testid="settings-dialog">
          <div className="flex h-full">
            <SettingsNav activeTab={activeTab} onTabChange={setActiveTab} />
            <div className="flex flex-1 flex-col h-[70vh]">
              <DialogHeader className="border-b border-border px-6 py-5">
                <DialogTitle>Set up Openwork</DialogTitle>
              </DialogHeader>
              <div className="flex flex-1 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-5xl h-[70vh] p-0 overflow-hidden" data-testid="settings-dialog">
        <div className="flex">
          <SettingsNav activeTab={activeTab} onTabChange={setActiveTab} />
          <div className="flex flex-1 flex-col h-[70vh]">
            <DialogHeader className="border-b border-border px-6 py-5">
              <DialogTitle>Settings</DialogTitle>
            </DialogHeader>

            <div className="flex-1 min-h-0 px-6 py-5 overflow-y-auto">
                {activeTab === 'general' ? (
                  <>
                    {closeWarningContent}
                    <GeneralSettings debugMode={debugMode} onToggleDebugMode={handleDebugToggle} />
                  </>
                ) : activeTab === 'providers' ? (
                  <>
                    {closeWarningContent}
                    <ProvidersSettings
                      settings={settings}
                      selectedProvider={selectedProvider}
                      onSelectProvider={handleSelectProvider}
                      onConnect={handleConnect}
                      onDisconnect={handleDisconnect}
                      onModelChange={handleModelChange}
                      showModelError={showModelError}
                    />
                  </>
                ) : null}
              </div>

            <div className="flex items-center justify-end border-t border-border px-6 py-4">
              <Button
                onClick={handleDone}
                data-testid="settings-done-button">
                <Check className='size-4' />
                Done
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
