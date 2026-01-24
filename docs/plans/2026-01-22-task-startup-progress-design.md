# Task Startup Progress Indicators

## Problem

Users see "Thinking..." with a spinner for 4-12 seconds on first message with no indication of what's happening.

## Solution

Emit progress events at key stages from backend, display in existing indicator location with elapsed timer and progress dots.

## UI Design

```
[spinner] Connecting to Claude Sonnet...  (4s)
          ●●●○○
          First task takes a bit longer...  (cold start only)
```

### Components

- **Spinner** — Existing `SpinningIcon`
- **Label** — Stage text, dynamic
- **Elapsed time** — "(Xs)" counter, resets when first tool runs
- **Progress dots** — Stage progress visualization
- **Subtext** — Cold start hint (first task only)

## Stages

| # | Stage ID | Label | When |
|---|----------|-------|------|
| 1 | `starting` | Starting task... | Task created |
| 2 | `browser` | Preparing browser... | Cold start only |
| 3 | `environment` | Setting up environment... | Config + API keys |
| 4 | `loading` | Loading agent... | CLI spawning |
| 5 | `connecting` | Connecting to {model}... | `step_start` received |
| 6 | `waiting` | Waiting for response... | 500ms after connecting |
| — | (tool) | Tool labels | Existing behavior |

## Backend Changes

### task-manager.ts

```typescript
// executeTask() - emit early stages
callbacks.onProgress({ stage: 'starting', message: 'Starting task...' });

// Before ensureDevBrowserServer (cold start only)
if (isFirstTask) {
  callbacks.onProgress({ stage: 'browser', message: 'Preparing browser...' });
}

// After browser ready
callbacks.onProgress({ stage: 'environment', message: 'Setting up environment...' });
```

### adapter.ts

```typescript
// After PTY spawn
this.emit('progress', { stage: 'loading', message: 'Loading agent...' });

// On step_start received
this.emit('progress', {
  stage: 'connecting',
  message: `Connecting to ${modelDisplayName}...`
});

// Timed transition (500ms after connecting, no tool yet)
this.emit('progress', { stage: 'waiting', message: 'Waiting for response...' });
```

### Cold Start Detection

- Track `isFirstTask` flag in TaskManager
- Set `true` initially, flip to `false` after first task completes browser setup

### Model Display Name Helper

```typescript
function getModelDisplayName(modelId: string): string {
  // claude-sonnet-4-20250514 → "Claude Sonnet"
  // gpt-4o → "GPT-4o"
  // gemini-2.0-flash → "Gemini Flash"
}
```

## Frontend Changes

### Execution.tsx

**New state:**
```typescript
const [startupStage, setStartupStage] = useState<string | null>(null);
const [elapsedTime, setElapsedTime] = useState(0);
const [isFirstTask, setIsFirstTask] = useState(false);
```

**Stage-to-dot mapping:**
```typescript
const STAGE_ORDER = ['starting', 'browser', 'environment', 'loading', 'connecting', 'waiting'];

function getStageDotCount(stage: string, isFirstTask: boolean): [filled: number, total: number] {
  const stages = isFirstTask ? STAGE_ORDER : STAGE_ORDER.filter(s => s !== 'browser');
  const index = stages.indexOf(stage);
  return [index + 1, stages.length];
}
```

**Elapsed timer:**
- Start when task status becomes `'running'`
- Increment every second
- Stop when first tool arrives

## Edge Cases

| Case | Behavior |
|------|----------|
| Task errors during startup | Stop timer, show error |
| User cancels during startup | Stop timer, hide indicator |
| Very fast response (<1s) | Dots jump quickly — acceptable |
| Follow-up message (session resume) | Skip to "Waiting for response..." |
| Non-cold start | Skip browser stage, adjust dot count |

## Files to Modify

| File | Changes |
|------|---------|
| `apps/desktop/src/main/opencode/task-manager.ts` | Emit progress events, track cold start |
| `apps/desktop/src/main/opencode/adapter.ts` | Emit progress events for CLI stages |
| `apps/desktop/src/renderer/pages/Execution.tsx` | Handle stages, render dots/timer |
| `packages/shared/src/types/task.ts` | Add stage types (optional) |
