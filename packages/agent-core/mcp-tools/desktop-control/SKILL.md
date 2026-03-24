---
name: desktop-control
description: Native desktop automation — mouse clicks, keyboard input, window management, and screenshots. ALWAYS requires user approval for every action. Use these tools for interacting with native desktop applications beyond CLI and browser.
---

# Desktop Control

Native desktop automation using MCP tools. Use these tools for interacting with native desktop applications.

## CRITICAL: Every Action Requires User Approval

**ALL desktop actions require per-action user approval.** The user will see a permission dialog describing the exact action before it executes. If denied, the action returns an error.

## CRITICAL: Sensitive App Blocklist

The following apps are **automatically blocked** and cannot be automated:

- **Password managers**: 1Password, Bitwarden, LastPass, KeePass, Dashlane
- **System security**: Keychain Access, Credential Manager, Windows Security
- **Admin tools**: Registry Editor

Attempting to target a blocklisted window returns a `403` error with details.

## IMPORTANT: Use `needs_planning: true`

Desktop automation is inherently destructive. **ALL tasks involving desktop.\* tools MUST use `needs_planning: true`** in the `start_task` call. Plan your steps before executing them.

## Tools

**desktop.click(x, y)** — Click at pixel coordinates

- x, y: Required pixel coordinates
- Example: `desktop.click(640, 300)` → clicks at center of screen

**desktop.doubleClick(x, y)** — Double-click at coordinates

- x, y: Required pixel coordinates

**desktop.rightClick(x, y)** — Right-click at coordinates

- x, y: Required pixel coordinates

**desktop.moveMouse(x, y)** — Move cursor without clicking

- x, y: Required pixel coordinates

**desktop.scroll(direction, amount?)** — Scroll the view

- direction: `up`, `down`, `left`, `right`
- amount: Number of scroll units (default: 3)

**desktop.type(text)** — Type text at the current cursor focus

- text: The text string to type
- IMPORTANT: Make sure the target input is focused first (use `desktop.click` on it)

**desktop.hotkey(keys[])** — Press a keyboard shortcut

- keys: Array of key names, e.g. `["LeftControl", "C"]` for Ctrl+C
- Keys are pressed simultaneously and released
- Key names follow nut.js Key enum (e.g. `LeftControl`, `LeftAlt`, `LeftShift`, `Return`, `Space`, `Tab`, `Escape`, `Delete`, `Backspace`, `A`-`Z`, `F1`-`F12`)

**desktop.pressKey(keys[])** — Press and hold key(s)

- keys: Array of key names to press down
- Use with `desktop.releaseKey` for complex interactions

**desktop.releaseKey(keys[])** — Release held key(s)

- keys: Array of key names to release

**desktop.screenshot()** — Take a screenshot of the entire desktop

- Returns: base64-encoded image data with width/height

**desktop.listWindows()** — List all open application windows

- Returns: Array of `{ id, title, appName, bounds }` objects
- Use this to discover available windows before targeting them

**desktop.findWindow(title)** — Find windows matching a title pattern

- title: Regex pattern to match against window titles (case-insensitive)
- Returns: Array of matching window objects

**desktop.focusWindow(title)** — Bring a window to the foreground

- title: Window title (or partial match) to focus
- The window must exist and not be on the blocklist

**desktop.resizeWindow(title, width, height)** — Resize a window

- title: Window title to target
- width, height: New dimensions in pixels

**desktop.repositionWindow(title, x, y)** — Move a window on screen

- title: Window title to target
- x, y: New position coordinates

## Workflow

**ALWAYS follow this pattern:**

1. `desktop.screenshot()` — See what's currently on screen
2. `desktop.listWindows()` — Discover available windows
3. Plan your actions (what to click, where to type)
4. Execute actions ONE AT A TIME, getting approval for each
5. `desktop.screenshot()` — Verify the result after each step

### Example: Open Notepad and Type

```
1. desktop.focusWindow("Notepad")       → Bring Notepad to front
2. desktop.click(400, 300)              → Click in the text area
3. desktop.type("Hello World!")         → Type the text
4. desktop.screenshot()                 → Verify the text appeared
```

### Example: Take a Screenshot

```
1. desktop.screenshot()                 → Capture the current screen
```

### Example: Send a Slack Message

```
1. desktop.listWindows()                → Find Slack window
2. desktop.focusWindow("Slack")         → Bring Slack to front
3. desktop.screenshot()                 → See current state
4. desktop.click(x, y)                  → Click message input
5. desktop.type("Hello team!")          → Type the message
6. desktop.hotkey(["Return"])           → Press Enter to send
7. desktop.screenshot()                 → Verify message sent
```

## Error Recovery

| Error                                              | What it means                            | What to do                                                                   |
| -------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| "Action denied by user"                            | User clicked Deny in the approval dialog | Respect the denial, explain what you were trying to do                       |
| "Blocked: [app] is on the sensitive app blocklist" | Target window is a protected app         | Do NOT try to work around this — inform the user                             |
| "Failed to load @nut-tree/nut-js"                  | Native module not available              | Ensure Accessibility permission is granted (macOS) or run as admin (Windows) |
| "x and y coordinates are required"                 | Missing required parameters              | Always provide coordinates for mouse actions                                 |

## Platform Considerations

- **macOS**: Requires Accessibility permission in System Preferences → Privacy & Security → Accessibility
- **Windows**: Some window management actions may require Administrator privileges
- **Linux**: Window management uses `wmctrl` (must be installed)
- **Display scaling**: Coordinates are in physical pixels — use `desktop.screenshot()` to determine actual positions
- **Multi-monitor**: Coordinates span across all displays
