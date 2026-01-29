// apps/desktop/src/renderer/components/settings/shared/RegionSelector.tsx

const AWS_REGIONS = [
  // US
  { id: 'us-east-1', name: 'US East (N. Virginia)' },
  { id: 'us-east-2', name: 'US East (Ohio)' },
  { id: 'us-west-1', name: 'US West (N. California)' },
  { id: 'us-west-2', name: 'US West (Oregon)' },
  // Canada
  { id: 'ca-central-1', name: 'Canada (Central)' },
  { id: 'ca-west-1', name: 'Canada West (Calgary)' },
  // Mexico
  { id: 'mx-central-1', name: 'Mexico (Central)' },
  // South America
  { id: 'sa-east-1', name: 'South America (São Paulo)' },
  // Europe
  { id: 'eu-north-1', name: 'Europe (Stockholm)' },
  { id: 'eu-west-1', name: 'Europe (Ireland)' },
  { id: 'eu-west-2', name: 'Europe (London)' },
  { id: 'eu-west-3', name: 'Europe (Paris)' },
  { id: 'eu-central-1', name: 'Europe (Frankfurt)' },
  { id: 'eu-central-2', name: 'Europe (Zurich)' },
  { id: 'eu-south-1', name: 'Europe (Milan)' },
  { id: 'eu-south-2', name: 'Europe (Spain)' },
  // Middle East
  { id: 'me-south-1', name: 'Middle East (Bahrain)' },
  { id: 'me-central-1', name: 'Middle East (UAE)' },
  { id: 'il-central-1', name: 'Israel (Tel Aviv)' },
  // Africa
  { id: 'af-south-1', name: 'Africa (Cape Town)' },
  // Asia Pacific
  { id: 'ap-south-1', name: 'Asia Pacific (Mumbai)' },
  { id: 'ap-south-2', name: 'Asia Pacific (Hyderabad)' },
  { id: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)' },
  { id: 'ap-northeast-2', name: 'Asia Pacific (Seoul)' },
  { id: 'ap-northeast-3', name: 'Asia Pacific (Osaka)' },
  { id: 'ap-southeast-1', name: 'Asia Pacific (Singapore)' },
  { id: 'ap-southeast-2', name: 'Asia Pacific (Sydney)' },
  { id: 'ap-southeast-3', name: 'Asia Pacific (Jakarta)' },
  { id: 'ap-southeast-4', name: 'Asia Pacific (Melbourne)' },
  { id: 'ap-southeast-5', name: 'Asia Pacific (Malaysia)' },
  { id: 'ap-southeast-6', name: 'Asia Pacific (New Zealand)' },
  { id: 'ap-southeast-7', name: 'Asia Pacific (Thailand)' },
  { id: 'ap-east-1', name: 'Asia Pacific (Hong Kong)' },
  { id: 'ap-east-2', name: 'Asia Pacific (Taipei)' },
];

interface RegionSelectorProps {
  value: string;
  onChange: (region: string) => void;
}

export function RegionSelector({ value, onChange }: RegionSelectorProps) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-foreground">Region</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid="bedrock-region-select"
        className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
      >
        {AWS_REGIONS.map((region) => (
          <option key={region.id} value={region.id}>
            {region.id}
          </option>
        ))}
      </select>
    </div>
  );
}
