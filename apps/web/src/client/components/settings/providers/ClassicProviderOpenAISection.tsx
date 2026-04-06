/**
 * OpenAI-specific disconnected section — separated from the generic ClassicProviderForm
 * because OpenAI supports both OAuth and API-key flows, requiring provider-specific
 * sign-in UI and session handling that would leak into the shared form otherwise.
 */

import { useTranslation } from 'react-i18next';
import { ConnectButton, FormError } from '../shared';
import { PROVIDER_LOGOS } from '@/lib/provider-logos';
import { ProviderAdvancedSettings } from './ProviderAdvancedSettings';

interface ClassicProviderOpenAISectionProps {
  apiKey: string;
  apiKeyInput: React.ReactNode;
  openAiBaseUrl: string;
  onOpenAiBaseUrlChange: (url: string) => void;
  error: string | null;
  connecting: boolean;
  signingIn: boolean;
  helpUrl?: string;
  onChatGptSignIn: () => void;
  onConnect: () => void;
}

export function ClassicProviderOpenAISection({
  apiKey,
  apiKeyInput,
  openAiBaseUrl,
  onOpenAiBaseUrlChange,
  error,
  connecting,
  signingIn,
  helpUrl,
  onChatGptSignIn,
  onConnect,
}: ClassicProviderOpenAISectionProps) {
  const { t } = useTranslation('settings');
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onChatGptSignIn}
        disabled={signingIn}
        data-testid="openai-oauth-signin"
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
      >
        <img src={PROVIDER_LOGOS['openai']} alt="" className="h-5 w-5 dark:invert" />
        {signingIn ? t('openai.signingIn') : t('openai.loginWithOpenAI')}
      </button>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-sm text-muted-foreground">{t('common.or')}</span>
        <div className="flex-1 h-px bg-border" />
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">{t('apiKey.title')}</span>
          {helpUrl && (
            <a
              href={helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-primary underline"
            >
              {t('help.findApiKey')}
            </a>
          )}
        </div>
        {apiKeyInput}
      </div>
      <ProviderAdvancedSettings
        fieldId="openai-base-url"
        value={openAiBaseUrl}
        onChange={onOpenAiBaseUrlChange}
        placeholder="https://api.openai.com/v1"
      />
      <FormError error={error} />
      <ConnectButton onClick={onConnect} connecting={connecting} disabled={!apiKey.trim()} />
    </div>
  );
}
