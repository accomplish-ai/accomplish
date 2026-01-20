# Settings Page Animations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add subtle, professional animations to all Settings page interactions.

**Architecture:** Hybrid approach using Framer Motion for complex transitions (enter/exit, crossfades) and CSS for simple states (hover, selection). All animations are 150-200ms with `springs.snappy` easing.

**Tech Stack:** Framer Motion (already installed), React, TypeScript, Tailwind CSS

---

## Task 1: Add Settings Animation Variants

**Files:**
- Modify: `apps/desktop/src/renderer/lib/animations.ts`

**Step 1: Add new animation variants for settings**

Add these variants after the existing `variants` object (around line 48):

```typescript
// Settings-specific variants
export const settingsVariants = {
  // Panel slide down - for ProviderSettingsPanel
  slideDown: {
    initial: { opacity: 0, y: -12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  } as Variants,

  // Fade slide - for error messages, warnings
  fadeSlide: {
    initial: { opacity: 0, y: -8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
  } as Variants,

  // Scale dropdown - for model selector
  scaleDropdown: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  } as Variants,

  // Stagger for grid expansion
  gridStagger: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
  } as Variants,
};

// Transition presets for settings
export const settingsTransitions = {
  enter: { duration: 0.2 },
  exit: { duration: 0.15 },
  fast: { duration: 0.1 },
  stagger: (index: number) => ({ duration: 0.2, delay: index * 0.04 }),
};
```

**Step 2: Verify changes compile**

Run: `cd apps/desktop && pnpm typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/lib/animations.ts
git commit -m "feat(settings): add animation variants for settings page"
```

---

## Task 2: Animate FormError Component

**Files:**
- Modify: `apps/desktop/src/renderer/components/settings/shared/FormError.tsx`

**Step 1: Add Framer Motion imports and animation**

Replace the entire file with:

```typescript
// apps/desktop/src/renderer/components/settings/shared/FormError.tsx

import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';

interface FormErrorProps {
  error: string | null;
}

export function FormError({ error }: FormErrorProps) {
  return (
    <AnimatePresence>
      {error && (
        <motion.p
          className="text-sm text-destructive"
          variants={settingsVariants.fadeSlide}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={settingsTransitions.enter}
        >
          {error}
        </motion.p>
      )}
    </AnimatePresence>
  );
}
```

**Step 2: Verify changes compile**

Run: `cd apps/desktop && pnpm typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/components/settings/shared/FormError.tsx
git commit -m "feat(settings): animate FormError enter/exit"
```

---

## Task 3: Animate ModelSelector Dropdown

**Files:**
- Modify: `apps/desktop/src/renderer/components/settings/shared/ModelSelector.tsx`

**Step 1: Add Framer Motion imports**

Add at the top of the file after existing imports:

```typescript
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
```

**Step 2: Wrap the dropdown with AnimatePresence**

Find the dropdown div (around line 127-165) that starts with `{isOpen && (`. Replace it with:

```typescript
        <AnimatePresence>
          {isOpen && (
            <motion.div
              className="absolute z-50 w-full mt-1 rounded-md border border-input bg-background shadow-lg"
              variants={settingsVariants.scaleDropdown}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.fast}
              style={{ transformOrigin: 'top' }}
            >
              {/* Search input */}
              <div className="p-2 border-b border-input">
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search models..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              {/* Model list */}
              <div className="max-h-60 overflow-y-auto">
                {filteredModels.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No models found</div>
                ) : (
                  filteredModels.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        onChange(model.id);
                        setIsOpen(false);
                        setSearch('');
                      }}
                      className={`w-full px-3 py-2 text-sm text-left hover:bg-muted ${
                        model.id === value ? 'bg-muted font-medium' : ''
                      }`}
                    >
                      {model.name}
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
```

**Step 3: Verify changes compile**

Run: `cd apps/desktop && pnpm typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/components/settings/shared/ModelSelector.tsx
git commit -m "feat(settings): animate ModelSelector dropdown open/close"
```

---

## Task 4: Animate ProviderCard Connected Badge

**Files:**
- Modify: `apps/desktop/src/renderer/components/settings/ProviderCard.tsx`

**Step 1: Add Framer Motion imports**

Add after the existing imports (around line 5):

```typescript
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
```

**Step 2: Wrap the connected badge with AnimatePresence**

Find the connected badge section (lines 79-88) and replace with:

```typescript
      {/* Connection status badge - always green when connected */}
      <AnimatePresence>
        {isConnected && (
          <motion.div
            className="absolute top-2 right-2"
            data-testid={`provider-connected-badge-${providerId}`}
            variants={settingsVariants.fadeSlide}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={settingsTransitions.enter}
          >
            <img
              src={connectedKeyIcon}
              alt={providerReady ? "Ready" : "Connected"}
              className="h-5 w-5"
              title={providerReady ? undefined : "Select a model to complete setup"}
            />
          </motion.div>
        )}
      </AnimatePresence>
```

**Step 3: Verify changes compile**

Run: `cd apps/desktop && pnpm typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/components/settings/ProviderCard.tsx
git commit -m "feat(settings): animate ProviderCard connected badge"
```

---

## Task 5: Animate ProviderGrid Expand/Collapse

**Files:**
- Modify: `apps/desktop/src/renderer/components/settings/ProviderGrid.tsx`

**Step 1: Add Framer Motion imports**

Add after line 3:

```typescript
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
```

**Step 2: Replace the expanded grid section**

Replace the expanded section (lines 79-92) with animated version:

```typescript
      {/* Providers - min-h prevents layout shift when switching between providers */}
      <div className="grid grid-cols-4 gap-3 min-h-[110px] justify-items-center">
        {/* Always show first 4 providers */}
        {filteredProviders.slice(0, 4).map(providerId => (
          <ProviderCard
            key={providerId}
            providerId={providerId}
            connectedProvider={settings?.connectedProviders?.[providerId]}
            isActive={settings?.activeProviderId === providerId}
            isSelected={selectedProvider === providerId}
            onSelect={onSelectProvider}
          />
        ))}
      </div>

      {/* Expanded providers (5-10) with animation */}
      <AnimatePresence>
        {expanded && filteredProviders.length > 4 && (
          <motion.div
            className="grid grid-cols-4 gap-3 mt-3 justify-items-center"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={settingsTransitions.enter}
          >
            {filteredProviders.slice(4).map((providerId, index) => (
              <motion.div
                key={providerId}
                variants={settingsVariants.gridStagger}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={settingsTransitions.stagger(index)}
              >
                <ProviderCard
                  providerId={providerId}
                  connectedProvider={settings?.connectedProviders?.[providerId]}
                  isActive={settings?.activeProviderId === providerId}
                  isSelected={selectedProvider === providerId}
                  onSelect={onSelectProvider}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
```

**Step 3: Remove the old conditional rendering**

Delete the old collapsed/expanded ternary (the original lines 79-107 that had `{expanded ? ... : ...}`).

**Step 4: Verify changes compile**

Run: `cd apps/desktop && pnpm typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add apps/desktop/src/renderer/components/settings/ProviderGrid.tsx
git commit -m "feat(settings): animate ProviderGrid expand/collapse with stagger"
```

---

## Task 6: Animate ProviderSettingsPanel

**Files:**
- Modify: `apps/desktop/src/renderer/components/settings/ProviderSettingsPanel.tsx`

**Step 1: Add Framer Motion imports**

Add after line 2:

```typescript
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
```

**Step 2: Wrap return with motion.div and AnimatePresence for form crossfade**

Replace the return statement (lines 98-103) with:

```typescript
  return (
    <div className="min-h-[260px]">
      <AnimatePresence mode="wait">
        <motion.div
          key={providerId}
          variants={settingsVariants.slideDown}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={settingsTransitions.enter}
        >
          {renderForm()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
```

**Step 3: Verify changes compile**

Run: `cd apps/desktop && pnpm typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/components/settings/ProviderSettingsPanel.tsx
git commit -m "feat(settings): animate ProviderSettingsPanel enter/exit and form crossfade"
```

---

## Task 7: Animate ClassicProviderForm State Transitions

**Files:**
- Modify: `apps/desktop/src/renderer/components/settings/providers/ClassicProviderForm.tsx`

**Step 1: Add Framer Motion imports**

Add after line 2:

```typescript
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
```

**Step 2: Wrap the connected/disconnected state swap with AnimatePresence**

Find the conditional rendering of connected vs disconnected (lines 128-182) and replace with:

```typescript
        <AnimatePresence mode="wait">
          {!isConnected ? (
            <motion.div
              key="disconnected"
              variants={settingsVariants.fadeSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.enter}
            >
              {/* Disconnected: API Key input with trash */}
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter API Key"
                  disabled={connecting}
                  data-testid="api-key-input"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm disabled:opacity-50"
                />
                <button
                  onClick={() => setApiKey('')}
                  className="rounded-md border border-border p-2.5 text-muted-foreground hover:text-foreground transition-colors"
                  type="button"
                  disabled={!apiKey}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              <FormError error={error} />
              <ConnectButton onClick={handleConnect} connecting={connecting} disabled={!apiKey.trim()} />
            </motion.div>
          ) : (
            <motion.div
              key="connected"
              variants={settingsVariants.fadeSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.enter}
            >
              {/* Connected: Show masked key + Connected button + Model */}
              <input
                type="text"
                value={(() => {
                  const creds = connectedProvider?.credentials as ApiKeyCredentials | undefined;
                  if (creds?.keyPrefix) return creds.keyPrefix;
                  return 'API key saved (reconnect to see prefix)';
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
```

**Step 3: Verify changes compile**

Run: `cd apps/desktop && pnpm typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/components/settings/providers/ClassicProviderForm.tsx
git commit -m "feat(settings): animate ClassicProviderForm connect/disconnect transitions"
```

---

## Task 8: Animate BedrockProviderForm State Transitions

**Files:**
- Modify: `apps/desktop/src/renderer/components/settings/providers/BedrockProviderForm.tsx`

**Step 1: Read the file to understand structure**

Run: Read the file first to see current structure

**Step 2: Add Framer Motion imports**

Add after the first few import lines:

```typescript
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
```

**Step 3: Wrap the main form sections with AnimatePresence**

The Bedrock form has auth tabs and connected/disconnected states. Wrap the main conditional content sections with AnimatePresence similar to ClassicProviderForm - wrap the disconnected form and connected state in motion.div with key="disconnected" and key="connected".

**Step 4: Verify changes compile**

Run: `cd apps/desktop && pnpm typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add apps/desktop/src/renderer/components/settings/providers/BedrockProviderForm.tsx
git commit -m "feat(settings): animate BedrockProviderForm state transitions"
```

---

## Task 9: Animate OllamaProviderForm State Transitions

**Files:**
- Modify: `apps/desktop/src/renderer/components/settings/providers/OllamaProviderForm.tsx`

**Step 1: Add Framer Motion imports**

```typescript
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
```

**Step 2: Wrap connected/disconnected state swap with AnimatePresence**

Same pattern as ClassicProviderForm - wrap the main conditional rendering.

**Step 3: Verify changes compile**

Run: `cd apps/desktop && pnpm typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/components/settings/providers/OllamaProviderForm.tsx
git commit -m "feat(settings): animate OllamaProviderForm state transitions"
```

---

## Task 10: Animate OpenRouterProviderForm State Transitions

**Files:**
- Modify: `apps/desktop/src/renderer/components/settings/providers/OpenRouterProviderForm.tsx`

**Step 1: Add Framer Motion imports**

```typescript
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
```

**Step 2: Wrap connected/disconnected state swap with AnimatePresence**

Same pattern as other forms.

**Step 3: Verify changes compile**

Run: `cd apps/desktop && pnpm typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/components/settings/providers/OpenRouterProviderForm.tsx
git commit -m "feat(settings): animate OpenRouterProviderForm state transitions"
```

---

## Task 11: Animate LiteLLMProviderForm State Transitions

**Files:**
- Modify: `apps/desktop/src/renderer/components/settings/providers/LiteLLMProviderForm.tsx`

**Step 1: Add Framer Motion imports**

```typescript
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
```

**Step 2: Wrap connected/disconnected state swap with AnimatePresence**

Same pattern as other forms.

**Step 3: Verify changes compile**

Run: `cd apps/desktop && pnpm typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/components/settings/providers/LiteLLMProviderForm.tsx
git commit -m "feat(settings): animate LiteLLMProviderForm state transitions"
```

---

## Task 12: Animate SettingsDialog Close Warning and Panel

**Files:**
- Modify: `apps/desktop/src/renderer/components/layout/SettingsDialog.tsx`

**Step 1: Add Framer Motion imports**

Add after line 1:

```typescript
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
```

**Step 2: Wrap closeWarning with AnimatePresence**

Find the close warning section (lines 238-260) and wrap with AnimatePresence:

```typescript
          {/* Close Warning */}
          <AnimatePresence>
            {closeWarning && (
              <motion.div
                className="rounded-lg border border-warning bg-warning/10 p-4"
                variants={settingsVariants.fadeSlide}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={settingsTransitions.enter}
              >
                <div className="flex items-start gap-3">
                  <svg className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-warning">No provider ready</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      You need to connect a provider and select a model before you can run tasks.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={handleForceClose}
                        className="rounded-md px-3 py-1.5 text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80"
                      >
                        Close Anyway
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
```

**Step 3: Wrap ProviderSettingsPanel section with AnimatePresence**

Find the provider settings panel section (lines 274-286) and wrap with AnimatePresence:

```typescript
          {/* Provider Settings Panel (shown when a provider is selected) */}
          <AnimatePresence>
            {selectedProvider && (
              <motion.section
                variants={settingsVariants.slideDown}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={settingsTransitions.enter}
              >
                <ProviderSettingsPanel
                  key={selectedProvider}
                  providerId={selectedProvider}
                  connectedProvider={settings?.connectedProviders?.[selectedProvider]}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                  onModelChange={handleModelChange}
                  showModelError={showModelError}
                />
              </motion.section>
            )}
          </AnimatePresence>

          {/* Debug Mode Section - only shown when a provider is selected */}
          <AnimatePresence>
            {selectedProvider && (
              <motion.section
                variants={settingsVariants.slideDown}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ ...settingsTransitions.enter, delay: 0.05 }}
              >
                {/* existing debug mode content */}
              </motion.section>
            )}
          </AnimatePresence>
```

**Step 4: Verify changes compile**

Run: `cd apps/desktop && pnpm typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add apps/desktop/src/renderer/components/layout/SettingsDialog.tsx
git commit -m "feat(settings): animate SettingsDialog warning and panel sections"
```

---

## Task 13: Final Verification and Testing

**Step 1: Run full typecheck**

Run: `cd apps/desktop && pnpm typecheck`
Expected: No errors

**Step 2: Run the app in dev mode**

Run: `pnpm dev`
Expected: App launches without errors

**Step 3: Manual testing checklist**

Test each animation in the Settings dialog:
- [ ] Dialog opens with existing animation (should still work)
- [ ] Provider card selection has smooth border/background transition
- [ ] Connected badge fades in when provider connects
- [ ] "Show All" expands grid with staggered card animation
- [ ] "Hide" collapses grid smoothly
- [ ] ProviderSettingsPanel slides down when provider selected
- [ ] Switching providers crossfades the form content
- [ ] Error messages fade in/out smoothly
- [ ] Model selector dropdown animates open/close
- [ ] Connect → Connected state transition is smooth
- [ ] Close warning alert fades in
- [ ] Debug mode section appears with panel

**Step 4: Run E2E tests**

Run: `pnpm -F @accomplish/desktop test:e2e`
Expected: All tests pass (animations shouldn't break functionality)

**Step 5: Create final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore(settings): animation polish and cleanup"
```

---

## Summary

| Task | Component | Animation Type |
|------|-----------|----------------|
| 1 | animations.ts | Add variants |
| 2 | FormError | Fade + slide |
| 3 | ModelSelector | Scale dropdown |
| 4 | ProviderCard | Badge fade |
| 5 | ProviderGrid | Staggered expand |
| 6 | ProviderSettingsPanel | Slide down + crossfade |
| 7-11 | Provider Forms (5) | State transitions |
| 12 | SettingsDialog | Warning + panel animations |
| 13 | Verification | Testing |

Total: 12 files modified, ~300 lines of animation code
