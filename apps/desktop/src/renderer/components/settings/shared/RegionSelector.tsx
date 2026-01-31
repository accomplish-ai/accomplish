// apps/desktop/src/renderer/components/settings/shared/RegionSelector.tsx

import { useTranslation } from 'react-i18next';

const AWS_REGION_IDS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-central-1',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-south-1',
];

interface RegionSelectorProps {
  value: string;
  onChange: (region: string) => void;
}

export function RegionSelector({ value, onChange }: RegionSelectorProps) {
  const { t } = useTranslation('settings');

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-foreground">{t('bedrock.region')}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid="bedrock-region-select"
        className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
      >
        {AWS_REGION_IDS.map((regionId) => (
          <option key={regionId} value={regionId}>
            {t(`bedrock.regions.${regionId}`, { defaultValue: regionId })}
          </option>
        ))}
      </select>
    </div>
  );
}
