// apps/desktop/src/renderer/components/settings/shared/RegionSelector.tsx

import { SearchableSelect, type SelectOption } from './SearchableSelect';
import { AWS_REGIONS } from './aws-regions';

// Re-export for backward compatibility
export { AWS_REGIONS };

interface RegionSelectorProps {
  value: string;
  onChange: (region: string) => void;
  /** Custom regions list. Defaults to AWS_REGIONS if not provided. */
  regions?: SelectOption[];
  /** Label text. Defaults to "Region". */
  label?: string;
  /** Placeholder text when no region is selected */
  placeholder?: string;
  /** Test ID for the select element */
  testId?: string;
}

export function RegionSelector({
  value,
  onChange,
  regions = AWS_REGIONS,
  label = 'Region',
  placeholder = 'Select region...',
  testId = 'bedrock-region-select',
}: RegionSelectorProps) {
  return (
    <SearchableSelect
      options={regions}
      value={value}
      onChange={onChange}
      label={label}
      placeholder={placeholder}
      searchPlaceholder="Search regions..."
      emptyMessage="No regions found"
      alwaysShowSearch
      testId={testId}
    />
  );
}
