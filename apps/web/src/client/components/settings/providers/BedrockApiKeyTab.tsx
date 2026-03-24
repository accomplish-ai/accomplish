import { useTranslation } from 'react-i18next';
import { RegionSelector } from '../shared';

interface BedrockApiKeyTabProps {
  apiKey: string;
  region: string;
  onApiKeyChange: (value: string) => void;
  onRegionChange: (value: string) => void;
}

export function BedrockApiKeyTab({
  apiKey,
  region,
  onApiKeyChange,
  onRegionChange,
}: BedrockApiKeyTabProps) {
  const { t } = useTranslation('settings');
  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-foreground">{t('bedrockApiKey.label')}</label>
          <a
            href="https://console.aws.amazon.com/bedrock/home#/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-primary"
          >
            {t('bedrockApiKey.howToGetIt')}
          </a>
        </div>
        <div className="relative">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={t('bedrockApiKey.placeholder')}
            data-testid="bedrock-api-key-input"
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm pr-10"
          />
          {apiKey && (
            <button
              onClick={() => onApiKeyChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              type="button"
              data-testid="bedrock-api-key-clear"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      <RegionSelector value={region} onChange={onRegionChange} />
    </>
  );
}
