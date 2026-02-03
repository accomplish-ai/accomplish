# HuggingFace Provider Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add HuggingFace Inference API as a provider with dynamic model fetching.

**Architecture:** New `'huggingface'` category in provider system. API token validation via HuggingFace whoami endpoint, model fetching via HuggingFace Hub API filtered to text-generation models with active inference.

**Tech Stack:** React, TypeScript, Electron IPC, keytar (secure storage)

---

## Task 1: Add HuggingFace to Shared Types

**Files:**
- Modify: `packages/shared/src/types/providerSettings.ts`
- Modify: `packages/shared/src/types/provider.ts`

**Step 1: Add 'huggingface' to ProviderId union**

In `packages/shared/src/types/providerSettings.ts`, change line 3-13:

```typescript
export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'xai'
  | 'deepseek'
  | 'zai'
  | 'bedrock'
  | 'ollama'
  | 'openrouter'
  | 'litellm'
  | 'huggingface';
```

**Step 2: Add 'huggingface' to ProviderCategory union**

In `packages/shared/src/types/providerSettings.ts`, change line 15:

```typescript
export type ProviderCategory = 'classic' | 'aws' | 'local' | 'proxy' | 'hybrid' | 'huggingface';
```

**Step 3: Add HuggingFaceCredentials interface**

In `packages/shared/src/types/providerSettings.ts`, add after line 69 (after LiteLLMCredentials):

```typescript
export interface HuggingFaceCredentials {
  type: 'huggingface';
  keyPrefix: string;
}
```

**Step 4: Add HuggingFaceCredentials to ProviderCredentials union**

In `packages/shared/src/types/providerSettings.ts`, update the ProviderCredentials type:

```typescript
export type ProviderCredentials =
  | ApiKeyCredentials
  | BedrockProviderCredentials
  | OllamaCredentials
  | OpenRouterCredentials
  | LiteLLMCredentials
  | HuggingFaceCredentials;
```

**Step 5: Add huggingface to PROVIDER_META**

In `packages/shared/src/types/providerSettings.ts`, add to PROVIDER_META object (after litellm entry, before the closing brace):

```typescript
  huggingface: { id: 'huggingface', name: 'Hugging Face', category: 'huggingface', label: 'Service', logoKey: 'huggingface', helpUrl: 'https://huggingface.co/settings/tokens' },
```

**Step 6: Add 'huggingface' to ProviderType in provider.ts**

In `packages/shared/src/types/provider.ts`, change line 5:

```typescript
export type ProviderType = 'anthropic' | 'openai' | 'openrouter' | 'google' | 'xai' | 'ollama' | 'deepseek' | 'zai' | 'custom' | 'bedrock' | 'litellm' | 'huggingface';
```

**Step 7: Add HuggingFace to DEFAULT_PROVIDERS array**

In `packages/shared/src/types/provider.ts`, add after the bedrock entry (before closing bracket of array):

```typescript
  {
    id: 'huggingface',
    name: 'Hugging Face',
    requiresApiKey: true,
    apiKeyEnvVar: 'HF_TOKEN',
    models: [], // Fetched dynamically
  },
```

**Step 8: Run typecheck**

Run: `cd /Users/danielscharfstein/Documents/accomplish/github-repos/openwork/.worktrees/huggingface-provider && pnpm run typecheck`
Expected: PASS (or errors only in files we haven't updated yet)

**Step 9: Commit**

```bash
git add packages/shared/src/types/providerSettings.ts packages/shared/src/types/provider.ts
git commit -m "feat(shared): add huggingface to provider types"
```

---

## Task 2: Add HuggingFace Logo

**Files:**
- Create: `apps/desktop/public/assets/ai-logos/huggingface.svg`

**Step 1: Create the HuggingFace logo SVG**

Create file `apps/desktop/public/assets/ai-logos/huggingface.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
  <path d="M50 95C74.8528 95 95 74.8528 95 50C95 25.1472 74.8528 5 50 5C25.1472 5 5 25.1472 5 50C5 74.8528 25.1472 95 50 95Z" fill="#FFD21E"/>
  <path d="M29.5 40C32.5376 40 35 37.5376 35 34.5C35 31.4624 32.5376 29 29.5 29C26.4624 29 24 31.4624 24 34.5C24 37.5376 26.4624 40 29.5 40Z" fill="#1A1A1A"/>
  <path d="M70.5 40C73.5376 40 76 37.5376 76 34.5C76 31.4624 73.5376 29 70.5 29C67.4624 29 65 31.4624 65 34.5C65 37.5376 67.4624 40 70.5 40Z" fill="#1A1A1A"/>
  <path d="M50 75C61.0457 75 70 66.0457 70 55H30C30 66.0457 38.9543 75 50 75Z" fill="#1A1A1A"/>
  <ellipse cx="29.5" cy="34" rx="4" ry="5" fill="white"/>
  <ellipse cx="70.5" cy="34" rx="4" ry="5" fill="white"/>
</svg>
```

**Step 2: Verify file exists**

Run: `ls -la /Users/danielscharfstein/Documents/accomplish/github-repos/openwork/.worktrees/huggingface-provider/apps/desktop/public/assets/ai-logos/huggingface.svg`
Expected: File exists

**Step 3: Commit**

```bash
git add apps/desktop/public/assets/ai-logos/huggingface.svg
git commit -m "feat(assets): add huggingface logo"
```

---

## Task 3: Add Backend IPC Handlers

**Files:**
- Modify: `apps/desktop/src/main/ipc/handlers.ts`

**Step 1: Add 'huggingface' to ALLOWED_API_KEY_PROVIDERS**

In `apps/desktop/src/main/ipc/handlers.ts`, find line 97 and update:

```typescript
const ALLOWED_API_KEY_PROVIDERS = new Set(['anthropic', 'openai', 'openrouter', 'google', 'xai', 'deepseek', 'zai', 'custom', 'bedrock', 'litellm', 'huggingface']);
```

**Step 2: Add huggingface:validate handler**

Find the `handle('openrouter:fetch-models'` handler (around line 1248) and add BEFORE it:

```typescript
  // HuggingFace handlers
  handle('huggingface:validate', async (_event: IpcMainInvokeEvent, token: string) => {
    if (!token?.trim()) {
      return { valid: false, error: 'Token is required' };
    }

    try {
      const response = await fetchWithTimeout(
        'https://huggingface.co/api/whoami',
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token.trim()}`,
          },
        },
        API_KEY_VALIDATION_TIMEOUT_MS
      );

      if (!response.ok) {
        if (response.status === 401) {
          return { valid: false, error: 'Invalid token' };
        }
        return { valid: false, error: `API returned status ${response.status}` };
      }

      return { valid: true };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { valid: false, error: 'Request timed out' };
      }
      return { valid: false, error: error instanceof Error ? error.message : 'Validation failed' };
    }
  });

  handle('huggingface:fetch-models', async (_event: IpcMainInvokeEvent) => {
    const apiKey = getApiKey('huggingface');
    if (!apiKey) {
      return { success: false, error: 'No HuggingFace token configured' };
    }

    try {
      // Fetch text-generation models with active inference, sorted by downloads
      const response = await fetchWithTimeout(
        'https://huggingface.co/api/models?pipeline_tag=text-generation&inference=warm&sort=downloads&direction=-1&limit=200',
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        },
        API_KEY_VALIDATION_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = (errorData as { error?: string })?.error || `API returned status ${response.status}`;
        return { success: false, error: errorMessage };
      }

      const data = await response.json() as Array<{ id: string; pipeline_tag?: string }>;
      const models = data.map((m) => ({
        id: m.id,
        name: m.id,
      }));

      return { success: true, models };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Request timed out' };
      }
      return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch models' };
    }
  });

```

**Step 3: Run typecheck**

Run: `cd /Users/danielscharfstein/Documents/accomplish/github-repos/openwork/.worktrees/huggingface-provider && pnpm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/desktop/src/main/ipc/handlers.ts
git commit -m "feat(main): add huggingface IPC handlers for validation and model fetch"
```

---

## Task 4: Add Preload IPC Bindings

**Files:**
- Modify: `apps/desktop/src/preload/index.ts`

**Step 1: Add 'huggingface' to addApiKey provider type**

In `apps/desktop/src/preload/index.ts`, find line 44-49 and update the provider type:

```typescript
  addApiKey: (
    provider: 'anthropic' | 'openai' | 'openrouter' | 'google' | 'xai' | 'deepseek' | 'zai' | 'custom' | 'bedrock' | 'litellm' | 'huggingface',
    key: string,
    label?: string
  ): Promise<unknown> =>
    ipcRenderer.invoke('settings:add-api-key', provider, key, label),
```

**Step 2: Add HuggingFace IPC methods**

Find the `// OpenRouter configuration` section (around line 113) and add BEFORE it:

```typescript
  // HuggingFace configuration
  validateHuggingFaceToken: (token: string): Promise<{ valid: boolean; error?: string }> =>
    ipcRenderer.invoke('huggingface:validate', token),

  fetchHuggingFaceModels: (): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string }>;
    error?: string;
  }> => ipcRenderer.invoke('huggingface:fetch-models'),

```

**Step 3: Run typecheck**

Run: `cd /Users/danielscharfstein/Documents/accomplish/github-repos/openwork/.worktrees/huggingface-provider && pnpm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/desktop/src/preload/index.ts
git commit -m "feat(preload): add huggingface IPC bindings"
```

---

## Task 5: Add Renderer API Types

**Files:**
- Modify: `apps/desktop/src/renderer/lib/accomplish.ts`

**Step 1: Add 'huggingface' to addApiKey provider type**

In `apps/desktop/src/renderer/lib/accomplish.ts`, find line 50 and update:

```typescript
  addApiKey(provider: 'anthropic' | 'openai' | 'openrouter' | 'google' | 'xai' | 'deepseek' | 'zai' | 'custom' | 'bedrock' | 'litellm' | 'huggingface', key: string, label?: string): Promise<ApiKeyConfig>;
```

**Step 2: Add HuggingFace methods to AccomplishAPI interface**

Find the `// OpenRouter configuration` section (around line 89) and add BEFORE it:

```typescript
  // HuggingFace configuration
  validateHuggingFaceToken(token: string): Promise<{ valid: boolean; error?: string }>;
  fetchHuggingFaceModels(): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string }>;
    error?: string;
  }>;

```

**Step 3: Run typecheck**

Run: `cd /Users/danielscharfstein/Documents/accomplish/github-repos/openwork/.worktrees/huggingface-provider && pnpm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/lib/accomplish.ts
git commit -m "feat(renderer): add huggingface API types"
```

---

## Task 6: Create HuggingFaceProviderForm Component

**Files:**
- Create: `apps/desktop/src/renderer/components/settings/providers/HuggingFaceProviderForm.tsx`

**Step 1: Create the component file**

Create `apps/desktop/src/renderer/components/settings/providers/HuggingFaceProviderForm.tsx`:

```typescript
// apps/desktop/src/renderer/components/settings/providers/HuggingFaceProviderForm.tsx

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAccomplish } from '@/lib/accomplish';
import type { ConnectedProvider, HuggingFaceCredentials } from '@accomplish/shared';
import { PROVIDER_META } from '@accomplish/shared';
import {
  ModelSelector,
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
} from '../shared';
import { settingsVariants, settingsTransitions } from '@/lib/animations';

// Import HuggingFace logo
import huggingfaceLogo from '/assets/ai-logos/huggingface.svg';

interface HuggingFaceProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function HuggingFaceProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: HuggingFaceProviderFormProps) {
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string }>>([]);

  const meta = PROVIDER_META.huggingface;
  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const handleConnect = async () => {
    if (!token.trim()) {
      setError('Please enter a token');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();

      // Validate token
      const validation = await accomplish.validateHuggingFaceToken(token.trim());
      if (!validation.valid) {
        setError(validation.error || 'Invalid token');
        setConnecting(false);
        return;
      }

      // Save token
      await accomplish.addApiKey('huggingface', token.trim());

      // Fetch models
      const result = await accomplish.fetchHuggingFaceModels();
      if (!result.success) {
        setError(result.error || 'Failed to fetch models');
        setConnecting(false);
        return;
      }

      const models = result.models?.map(m => ({
        id: `huggingface/${m.id}`,
        name: m.name,
      })) || [];
      setAvailableModels(models);

      // Store token prefix for display
      const trimmedToken = token.trim();
      const provider: ConnectedProvider = {
        providerId: 'huggingface',
        connectionStatus: 'connected',
        selectedModelId: null,
        credentials: {
          type: 'huggingface',
          keyPrefix: trimmedToken.length > 20
            ? trimmedToken.substring(0, 20) + '...'
            : trimmedToken.substring(0, Math.min(trimmedToken.length, 10)) + '...',
        } as HuggingFaceCredentials,
        lastConnectedAt: new Date().toISOString(),
        availableModels: models,
      };

      onConnect(provider);
      setToken('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const models = connectedProvider?.availableModels || availableModels;

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="provider-settings-panel">
      <ProviderFormHeader logoSrc={huggingfaceLogo} providerName="Hugging Face" />

      <div className="space-y-3">
        <AnimatePresence mode="wait">
          {!isConnected ? (
            <motion.div
              key="disconnected"
              variants={settingsVariants.fadeSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.enter}
              className="space-y-3"
            >
              {/* Token Section */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Access Token</label>
                {meta.helpUrl && (
                  <a
                    href={meta.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-primary underline"
                  >
                    How can I find it?
                  </a>
                )}
              </div>

              {/* Token input with trash */}
              <div className="flex gap-2">
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="hf_..."
                  disabled={connecting}
                  data-testid="api-key-input"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm disabled:opacity-50"
                />
                <button
                  onClick={() => setToken('')}
                  className="rounded-md border border-border p-2.5 text-muted-foreground hover:text-foreground transition-colors"
                  type="button"
                  disabled={!token}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              <FormError error={error} />
              <ConnectButton onClick={handleConnect} connecting={connecting} disabled={!token.trim()} />
            </motion.div>
          ) : (
            <motion.div
              key="connected"
              variants={settingsVariants.fadeSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.enter}
              className="space-y-3"
            >
              {/* Connected: Show masked token + Connected button + Model */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Access Token</label>
                {meta.helpUrl && (
                  <a
                    href={meta.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-primary underline"
                  >
                    How can I find it?
                  </a>
                )}
              </div>

              <input
                type="text"
                value={(() => {
                  const creds = connectedProvider?.credentials as HuggingFaceCredentials | undefined;
                  if (creds?.keyPrefix) return creds.keyPrefix;
                  return 'Token saved (reconnect to see prefix)';
                })()}
                disabled
                data-testid="api-key-display"
                className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
              />

              <ConnectedControls onDisconnect={onDisconnect} />

              {/* Model Selector */}
              <ModelSelector
                models={models}
                value={connectedProvider?.selectedModelId || null}
                onChange={onModelChange}
                error={showModelError && !connectedProvider?.selectedModelId}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
```

**Step 2: Run typecheck**

Run: `cd /Users/danielscharfstein/Documents/accomplish/github-repos/openwork/.worktrees/huggingface-provider && pnpm run typecheck`
Expected: PASS (or errors only about missing export)

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/components/settings/providers/HuggingFaceProviderForm.tsx
git commit -m "feat(ui): create HuggingFaceProviderForm component"
```

---

## Task 7: Export HuggingFaceProviderForm

**Files:**
- Modify: `apps/desktop/src/renderer/components/settings/providers/index.ts`

**Step 1: Add export**

In `apps/desktop/src/renderer/components/settings/providers/index.ts`, add at the end:

```typescript
export { HuggingFaceProviderForm } from './HuggingFaceProviderForm';
```

**Step 2: Run typecheck**

Run: `cd /Users/danielscharfstein/Documents/accomplish/github-repos/openwork/.worktrees/huggingface-provider && pnpm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/components/settings/providers/index.ts
git commit -m "feat(ui): export HuggingFaceProviderForm"
```

---

## Task 8: Add Routing in ProviderSettingsPanel

**Files:**
- Modify: `apps/desktop/src/renderer/components/settings/ProviderSettingsPanel.tsx`

**Step 1: Import HuggingFaceProviderForm**

In `apps/desktop/src/renderer/components/settings/ProviderSettingsPanel.tsx`, update line 6-12:

```typescript
import {
  ClassicProviderForm,
  BedrockProviderForm,
  OllamaProviderForm,
  OpenRouterProviderForm,
  LiteLLMProviderForm,
  HuggingFaceProviderForm,
} from './providers';
```

**Step 2: Add case for 'huggingface' category**

In `apps/desktop/src/renderer/components/settings/ProviderSettingsPanel.tsx`, find the switch statement in `renderForm()` and add before the default case (after 'hybrid'):

```typescript
      case 'huggingface':
        return (
          <HuggingFaceProviderForm
            connectedProvider={connectedProvider}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            onModelChange={onModelChange}
            showModelError={showModelError}
          />
        );
```

**Step 3: Run typecheck**

Run: `cd /Users/danielscharfstein/Documents/accomplish/github-repos/openwork/.worktrees/huggingface-provider && pnpm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/components/settings/ProviderSettingsPanel.tsx
git commit -m "feat(ui): add huggingface routing in ProviderSettingsPanel"
```

---

## Task 9: Add HuggingFace to Provider Grid

**Files:**
- Modify: `apps/desktop/src/renderer/components/settings/ProviderGrid.tsx`

**Step 1: Add 'huggingface' to PROVIDER_ORDER array**

In `apps/desktop/src/renderer/components/settings/ProviderGrid.tsx`, update lines 11-22:

```typescript
const PROVIDER_ORDER: ProviderId[] = [
  'anthropic',
  'openai',
  'google',
  'bedrock',
  'deepseek',
  'zai',
  'ollama',
  'xai',
  'openrouter',
  'litellm',
  'huggingface',
];
```

**Step 2: Run typecheck**

Run: `cd /Users/danielscharfstein/Documents/accomplish/github-repos/openwork/.worktrees/huggingface-provider && pnpm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/components/settings/ProviderGrid.tsx
git commit -m "feat(ui): add huggingface to provider grid"
```

---

## Task 10: Add HuggingFace Logo to ProviderCard

**Files:**
- Modify: `apps/desktop/src/renderer/components/settings/ProviderCard.tsx`

**Step 1: Check if logo imports exist and add huggingface**

Read the ProviderCard.tsx file to see how logos are imported, then add the huggingface import following the same pattern.

Look for a section with logo imports like:
```typescript
import anthropicLogo from '/assets/ai-logos/anthropic.svg';
```

Add after the last logo import:
```typescript
import huggingfaceLogo from '/assets/ai-logos/huggingface.svg';
```

Then find the PROVIDER_LOGOS object and add:
```typescript
  huggingface: huggingfaceLogo,
```

**Step 2: Run typecheck**

Run: `cd /Users/danielscharfstein/Documents/accomplish/github-repos/openwork/.worktrees/huggingface-provider && pnpm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/components/settings/ProviderCard.tsx
git commit -m "feat(ui): add huggingface logo to ProviderCard"
```

---

## Task 11: Final Verification

**Step 1: Run full typecheck**

Run: `cd /Users/danielscharfstein/Documents/accomplish/github-repos/openwork/.worktrees/huggingface-provider && pnpm run typecheck`
Expected: PASS with 0 errors

**Step 2: Run the test local agent script**

Run: `cd /Users/danielscharfstein/Documents/accomplish/github-repos/openwork/.worktrees/huggingface-provider && ./scripts/test-local-agent-package.sh`
Expected: Script runs successfully

**Step 3: Build the app**

Run: `cd /Users/danielscharfstein/Documents/accomplish/github-repos/openwork/.worktrees/huggingface-provider && pnpm run build`
Expected: Build succeeds

**Step 4: Final commit if any remaining changes**

```bash
git status
# If there are unstaged changes, review and commit them
```

---

## Summary

After completing all tasks, you will have:

1. **Shared types** updated with `'huggingface'` provider ID, category, and credentials type
2. **Logo asset** added for HuggingFace
3. **Backend IPC handlers** for token validation and model fetching
4. **Preload bindings** exposing HuggingFace IPC methods
5. **Renderer API types** with HuggingFace methods
6. **HuggingFaceProviderForm** component for the settings UI
7. **Routing** in ProviderSettingsPanel for the huggingface category
8. **Provider grid** showing HuggingFace as the 11th provider

The implementation follows the exact patterns used by OpenRouter (closest analog - API key + dynamic model fetch).
