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
import { Trash2 } from 'lucide-react';
import type { ApiKeyConfig, SelectedModel, ProviderId, ConnectedProvider } from '@accomplish/shared';
import { DEFAULT_PROVIDERS, hasAnyReadyProvider, isProviderReady } from '@accomplish/shared';
import logoImage from '/assets/logo.png';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '@/i18n/config';
import { useProviderSettings } from '@/components/settings/hooks/useProviderSettings';
import { ProviderGrid } from '@/components/settings/ProviderGrid';
import { ProviderSettingsPanel } from '@/components/settings/ProviderSettingsPanel';

// First 4 providers shown in collapsed view (matches PROVIDER_ORDER in ProviderGrid)
const FIRST_FOUR_PROVIDERS: ProviderId[] = ['anthropic', 'openai', 'google', 'bedrock'];

// Provider configuration for legacy API key management
const API_KEY_PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', prefix: 'sk-ant-', placeholder: 'sk-ant-...' },
  { id: 'openai', name: 'OpenAI', prefix: 'sk-', placeholder: 'sk-...' },
  { id: 'openrouter', name: 'OpenRouter', prefix: 'sk-or-', placeholder: 'sk-or-...' },
  { id: 'google', name: 'Google AI', prefix: 'AIza', placeholder: 'AIza...' },
  { id: 'xai', name: 'xAI (Grok)', prefix: 'xai-', placeholder: 'xai-...' },
  { id: 'deepseek', name: 'DeepSeek', prefix: 'sk-', placeholder: 'sk-...' },
  { id: 'zai', name: 'Z.AI Coding Plan', prefix: '', placeholder: 'Your Z.AI API key...' },
  { id: 'bedrock', name: 'Amazon Bedrock', prefix: '', placeholder: '' },
] as const;

// Priority order for OpenRouter providers (lower index = higher priority)
const OPENROUTER_PROVIDER_PRIORITY = [
  'anthropic',
  'openai',
  'google',
  'meta-llama',
  'mistralai',
  'x-ai',
  'deepseek',
  'cohere',
  'perplexity',
  'amazon',
];

// Priority order for LiteLLM providers (lower index = higher priority)
const LITELLM_PROVIDER_PRIORITY = [
  'anthropic',
  'openai',
  'google',
  'meta-llama',
  'mistralai',
  'x-ai',
  'deepseek',
  'cohere',
  'perplexity',
  'amazon',
];

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApiKeySaved?: () => void;
}

export default function SettingsDialog({ open, onOpenChange, onApiKeySaved }: SettingsDialogProps) {
  const { t, i18n } = useTranslation();
  
  // Legacy state for backward compatibility with i18n features
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<ProviderId>('anthropic');
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<ApiKeyConfig[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [appVersion, setAppVersion] = useState('');
  const [selectedModel, setSelectedModel] = useState<SelectedModel | null>(null);
  const [loadingModel, setLoadingModel] = useState(true);
  const [modelStatusMessage, setModelStatusMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'cloud' | 'local' | 'proxy'>('cloud');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaModels, setOllamaModels] = useState<Array<{ id: string; displayName: string; size: number }>>([]);
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [testingOllama, setTestingOllama] = useState(false);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string>('');
  const [savingOllama, setSavingOllama] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);
  const [bedrockAuthTab, setBedrockAuthTab] = useState<'accessKeys' | 'profile'>('accessKeys');
  const [bedrockAccessKeyId, setBedrockAccessKeyId] = useState('');
  const [bedrockSecretKey, setBedrockSecretKey] = useState('');
  const [bedrockSessionToken, setBedrockSessionToken] = useState('');
  const [bedrockProfileName, setBedrockProfileName] = useState('default');
  const [bedrockRegion, setBedrockRegion] = useState('us-east-1');
  const [savingBedrock, setSavingBedrock] = useState(false);
  const [bedrockError, setBedrockError] = useState<string | null>(null);
  const [bedrockStatus, setBedrockStatus] = useState<string | null>(null);

  // OpenRouter state
  const [selectedProxyPlatform, setSelectedProxyPlatform] = useState<'openrouter' | 'litellm'>('openrouter');
  const [openrouterModels, setOpenrouterModels] = useState<Array<{ id: string; name: string; provider: string; contextLength: number }>>([]);
  const [openrouterLoading, setOpenrouterLoading] = useState(false);
  const [openrouterError, setOpenrouterError] = useState<string | null>(null);
  const [openrouterSearch, setOpenrouterSearch] = useState('');
  const [selectedOpenrouterModel, setSelectedOpenrouterModel] = useState<string>('');
  const [savingOpenrouter, setSavingOpenrouter] = useState(false);
  // OpenRouter inline API key entry (for Proxy Platforms tab)
  const [openrouterApiKey, setOpenrouterApiKey] = useState('');

  // LiteLLM state
  const [litellmUrl, setLitellmUrl] = useState('http://localhost:4000');
  const [litellmApiKey, setLitellmApiKey] = useState('');
  const [litellmModels, setLitellmModels] = useState<Array<{ id: string; name: string; provider: string; contextLength: number }>>([]);
  const [litellmConnected, setLitellmConnected] = useState(false);
  const [litellmError, setLitellmError] = useState<string | null>(null);
  const [testingLitellm, setTestingLitellm] = useState(false);
  const [selectedLitellmModel, setSelectedLitellmModel] = useState<string>('');
  const [savingLitellm, setSavingLitellm] = useState(false);
  const [litellmSearch, setLitellmSearch] = useState('');

  // Language state
  const [currentLanguage, setCurrentLanguage] = useState(i18n.language);
  const [supportedLocales, setSupportedLocales] = useState<string[]>([]);

  // New provider settings state
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

    // Auto-expand grid if active provider is not in the first 4 visible providers
    if (!FIRST_FOUR_PROVIDERS.includes(settings.activeProviderId)) {
      setGridExpanded(true);
    }
  }, [open, loading, settings?.activeProviderId]);

  // Sync selectedProxyPlatform and selected model radio button with the actual selected model
  useEffect(() => {
    if (selectedModel?.provider === 'litellm') {
      setSelectedProxyPlatform('litellm');
      // Extract model ID from "litellm/anthropic/claude-haiku" -> "anthropic/claude-haiku"
      const modelId = selectedModel.model?.replace(/^litellm\//, '') || '';
      if (modelId) {
        setSelectedLitellmModel(modelId);
      }
    } else if (selectedModel?.provider === 'openrouter') {
      setSelectedProxyPlatform('openrouter');
      // Extract model ID from "openrouter/anthropic/..." -> "anthropic/..."
      const modelId = selectedModel.model?.replace(/^openrouter\//, '') || '';
      if (modelId) {
        setSelectedOpenrouterModel(modelId);
      }
    }
  }, [selectedModel]);

  const fetchKeys = async () => {
    try {
      const keys = await accomplish.getApiKeys();
      setSavedKeys(keys);
    } catch (err) {
      console.error('Failed to fetch API keys:', err);
    } finally {
      setLoadingKeys(false);
    }
  };

  const fetchDebugSetting = async () => {
    try {
      const debug = await accomplish.getDebugMode();
      setDebugMode(debug);
    } catch (err) {
      console.error('Failed to fetch debug setting:', err);
    } finally {
      setLoadingDebug(false);
    }
  };

  const fetchVersion = async () => {
    try {
      const version = await accomplish.getVersion();
      setAppVersion(version);
    } catch (err) {
      console.error('Failed to fetch version:', err);
    }
  };

  const fetchSelectedModel = async () => {
    try {
      const model = await accomplish.getSelectedModel();
      setSelectedModel(model as SelectedModel | null);
    } catch (err) {
      console.error('Failed to fetch selected model:', err);
    } finally {
      setLoadingModel(false);
    }
  };

  const fetchOllamaConfig = async () => {
    try {
      const config = await accomplish.getOllamaConfig();
      if (config) {
        setOllamaUrl(config.baseUrl);
        // Auto-test connection if previously configured
        if (config.enabled) {
          const result = await accomplish.testOllamaConnection(config.baseUrl);
          if (result.success && result.models) {
            setOllamaConnected(true);
            setOllamaModels(result.models);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch Ollama config:', err);
    }
  };

  const fetchBedrockCredentials = async () => {
    try {
      const credentials = await accomplish.getBedrockCredentials();
      if (credentials) {
        setBedrockAuthTab(credentials.authType);
        if (credentials.authType === 'accessKeys') {
          setBedrockAccessKeyId(credentials.accessKeyId || '');
          // Don't pre-fill secret key for security
        } else {
          setBedrockProfileName(credentials.profileName || 'default');
        }
        setBedrockRegion(credentials.region || 'us-east-1');
      }
    } catch (err) {
      console.error('Failed to fetch Bedrock credentials:', err);
    }
  };

  const fetchLiteLLMConfig = async () => {
    try {
      const config = await accomplish.getLiteLLMConfig();
      if (config) {
        setLitellmUrl(config.baseUrl);
        // Auto-reconnect if previously configured - uses stored API key from secure storage
        if (config.enabled) {
          const result = await accomplish.fetchLiteLLMModels();
          if (result.success && result.models) {
            setLitellmConnected(true);
            setLitellmModels(result.models);
          }
        }
      } catch (err) {
        console.error('Failed to fetch LiteLLM config:', err);
      }
    }
  };

  const fetchSupportedLocales = async () => {
    try {
      const locales = await accomplish.getSupportedLocales();
      setSupportedLocales(locales);
    } catch (err) {
      console.error('Failed to fetch supported locales:', err);
    }
  };

  // Initialize data when dialog opens
  useEffect(() => {
    if (!open) return;
    
    fetchKeys();
    fetchDebugSetting();
    fetchVersion();
    fetchSelectedModel();
    fetchOllamaConfig();
    fetchBedrockCredentials();
    fetchLiteLLMConfig();
    fetchSupportedLocales();
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

  const handleLanguageChange = async (locale: string) => {
    const accomplish = getAccomplish();
    try {
      await changeLanguage(locale);
      await accomplish.setLocale(locale);
      setCurrentLanguage(locale);
    } catch (err) {
      console.error('Failed to change language:', err);
    }
  };

  const handleModelChangeLegacy = async (fullId: string) => {
    const accomplish = getAccomplish();
    const allModels = DEFAULT_PROVIDERS.flatMap((p) => p.models);
    const model = allModels.find((m) => m.fullId === fullId);
    if (model) {
      analytics.trackSelectModel(model.displayName);
      const newSelection: SelectedModel = {
        provider: model.provider,
        model: model.fullId,
      };
      setModelStatusMessage(null);
      try {
        await accomplish.setSelectedModel(newSelection);
        setSelectedModel(newSelection);
        setModelStatusMessage(`Model updated to ${model.displayName}`);
      } catch (err) {
        console.error('Failed to save model selection:', err);
      }
    }
  };

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

  if (loading || !settings) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="settings-dialog">
          <DialogHeader>
            <DialogTitle>{t('settings.title')}</DialogTitle>
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
          <DialogTitle>{t('settings.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Close Warning */}
          <AnimatePresence>
            {closeWarning && (
              <motion.div
                className="rounded-lg border border-warning bg-warning/10 p-4"
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

          {/* Provider Settings Panel */}
          {selectedProvider && (
            <section>
              <ProviderSettingsPanel
                providerId={selectedProvider}
                provider={settings.connectedProviders[selectedProvider]}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onModelChange={handleModelChange}
                onSaveApiKey={(providerId, key) => {
                  // Legacy API key saving functionality
                  return accomplish.addApiKey(providerId, key);
                }}
                onCancel={() => setSelectedProvider(null)}
                showModelError={showModelError}
                onCloseModelError={() => setShowModelError(false)}
              />
            </section>
          )}

          {/* Debug Mode Toggle */}
          <section className="pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-foreground">Debug Mode</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Enable to see detailed logs in the console
                </p>
              </div>
              <button
                onClick={handleDebugToggle}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  debugMode ? 'bg-primary' : 'bg-input'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    debugMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </section>

          {/* Language Selection */}
          <section className="pt-4 border-t border-border">
            <h3 className="text-sm font-medium text-foreground mb-3">Language</h3>
            <select
              value={currentLanguage}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {supportedLocales.map((locale) => (
                <option key={locale} value={locale}>
                  {locale.toUpperCase()}
                </option>
              ))}
            </select>
          </section>

          {/* Version Info */}
          <section className="pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Version: {appVersion}
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}