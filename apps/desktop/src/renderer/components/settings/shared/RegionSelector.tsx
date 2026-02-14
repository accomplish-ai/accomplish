import { SearchableSelect } from '@/components/ui/searchable-select';

import { useTranslation } from 'react-i18next';

const AWS_REGIONS = [
  { id: 'us-east-1', name: 'us-east-1' },
  { id: 'us-east-2', name: 'us-east-2' },
  { id: 'us-west-1', name: 'us-west-1' },
  { id: 'us-west-2', name: 'us-west-2' },
  { id: 'ca-central-1', name: 'ca-central-1' },
  { id: 'ca-west-1', name: 'ca-west-1' },
  { id: 'sa-east-1', name: 'sa-east-1' },
  { id: 'eu-north-1', name: 'eu-north-1' },
  { id: 'eu-west-1', name: 'eu-west-1' },
  { id: 'eu-west-2', name: 'eu-west-2' },
  { id: 'eu-west-3', name: 'eu-west-3' },
  { id: 'eu-central-1', name: 'eu-central-1' },
  { id: 'eu-central-2', name: 'eu-central-2' },
  { id: 'eu-south-1', name: 'eu-south-1' },
  { id: 'eu-south-2', name: 'eu-south-2' },
  { id: 'me-south-1', name: 'me-south-1' },
  { id: 'me-central-1', name: 'me-central-1' },
  { id: 'il-central-1', name: 'il-central-1' },
  { id: 'af-south-1', name: 'af-south-1' },
  { id: 'ap-northeast-1', name: 'ap-northeast-1' },
  { id: 'ap-northeast-2', name: 'ap-northeast-2' },
  { id: 'ap-northeast-3', name: 'ap-northeast-3' },
  { id: 'ap-southeast-1', name: 'ap-southeast-1' },
  { id: 'ap-southeast-2', name: 'ap-southeast-2' },
  { id: 'ap-southeast-3', name: 'ap-southeast-3' },
  { id: 'ap-southeast-4', name: 'ap-southeast-4' },
  { id: 'ap-southeast-5', name: 'ap-southeast-5' },
  { id: 'ap-southeast-6', name: 'ap-southeast-6' },
  { id: 'ap-southeast-7', name: 'ap-southeast-7' },
  { id: 'ap-south-1', name: 'ap-south-1' },
  { id: 'ap-south-2', name: 'ap-south-2' },
  { id: 'ap-east-1', name: 'ap-east-1' },
  { id: 'ap-east-2', name: 'ap-east-2' },
  { id: 'mx-central-1', name: 'mx-central-1' },
];

interface RegionSelectorProps {
  value: string;
  onChange: (region: string) => void;
}

export function RegionSelector({ value, onChange }: RegionSelectorProps) {
  const { t } = useTranslation('settings');

  return (
    <SearchableSelect
      items={AWS_REGIONS}
      value={value}
      onChange={onChange}
      label={t('bedrock.region')}
      placeholder={t('bedrock.selectRegion', { defaultValue: 'Select region...' })}
      searchPlaceholder={t('bedrock.searchRegions', { defaultValue: 'Search regions...' })}
      emptyMessage={t('bedrock.noRegionsFound', { defaultValue: 'No regions found' })}
      testId="bedrock-region-select"
    />
  );
}
