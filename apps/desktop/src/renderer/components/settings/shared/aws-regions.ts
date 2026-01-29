// apps/desktop/src/renderer/components/settings/shared/aws-regions.ts

import type { SelectOption } from './SearchableSelect';

/** Default AWS regions list for Bedrock and other AWS services */
export const AWS_REGIONS: SelectOption[] = [
  // US
  { id: 'us-east-1', name: 'us-east-1' },
  { id: 'us-east-2', name: 'us-east-2' },
  { id: 'us-west-1', name: 'us-west-1' },
  { id: 'us-west-2', name: 'us-west-2' },
  // Canada
  { id: 'ca-central-1', name: 'ca-central-1' },
  { id: 'ca-west-1', name: 'ca-west-1' },
  // Mexico
  { id: 'mx-central-1', name: 'mx-central-1' },
  // South America
  { id: 'sa-east-1', name: 'sa-east-1' },
  // Europe
  { id: 'eu-north-1', name: 'eu-north-1' },
  { id: 'eu-west-1', name: 'eu-west-1' },
  { id: 'eu-west-2', name: 'eu-west-2' },
  { id: 'eu-west-3', name: 'eu-west-3' },
  { id: 'eu-central-1', name: 'eu-central-1' },
  { id: 'eu-central-2', name: 'eu-central-2' },
  { id: 'eu-south-1', name: 'eu-south-1' },
  { id: 'eu-south-2', name: 'eu-south-2' },
  // Middle East
  { id: 'me-south-1', name: 'me-south-1' },
  { id: 'me-central-1', name: 'me-central-1' },
  { id: 'il-central-1', name: 'il-central-1' },
  // Africa
  { id: 'af-south-1', name: 'af-south-1' },
  // Asia Pacific
  { id: 'ap-south-1', name: 'ap-south-1' },
  { id: 'ap-south-2', name: 'ap-south-2' },
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
  { id: 'ap-east-1', name: 'ap-east-1' },
  { id: 'ap-east-2', name: 'ap-east-2' },
];
