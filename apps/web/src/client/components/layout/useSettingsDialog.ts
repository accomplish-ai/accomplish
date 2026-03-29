import { useState, useEffect, useCallback } from 'react';
import type { ProviderId, ConnectedProvider } from '@accomplish_ai/agent-core/common';
import { hasAnyReadyProvider, isProviderReady } from '@accomplish_ai/agent-core/common';
import { getAccomplish } from '@/lib/accomplish';
import { useProviderSettings } from '@/components/settings/hooks/useProviderSettings';
import { FIRST_FOUR_PROVIDERS, type SettingsTabId } from './settings-tabs';

interface UseSettingsDialogOptions {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApiKeySaved?: () => void;
  initialProvider?: ProviderId;
  initialTab: SettingsTabId;
}

/** All state and callbacks for SettingsDialog. */
export function useSettingsDialog({
  open,
  onOpenChange,
  onApiKeySaved,
  initialProvider,
  initialTab,
}: UseSettingsDialogOptions) {
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null);
  const [gridExpanded, setGridExpanded] = useState(false);
  const [closeWarning, setCloseWarning] = useState(false);
  const [showModelError, setShowModelError] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [appVersion, setAppVersion] = useState<string>('');
  const [skillsRefreshTrigger, setSkillsRefreshTrigger] = useState(0);
  const [debugMode, setDebugModeState] = useState(false);
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);

  const {
    settings,
    loading,
    setActiveProvider,
    connectProvider,
    disconnectProvider,
    updateModel,
    refetch,
  } = useProviderSettings();
  const accomplish = getAccomplish();

  useEffect(() => {
    if (!open) {
      return;
    }
    refetch();
    accomplish.getDebugMode().then(setDebugModeState);
    accomplish.getNotificationsEnabled().then(setNotificationsEnabledState);
    accomplish.getVersion().then(setAppVersion);
  }, [open, refetch, accomplish]);

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

  useEffect(() => {
    if (!open || loading) {
      return;
    }
    const providerToSelect = initialProvider || settings?.activeProviderId;
    if (!providerToSelect) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: sync with open/initialProvider
    setSelectedProvider(providerToSelect);
    if (!FIRST_FOUR_PROVIDERS.includes(providerToSelect as (typeof FIRST_FOUR_PROVIDERS)[number])) {
      setGridExpanded(true);
    }
  }, [open, loading, initialProvider, settings?.activeProviderId]);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen && settings && !hasAnyReadyProvider(settings)) {
        setCloseWarning(true);
        return;
      }
      setCloseWarning(false);
      onOpenChange(newOpen);
    },
    [settings, onOpenChange],
  );

  const handleSelectProvider = useCallback(
    async (providerId: ProviderId) => {
      setSelectedProvider(providerId);
      setCloseWarning(false);
      setShowModelError(false);
      const provider = settings?.connectedProviders?.[providerId];
      if (provider && isProviderReady(provider)) {
        await setActiveProvider(providerId);
      }
    },
    [settings?.connectedProviders, setActiveProvider],
  );

  const handleConnect = useCallback(
    async (provider: ConnectedProvider) => {
      await connectProvider(provider.providerId, provider);
      if (isProviderReady(provider)) {
        await setActiveProvider(provider.providerId);
        onApiKeySaved?.();
      }
    },
    [connectProvider, setActiveProvider, onApiKeySaved],
  );

  const handleUpdateProvider = useCallback(
    async (provider: ConnectedProvider) => {
      await connectProvider(provider.providerId, provider);
    },
    [connectProvider],
  );

  const handleDisconnect = useCallback(async () => {
    if (!selectedProvider) {
      return;
    }
    const wasActive = settings?.activeProviderId === selectedProvider;
    await disconnectProvider(selectedProvider);
    setSelectedProvider(null);
    if (wasActive && settings?.connectedProviders) {
      const readyId = Object.keys(settings.connectedProviders).find(
        (id) =>
          id !== selectedProvider && isProviderReady(settings.connectedProviders[id as ProviderId]),
      ) as ProviderId | undefined;
      if (readyId) {
        await setActiveProvider(readyId);
      }
    }
  }, [selectedProvider, disconnectProvider, settings, setActiveProvider]);

  const handleModelChange = useCallback(
    async (modelId: string) => {
      if (!selectedProvider) {
        return;
      }
      await updateModel(selectedProvider, modelId);
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

  const handleDebugToggle = useCallback(async () => {
    const newValue = !debugMode;
    await accomplish.setDebugMode(newValue);
    setDebugModeState(newValue);
  }, [debugMode, accomplish]);

  const handleNotificationsToggle = useCallback(async () => {
    const newValue = !notificationsEnabled;
    await accomplish.setNotificationsEnabled(newValue);
    setNotificationsEnabledState(newValue);
  }, [notificationsEnabled, accomplish]);

  const handleDone = useCallback(() => {
    if (!settings) {
      return;
    }
    if (selectedProvider) {
      const provider = settings.connectedProviders[selectedProvider];
      if (provider?.connectionStatus === 'connected' && !provider.selectedModelId) {
        setShowModelError(true);
        return;
      }
    }
    if (!hasAnyReadyProvider(settings)) {
      setActiveTab('providers');
      setCloseWarning(true);
      return;
    }
    if (settings.activeProviderId) {
      const activeProvider = settings.connectedProviders[settings.activeProviderId];
      if (!isProviderReady(activeProvider)) {
        const readyId = Object.keys(settings.connectedProviders).find((id) =>
          isProviderReady(settings.connectedProviders[id as ProviderId]),
        ) as ProviderId | undefined;
        if (readyId) {
          setActiveProvider(readyId);
        }
      }
    } else {
      const readyId = Object.keys(settings.connectedProviders).find((id) =>
        isProviderReady(settings.connectedProviders[id as ProviderId]),
      ) as ProviderId | undefined;
      if (readyId) {
        setActiveProvider(readyId);
      }
    }
    onOpenChange(false);
  }, [settings, selectedProvider, onOpenChange, setActiveProvider]);

  const handleForceClose = useCallback(() => {
    setCloseWarning(false);
    onOpenChange(false);
  }, [onOpenChange]);

  return {
    settings,
    loading,
    selectedProvider,
    gridExpanded,
    setGridExpanded,
    closeWarning,
    showModelError,
    activeTab,
    setActiveTab,
    appVersion,
    skillsRefreshTrigger,
    setSkillsRefreshTrigger,
    debugMode,
    notificationsEnabled,
    handleOpenChange,
    handleSelectProvider,
    handleConnect,
    handleUpdateProvider,
    handleDisconnect,
    handleModelChange,
    handleDebugToggle,
    handleNotificationsToggle,
    handleDone,
    handleForceClose,
  };
}
