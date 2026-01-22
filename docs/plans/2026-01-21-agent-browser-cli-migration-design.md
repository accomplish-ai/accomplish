# Agent-Browser CLI Migration Design

**Date:** 2026-01-21
**Status:** Pending Approval

## Overview

Replace the custom `agent-browser-mcp` with the vanilla `agent-browser` CLI from Vercel Labs. The CLI connects to our existing dev-browser server via CDP, preserving anti-detection while eliminating custom MCP code.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    UNCHANGED                                │
│  dev-browser server (rebrowser-playwright + System Chrome)  │
│  - Anti-detection patches (rebrowser-playwright)            │
│  - System Chrome preference (faster, less detectable)       │
│  - CDP endpoint on port 9224                                │
└─────────────────────────────────────────────────────────────┘
                          ↑ CDP Connection
┌─────────────────────────────────────────────────────────────┐
│                    NEW                                      │
│  agent-browser CLI (bundled via npm)                        │
│  - Connects via: agent-browser connect 9224                 │
│  - OpenCode calls via Bash tool                             │
│  - Output optimized for LLMs (refs like @e1, @e2)           │
└─────────────────────────────────────────────────────────────┘
```

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Anti-detection | Keep rebrowser-playwright | Required - cannot lose bot detection protection |
| System Chrome | Keep preference | Required - faster startup, less detectable |
| Browser server | Keep dev-browser | Provides CDP endpoint with anti-detection |
| CLI tool | Use vanilla agent-browser | No custom MCP code to maintain |
| Invocation | Bash tool | How agent-browser is designed to be used |

## Benefits

1. **No custom MCP code** - Eliminates ~800 lines of custom MCP wrapper
2. **Upstream updates** - Get agent-browser improvements via `npm update`
3. **LLM-optimized output** - agent-browser designed for AI agents
4. **Simpler architecture** - CLI → CDP → Browser (no MCP layer)

## Files to Delete

```
apps/desktop/skills/agent-browser-mcp/     # Entire directory (~800 lines)
├── package.json
├── src/
│   └── index.ts
├── SKILL.md
└── node_modules/
```

## Files to Modify

### 1. `apps/desktop/package.json`

Add agent-browser dependency, remove agent-browser-mcp build steps:

```json
{
  "dependencies": {
    "agent-browser": "^0.1.0"
  },
  "scripts": {
    "postinstall": "electron-rebuild && npm --prefix skills/dev-browser install && npm --prefix skills/file-permission install && npm --prefix skills/ask-user-question install",
    "build": "tsc && vite build && npm --prefix skills/dev-browser install --omit=dev && npm --prefix skills/file-permission install --omit=dev && npm --prefix skills/ask-user-question install --omit=dev"
  }
}
```

### 2. `apps/desktop/src/main/opencode/config-generator.ts`

**Remove MCP config for agent-browser-mcp:**

```typescript
// DELETE this from mcp config:
'agent-browser-mcp': {
  type: 'local',
  command: ['npx', 'tsx', path.join(skillsPath, 'agent-browser-mcp', 'src', 'index.ts')],
  enabled: true,
  environment: {
    ACCOMPLISH_TASK_ID: '${TASK_ID}',
  },
  timeout: 30000,
},
```

**Update system prompt to use CLI commands:**

```typescript
const ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE = `<identity>
You are Accomplish, a browser automation assistant.
</identity>

{{ENVIRONMENT_INSTRUCTIONS}}

<capabilities>
When users ask about your capabilities, mention:
- **Browser Automation**: Control web browsers, navigate sites, fill forms, click buttons
- **File Management**: Sort, rename, and move files based on content or rules you give it
</capabilities>

<important name="filesystem-rules">
... (unchanged)
</important>

<important name="user-communication">
CRITICAL: The user CANNOT see your text output or CLI prompts!
To ask ANY question or get user input, you MUST use the AskUserQuestion MCP tool.
See the ask-user-question skill for full documentation and examples.
</important>

<tool name="agent-browser">
Use the agent-browser CLI for all browser automation. Run commands via Bash.

**Connection:** The browser is pre-connected. Just run commands directly.

**Core Commands:**
- \`agent-browser open <url>\` - Navigate to URL
- \`agent-browser snapshot\` - Get page content with element refs (@e1, @e2, etc.)
- \`agent-browser snapshot -i\` - Interactive elements only (recommended)
- \`agent-browser click <ref>\` - Click element (e.g., \`agent-browser click @e5\`)
- \`agent-browser fill <ref> <text>\` - Fill input field
- \`agent-browser press <key>\` - Press keyboard key (Enter, Tab, Escape, etc.)
- \`agent-browser screenshot\` - Take screenshot

**Navigation:**
- \`agent-browser back\` - Go back
- \`agent-browser forward\` - Go forward
- \`agent-browser reload\` - Reload page

**Information:**
- \`agent-browser get url\` - Get current URL
- \`agent-browser get title\` - Get page title
- \`agent-browser get text <ref>\` - Get element text

**Tabs:**
- \`agent-browser tab list\` - List all tabs
- \`agent-browser tab new <url>\` - Open new tab
- \`agent-browser tab switch <index>\` - Switch to tab
- \`agent-browser tab close\` - Close current tab

**Selectors:** Use refs from snapshot (@e1, @e2) or CSS selectors.

**Example workflow:**
\`\`\`bash
# Navigate to a page
agent-browser open "https://google.com"

# Get interactive elements
agent-browser snapshot -i
# Output: @e1 textbox "Search" | @e2 button "Google Search"

# Fill search box and submit
agent-browser fill @e1 "cute puppies"
agent-browser press Enter

# Check results
agent-browser snapshot -i
\`\`\`
</tool>

<behavior>
- Use agent-browser CLI (via Bash) for all web automation
- **NEVER use shell commands like open, xdg-open, start** to open browsers - use agent-browser
- Run \`agent-browser snapshot -i\` to see interactive elements before clicking
- Use element refs (@e1, @e2) from snapshot output for interactions
- After clicking links, check for new tabs with \`agent-browser tab list\`

**BROWSER ACTION VERBOSITY - Be descriptive about web interactions:**
- Before each action, briefly explain what you're about to do
- After navigation: mention the page title and what you see
- After clicking: describe what happened (new page, form appeared, etc.)
- When analyzing a snapshot: describe the key elements you found

**TASK COMPLETION - CRITICAL:**
You may ONLY finish a task when ONE of these conditions is met:

1. **SUCCESS**: You have verified that EVERY part of the user's request is complete
   - Review the original request and check off each requirement
   - Provide a summary: "Task completed. Here's what I did: [list each step and result]"

2. **CANNOT COMPLETE**: You encountered a blocker you cannot resolve
   - Explain what went wrong or what's blocking you
   - State what remains to be done

**NEVER** stop without either a completion summary or an explanation of why you couldn't finish.
</behavior>
`;
```

### 3. `apps/desktop/src/main/opencode/task-manager.ts`

Add agent-browser connection at task start:

```typescript
// In startTask() or wherever dev-browser is started:

// After dev-browser is ready on port 9224...
import { spawn } from 'child_process';
import { getAgentBrowserPath } from '../utils/bundled-node';

async function connectAgentBrowser(): Promise<void> {
  const agentBrowserPath = getAgentBrowserPath(); // or use npx

  return new Promise((resolve, reject) => {
    const proc = spawn(agentBrowserPath, ['connect', '9224'], {
      stdio: 'pipe',
      env: {
        ...process.env,
        // Ensure bundled node is in PATH for agent-browser
        PATH: `${bundledPaths?.binDir}:${process.env.PATH}`,
      },
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log('[Agent Browser] Connected to CDP on port 9224');
        resolve();
      } else {
        reject(new Error(`agent-browser connect failed with code ${code}`));
      }
    });

    // Timeout after 10 seconds
    setTimeout(() => reject(new Error('agent-browser connect timeout')), 10000);
  });
}
```

### 4. `apps/desktop/skills/agent-browser/SKILL.md` (new file)

Create a SKILL.md for OpenCode to reference:

```markdown
# Agent Browser CLI

Browser automation CLI for AI agents. Pre-connected to anti-detection browser.

## Quick Reference

### Navigation
| Command | Description |
|---------|-------------|
| `agent-browser open <url>` | Navigate to URL |
| `agent-browser back` | Go back |
| `agent-browser forward` | Go forward |
| `agent-browser reload` | Reload page |

### Page Analysis
| Command | Description |
|---------|-------------|
| `agent-browser snapshot` | Full accessibility tree |
| `agent-browser snapshot -i` | Interactive elements only (recommended) |
| `agent-browser snapshot -i -c` | Compact interactive elements |

### Interactions
| Command | Description |
|---------|-------------|
| `agent-browser click <ref>` | Click element |
| `agent-browser fill <ref> <text>` | Fill input field |
| `agent-browser press <key>` | Press key (Enter, Tab, Escape) |
| `agent-browser hover <ref>` | Hover over element |
| `agent-browser select <ref> <value>` | Select dropdown option |
| `agent-browser check <ref>` | Check checkbox |
| `agent-browser scroll down` | Scroll down |

### Information
| Command | Description |
|---------|-------------|
| `agent-browser get url` | Get current URL |
| `agent-browser get title` | Get page title |
| `agent-browser get text <ref>` | Get element text |

### Tabs
| Command | Description |
|---------|-------------|
| `agent-browser tab list` | List all tabs |
| `agent-browser tab new <url>` | Open new tab |
| `agent-browser tab switch <n>` | Switch to tab index |
| `agent-browser tab close` | Close current tab |

### Capture
| Command | Description |
|---------|-------------|
| `agent-browser screenshot` | Take screenshot |
| `agent-browser screenshot <path>` | Save to file |

## Element Refs

Snapshot returns refs like `@e1`, `@e2`. Use these for interactions:

```bash
agent-browser snapshot -i
# Output:
# @e1 textbox "Email"
# @e2 textbox "Password"
# @e3 button "Sign In"

agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "password123"
agent-browser click @e3
```

## CRITICAL: Tab Awareness

**ALWAYS check for new tabs after clicking links!**

```bash
# Click a link
agent-browser click @e5

# Check if new tab opened
agent-browser tab list
# Output: 0: https://original.com (active)
#         1: https://newpage.com

# Switch to new tab
agent-browser tab switch 1

# Now snapshot the new tab
agent-browser snapshot -i
```

**Signs you're on wrong tab:**
- Page content unchanged after clicking link
- Expected elements not found
- URL still shows old page
```

## Files Unchanged

```
apps/desktop/skills/dev-browser/           # Keeps rebrowser-playwright, anti-detection
packages/shared/src/constants.ts           # Keeps DEV_BROWSER_PORT = 9224
apps/desktop/skills/file-permission/       # Unchanged
apps/desktop/skills/ask-user-question/     # Unchanged
```

## Implementation Steps

1. **Delete agent-browser-mcp directory**
2. **Add agent-browser to package.json dependencies**
3. **Update package.json scripts** (remove agent-browser-mcp build steps)
4. **Update config-generator.ts**:
   - Remove agent-browser-mcp from MCP config
   - Update system prompt to use CLI commands
5. **Update task-manager.ts**:
   - Add `agent-browser connect 9224` after dev-browser starts
6. **Create SKILL.md** for agent-browser reference
7. **Test the integration**

## Bundling for DMG/exe

agent-browser is an npm package with:
- Rust CLI binary (fast, ~5MB)
- Node.js fallback (works everywhere)

For Electron bundling:
1. Install as dependency: `npm install agent-browser`
2. The package auto-detects platform and uses appropriate binary
3. Ensure bundled Node.js is in PATH (existing pattern from CLAUDE.md)

```typescript
// When spawning agent-browser commands:
const env = {
  ...process.env,
  PATH: `${bundledPaths?.binDir}:${process.env.PATH}`,
};
spawn('npx', ['agent-browser', 'open', url], { env });
```

## Testing Plan

1. **Connection test**: Verify `agent-browser connect 9224` succeeds
2. **Navigation test**: `agent-browser open` navigates correctly
3. **Snapshot test**: Returns refs and content
4. **Interaction test**: Click, fill, press work with refs
5. **Tab test**: New tabs detected and switchable
6. **Anti-detection test**: Verify rebrowser-playwright still active (bot-detector.rebrowser.net)
7. **Packaging test**: Works in DMG/exe

## Rollback Plan

If issues arise, revert to MCP approach:
1. Restore agent-browser-mcp directory from git
2. Revert config-generator.ts changes
3. Revert package.json changes
