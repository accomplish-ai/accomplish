import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Microphone, CheckCircle, WarningCircle, SpinnerGap } from '@phosphor-icons/react';
import { getAccomplish } from '../../lib/accomplish';

interface SpeechSettingsFormProps {
  onSave?: () => void;
  onChange?: (config: { apiKey: string; enabled: boolean }) => void;
}

export function SpeechSettingsForm({ onSave, onChange }: SpeechSettingsFormProps) {
  const { t } = useTranslation('settings');
  const accomplish = getAccomplish();

  const [apiKey, setApiKey] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    accomplish.speechGetConfig().then((config) => {
      setIsConfigured(config.hasApiKey);
    });
  }, [accomplish]);
  const [isLoading, setIsLoading] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      setSaveResult({ success: false, message: t('speech.apiKeyRequired') });
      return;
    }

    setIsLoading(true);
    setSaveResult(null);

    try {
      await accomplish.addApiKey('elevenlabs', apiKey, 'ElevenLabs Speech-to-Text');
      setSaveResult({ success: true, message: t('speech.apiKeySaved') });
      setIsConfigured(true);
      setApiKey('');
      onChange?.({ apiKey, enabled: true });
      onSave?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : t('speech.apiKeySaveFailed');
      setSaveResult({ success: false, message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="group rounded-xl border border-border bg-card p-3.5 transition-all duration-200 hover:border-primary hover:shadow-md">
      {/* Header: Title + Toggle */}
      <div className="mb-1.5">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
          <Microphone className="h-3.5 w-3.5 text-blue-500" />
          {t('speech.title')}
        </span>
      </div>

      {/* Description */}
      <p className="mb-2.5 text-[11px] leading-relaxed text-muted-foreground">
        {t('speech.description')}
      </p>

      {/* Info section */}
      <div className="mb-2.5 flex items-start gap-1.5 rounded-md border border-border bg-background px-2.5 py-2 text-[11px] text-foreground">
        <WarningCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          {t('speech.setupInstructions')}{' '}
          <a
            href="https://elevenlabs.io/app/settings/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            {t('speech.elevenlabsLink')}
          </a>
        </span>
      </div>

      {/* Configured status */}
      {isConfigured && !apiKey && (
        <div className="mb-2.5 flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-2 text-[11px] text-foreground">
          <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-500" />
          <span>{t('speech.apiKeyConfigured')}</span>
        </div>
      )}

      {/* API Key Input */}
      <div className="space-y-2">
        <label className="text-[11px] font-medium text-foreground">{t('speech.apiKeyLabel')}</label>
        <div className="flex gap-1.5">
          <Input
            type="password"
            placeholder={isConfigured ? t('speech.apiKeyMasked') : t('speech.apiKeyPlaceholder')}
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setSaveResult(null);
            }}
            disabled={isLoading}
            className="h-7 text-[11px] px-2"
          />
          <button
            onClick={handleSaveApiKey}
            disabled={isLoading || !apiKey.trim()}
            className="inline-flex h-7 shrink-0 items-center justify-center whitespace-nowrap rounded-md bg-primary px-3 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {isLoading ? <SpinnerGap className="h-3 w-3 animate-spin" /> : t('apiKey.saveButton')}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">{t('speech.secureStorage')}</p>
      </div>

      {/* Save Result */}
      {saveResult && (
        <div
          className={`mt-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] ${
            saveResult.success
              ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
              : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
          }`}
        >
          {saveResult.success ? (
            <CheckCircle className="h-3 w-3" />
          ) : (
            <WarningCircle className="h-3 w-3" />
          )}
          {saveResult.message}
        </div>
      )}

      {/* Usage Instructions */}
      <div className="mt-2.5 rounded-md bg-blue-50 p-2.5 text-[11px] dark:bg-blue-950">
        <p className="mb-1.5 font-medium text-blue-900 dark:text-blue-100">
          {t('speech.howToUse')}
        </p>
        <ul className="space-y-1 text-[10px] text-blue-800 dark:text-blue-200">
          <li>
            <strong>{t('speech.clickMicButton')}</strong>
          </li>
          <li>
            <strong>{t('speech.holdAltKey')}</strong>
          </li>
        </ul>
      </div>
    </div>
  );
}
