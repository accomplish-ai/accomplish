import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type { ConnectedProvider } from '@accomplish_ai/agent-core/common';
import { RegionSelector, ConnectButton, ProviderFormHeader, FormError } from '../shared';
import { BedrockApiKeyTab } from './BedrockApiKeyTab';
import { BedrockAccessKeyTab } from './BedrockAccessKeyTab';
import { BedrockConnectedSection } from './BedrockConnectedSection';
import { useBedrockProviderConnect } from './useBedrockProviderConnect';

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
  const {
    authTab,
    setAuthTab,
    bedrockApiKey,
    setBedrockApiKey,
    accessKeyId,
    setAccessKeyId,
    secretKey,
    setSecretKey,
    sessionToken,
    setSessionToken,
    profileName,
    setProfileName,
    region,
    setRegion,
    connecting,
    error,
    availableModels,
    handleConnect,
  } = useBedrockProviderConnect({ onConnect });

  const isConnected = connectedProvider?.connectionStatus === 'connected';
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
                <BedrockAccessKeyTab
                  accessKeyId={accessKeyId}
                  secretKey={secretKey}
                  sessionToken={sessionToken}
                  region={region}
                  onAccessKeyIdChange={setAccessKeyId}
                  onSecretKeyChange={setSecretKey}
                  onSessionTokenChange={setSessionToken}
                  onRegionChange={setRegion}
                />
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
            <BedrockConnectedSection
              connectedProvider={connectedProvider!}
              models={models}
              onDisconnect={onDisconnect}
              onModelChange={onModelChange}
              showModelError={showModelError}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
