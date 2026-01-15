'use client';

import { useState, useEffect } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ApiKeyConfig } from '@accomplish/shared';
import logoImage from '/assets/logo.png';
import {
  ChooseModelType,
  SelectProvider,
  AddApiKey,
  SelectModel,
  OllamaSetup,
  ApiKeysSection,
  type WizardStep,
  type ModelType,
  type ProviderId,
} from './settings';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApiKeySaved?: () => void;
}

export default function SettingsDialog({ open, onOpenChange, onApiKeySaved }: SettingsDialogProps) {
  // Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>('choose-type');
  const [selectedModelType, setSelectedModelType] = useState<ModelType>(null);
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null);

  // Data state
  const [savedKeys, setSavedKeys] = useState<ApiKeyConfig[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [loadingDebug, setLoadingDebug] = useState(true);
  const [appVersion, setAppVersion] = useState('');
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState<{ provider: string; model: string } | null>(null);

  useEffect(() => {
    if (!open) {
      // Reset wizard when dialog closes
      setWizardStep('choose-type');
      setSelectedModelType(null);
      setSelectedProvider(null);
      setCompletionMessage(null);
      return;
    }

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

    const fetchCurrentModel = async () => {
      try {
        const model = await accomplish.getSelectedModel();
        setCurrentModel(model);
      } catch (err) {
        console.error('Failed to fetch current model:', err);
      }
    };

    fetchKeys();
    fetchDebugSetting();
    fetchVersion();
    fetchCurrentModel();
  }, [open]);

  const handleDebugToggle = async () => {
    const accomplish = getAccomplish();
    const newValue = !debugMode;
    setDebugMode(newValue);
    try {
      await accomplish.setDebugMode(newValue);
    } catch (err) {
      console.error('Failed to save debug setting:', err);
      setDebugMode(!newValue);
    }
  };

  // Wizard navigation handlers
  const handleModelTypeSelect = (type: ModelType) => {
    setSelectedModelType(type);
    if (type === 'cloud') {
      setWizardStep('select-provider');
    } else {
      setWizardStep('ollama-setup');
    }
  };

  const handleProviderSelect = (providerId: ProviderId) => {
    setSelectedProvider(providerId);
    // Check if API key exists for this provider
    const hasKey = savedKeys.some((k) => k.provider === providerId);
    if (hasKey) {
      setWizardStep('select-model');
    } else {
      setWizardStep('add-api-key');
    }
  };

  const handleApiKeySuccess = async () => {
    // Refresh keys and proceed to model selection
    // NOTE: Do NOT call onApiKeySaved here - that closes the dialog in Home.tsx
    // We only want to close after the user completes model selection
    try {
      const accomplish = getAccomplish();
      const keys = await accomplish.getApiKeys();
      setSavedKeys(keys);
    } catch (err) {
      console.error('Failed to refresh keys after adding:', err);
    }
    // Always proceed to model selection
    setWizardStep('select-model');
  };

  const handleModelDone = async (modelName: string) => {
    setCompletionMessage(`Model set to ${modelName}`);
    // Refresh current model
    const accomplish = getAccomplish();
    const model = await accomplish.getSelectedModel();
    setCurrentModel(model);
    // Reset wizard after showing success message (2s)
    setTimeout(() => {
      setCompletionMessage(null);
      setWizardStep('choose-type');
      setSelectedModelType(null);
      setSelectedProvider(null);
    }, 2000);
  };

  const handleBack = () => {
    switch (wizardStep) {
      case 'select-provider':
        setWizardStep('choose-type');
        setSelectedModelType(null);
        break;
      case 'add-api-key':
        setWizardStep('select-provider');
        setSelectedProvider(null);
        break;
      case 'select-model':
        setWizardStep('select-provider');
        setSelectedProvider(null);
        break;
      case 'ollama-setup':
        setWizardStep('choose-type');
        setSelectedModelType(null);
        break;
    }
  };

  const renderWizardStep = () => {
    if (completionMessage) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="mb-2 text-success">
              <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-medium text-foreground">{completionMessage}</p>
          </div>
        </div>
      );
    }

    switch (wizardStep) {
      case 'choose-type':
        return <ChooseModelType onSelect={handleModelTypeSelect} currentModel={currentModel} />;
      case 'select-provider':
        return <SelectProvider onSelect={handleProviderSelect} onBack={handleBack} />;
      case 'add-api-key':
        return selectedProvider ? (
          <AddApiKey providerId={selectedProvider} onSuccess={handleApiKeySuccess} onBack={handleBack} />
        ) : null;
      case 'select-model':
        return selectedProvider ? (
          <SelectModel providerId={selectedProvider} onDone={handleModelDone} onBack={handleBack} />
        ) : null;
      case 'ollama-setup':
        return <OllamaSetup onDone={handleModelDone} onBack={handleBack} />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-8 mt-4">
          {/* Wizard Section */}
          <section>
            <div className="rounded-lg border border-border bg-card p-5">
              {renderWizardStep()}
            </div>
          </section>

          {/* API Keys Section */}
          <ApiKeysSection
            savedKeys={savedKeys}
            onKeysChange={(keys) => {
              setSavedKeys(keys);
              onApiKeySaved?.();
            }}
          />

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
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        debugMode ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
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
                    Debug mode is enabled. Backend logs will appear in the task view when running tasks.
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
                <img src={logoImage} alt="Openwork" className="h-12 w-12 rounded-xl" />
                <div>
                  <div className="font-medium text-foreground">Openwork</div>
                  <div className="text-sm text-muted-foreground">Version {appVersion || '0.1.0'}</div>
                </div>
              </div>
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                Openwork is a local computer-use AI agent for your Mac that reads your files, creates documents, and automates repetitive knowledge work—all open-source with your AI models of choice.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Any questions or feedback?{' '}
                <a href="mailto:openwork-support@accomplish.ai" className="text-primary hover:underline">
                  Click here to contact us
                </a>.
              </p>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
