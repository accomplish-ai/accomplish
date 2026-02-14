export type CloudBrowserProviderId = 'browserbase';

export interface BrowserbaseConfig {
  providerId: 'browserbase';
  projectId: string;
  enabled: boolean;
  lastValidated?: number;
}

export interface CloudBrowserConfig {
  id: string;
  providerId: CloudBrowserProviderId;
  projectId: string;
  enabled: boolean;
  lastValidated?: number;
  createdAt: string;
  updatedAt: string;
}
