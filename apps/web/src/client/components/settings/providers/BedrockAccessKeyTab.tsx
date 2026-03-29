import { useTranslation } from 'react-i18next';
import { RegionSelector } from '../shared';

interface BedrockAccessKeyTabProps {
  accessKeyId: string;
  secretKey: string;
  sessionToken: string;
  region: string;
  onAccessKeyIdChange: (v: string) => void;
  onSecretKeyChange: (v: string) => void;
  onSessionTokenChange: (v: string) => void;
  onRegionChange: (v: string) => void;
}

export function BedrockAccessKeyTab({
  accessKeyId,
  secretKey,
  sessionToken,
  region,
  onAccessKeyIdChange,
  onSecretKeyChange,
  onSessionTokenChange,
  onRegionChange,
}: BedrockAccessKeyTabProps) {
  const { t } = useTranslation('settings');

  return (
    <>
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          {t('bedrock.accessKeyId')}
        </label>
        <input
          type="text"
          value={accessKeyId}
          onChange={(e) => onAccessKeyIdChange(e.target.value)}
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
          onChange={(e) => onSecretKeyChange(e.target.value)}
          placeholder={t('bedrock.enterSecretAccessKey')}
          data-testid="bedrock-secret-key"
          className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          {t('bedrock.sessionToken')}{' '}
          <span className="text-muted-foreground">({t('bedrock.sessionTokenOptional')})</span>
        </label>
        <input
          type="password"
          value={sessionToken}
          onChange={(e) => onSessionTokenChange(e.target.value)}
          placeholder={t('bedrock.sessionTokenHint')}
          data-testid="bedrock-session-token"
          className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
        />
      </div>
      <RegionSelector value={region} onChange={onRegionChange} />
    </>
  );
}
