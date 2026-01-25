# Token Optimization Design for dev-browser-mcp

## Problem Statement

Browser accessibility tree snapshots on complex pages (e.g., Zillow, Amazon) can contain 5,000+ elements, causing:
- Single snapshots of 50K+ tokens
- Session accumulation to 300K+ tokens
- Tasks failing with "prompt is too long" errors

## Industry Research

This design is informed by how production browser automation agents solve this problem:

### Sources

1. **[Vercel agent-browser](https://github.com/vercel-labs/agent-browser)** - Achieves 93% context reduction through aggressive filtering and compact refs system. [Analysis](https://paddo.dev/blog/agent-browser-context-efficiency/)

2. **[Anthropic Context Engineering Guide](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)** - Recommends single snapshot retention, compaction, and treating context as finite resource with diminishing returns.

3. **[D2Snap/Webfuse](https://www.webfuse.com/blog/dom-downsampling-for-llm-based-web-agents)** - Adaptive token budget targeting with hierarchy preservation. Research shows hierarchy is the strongest UI feature for LLM performance.

4. **[browser-use](https://docs.browser-use.com/customize/agent/all-parameters)** - Uses `max_history_items` for context management and vision detail levels for token optimization.

5. **[Will Larson on Progressive Disclosure](https://lethain.com/agents-large-files/)** - Metadata-first approach with selective loading for large content.

6. **[Context Window Management (Maxim AI)](https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/)** - Documents "lost-in-the-middle" effect and effective context length limits.

### Key Industry Insights

| Technique | Who Uses It | Result |
|-----------|-------------|--------|
| Interactive-only + aggressive limits | agent-browser | 93% reduction |
| Single snapshot retention | Anthropic guidance | Prevents accumulation |
| Token budget targeting | D2Snap | Auto-tunes to hit target |
| Hierarchy preservation | D2Snap research | Maintains LLM performance |
| Refs system (`@e1`, `@e2`) | agent-browser, dev-browser | Compact action references |

## Current State

The `dev-browser-mcp` implementation already has:
- Refs system (`e1`, `e2`, etc.) for element identification
- Snapshot diffing via `SnapshotManager`
- YAML-based accessibility tree output
- `interactiveOnly` mode (captures all interactive elements without limits)

**Gap:** No element limits, no token budgeting, no context management beyond single-snapshot diffing.

## Proposed Architecture

### 3-Tier Optimization System

```
┌─────────────────────────────────────────────────────────────┐
│                    Tier 1: Filtering                        │
│  maxElements: 300 | interactiveOnly | viewport priority     │
├─────────────────────────────────────────────────────────────┤
│                  Tier 2: Token Budget                       │
│  maxTokens: 8000 | adaptive truncation | estimation         │
├─────────────────────────────────────────────────────────────┤
│                Tier 3: Context Management                   │
│  single snapshot | session compaction | deduplication       │
└─────────────────────────────────────────────────────────────┘
```

### What We're NOT Doing

Based on research, these approaches are either harmful or premature:

- **`maxDepth` parameter** - D2Snap research shows hierarchy is the most valuable feature; flattening hurts LLM performance more than it helps token counts.

- **Keeping 3 snapshots** - Anthropic explicitly recommends single snapshot retention. Multiple snapshots cause the accumulation problem we're trying to solve.

- **Progressive disclosure (Phase 1)** - Requires significant prompt engineering investment. Save for future iteration once basics are proven.

## Implementation Plan

### Phase 1: Aggressive Filtering (P0)

**Goal:** Immediate relief for worst-case pages.

**Changes to `src/snapshot/browser-script.ts`:**

```typescript
interface SnapshotOptions {
  maxElements?: number;      // Default: 300
  viewportOnly?: boolean;    // Default: false
  interactiveOnly?: boolean; // Default: true
}

// Priority scoring for elements
function getElementPriority(role: string, inViewport: boolean): number {
  const rolePriority: Record<string, number> = {
    button: 100,
    textbox: 95,
    checkbox: 90,
    radio: 90,
    combobox: 85,
    link: 80,
    menuitem: 70,
    tab: 70,
    // ... other roles default to 50
  };
  const base = rolePriority[role] ?? 50;
  return inViewport ? base + 50 : base;
}
```

**Changes to `src/snapshot/manager.ts`:**

```typescript
interface SnapshotManagerOptions {
  fullSnapshot?: boolean;
  interactiveOnly?: boolean;
  maxElements?: number;      // NEW
  viewportOnly?: boolean;    // NEW
}
```

**Output format change:**

```yaml
# Header with metadata
# URL: https://zillow.com/homes/...
# Elements: 300 of 5538 (truncated, prioritized by interactivity)
# Tokens: ~4,500 (estimated)

- button "Search" [ref=e1]
- textbox "Location" [ref=e2]
# ... up to 300 elements
```

### Phase 2: Token Budget System (P1)

**Goal:** Predictable token usage regardless of page complexity.

**New function in `browser-script.ts`:**

```typescript
function estimateTokens(element: AriaNode): number {
  // Average: ~15 tokens per element
  // role (1-2) + name (varies) + attributes (2-5) + yaml overhead (5)
  const nameTokens = Math.ceil((element.name?.length || 0) / 4);
  return 5 + Math.min(nameTokens, 50) + 5; // Cap name contribution
}

function generateAriaTree(root: Element, options: SnapshotOptions) {
  const maxTokens = options.maxTokens ?? 8000;
  let tokenCount = 0;
  const elements: AriaNode[] = [];

  for (const element of prioritizedElements) {
    const tokens = estimateTokens(element);
    if (tokenCount + tokens > maxTokens) break;
    tokenCount += tokens;
    elements.push(element);
  }

  return { elements, tokenCount, truncated: prioritizedElements.length > elements.length };
}
```

**Changes to `src/snapshot/types.ts`:**

```typescript
export interface ParsedSnapshot {
  url: string;
  title: string;
  timestamp: number;
  elements: Map<string, SnapshotElement>;
  rawYaml: string;
  tokenCount?: number;    // NEW
  truncated?: boolean;    // NEW
  totalElements?: number; // NEW
}
```

### Phase 3: Context Management (P2)

**Goal:** Prevent session-level token accumulation.

**Changes to `src/snapshot/manager.ts`:**

```typescript
export class SnapshotManager {
  private lastSnapshot: ParsedSnapshot | null = null;
  private sessionHistory: SessionHistoryEntry[] = []; // NEW
  private navPatternHashes: Set<string> = new Set();  // NEW

  processSnapshot(rawYaml: string, url: string, title: string, options: SnapshotManagerOptions): SnapshotResult {
    // ... existing logic ...

    // Add to session history (compact form)
    this.sessionHistory.push({
      url,
      title,
      timestamp: Date.now(),
      actionsTaken: [], // Populated by action handlers
    });

    // Trim history to last 10 pages
    if (this.sessionHistory.length > 10) {
      this.sessionHistory = this.sessionHistory.slice(-10);
    }
  }

  getSessionSummary(): string {
    // Returns: "Previously visited: Login page (authenticated) → Dashboard → Settings"
    return this.sessionHistory
      .map(h => h.title || new URL(h.url).pathname)
      .join(' → ');
  }
}
```

**New file: `src/snapshot/compactor.ts`:**

```typescript
/**
 * Hash navigation patterns for deduplication.
 * If nav/footer is identical to previous page, skip it.
 */
export function hashNavigationPattern(elements: SnapshotElement[]): string {
  const navElements = elements.filter(e =>
    e.role === 'navigation' || e.role === 'banner' || e.role === 'contentinfo'
  );
  const signature = navElements.map(e => `${e.role}:${e.name}`).join('|');
  return createHash('md5').update(signature).digest('hex').slice(0, 8);
}

/**
 * Generate compact session history for context.
 */
export function summarizeSession(history: SessionHistoryEntry[]): string {
  if (history.length === 0) return '';
  if (history.length === 1) return `Currently on: ${history[0].title}`;

  const recent = history.slice(-5);
  return `Navigation history: ${recent.map(h => h.title || 'Page').join(' → ')}`;
}
```

## API Changes

### New Parameters for `browser_snapshot` Tool

```typescript
interface BrowserSnapshotParams {
  // Existing
  fullSnapshot?: boolean;
  interactiveOnly?: boolean;

  // New in Phase 1
  maxElements?: number;      // Default: 300, max: 1000
  viewportOnly?: boolean;    // Default: false

  // New in Phase 2
  maxTokens?: number;        // Default: 8000, max: 50000

  // New in Phase 3
  includeHistory?: boolean;  // Default: true, adds session summary
}
```

### Backward Compatibility

- All new parameters have sensible defaults
- Existing behavior preserved when no parameters specified
- `fullSnapshot: true` bypasses all limits (escape hatch)

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Elements per snapshot | 5,538 | ≤300 | Log in snapshot metadata |
| Tokens per snapshot | ~50K | ≤8K | Token estimation function |
| Session accumulation | 300K+ | ≤100K | Sum across task session |
| Task completion rate | ~80% | >95% | E2E test pass rate |
| "Prompt too long" errors | Common | Rare | Error log monitoring |

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Over-aggressive filtering misses needed elements | Medium | High | `fullSnapshot` escape hatch; clear truncation warnings; agent can request more |
| Token estimation inaccurate | Low | Medium | Calibrate against real token counts; add 20% buffer |
| Viewport detection fails on SPAs | Low | Medium | Fall back to priority-only sorting |
| Breaking change for existing workflows | Low | Low | Defaults preserve existing behavior initially |

## Testing Strategy

### Unit Tests
- Priority scoring returns expected values
- Token estimation within 20% of actual
- Truncation respects limits
- Navigation pattern hashing is stable

### Integration Tests
- Snapshot on complex pages (Zillow, Amazon, GitHub)
- Verify refs still work for click/type actions after truncation
- Session history accumulates correctly

### E2E Tests
- Complete multi-step task on Zillow without token overflow
- Verify task completion rate improvement

## Rollout Plan

### Week 1: Phase 1
- Implement `maxElements` and priority scoring
- Default to 300 elements
- Ship behind feature flag, test internally

### Week 2: Phase 2
- Implement token budget system
- Add estimation function
- Calibrate against real usage

### Week 3: Phase 3
- Implement session history
- Add navigation deduplication
- Full rollout

## Future Considerations (Not in Scope)

These are valuable but require more investment:

1. **Progressive Disclosure** - Return structure first, let agent request `expand @e5` for children. Requires prompt engineering.

2. **Compact Output Format** - Agent-browser style (`@e1: button "Sign In"`) instead of YAML. Breaking change.

3. **Adaptive Downsampling (D2Snap)** - Merge containers, summarize text. Complex algorithm.

4. **Multi-Agent Architecture** - Delegate detailed page analysis to sub-agents. Architectural change.

## References

- [Vercel agent-browser GitHub](https://github.com/vercel-labs/agent-browser)
- [agent-browser Context Efficiency Analysis](https://paddo.dev/blog/agent-browser-context-efficiency/)
- [Anthropic: Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [D2Snap: DOM Downsampling for LLM-Based Web Agents](https://www.webfuse.com/blog/dom-downsampling-for-llm-based-web-agents)
- [browser-use Documentation](https://docs.browser-use.com/customize/agent/all-parameters)
- [Will Larson: Progressive Disclosure in Agents](https://lethain.com/agents-large-files/)
- [Context Window Management Strategies](https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/)
