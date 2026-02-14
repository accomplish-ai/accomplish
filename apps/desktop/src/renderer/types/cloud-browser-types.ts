/**
 * Cloud Browser Provider types
 * Used for integrating cloud browser services like Browserbase
 */

import type { CloudBrowserProviderType } from '@accomplish_ai/agent-core';

export type {
    CloudBrowserProviderType,
    CloudBrowserStatus,
    CloudBrowserProvider,
    CloudBrowserConfig,
} from '@accomplish_ai/agent-core';

/** Supported cloud browser providers with display metadata */
export const CLOUD_BROWSER_PROVIDERS: {
    type: CloudBrowserProviderType;
    name: string;
    description: string;
    docsUrl: string;
}[] = [
        {
            type: 'browserbase',
            name: 'Browserbase',
            description: 'Cloud browser infrastructure for AI agents. Provides managed Chromium instances accessible via CDP.',
            docsUrl: 'https://docs.browserbase.com',
        },
    ];
