import { useTranslation } from 'react-i18next';

interface ProviderAdvancedSettingsProps {
  fieldId: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
}

/** Base URL input shown for providers with editable base URL. */
export function ProviderAdvancedSettings({
  fieldId,
  value,
  onChange,
  placeholder,
  disabled,
  readOnly,
}: ProviderAdvancedSettingsProps) {
  const { t } = useTranslation('settings');
  return (
    <div className="space-y-2">
      <label htmlFor={fieldId} className="text-sm font-medium text-foreground">
        {t('baseUrl.title', { defaultValue: 'Base URL' })}
      </label>
      <input
        id={fieldId}
        type="text"
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        data-testid={readOnly ? 'base-url-display' : 'base-url-input'}
        className={`w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm ${readOnly ? 'bg-muted/50 text-muted-foreground' : ''} disabled:opacity-50`}
      />
      {!readOnly && (
        <p className="text-xs text-muted-foreground">
          {t('baseUrl.description', { defaultValue: 'Leave empty to use the default URL.' })}
        </p>
      )}
    </div>
  );
}
