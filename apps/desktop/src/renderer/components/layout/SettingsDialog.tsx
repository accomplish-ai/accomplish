'use client';

import { useState, useEffect } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import { analytics } from '@/lib/analytics';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Trash2 } from 'lucide-react';
import type { ApiKeyConfig, SelectedModel } from '@accomplish/shared';
import { DEFAULT_PROVIDERS } from '@accomplish/shared';
import logoImage from '/assets/logo.png';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApiKeySaved?: () => void;
}

// Provider configuration
const API_KEY_PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', prefix: 'sk-ant-', placeholder: 'sk-ant-...' },
  { id: 'openai', name: 'OpenAI', prefix: 'sk-', placeholder: 'sk-...' },
  { id: 'google', name: 'Google AI', prefix: 'AIza', placeholder: 'AIza...' },
  { id: 'xai', name: 'xAI (Grok)', prefix: 'xai-', placeholder: 'xai-...' },
] as const;

type ProviderId = typeof API_KEY_PROVIDERS[number]['id'];

export default function SettingsDialog({ open, onOpenChange, onApiKeySaved }: SettingsDialogProps) {
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<ProviderId>('anthropic');
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<ApiKeyConfig[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [loadingDebug, setLoadingDebug] = useState(true);
  const [appVersion, setAppVersion] = useState('');
  const [selectedModel, setSelectedModel] = useState<SelectedModel | null>(null);
  const [loadingModel, setLoadingModel] = useState(true);
  const [modelStatusMessage, setModelStatusMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'cloud' | 'local'>('cloud');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaModels, setOllamaModels] = useState<Array<{ id: string; displayName: string; size: number }>>([]);
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [testingOllama, setTestingOllama] = useState(false);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string>('');
  const [savingOllama, setSavingOllama] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const accomplish = getAccomplish();

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
        const enabled = await accomplish.getDebugMode();
        setDebugMode(enabled);
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

    fetchKeys();
    fetchDebugSetting();
    fetchVersion();
    fetchSelectedModel();
    fetchOllamaConfig();
  }, [open]);

  const handleDebugToggle = async () => {
    const accomplish = getAccomplish();
    const newValue = !debugMode;
    setDebugMode(newValue);
    analytics.trackToggleDebugMode(newValue);
    try {
      await accomplish.setDebugMode(newValue);
    } catch (err) {
      console.error('Failed to save debug setting:', err);
      setDebugMode(!newValue);
    }
  };

  const handleModelChange = async (fullId: string) => {
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

  const handleSaveApiKey = async () => {
    const accomplish = getAccomplish();
    const trimmedKey = apiKey.trim();
    const currentProvider = API_KEY_PROVIDERS.find((p) => p.id === provider)!;

    if (!trimmedKey) {
      setError('Please enter an API key.');
      return;
    }

    if (!trimmedKey.startsWith(currentProvider.prefix)) {
      setError(`Invalid API key format. Key should start with ${currentProvider.prefix}`);
      return;
    }

    setIsSaving(true);
    setError(null);
    setStatusMessage(null);

    try {
      // Validate first
      const validation = await accomplish.validateApiKeyForProvider(provider, trimmedKey);
      if (!validation.valid) {
        setError(validation.error || 'Invalid API key');
        setIsSaving(false);
        return;
      }

      const savedKey = await accomplish.addApiKey(provider, trimmedKey);
      analytics.trackSaveApiKey(currentProvider.name);
      setApiKey('');
      setStatusMessage(`${currentProvider.name} API key saved securely.`);
      setSavedKeys((prev) => {
        const filtered = prev.filter((k) => k.provider !== savedKey.provider);
        return [...filtered, savedKey];
      });
      onApiKeySaved?.();

      // Auto-select model for the provider if it's not already selected
      if (provider === 'google' && selectedModel?.provider !== 'google') {
        const googleModel = 'google/gemini-3-pro-preview';
        const newSelection: SelectedModel = { provider: 'google', model: googleModel };
        await accomplish.setSelectedModel(newSelection);
        setSelectedModel(newSelection);
        setModelStatusMessage(`Model switched to Gemini 3 Pro for Google AI`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save API key.';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteApiKey = async (id: string, providerName: string) => {
    const accomplish = getAccomplish();
    const providerConfig = API_KEY_PROVIDERS.find((p) => p.id === providerName);
    try {
      await accomplish.removeApiKey(id);
      setSavedKeys((prev) => prev.filter((k) => k.id !== id));
      setStatusMessage(`${providerConfig?.name || providerName} API key removed.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove API key.';
      setError(message);
    }
  };

  const handleTestOllama = async () => {
    const accomplish = getAccomplish();
    setTestingOllama(true);
    setOllamaError(null);
    setOllamaConnected(false);
    setOllamaModels([]);

    try {
      const result = await accomplish.testOllamaConnection(ollamaUrl);
      if (result.success && result.models) {
        setOllamaConnected(true);
        setOllamaModels(result.models);
        if (result.models.length > 0) {
          setSelectedOllamaModel(result.models[0].id);
        }
      } else {
        setOllamaError(result.error || 'Connection failed');
      }
    } catch (err) {
      setOllamaError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setTestingOllama(false);
    }
  };

  const handleSaveOllama = async () => {
    const accomplish = getAccomplish();
    setSavingOllama(true);

    try {
      // Save the Ollama config
      await accomplish.setOllamaConfig({
        baseUrl: ollamaUrl,
        enabled: true,
        lastValidated: Date.now(),
        models: ollamaModels,  // Include discovered models
      });

      // Set as selected model
      await accomplish.setSelectedModel({
        provider: 'ollama',
        model: `ollama/${selectedOllamaModel}`,
        baseUrl: ollamaUrl,
      });

      setSelectedModel({
        provider: 'ollama',
        model: `ollama/${selectedOllamaModel}`,
        baseUrl: ollamaUrl,
      });

      setModelStatusMessage(`Model updated to ${selectedOllamaModel}`);
    } catch (err) {
      setOllamaError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingOllama(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-8 mt-4">
          {/* Model Selection Section */}
          <section>
            <h2 className="mb-4 text-base font-medium text-foreground">Model</h2>
            <div className="rounded-lg border border-border bg-card p-5">
              {/* Tabs */}
              <div className="flex gap-2 mb-5">
                <button
                  onClick={() => setActiveTab('cloud')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'cloud'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Cloud Providers
                </button>
                <button
                  onClick={() => setActiveTab('local')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'local'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Local Models
                </button>
              </div>

              {activeTab === 'cloud' ? (
                <>
                  <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
                    Select a cloud AI model. Requires an API key for the provider.
                  </p>
                  {loadingModel ? (
                    <div className="h-10 animate-pulse rounded-md bg-muted" />
                  ) : (
                    <select
                      data-testid="settings-model-select"
                      value={selectedModel?.provider !== 'ollama' ? selectedModel?.model || '' : ''}
                      onChange={(e) => handleModelChange(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="" disabled>Select a model...</option>
                      {DEFAULT_PROVIDERS.filter((p) => p.requiresApiKey).map((provider) => {
                        const hasApiKey = savedKeys.some((k) => k.provider === provider.id);
                        return (
                          <optgroup key={provider.id} label={provider.name}>
                            {provider.models.map((model) => (
                              <option
                                key={model.fullId}
                                value={model.fullId}
                                disabled={!hasApiKey}
                              >
                                {model.displayName}{!hasApiKey ? ' (No API key)' : ''}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  )}
                  {modelStatusMessage && (
                    <p className="mt-3 text-sm text-success">{modelStatusMessage}</p>
                  )}
                  {selectedModel && selectedModel.provider !== 'ollama' && !savedKeys.some((k) => k.provider === selectedModel.provider) && (
                    <p className="mt-3 text-sm text-warning">
                      No API key configured for {DEFAULT_PROVIDERS.find((p) => p.id === selectedModel.provider)?.name}. Add one below.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
                    Connect to a local Ollama server to use models running on your machine.
                  </p>

                  {/* Ollama URL Input */}
                  <div className="mb-4">
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      Ollama Server URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={ollamaUrl}
                        onChange={(e) => {
                          setOllamaUrl(e.target.value);
                          setOllamaConnected(false);
                          setOllamaModels([]);
                        }}
                        placeholder="http://localhost:11434"
                        className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                      <button
                        onClick={handleTestOllama}
                        disabled={testingOllama}
                        className="rounded-md bg-muted px-4 py-2 text-sm font-medium hover:bg-muted/80 disabled:opacity-50"
                      >
                        {testingOllama ? 'Testing...' : 'Test'}
                      </button>
                    </div>
                  </div>

                  {/* Connection Status */}
                  {ollamaConnected && (
                    <div className="mb-4 flex items-center gap-2 text-sm text-success">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Connected - {ollamaModels.length} model{ollamaModels.length !== 1 ? 's' : ''} available
                    </div>
                  )}

                  {ollamaError && (
                    <div className="mb-4 flex items-center gap-2 text-sm text-destructive">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      {ollamaError}
                    </div>
                  )}

                  {/* Model Selection (only show when connected) */}
                  {ollamaConnected && ollamaModels.length > 0 && (
                    <div className="mb-4">
                      <label className="mb-2 block text-sm font-medium text-foreground">
                        Select Model
                      </label>
                      <select
                        value={selectedOllamaModel}
                        onChange={(e) => setSelectedOllamaModel(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        {ollamaModels.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.displayName} ({formatBytes(model.size)})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Save Button */}
                  {ollamaConnected && selectedOllamaModel && (
                    <button
                      onClick={handleSaveOllama}
                      disabled={savingOllama}
                      className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {savingOllama ? 'Saving...' : 'Use This Model'}
                    </button>
                  )}

                  {/* Help text when not connected */}
                  {!ollamaConnected && !ollamaError && (
                    <p className="text-sm text-muted-foreground">
                      Make sure{' '}
                      <a
                        href="https://ollama.ai"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Ollama
                      </a>{' '}
                      is installed and running, then click Test to connect.
                    </p>
                  )}

                  {/* Current Ollama selection indicator */}
                  {selectedModel?.provider === 'ollama' && (
                    <div className="mt-4 rounded-lg bg-muted p-3">
                      <p className="text-sm text-foreground">
                        <span className="font-medium">Currently using:</span>{' '}
                        {selectedModel.model.replace('ollama/', '')}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {/* API Key Section - Only show for cloud providers */}
          {activeTab === 'cloud' && (
            <section>
              <h2 className="mb-4 text-base font-medium text-foreground">Bring Your Own Model/API Key</h2>
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="mb-5 text-sm text-muted-foreground leading-relaxed">
                Setup the API key and model for your own AI coworker.
              </p>

              {/* Provider Selection */}
              <div className="mb-5">
                <label className="mb-2.5 block text-sm font-medium text-foreground">
                  Provider
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {API_KEY_PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        analytics.trackSelectProvider(p.name);
                        setProvider(p.id);
                      }}
                      className={`rounded-xl border p-4 text-center transition-all duration-200 ease-accomplish ${
                        provider === p.id
                          ? 'border-primary bg-muted'
                          : 'border-border hover:border-ring'
                      }`}
                    >
                      <div className="font-medium text-foreground">{p.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* API Key Input */}
              <div className="mb-5">
                <label className="mb-2.5 block text-sm font-medium text-foreground">
                  {API_KEY_PROVIDERS.find((p) => p.id === provider)?.name} API Key
                </label>
                <input
                  data-testid="settings-api-key-input"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={API_KEY_PROVIDERS.find((p) => p.id === provider)?.placeholder}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
              {statusMessage && (
                <p className="mb-4 text-sm text-success">{statusMessage}</p>
              )}

              <button
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                onClick={handleSaveApiKey}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save API Key'}
              </button>

              {/* Saved Keys */}
              {loadingKeys ? (
                <div className="mt-6 animate-pulse">
                  <div className="h-4 w-24 rounded bg-muted mb-3" />
                  <div className="h-14 rounded-xl bg-muted" />
                </div>
              ) : savedKeys.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-3 text-sm font-medium text-foreground">Saved Keys</h3>
                  <div className="space-y-2">
                    {savedKeys.map((key) => {
                      const providerConfig = API_KEY_PROVIDERS.find((p) => p.id === key.provider);
                      return (
                        <div
                          key={key.id}
                          className="flex items-center justify-between rounded-xl border border-border bg-muted p-3.5"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                              <span className="text-xs font-bold text-primary">
                                {providerConfig?.name.charAt(0) || key.provider.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <div className="text-sm font-medium text-foreground">
                                {providerConfig?.name || key.provider}
                              </div>
                              <div className="text-xs text-muted-foreground font-mono">
                                {key.keyPrefix}
                              </div>
                            </div>
                          </div>
                          {keyToDelete === key.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Are you sure?</span>
                              <button
                                onClick={() => {
                                  handleDeleteApiKey(key.id, key.provider);
                                  setKeyToDelete(null);
                                }}
                                className="rounded px-2 py-1 text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setKeyToDelete(null)}
                                className="rounded px-2 py-1 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setKeyToDelete(key.id)}
                              className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors duration-200 ease-accomplish"
                              title="Remove API key"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            </section>
          )}

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
                  {loadingDebug ? (
                    <div className="h-6 w-11 animate-pulse rounded-full bg-muted" />
                  ) : (
                    <button
                      data-testid="settings-debug-toggle"
                      onClick={handleDebugToggle}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-accomplish ${
                        debugMode ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-accomplish ${
                          debugMode ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  )}
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
                  <div className="text-sm text-muted-foreground">Version {appVersion || '0.1.0'}</div>
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
