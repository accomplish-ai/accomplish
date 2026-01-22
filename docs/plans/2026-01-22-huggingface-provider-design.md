# HuggingFace Provider Integration Design

## Overview

Add HuggingFace Inference API as a provider in OpenWork, allowing users to connect with their HuggingFace API token and select from dynamically fetched text-generation models.

## Provider Classification

- **ProviderId:** `'huggingface'`
- **Category:** `'huggingface'` (new category for routing)
- **Auth:** Single API token (HF_TOKEN)
- **Models:** Fetched dynamically from HuggingFace Hub API

## HuggingFace API Integration

### Authentication
- Bearer token auth via `Authorization: Bearer <token>`
- Token obtained from: https://huggingface.co/settings/tokens
- Validation: `GET https://huggingface.co/api/whoami`

### Model Fetching
- Endpoint: `GET https://huggingface.co/api/models`
- Params: `?pipeline_tag=text-generation&inference=warm`
- Filter: Only models with active inference endpoints
- Limit: Top 200 by downloads
- Model ID format: `huggingface/owner/model-name`

### Inference
- Base URL: `https://api-inference.huggingface.co/models/{model_id}`

## Implementation

### Files to Create

1. `apps/desktop/src/renderer/components/settings/providers/HuggingFaceProviderForm.tsx`
2. `apps/desktop/public/assets/ai-logos/huggingface.svg`

### Files to Modify

| File | Change |
|------|--------|
| `packages/shared/src/types/providerSettings.ts` | Add `'huggingface'` to ProviderId union, add `'huggingface'` to ProviderCategory, add PROVIDER_META entry |
| `packages/shared/src/types/provider.ts` | Add HuggingFace to DEFAULT_PROVIDERS (empty models array) |
| `apps/desktop/src/renderer/components/settings/providers/index.ts` | Export HuggingFaceProviderForm |
| `apps/desktop/src/renderer/components/settings/ProviderSettingsPanel.tsx` | Add case for `'huggingface'` category routing |
| `apps/desktop/src/renderer/components/settings/ProviderGrid.tsx` | Add `'huggingface'` to PROVIDER_ORDER array |
| `apps/desktop/src/main/ipc/handlers.ts` | Add `huggingface:validate` and `huggingface:fetch-models` handlers, add to ALLOWED_API_KEY_PROVIDERS |
| `apps/desktop/src/renderer/lib/accomplish.ts` | Add typed IPC methods for HuggingFace |

### Type Changes

```typescript
// providerSettings.ts
export type ProviderId =
  | 'anthropic' | 'openai' | 'google' | 'xai' | 'deepseek'
  | 'zai' | 'bedrock' | 'ollama' | 'openrouter' | 'litellm'
  | 'huggingface';  // ADD

export type ProviderCategory =
  | 'classic' | 'aws' | 'local' | 'proxy' | 'hybrid'
  | 'huggingface';  // ADD

export const PROVIDER_META: Record<ProviderId, ProviderMeta> = {
  // ... existing entries
  huggingface: {
    id: 'huggingface',
    name: 'Hugging Face',
    category: 'huggingface',
    label: 'Service',
    logoKey: 'huggingface',
    helpUrl: 'https://huggingface.co/settings/tokens',
  },
};
```

### IPC Handlers

```typescript
// handlers.ts
handle('huggingface:validate', async (_event, token: string) => {
  const response = await fetch('https://huggingface.co/api/whoami', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return { valid: response.ok, error: response.ok ? undefined : 'Invalid token' };
});

handle('huggingface:fetch-models', async () => {
  const token = await getApiKey('huggingface');
  const response = await fetch(
    'https://huggingface.co/api/models?pipeline_tag=text-generation&inference=warm&sort=downloads&limit=200',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await response.json();
  return {
    success: true,
    models: data.map((m: any) => ({
      id: `huggingface/${m.id}`,
      name: m.id,
    })),
  };
});
```

### UI Component States

1. **Disconnected:** API token input, "Get Token" help link, Connect button
2. **Connecting:** Loading spinner, "Validating and fetching models..."
3. **Connected:** Masked token, Disconnect button, Model selector dropdown

## Verification

- Run `scripts/test-local-agent-package.sh`
- Manual test: Settings dialog → HuggingFace card → Enter token → Connect → Select model

## Out of Scope

- HuggingFace Inference Endpoints (dedicated deployments)
- Text Generation Inference (TGI) self-hosted
- Model search/filtering in UI
