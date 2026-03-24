// apps/desktop/src/renderer/components/settings/providers/BedrockProviderForm.tsx

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { getAccomplish } from '@/lib/accomplish';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type {
  ConnectedProvider,
  BedrockProviderCredentials,
} from '@accomplish_ai/agent-core/common';
import { getDefaultModelForProvider } from '@accomplish_ai/agent-core/common';
import {
  ModelSelector,
  RegionSelector,
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
} from '../shared';
import { BedrockApiKeyTab } from './BedrockApiKeyTab';

// Import Bedrock logo
import bedrockLogo from '/assets/ai-logos/bedrock.svg';

interface BedrockProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function BedrockProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: BedrockProviderFormProps) {
  const { t } = useTranslation('settings');
  const [authTab, setAuthTab] = useState<'apiKey' | 'accessKey' | 'profile'>('apiKey');
  const [bedrockApiKey, setBedrockApiKey] = useState('');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [profileName, setProfileName] = useState('default');
  const [region, setRegion] = useState('us-east-1');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string }>>([]);

  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();

      const credentialsMap = {
        apiKey: {
          authType: 'apiKey' as const,
          apiKey: bedrockApiKey.trim(),
          region,
        },
        accessKey: {
          authType: 'accessKeys' as const,
          accessKeyId: accessKeyId.trim(),
          secretAccessKey: secretKey.trim(),
          sessionToken: sessionToken.trim() || undefined,
          region,
        },
        profile: {
          authType: 'profile' as const,
          profileName: profileName.trim() || 'default',
          region,
        },
      };
      const credentials = credentialsMap[authTab];

      const validation = await accomplish.validateBedrockCredentials(credentials);

      if (!validation.valid) {
        setError(validation.error || t('bedrock.invalidCredentials'));
        setConnecting(false);
        return;
      }

      // Save credentials
      await accomplish.saveBedrockCredentials(credentials);

      // Fetch available models dynamically from AWS
      const credentialsJson = JSON.stringify(credentials);
      const modelsResult = await accomplish.fetchBedrockModels(credentialsJson);
      const fetchedModels = modelsResult.success ? modelsResult.models : [];
      setAvailableModels(fetchedModels);

      // Auto-select default model if available in fetched list
      const defaultModelId = getDefaultModelForProvider('bedrock');
      const hasDefaultModel = defaultModelId && fetchedModels.some((m) => m.id === defaultModelId);

      const provider: ConnectedProvider = {
        providerId: 'bedrock',
        connectionStatus: 'connected',
        selectedModelId: hasDefaultModel ? defaultModelId : null,
        credentials: {
          type: 'bedrock',
          authMethod: authTab,
          region,
          ...(authTab === 'apiKey'
            ? { apiKeyPrefix: bedrockApiKey.substring(0, 8) + '...' }
            : authTab === 'accessKey'
              ? { accessKeyIdPrefix: accessKeyId.substring(0, 8) + '...' }
              : { profileName: profileName.trim() || 'default' }),
        } as BedrockProviderCredentials,
        lastConnectedAt: new Date().toISOString(),
        availableModels: fetchedModels,
      };

      onConnect(provider);
      setBedrockApiKey('');
      setSecretKey('');
      setSessionToken('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('status.connectionFailed'));
    } finally {
      setConnecting(false);
    }
  };

  const models = connectedProvider?.availableModels || availableModels;

  return (
    <div
      className="rounded-xl border border-border bg-card p-5"
      data-testid="provider-settings-panel"
    >
      <ProviderFormHeader logoSrc={bedrockLogo} providerName={t('providers.bedrock')} />

      <div className="space-y-3">
        <AnimatePresence mode="wait">
          {!isConnected ? (
            <motion.div
              key="disconnected"
              variants={settingsVariants.fadeSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.enter}
              className="space-y-3"
            >
              {/* Auth tabs */}
              <div className="flex gap-2">
                <button
                  onClick={() => setAuthTab('apiKey')}
                  data-testid="bedrock-auth-tab-apikey"
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    authTab === 'apiKey'
                      ? 'bg-provider-accent text-white'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('bedrockApiKey.label')}
                </button>
                <button
                  onClick={() => setAuthTab('accessKey')}
                  data-testid="bedrock-auth-tab-accesskey"
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    authTab === 'accessKey'
                      ? 'bg-provider-accent text-white'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('bedrock.accessKeys')}
                </button>
                <button
                  onClick={() => setAuthTab('profile')}
                  data-testid="bedrock-auth-tab-profile"
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    authTab === 'profile'
                      ? 'bg-provider-accent text-white'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('bedrock.awsProfile')}
                </button>
              </div>

              {authTab === 'apiKey' ? (
                <BedrockApiKeyTab
                  apiKey={bedrockApiKey}
                  region={region}
                  onApiKeyChange={setBedrockApiKey}
                  onRegionChange={setRegion}
                />
              ) : authTab === 'accessKey' ? (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      {t('bedrock.accessKeyId')}
                    </label>
                    <input
                      type="text"
                      value={accessKeyId}
                      onChange={(e) => setAccessKeyId(e.target.value)}
                      placeholder="AKIA..."
                      data-testid="bedrock-access-key-id"
                      className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      {t('bedrock.secretAccessKey')}
                    </label>
                    <input
                      type="password"
                      value={secretKey}
                      onChange={(e) => setSecretKey(e.target.value)}
                      placeholder={t('bedrock.enterSecretAccessKey')}
                      data-testid="bedrock-secret-key"
                      className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      {t('bedrock.sessionToken')}{' '}
                      <span className="text-muted-foreground">
                        ({t('bedrock.sessionTokenOptional')})
                      </span>
                    </label>
                    <input
                      type="password"
                      value={sessionToken}
                      onChange={(e) => setSessionToken(e.target.value)}
                      placeholder={t('bedrock.sessionTokenHint')}
                      data-testid="bedrock-session-token"
                      className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                    />
                  </div>
                  <RegionSelector value={region} onChange={setRegion} />
                </>
              ) : (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      {t('bedrock.profileName')}
                    </label>
                    <input
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder={t('bedrock.defaultProfile')}
                      data-testid="bedrock-profile-name"
                      className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                    />
                  </div>
                  <RegionSelector value={region} onChange={setRegion} />
                </>
              )}

              <FormError error={error} />
              <ConnectButton onClick={handleConnect} connecting={connecting} />
            </motion.div>
          ) : (
            <motion.div
              key="connected"
              variants={settingsVariants.fadeSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.enter}
              className="space-y-3"
            >
              {/* Display saved credentials info */}
              <div className="space-y-3">
                {(connectedProvider?.credentials as BedrockProviderCredentials)?.authMethod ===
                'apiKey' ? (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      API Key
                    </label>
                    <input
                      type="text"
                      value={
                        (connectedProvider?.credentials as BedrockProviderCredentials)
                          ?.apiKeyPrefix || '********'
                      }
                      disabled
                      className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                    />
                  </div>
                ) : (connectedProvider?.credentials as BedrockProviderCredentials)?.authMethod ===
                  'accessKey' ? (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      {t('bedrock.accessKeyId')}
                    </label>
                    <input
                      type="text"
                      value={
                        (connectedProvider?.credentials as BedrockProviderCredentials)
                          ?.accessKeyIdPrefix || 'AKIA...'
                      }
                      disabled
                      className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      {t('bedrock.awsProfile')}
                    </label>
                    <input
                      type="text"
                      value={
                        (connectedProvider?.credentials as BedrockProviderCredentials)
                          ?.profileName || 'default'
                      }
                      disabled
                      className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                    />
                  </div>
                )}
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    {t('bedrock.region')}
                  </label>
                  <input
                    type="text"
                    value={
                      (connectedProvider?.credentials as BedrockProviderCredentials)?.region ||
                      'us-east-1'
                    }
                    disabled
                    className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                  />
                </div>
              </div>

              <ConnectedControls onDisconnect={onDisconnect} />

              {/* Model Selector */}
              <ModelSelector
                models={models}
                value={connectedProvider?.selectedModelId || null}
                onChange={onModelChange}
                error={showModelError && !connectedProvider?.selectedModelId}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
