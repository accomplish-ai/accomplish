// apps/desktop/src/renderer/components/settings/providers/BedrockProviderForm.tsx

import { useState } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import type { ConnectedProvider, BedrockProviderCredentials } from '@accomplish/shared';
import { getDefaultModelForProvider } from '@accomplish/shared';
import {
  ModelSelector,
  ConnectButton,
  ConnectedControls,
} from '../shared';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel, FieldSet,
  FieldTitle
} from '@/components/ui/field';
import {RadioGroup, RadioGroupItem} from "@/components/ui/radio-group";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";

const AWS_REGIONS = [
  { id: 'us-east-1', name: 'US East (N. Virginia)' },
  { id: 'us-east-2', name: 'US East (Ohio)' },
  { id: 'us-west-1', name: 'US West (N. California)' },
  { id: 'us-west-2', name: 'US West (Oregon)' },
  { id: 'eu-west-1', name: 'Europe (Ireland)' },
  { id: 'eu-west-2', name: 'Europe (London)' },
  { id: 'eu-west-3', name: 'Europe (Paris)' },
  { id: 'eu-central-1', name: 'Europe (Frankfurt)' },
  { id: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)' },
  { id: 'ap-northeast-2', name: 'Asia Pacific (Seoul)' },
  { id: 'ap-southeast-1', name: 'Asia Pacific (Singapore)' },
  { id: 'ap-southeast-2', name: 'Asia Pacific (Sydney)' },
  { id: 'ap-south-1', name: 'Asia Pacific (Mumbai)' },
];


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
  const [authTab, setAuthTab] = useState<'accessKey' | 'profile'>('accessKey');
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

      const credentials = authTab === 'accessKey'
        ? {
            authType: 'accessKeys' as const,
            accessKeyId: accessKeyId.trim(),
            secretAccessKey: secretKey.trim(),
            sessionToken: sessionToken.trim() || undefined,
            region,
          }
        : {
            authType: 'profile' as const,
            profileName: profileName.trim() || 'default',
            region,
          };

      const validation = await accomplish.validateBedrockCredentials(credentials);

      if (!validation.valid) {
        setError(validation.error || 'Invalid credentials');
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
      const hasDefaultModel = defaultModelId && fetchedModels.some(m => m.id === defaultModelId);

      const provider: ConnectedProvider = {
        providerId: 'bedrock',
        connectionStatus: 'connected',
        selectedModelId: hasDefaultModel ? defaultModelId : null,
        credentials: {
          type: 'bedrock',
          authMethod: authTab,
          region,
          ...(authTab === 'accessKey'
            ? { accessKeyIdPrefix: accessKeyId.substring(0, 8) + '...' }
            : { profileName: profileName.trim() || 'default' }
          ),
        } as BedrockProviderCredentials,
        lastConnectedAt: new Date().toISOString(),
        availableModels: fetchedModels,
      };

      onConnect(provider);
      setSecretKey('');
      setSessionToken('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const models = connectedProvider?.availableModels || availableModels;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          Provider settings
        </CardTitle>
        <CardDescription>
          Connect and select provider model
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!isConnected ? (
          <FieldGroup>
            <FieldSet>
              <Field>
              <FieldLabel>
                Authentication
              </FieldLabel>
              <RadioGroup defaultValue={authTab} className="flex" onValueChange={(value) => setAuthTab(value)}>
                <FieldLabel htmlFor="accessKey">
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>Access Key</FieldTitle>
                    </FieldContent>
                    <RadioGroupItem value="accessKey" id="accessKey" />
                  </Field>
                </FieldLabel>
                <FieldLabel htmlFor="profile">
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>AWS Profile</FieldTitle>
                    </FieldContent>
                    <RadioGroupItem value="profile" id="profile" />
                  </Field>
                </FieldLabel>
              </RadioGroup>
            </Field>

              {authTab === 'accessKey' ? (
                <>
                  <Field>
                    <FieldLabel>Access Key ID</FieldLabel>
                    <Input
                      type="text"
                      value={accessKeyId}
                      onChange={(e) => setAccessKeyId(e.target.value)}
                      placeholder="AKIA..."
                      data-testid="bedrock-access-key-id"
                    />
                  </Field>

                  <Field>
                    <FieldLabel>Secret Access Key</FieldLabel>
                    <Input
                      type="password"
                      value={secretKey}
                      onChange={(e) => setSecretKey(e.target.value)}
                      placeholder="Enter secret access key"
                      data-testid="bedrock-secret-key"
                    />
                  </Field>

                  <Field>
                    <FieldLabel>
                      Session Token <span className="text-muted-foreground">(Optional)</span>
                    </FieldLabel>
                    <Input
                      type="password"
                      value={sessionToken}
                      onChange={(e) => setSessionToken(e.target.value)}
                      placeholder="For temporary credentials"
                      data-testid="bedrock-session-token"
                    />
                  </Field>
                </>
              ) : (
                <Field>
                  <FieldLabel>Profile Name</FieldLabel>
                  <Input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="default"
                    data-testid="bedrock-profile-name"
                  />
                </Field>
              )}

              <Field>
                <FieldLabel>
                  Region
                </FieldLabel>
                <Select value={region} onValueChange={(value) => {
                  if (value === null) {
                    return;
                  }
                  setRegion(value)
                }}>
                  <SelectTrigger className='w-full' data-testid="bedrock-region-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AWS_REGIONS.map((region) => (
                        <SelectItem key={region.id} value={region.id}>
                          {region.id}
                        </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldError>{error}</FieldError>
                <ConnectButton onClick={handleConnect} connecting={connecting} />
              </Field>
            </FieldSet>
          </FieldGroup>
        ) : (
          <>
            {(connectedProvider?.credentials as BedrockProviderCredentials)?.authMethod === 'accessKey' ? (
              <Field>
                <FieldLabel>Access Key ID</FieldLabel>
                <Input
                  type="text"
                  value={(connectedProvider?.credentials as BedrockProviderCredentials)?.accessKeyIdPrefix || 'AKIA...'}
                  disabled
                />
              </Field>
            ) : (
              <Field>
                <FieldLabel>AWS Profile</FieldLabel>
                <Input
                  type="text"
                  value={(connectedProvider?.credentials as BedrockProviderCredentials)?.profileName || 'default'}
                  disabled
                />
              </Field>
            )}
            <Field>
              <FieldLabel>Region</FieldLabel>
              <Input
                type="text"
                value={(connectedProvider?.credentials as BedrockProviderCredentials)?.region || 'us-east-1'}
                disabled
              />
            </Field>

            <Field>
              <ModelSelector
                models={models}
                value={connectedProvider?.selectedModelId || null}
                onChange={onModelChange}
                error={showModelError && !connectedProvider?.selectedModelId}
              />
              <ConnectedControls onDisconnect={onDisconnect} />
            </Field>
          </>
        )}
      </CardContent>
    </Card>
  );
}
