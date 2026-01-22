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
