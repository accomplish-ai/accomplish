# Agent-Browser CLI Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace custom agent-browser-mcp with vanilla agent-browser CLI, connecting to dev-browser via CDP for anti-detection.

**Architecture:** Keep dev-browser server (rebrowser-playwright + system Chrome) providing CDP on port 9224. Bundle agent-browser CLI and connect it to dev-browser. OpenCode agent uses Bash commands (`agent-browser open`, `agent-browser click @e1`) instead of MCP tools.

**Tech Stack:** agent-browser (npm), dev-browser server (rebrowser-playwright), Electron, OpenCode CLI

---

## Task 1: Delete agent-browser-mcp Directory

**Files:**
- Delete: `apps/desktop/skills/agent-browser-mcp/` (entire directory)

**Step 1: Verify directory exists**

Run: `ls -la apps/desktop/skills/agent-browser-mcp/`
Expected: Shows package.json, src/, node_modules/

**Step 2: Delete the directory**

Run: `rm -rf apps/desktop/skills/agent-browser-mcp`

**Step 3: Verify deletion**

Run: `ls apps/desktop/skills/`
Expected: Shows dev-browser/, file-permission/, ask-user-question/ (no agent-browser-mcp)

**Step 4: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: delete agent-browser-mcp directory

Removing custom MCP wrapper in preparation for vanilla agent-browser CLI.
EOF
)"
```

---

## Task 2: Add agent-browser Dependency to package.json

**Files:**
- Modify: `apps/desktop/package.json`

**Step 1: Add agent-browser to dependencies**

In `apps/desktop/package.json`, add to `dependencies`:

```json
"agent-browser": "^0.1.0",
```

Add it after the existing dependencies (alphabetically near the top).

**Step 2: Update postinstall script**

Change line 9 from:
```json
"postinstall": "electron-rebuild && npm --prefix skills/dev-browser install && npm --prefix skills/agent-browser-mcp install && npm --prefix skills/file-permission install && npm --prefix skills/ask-user-question install",
```

To:
```json
"postinstall": "electron-rebuild && npm --prefix skills/dev-browser install && npm --prefix skills/file-permission install && npm --prefix skills/ask-user-question install",
```

**Step 3: Update build script**

Change line 12 from:
```json
"build": "tsc && vite build && npm --prefix skills/dev-browser install --omit=dev && npm --prefix skills/agent-browser-mcp install --omit=dev && npm --prefix skills/file-permission install --omit=dev && npm --prefix skills/ask-user-question install --omit=dev",
```

To:
```json
"build": "tsc && vite build && npm --prefix skills/dev-browser install --omit=dev && npm --prefix skills/file-permission install --omit=dev && npm --prefix skills/ask-user-question install --omit=dev",
```

**Step 4: Install dependencies**

Run: `cd apps/desktop && pnpm install`
Expected: agent-browser installed, no errors

**Step 5: Verify agent-browser installed**

Run: `ls apps/desktop/node_modules/agent-browser/`
Expected: Shows package.json, bin/, etc.

**Step 6: Commit**

```bash
git add apps/desktop/package.json apps/desktop/pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat: add agent-browser CLI dependency

Replace custom MCP with vanilla CLI from Vercel Labs.
EOF
)"
```

---

## Task 3: Update Electron Build Config for agent-browser

**Files:**
- Modify: `apps/desktop/package.json` (build section)

**Step 1: Add agent-browser to files array**

In the `build.files` array (around line 103), add:
```json
"node_modules/agent-browser/**",
```

**Step 2: Add agent-browser bin to asarUnpack**

In the `build.asarUnpack` array (around line 119), add:
```json
"node_modules/agent-browser/bin/**",
"node_modules/agent-browser/package.json",
```

This ensures the CLI binary is accessible outside the asar archive.

**Step 3: Verify JSON is valid**

Run: `cd apps/desktop && node -e "require('./package.json')"`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/desktop/package.json
git commit -m "$(cat <<'EOF'
build: include agent-browser in Electron package

Unpack binary from asar for CLI execution.
EOF
)"
```

---

## Task 4: Remove agent-browser-mcp from MCP Config

**Files:**
- Modify: `apps/desktop/src/main/opencode/config-generator.ts:591-600`

**Step 1: Remove agent-browser-mcp from mcp config**

Delete these lines (around 591-600):
```typescript
      'agent-browser-mcp': {
        type: 'local',
        command: ['npx', 'tsx', path.join(skillsPath, 'agent-browser-mcp', 'src', 'index.ts')],
        enabled: true,
        environment: {
          ACCOMPLISH_TASK_ID: '${TASK_ID}',
        },
        timeout: 30000,  // Longer timeout for browser operations
      },
```

**Step 2: Verify TypeScript compiles**

Run: `cd apps/desktop && pnpm typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/desktop/src/main/opencode/config-generator.ts
git commit -m "$(cat <<'EOF'
refactor: remove agent-browser-mcp from MCP config

CLI will be invoked via Bash, not MCP.
EOF
)"
```

---

## Task 5: Update System Prompt for CLI Usage

**Files:**
- Modify: `apps/desktop/src/main/opencode/config-generator.ts:70-207`

**Step 1: Replace the system prompt template**

Replace the entire `ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE` constant (lines ~70-207) with:

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
##############################################################################
# CRITICAL: FILE PERMISSION WORKFLOW - NEVER SKIP
##############################################################################

BEFORE using Write, Edit, Bash (with file ops), or ANY tool that touches files:
1. FIRST: Call request_file_permission tool and wait for response
2. ONLY IF response is "allowed": Proceed with the file operation
3. IF "denied": Stop and inform the user

WRONG (never do this):
  Write({ path: "/tmp/file.txt", content: "..." })  <- NO! Permission not requested!

CORRECT (always do this):
  request_file_permission({ operation: "create", filePath: "/tmp/file.txt" })
  -> Wait for "allowed"
  Write({ path: "/tmp/file.txt", content: "..." })  <- OK after permission granted

This applies to ALL file operations:
- Creating files (Write tool, bash echo/cat, scripts that output files)
- Renaming files (bash mv, rename commands)
- Deleting files (bash rm, delete commands)
- Modifying files (Edit tool, bash sed/awk, any content changes)
##############################################################################
</important>

<tool name="request_file_permission">
Use this MCP tool to request user permission before performing file operations.

<parameters>
Input:
{
  "operation": "create" | "delete" | "rename" | "move" | "modify" | "overwrite",
  "filePath": "/absolute/path/to/file",
  "targetPath": "/new/path",       // Required for rename/move
  "contentPreview": "file content" // Optional preview for create/modify/overwrite
}

Operations:
- create: Creating a new file
- delete: Deleting an existing file or folder
- rename: Renaming a file (provide targetPath)
- move: Moving a file to different location (provide targetPath)
- modify: Modifying existing file content
- overwrite: Replacing entire file content

Returns: "allowed" or "denied" - proceed only if allowed
</parameters>
</tool>

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
\\\`\\\`\\\`bash
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
\\\`\\\`\\\`
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

**Step 2: Verify TypeScript compiles**

Run: `cd apps/desktop && pnpm typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/desktop/src/main/opencode/config-generator.ts
git commit -m "$(cat <<'EOF'
feat: update system prompt for agent-browser CLI

Replace MCP tool instructions with CLI commands.
EOF
)"
```

---

## Task 6: Add agent-browser Connection to Task Manager

**Files:**
- Modify: `apps/desktop/src/main/opencode/task-manager.ts`

**Step 1: Add connectAgentBrowser function**

After the `waitForDevBrowserServer` function (around line 174), add:

```typescript
/**
 * Connect agent-browser CLI to the dev-browser CDP endpoint.
 * This allows agent-browser commands to use our anti-detection browser.
 */
async function connectAgentBrowser(): Promise<void> {
  const bundledPaths = getBundledNodePaths();

  // Build environment with bundled node in PATH
  let spawnEnv: NodeJS.ProcessEnv = { ...process.env };
  if (bundledPaths) {
    const delimiter = process.platform === 'win32' ? ';' : ':';
    spawnEnv.PATH = `${bundledPaths.binDir}${delimiter}${process.env.PATH || ''}`;
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['agent-browser', 'connect', String(DEV_BROWSER_PORT)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: spawnEnv,
      shell: process.platform === 'win32',
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log('[TaskManager] agent-browser connected to CDP on port', DEV_BROWSER_PORT);
        resolve();
      } else {
        console.error('[TaskManager] agent-browser connect failed:', stderr || stdout);
        // Don't reject - let the agent handle connection errors
        resolve();
      }
    });

    proc.on('error', (err) => {
      console.error('[TaskManager] agent-browser connect error:', err);
      // Don't reject - let the agent handle connection errors
      resolve();
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      proc.kill();
      console.warn('[TaskManager] agent-browser connect timeout');
      resolve();
    }, 10000);
  });
}
```

**Step 2: Call connectAgentBrowser in ensureDevBrowserServer**

In the `ensureDevBrowserServer` function, after the server is started (around line 252), add:

```typescript
    // Connect agent-browser to the dev-browser CDP endpoint
    console.log('[TaskManager] Connecting agent-browser to dev-browser...');
    await connectAgentBrowser();
```

Add this right before the closing `} catch (error) {` of the try block (around line 253).

**Step 3: Verify TypeScript compiles**

Run: `cd apps/desktop && pnpm typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/desktop/src/main/opencode/task-manager.ts
git commit -m "$(cat <<'EOF'
feat: connect agent-browser to dev-browser CDP

Run 'agent-browser connect 9224' after dev-browser starts.
EOF
)"
```

---

## Task 7: Create SKILL.md for agent-browser

**Files:**
- Create: `apps/desktop/skills/agent-browser/SKILL.md`

**Step 1: Create directory**

Run: `mkdir -p apps/desktop/skills/agent-browser`

**Step 2: Create SKILL.md**

Create file `apps/desktop/skills/agent-browser/SKILL.md`:

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

**Step 3: Verify file created**

Run: `cat apps/desktop/skills/agent-browser/SKILL.md | head -20`
Expected: Shows the beginning of the SKILL.md file

**Step 4: Commit**

```bash
git add apps/desktop/skills/agent-browser/SKILL.md
git commit -m "$(cat <<'EOF'
docs: add SKILL.md for agent-browser CLI reference

Quick reference for OpenCode agent.
EOF
)"
```

---

## Task 8: Test the Integration

**Files:**
- None (testing only)

**Step 1: Start dev mode**

Run: `cd apps/desktop && pnpm dev`
Expected: Electron app launches without errors

**Step 2: Verify no MCP errors in console**

Check the terminal output for any errors related to agent-browser-mcp.
Expected: No "agent-browser-mcp" errors (since we removed it)

**Step 3: Test a browser task**

In the app, start a task like "Go to google.com and search for 'hello world'"
Expected: Agent uses `agent-browser` CLI commands via Bash

**Step 4: Verify anti-detection**

Have the agent navigate to `https://bot-detector.rebrowser.net/`
Expected: Should pass most/all tests (rebrowser-playwright still active)

**Step 5: Document any issues**

If tests fail, note the specific failures for debugging.

---

## Task 9: Final Cleanup and Verification

**Files:**
- None (verification only)

**Step 1: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck`
Expected: No errors

**Step 2: Run lint**

Run: `cd apps/desktop && pnpm lint`
Expected: No errors

**Step 3: Verify git status is clean**

Run: `git status`
Expected: All changes committed

**Step 4: Create summary commit (if needed)**

If any loose changes remain:
```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: complete agent-browser CLI migration

- Removed custom agent-browser-mcp (~800 lines)
- Added vanilla agent-browser CLI from Vercel Labs
- CLI connects to dev-browser CDP for anti-detection
- OpenCode agent uses Bash commands instead of MCP tools
EOF
)"
```

---

## Summary of Changes

| File | Action |
|------|--------|
| `skills/agent-browser-mcp/` | Deleted |
| `skills/agent-browser/SKILL.md` | Created |
| `package.json` | Added agent-browser dep, updated scripts, updated build config |
| `config-generator.ts` | Removed MCP config, updated system prompt |
| `task-manager.ts` | Added connectAgentBrowser() function |

## Rollback

To revert this migration:
```bash
git revert HEAD~9..HEAD  # Revert all 9 commits
```

Or restore from the previous branch state.
