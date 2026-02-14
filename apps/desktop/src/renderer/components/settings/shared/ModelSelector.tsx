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
  errorMessage = 'Please select a model',
  placeholder = 'Select model...',
}: ModelSelectorProps) {
  return (
    <SearchableSelect
      items={models}
      value={value}
      onChange={onChange}
      label="Model"
      placeholder={placeholder}
      searchPlaceholder="Search models..."
      emptyMessage="No models found"
      loading={loading}
      error={error}
      errorMessage={error && !value ? errorMessage : undefined}
      testId="model-selector"
    />
  );
}
