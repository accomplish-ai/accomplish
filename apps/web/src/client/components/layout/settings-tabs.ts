import {
  Key,
  Lightning,
  Microphone,
  Info,
  Plugs,
  FolderSimple,
  Globe,
  ChatCircle,
  GearSix,
  Timer,
} from '@phosphor-icons/react';

export type SettingsTabId =
  | 'providers'
  | 'voice'
  | 'skills'
  | 'connectors'
  | 'browsers'
  | 'workspaces'
  | 'integrations'
  | 'scheduler'
  | 'general'
  | 'about';

export const SETTINGS_TABS = [
  { id: 'providers' as const, labelKey: 'tabs.providers', icon: Key },
  { id: 'skills' as const, labelKey: 'tabs.skills', icon: Lightning },
  { id: 'connectors' as const, labelKey: 'tabs.connectors', icon: Plugs },
  { id: 'browsers' as const, labelKey: 'tabs.browsers', icon: Globe },
  { id: 'workspaces' as const, labelKey: 'tabs.workspaces', icon: FolderSimple },
  { id: 'integrations' as const, labelKey: 'tabs.integrations', icon: ChatCircle },
  { id: 'scheduler' as const, labelKey: 'tabs.scheduler', icon: Timer },
  { id: 'voice' as const, labelKey: 'tabs.voiceInput', icon: Microphone },
  { id: 'general' as const, labelKey: 'tabs.general', icon: GearSix },
  { id: 'about' as const, labelKey: 'tabs.about', icon: Info },
] as const;

/** First 4 providers shown in collapsed view (matches PROVIDER_ORDER in ProviderGrid). */
export const FIRST_FOUR_PROVIDERS = ['openai', 'anthropic', 'google', 'bedrock'] as const;
