import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccomplish } from '@/lib/accomplish';
import {
  getDefaultModelForProvider,
  type BedrockProviderCredentials,
  type ConnectedProvider,
} from '@accomplish_ai/agent-core/common';

export interface UseBedrockProviderConnectReturn {
  authTab: 'apiKey' | 'accessKey' | 'profile';
  setAuthTab: (tab: 'apiKey' | 'accessKey' | 'profile') => void;
  bedrockApiKey: string;
  setBedrockApiKey: (v: string) => void;
  accessKeyId: string;
  setAccessKeyId: (v: string) => void;
  secretKey: string;
  setSecretKey: (v: string) => void;
  sessionToken: string;
  setSessionToken: (v: string) => void;
  profileName: string;
  setProfileName: (v: string) => void;
  region: string;
  setRegion: (v: string) => void;
  connecting: boolean;
  error: string | null;
  availableModels: Array<{ id: string; name: string }>;
  handleConnect: () => Promise<void>;
}

interface UseBedrockProviderConnectParams {
  onConnect: (provider: ConnectedProvider) => void;
}

export function useBedrockProviderConnect({
  onConnect,
}: UseBedrockProviderConnectParams): UseBedrockProviderConnectReturn {
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

      await accomplish.saveBedrockCredentials(credentials);

      const credentialsJson = JSON.stringify(credentials);
      const modelsResult = await accomplish.fetchBedrockModels(credentialsJson);
      if (!modelsResult.success) {
        setError(modelsResult.error || t('status.connectionFailed'));
        return;
      }
      const fetchedModels = modelsResult.models;
      setAvailableModels(fetchedModels);

      const defaultModelId = getDefaultModelForProvider('bedrock');
      const hasDefaultModel = defaultModelId && fetchedModels.some((m) => m.id === defaultModelId);

      const credentialFields: Partial<BedrockProviderCredentials> = {};
      if (authTab === 'apiKey') {
        credentialFields.apiKeyPrefix = bedrockApiKey.substring(0, 8) + '...';
      } else if (authTab === 'accessKey') {
        credentialFields.accessKeyIdPrefix = accessKeyId.substring(0, 8) + '...';
      } else {
        credentialFields.profileName = profileName.trim() || 'default';
      }

      const provider: ConnectedProvider = {
        providerId: 'bedrock',
        connectionStatus: 'connected',
        selectedModelId: hasDefaultModel ? defaultModelId : null,
        credentials: {
          type: 'bedrock',
          authMethod: authTab,
          region,
          ...credentialFields,
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

  return {
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
  };
}
