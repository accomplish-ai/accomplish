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
import type { ApiKeyConfig, SelectedModel, LocalLlmConfig, ModelConfig } from '@accomplish/shared';
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
  { id: 'groq', name: 'Groq', prefix: 'gsk_', placeholder: 'gsk_...' },
  { id: 'openrouter', name: 'OpenRouter', prefix: 'sk-or-', placeholder: 'sk-or-...' },
  { id: 'litellm', name: 'LiteLLM', prefix: '', placeholder: 'LiteLLM key (optional)' },
] as const;

// Coming soon providers (displayed but not selectable)
const COMING_SOON_PROVIDERS: Array<{ id: string; name: string }> = [];

const LOCAL_LLM_PRESETS = [
  { id: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
  { id: 'lm-studio', name: 'LM Studio', baseUrl: 'http://localhost:1234/v1' },
  { id: 'localai', name: 'LocalAI', baseUrl: 'http://localhost:8080/v1' },
  { id: 'custom', name: 'Custom', baseUrl: '' },
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
  const [localConfig, setLocalConfig] = useState<LocalLlmConfig | null>(null);
  const [localPreset, setLocalPreset] = useState<string>('ollama');
  const [localBaseUrl, setLocalBaseUrl] = useState('');
  const [localModel, setLocalModel] = useState('');
  const [localApiKey, setLocalApiKey] = useState('');
  const [localStatusMessage, setLocalStatusMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localTesting, setLocalTesting] = useState(false);
  const [localSaving, setLocalSaving] = useState(false);
  const [openrouterModel, setOpenrouterModel] = useState('');
  const [openrouterStatus, setOpenrouterStatus] = useState<string | null>(null);
  const [openrouterError, setOpenrouterError] = useState<string | null>(null);
  const [openrouterTesting, setOpenrouterTesting] = useState(false);
  const [openrouterSaving, setOpenrouterSaving] = useState(false);
  const [litellmBaseUrl, setLitellmBaseUrl] = useState('');
  const [litellmModel, setLitellmModel] = useState('');
  const [litellmStatus, setLitellmStatus] = useState<string | null>(null);
  const [litellmError, setLitellmError] = useState<string | null>(null);
  const [litellmTesting, setLitellmTesting] = useState(false);
  const [litellmSaving, setLitellmSaving] = useState(false);

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

    const fetchLocalConfig = async () => {
      try {
        const config = await accomplish.getLocalLlmConfig();
        setLocalConfig(config as LocalLlmConfig | null);
        if (config) {
          setLocalPreset(config.preset || 'custom');
          setLocalBaseUrl(config.baseUrl);
          setLocalModel(config.model);
        }
      } catch (err) {
        console.error('Failed to fetch local LLM config:', err);
      }
    };

    const fetchOpenRouterConfig = async () => {
      try {
        const config = await accomplish.getOpenRouterConfig();
        if (config?.model) {
          setOpenrouterModel(config.model);
        }
      } catch (err) {
        console.error('Failed to fetch OpenRouter config:', err);
      }
    };

    const fetchLiteLlmConfig = async () => {
      try {
        const config = await accomplish.getLiteLlmConfig();
        if (config) {
          setLitellmBaseUrl(config.baseUrl);
          setLitellmModel(config.model);
        }
      } catch (err) {
        console.error('Failed to fetch LiteLLM config:', err);
      }
    };

    fetchKeys();
    fetchDebugSetting();
    fetchVersion();
    fetchSelectedModel();
    fetchLocalConfig();
    fetchOpenRouterConfig();
    fetchLiteLlmConfig();
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
    const baseModels = DEFAULT_PROVIDERS
      .filter((p) => p.id !== 'local' && p.id !== 'openrouter' && p.id !== 'litellm')
      .flatMap((p) => p.models);
    const localModelOption: ModelConfig[] = localConfig?.baseUrl && localConfig?.model
      ? [{
        id: localConfig.model,
        displayName: `Local (${localConfig.model})`,
        provider: 'local',
        fullId: `openai/${localConfig.model}`,
        supportsVision: false,
      }]
      : [];
    const openrouterOption: ModelConfig[] = openrouterModel.trim()
      ? [{
        id: openrouterModel.trim(),
        displayName: `OpenRouter (${openrouterModel.trim()})`,
        provider: 'openrouter',
        fullId: `openrouter/${openrouterModel.trim()}`,
        supportsVision: true,
      }]
      : [];
    const litellmOption: ModelConfig[] = litellmBaseUrl.trim() && litellmModel.trim()
      ? [{
        id: litellmModel.trim(),
        displayName: `LiteLLM (${litellmModel.trim()})`,
        provider: 'litellm',
        fullId: `litellm/${litellmModel.trim()}`,
        supportsVision: false,
      }]
      : [];
    const allModels = [...baseModels, ...localModelOption, ...openrouterOption, ...litellmOption];
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

  const handleLocalPresetChange = (presetId: string) => {
    setLocalPreset(presetId);
    const preset = LOCAL_LLM_PRESETS.find((p) => p.id === presetId);
    if (preset && preset.baseUrl) {
      setLocalBaseUrl(preset.baseUrl);
    }
  };

  const handleSaveLocalConfig = async () => {
    const accomplish = getAccomplish();
    const trimmedBaseUrl = localBaseUrl.trim();
    const trimmedModel = localModel.trim();

    if (!trimmedBaseUrl || !trimmedModel) {
      setLocalError('Please enter a base URL and model name.');
      return;
    }

    setLocalSaving(true);
    setLocalError(null);
    setLocalStatusMessage(null);

    try {
      const preset = localPreset === 'custom' ? undefined : localPreset;
      const saved = await accomplish.setLocalLlmConfig({
        baseUrl: trimmedBaseUrl,
        model: trimmedModel,
        preset,
      });
      setLocalConfig(saved as LocalLlmConfig);
      if (localApiKey.trim()) {
        await accomplish.setLocalLlmKey(localApiKey.trim());
      }
      setLocalStatusMessage('Local endpoint saved.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save local endpoint.';
      setLocalError(message);
    } finally {
      setLocalSaving(false);
    }
  };

  const handleTestLocalConfig = async () => {
    const accomplish = getAccomplish();
    const trimmedBaseUrl = localBaseUrl.trim();
    if (!trimmedBaseUrl) {
      setLocalError('Please enter a base URL to test.');
      return;
    }

    setLocalTesting(true);
    setLocalError(null);
    setLocalStatusMessage(null);

    try {
      const result = await accomplish.testLocalLlm({
        baseUrl: trimmedBaseUrl,
        apiKey: localApiKey.trim() || undefined,
      });
      if (result.ok) {
        setLocalStatusMessage('Connection successful.');
      } else {
        setLocalError(result.error || 'Connection failed.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed.';
      setLocalError(message);
    } finally {
      setLocalTesting(false);
    }
  };

  const handleClearLocalKey = async () => {
    const accomplish = getAccomplish();
    try {
      await accomplish.clearLocalLlmKey();
      setLocalApiKey('');
      setLocalStatusMessage('Local API key cleared.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to clear local API key.';
      setLocalError(message);
    }
  };

  const handleSaveOpenRouter = async () => {
    const accomplish = getAccomplish();
    const trimmedModel = openrouterModel.trim();
    if (!trimmedModel) {
      setOpenrouterError('Please enter a model name.');
      return;
    }
    setOpenrouterSaving(true);
    setOpenrouterError(null);
    setOpenrouterStatus(null);
    try {
      await accomplish.setOpenRouterConfig({ model: trimmedModel });
      setOpenrouterStatus('OpenRouter config saved.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save OpenRouter config.';
      setOpenrouterError(message);
    } finally {
      setOpenrouterSaving(false);
    }
  };

  const handleTestOpenRouter = async () => {
    const accomplish = getAccomplish();
    setOpenrouterTesting(true);
    setOpenrouterError(null);
    setOpenrouterStatus(null);
    try {
      const result = await accomplish.testOpenRouter({});
      if (result.ok) {
        setOpenrouterStatus('Connection successful.');
      } else {
        setOpenrouterError(result.error || 'Connection failed.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed.';
      setOpenrouterError(message);
    } finally {
      setOpenrouterTesting(false);
    }
  };

  const handleSaveLiteLlm = async () => {
    const accomplish = getAccomplish();
    const trimmedBaseUrl = litellmBaseUrl.trim();
    const trimmedModel = litellmModel.trim();
    if (!trimmedBaseUrl || !trimmedModel) {
      setLitellmError('Please enter a base URL and model name.');
      return;
    }
    setLitellmSaving(true);
    setLitellmError(null);
    setLitellmStatus(null);
    try {
      await accomplish.setLiteLlmConfig({ baseUrl: trimmedBaseUrl, model: trimmedModel });
      setLitellmStatus('LiteLLM config saved.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save LiteLLM config.';
      setLitellmError(message);
    } finally {
      setLitellmSaving(false);
    }
  };

  const handleTestLiteLlm = async () => {
    const accomplish = getAccomplish();
    const trimmedBaseUrl = litellmBaseUrl.trim();
    if (!trimmedBaseUrl) {
      setLitellmError('Please enter a base URL to test.');
      return;
    }
    setLitellmTesting(true);
    setLitellmError(null);
    setLitellmStatus(null);
    try {
      const result = await accomplish.testLiteLlm({ baseUrl: trimmedBaseUrl });
      if (result.ok) {
        setLitellmStatus('Connection successful.');
      } else {
        setLitellmError(result.error || 'Connection failed.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed.';
      setLitellmError(message);
    } finally {
      setLitellmTesting(false);
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

    if (currentProvider.prefix && !trimmedKey.startsWith(currentProvider.prefix)) {
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

  const visibleKeys = savedKeys.filter((key) => key.provider !== 'local');
  const localConfigured = Boolean(localConfig?.baseUrl && localConfig?.model);

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
              <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
                Select the AI model to use for task execution.
              </p>
              {loadingModel ? (
                <div className="h-10 animate-pulse rounded-md bg-muted" />
              ) : (
                <select
                  value={selectedModel?.model || ''}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {DEFAULT_PROVIDERS.filter((p) => p.requiresApiKey && p.id !== 'local' && p.id !== 'openrouter' && p.id !== 'litellm').map((provider) => {
                    const hasApiKey = visibleKeys.some((k) => k.provider === provider.id);
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
                  <optgroup label="Local (OpenAI-compatible)">
                    {localConfigured && localConfig ? (
                      <option value={`openai/${localConfig.model}`}>
                        Local ({localConfig.model})
                      </option>
                    ) : (
                      <option value="" disabled>
                        Configure local endpoint to enable
                      </option>
                    )}
                  </optgroup>
                  <optgroup label="OpenRouter">
                    {openrouterModel.trim() ? (
                      <option value={`openrouter/${openrouterModel.trim()}`}>
                        OpenRouter ({openrouterModel.trim()})
                      </option>
                    ) : (
                      <option value="" disabled>
                        Configure OpenRouter to enable
                      </option>
                    )}
                  </optgroup>
                  <optgroup label="LiteLLM">
                    {litellmBaseUrl.trim() && litellmModel.trim() ? (
                      <option value={`litellm/${litellmModel.trim()}`}>
                        LiteLLM ({litellmModel.trim()})
                      </option>
                    ) : (
                      <option value="" disabled>
                        Configure LiteLLM to enable
                      </option>
                    )}
                  </optgroup>
                </select>
              )}
              {modelStatusMessage && (
                <p className="mt-3 text-sm text-success">{modelStatusMessage}</p>
              )}
              {selectedModel && DEFAULT_PROVIDERS.find((p) => p.id === selectedModel.provider)?.requiresApiKey &&
                !visibleKeys.some((k) => k.provider === selectedModel.provider) && (
                  <p className="mt-3 text-sm text-warning">
                    No API key configured for {DEFAULT_PROVIDERS.find((p) => p.id === selectedModel.provider)?.name}. Add one below to use this model.
                  </p>
                )}
              {selectedModel?.provider === 'local' && !localConfigured && (
                <p className="mt-3 text-sm text-warning">
                  Local endpoint is not configured. Add it below to use the local model.
                </p>
              )}
              {selectedModel?.provider === 'openrouter' && !openrouterModel.trim() && (
                <p className="mt-3 text-sm text-warning">
                  OpenRouter is not configured. Add a model below to use it.
                </p>
              )}
              {selectedModel?.provider === 'litellm' && !(litellmBaseUrl.trim() && litellmModel.trim()) && (
                <p className="mt-3 text-sm text-warning">
                  LiteLLM is not configured. Add a base URL and model below to use it.
                </p>
              )}
            </div>
          </section>

          {/* API Key Section */}
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
                  {COMING_SOON_PROVIDERS.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-xl border border-dashed border-muted-foreground/30 p-4 text-center opacity-60 cursor-not-allowed"
                    >
                      <div className="font-medium text-muted-foreground">{p.name}</div>
                      <div className="text-xs text-muted-foreground/70 mt-1">Coming Soon</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* API Key Input */}
              <div className="mb-5">
                <label className="mb-2.5 block text-sm font-medium text-foreground">
                  {API_KEY_PROVIDERS.find((p) => p.id === provider)?.name} API Key
                </label>
                <input
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
              ) : visibleKeys.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-3 text-sm font-medium text-foreground">Saved Keys</h3>
                  <div className="space-y-2">
                    {visibleKeys.map((key) => {
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
                          <button
                            onClick={() => handleDeleteApiKey(key.id, key.provider)}
                            className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors duration-200 ease-accomplish"
                            title="Remove API key"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Local LLM Section */}
          <section>
            <h2 className="mb-4 text-base font-medium text-foreground">Local (OpenAI-compatible)</h2>
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="mb-5 text-sm text-muted-foreground leading-relaxed">
                Configure a local OpenAI-compatible endpoint (Ollama, LM Studio, LocalAI, etc.) to run fully offline.
              </p>

              <div className="mb-5">
                <label className="mb-2.5 block text-sm font-medium text-foreground">
                  Preset
                </label>
                <select
                  value={localPreset}
                  onChange={(e) => handleLocalPresetChange(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {LOCAL_LLM_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-5">
                <label className="mb-2.5 block text-sm font-medium text-foreground">
                  Base URL
                </label>
                <input
                  type="text"
                  value={localBaseUrl}
                  onChange={(e) => setLocalBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434/v1"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="mb-5">
                <label className="mb-2.5 block text-sm font-medium text-foreground">
                  Model name
                </label>
                <input
                  type="text"
                  value={localModel}
                  onChange={(e) => setLocalModel(e.target.value)}
                  placeholder="llama3.1"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="mb-5">
                <label className="mb-2.5 block text-sm font-medium text-foreground">
                  Optional API key
                </label>
                <input
                  type="password"
                  value={localApiKey}
                  onChange={(e) => setLocalApiKey(e.target.value)}
                  placeholder="(optional)"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              {localError && <p className="mb-4 text-sm text-destructive">{localError}</p>}
              {localStatusMessage && (
                <p className="mb-4 text-sm text-success">{localStatusMessage}</p>
              )}

              <div className="flex flex-col gap-2">
                <button
                  className="w-full rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/90"
                  onClick={handleTestLocalConfig}
                  disabled={localTesting}
                >
                  {localTesting ? 'Testing...' : 'Test Connection'}
                </button>
                <button
                  className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  onClick={handleSaveLocalConfig}
                  disabled={localSaving}
                >
                  {localSaving ? 'Saving...' : 'Save Local Endpoint'}
                </button>
                <button
                  className="w-full rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                  onClick={handleClearLocalKey}
                >
                  Clear Local API Key
                </button>
              </div>
            </div>
          </section>

          {/* OpenRouter Section */}
          <section>
            <h2 className="mb-4 text-base font-medium text-foreground">OpenRouter</h2>
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="mb-5 text-sm text-muted-foreground leading-relaxed">
                Configure an OpenRouter model to route across providers using a single API.
              </p>
              <div className="mb-5">
                <label className="mb-2.5 block text-sm font-medium text-foreground">
                  Model name
                </label>
                <input
                  type="text"
                  value={openrouterModel}
                  onChange={(e) => setOpenrouterModel(e.target.value)}
                  placeholder="openai/gpt-4o-mini"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              {openrouterError && <p className="mb-4 text-sm text-destructive">{openrouterError}</p>}
              {openrouterStatus && (
                <p className="mb-4 text-sm text-success">{openrouterStatus}</p>
              )}
              <div className="flex flex-col gap-2">
                <button
                  className="w-full rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/90"
                  onClick={handleTestOpenRouter}
                  disabled={openrouterTesting}
                >
                  {openrouterTesting ? 'Testing...' : 'Test Connection'}
                </button>
                <button
                  className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  onClick={handleSaveOpenRouter}
                  disabled={openrouterSaving}
                >
                  {openrouterSaving ? 'Saving...' : 'Save OpenRouter Config'}
                </button>
              </div>
            </div>
          </section>

          {/* LiteLLM Section */}
          <section>
            <h2 className="mb-4 text-base font-medium text-foreground">LiteLLM</h2>
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="mb-5 text-sm text-muted-foreground leading-relaxed">
                Configure a LiteLLM proxy endpoint and model for routing, fallbacks, or load balancing.
              </p>
              <div className="mb-5">
                <label className="mb-2.5 block text-sm font-medium text-foreground">
                  Base URL
                </label>
                <input
                  type="text"
                  value={litellmBaseUrl}
                  onChange={(e) => setLitellmBaseUrl(e.target.value)}
                  placeholder="http://localhost:4000/v1"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="mb-5">
                <label className="mb-2.5 block text-sm font-medium text-foreground">
                  Model name
                </label>
                <input
                  type="text"
                  value={litellmModel}
                  onChange={(e) => setLitellmModel(e.target.value)}
                  placeholder="gpt-4o-mini"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              {litellmError && <p className="mb-4 text-sm text-destructive">{litellmError}</p>}
              {litellmStatus && (
                <p className="mb-4 text-sm text-success">{litellmStatus}</p>
              )}
              <div className="flex flex-col gap-2">
                <button
                  className="w-full rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/90"
                  onClick={handleTestLiteLlm}
                  disabled={litellmTesting}
                >
                  {litellmTesting ? 'Testing...' : 'Test Connection'}
                </button>
                <button
                  className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  onClick={handleSaveLiteLlm}
                  disabled={litellmSaving}
                >
                  {litellmSaving ? 'Saving...' : 'Save LiteLLM Config'}
                </button>
              </div>
            </div>
          </section>

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
