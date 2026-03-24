import { useTranslation } from 'react-i18next';
import { SearchableSelect, type SelectItem } from '@/components/ui/searchable-select';

interface ModelSelectorProps {
  models: SelectItem[];
  value: string | null;
  onChange: (modelId: string) => void;
  loading?: boolean;
  error?: boolean;
  errorMessage?: string;
  placeholder?: string;
}

export function ModelSelector({
  models,
  value,
  onChange,
  loading,
  error,
  errorMessage,
  placeholder,
}: ModelSelectorProps) {
  const { t } = useTranslation('settings');

  return (
    <SearchableSelect
      items={models}
      value={value}
      onChange={onChange}
      label={t('model.title')}
      placeholder={placeholder || t('model.selectModel')}
      searchPlaceholder={t('model.searchModels')}
      emptyMessage={t('model.noModelsFound')}
      loading={loading}
      error={error}
      errorMessage={error && !value ? errorMessage || t('model.required') : undefined}
      testId="model-selector"
    />
  );
}
