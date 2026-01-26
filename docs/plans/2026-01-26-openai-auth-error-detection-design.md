# OpenAI OAuth Auth Error Detection Design

## Overview

Detect OpenAI OAuth authentication failures during task execution and prompt user to re-authenticate via a toast notification.

## Problem

When OpenAI OAuth tokens expire or are revoked, tasks fail with cryptic errors. Users have no clear path to re-authenticate.

## Solution

1. Detect auth errors in OpenCode logs
2. Show persistent toast: "Your OpenAI session expired" + "Re-login" button
3. "Re-login" opens Settings dialog to OpenAI provider

## Implementation

### 1. Error Detection (log-watcher.ts)

Add patterns:
- `invalid_api_key|invalid_token|token.*expired|oauth.*invalid` → OAuthExpiredError
- `openai.*401|401.*openai` → OAuthUnauthorizedError
- `authentication.*failed.*openai` → OAuthAuthenticationError

Add to `OpenCodeLogError`:
- `isAuthError: boolean`
- `providerId?: string`

### 2. IPC Flow (adapter.ts → preload → renderer)

- Adapter emits `auth:error` IPC when `isAuthError === true`
- Preload exposes `onAuthError` listener
- App.tsx subscribes and updates store

### 3. Toast Component (auth-error-toast.tsx)

- Fixed top center position
- Warning icon + message + "Re-login" button + dismiss X
- Persists until dismissed or re-login clicked

### 4. State (taskStore.ts)

```typescript
authError: { providerId: string; message: string } | null
setAuthError(error)
clearAuthError()
```

### 5. Settings Integration

- SettingsDialog accepts `initialProviderId` prop
- "Re-login" clears toast, opens Settings to OpenAI

## Files Modified

- `apps/desktop/src/main/opencode/log-watcher.ts`
- `apps/desktop/src/main/opencode/adapter.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/renderer/stores/taskStore.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/components/layout/SettingsDialog.tsx`

## New Files

- `apps/desktop/src/renderer/components/ui/auth-error-toast.tsx`
