---
name: dev-browser
description: Browser automation via MCP tools. ALWAYS use these tools for ANY web task - navigating sites, clicking, typing, filling forms, taking screenshots, or extracting data. This is the ONLY way to control the browser.
---

# Dev Browser

Browser automation using MCP tools. Use these tools directly for all web automation tasks.

##############################################################################
# CRITICAL: PERFORMING AN ACTION ≠ VERIFICATION
##############################################################################

**THIS IS THE MOST IMPORTANT RULE. READ IT CAREFULLY.**

❌ "I typed the text" is NOT verification - you don't know if it worked
❌ "I clicked the button" is NOT verification - you don't know if it worked
❌ "I ran the command" is NOT verification - you don't know if it worked
❌ "I used browser_keyboard" is NOT verification - you don't know if it worked

✅ "I SEE 'Hello World' in the screenshot" IS verification
✅ "I SEE the title changed to 'MyDoc' in the screenshot" IS verification
✅ "The screenshot shows the text I typed" IS verification

**THE RULE:** If you cannot LITERALLY SEE the expected result in a SCREENSHOT,
the action FAILED. Period. No exceptions.

**Example of WRONG thinking:**
```
browser_keyboard(text="Hello World")
"✓ Typed 'Hello World'"  ← WRONG! You typed, but did it appear? TAKE A SCREENSHOT!
```

**Example of RIGHT thinking:**
```
browser_keyboard(text="Hello World")
browser_screenshot()
"Looking at screenshot... I can see 'Hello World' in the document body. VERIFIED."
```

##############################################################################
# THE OBSERVE-ACT-VERIFY LOOP (MANDATORY)
##############################################################################

For EVERY action, follow this loop:

### 1. OBSERVE: Capture current state BEFORE acting
```
browser_screenshot()
"BEFORE STATE: Document title is 'Untitled document'. Tab count: 1."
```

### 2. DEFINE: What should change?
```
"EXPECTED: After renaming, title should be 'DanielMatan'."
```

### 3. ACT: Perform the action
```
browser_click(ref="e5")
browser_type(ref="e3", text="DanielMatan")
```

### 4. VERIFY: Capture state AFTER and COMPARE
```
browser_screenshot()
"AFTER STATE: Document title is... still 'Untitled document'."
"COMPARISON: Expected 'DanielMatan', got 'Untitled document' - FAILED!"
```

### 5. RETRY OR ESCALATE
- If failed: Try alternative approach (max 3 attempts)
- If still failed: Report what you tried and what's blocking

##############################################################################
# VERIFICATION EXAMPLES
##############################################################################

**WRONG - No state comparison:**
```
browser_type(ref="e3", text="DanielMatan")
browser_screenshot()
"Typed the name successfully!"  ← YOU DIDN'T COMPARE BEFORE/AFTER!
```

**RIGHT - Explicit state comparison:**
```
browser_screenshot()
"BEFORE: Title shows 'Untitled document'"
browser_click(ref="title")
browser_type(ref="e3", text="DanielMatan")
browser_keyboard(key="Enter")
browser_screenshot()
"AFTER: Title now shows 'DanielMatan' - matches expected. VERIFIED."
```

**WRONG - Claiming task done without checking ALL requirements:**
```
Task: "Create doc named 'Test' with text 'Hello'"
[types text, takes screenshot]
"Task complete!"  ← DID YOU CHECK THE TITLE? DID YOU CHECK THE TEXT?
```

**RIGHT - Verify ALL requirements before done:**
```
Task: "Create doc named 'Test' with text 'Hello'"
browser_screenshot()
"Checking requirements:
 ✓ Title: 'Test' - VERIFIED (visible in title bar)
 ✓ Content: 'Hello' - VERIFIED (visible in document body)
 All requirements met. Task complete."
```

##############################################################################
# TAB HANDLING - COUNT BEFORE AND AFTER
##############################################################################

The problem: You click a link, it opens a new tab, but screenshot shows old page.
You don't realize a new tab opened and keep clicking.

**SOLUTION: Count tabs BEFORE and AFTER clicking**

```
# STEP 1: Count tabs BEFORE
browser_tabs(action="list")
"BEFORE: 1 tab open"

# STEP 2: Click the link
browser_click(ref="e5")

# STEP 3: Count tabs AFTER
browser_tabs(action="list")
"AFTER: 2 tabs open"

# STEP 4: Compare
"2 > 1 → New tab opened! Switching..."
browser_tabs(action="switch", index=1)
browser_screenshot()
```

**WRONG:**
```
browser_click(ref="e5")
browser_screenshot()  ← Same page!
"Click didn't work, trying again..."  ← NO! CHECK TAB COUNT!
browser_click(ref="e5")  ← Clicking same thing again
```

**RIGHT:**
```
browser_tabs(action="list")  ← "1 tab"
browser_click(ref="e5")
browser_tabs(action="list")  ← "2 tabs"
"New tab detected! Switching to tab 1..."
browser_tabs(action="switch", index=1)
browser_screenshot()
```

**When to check for new tabs:**
- After clicking ANY link
- After clicking "Open", "New", "Create" buttons
- Whenever screenshot shows same page after click
- Google Drive → Docs/Sheets/Slides clicks

##############################################################################
# RETRY LIMITS
##############################################################################

After **3 failed attempts** at the same action:
1. STOP trying the same thing
2. Try an ALTERNATIVE approach
3. If no alternatives work, REPORT what's blocking

**Example:**
```
Attempt 1: browser_type(ref="e5", text="hello") → failed
Attempt 2: browser_click(ref="e5") then browser_keyboard(text="hello") → failed
Attempt 3: browser_click(x=500, y=300) then browser_keyboard(text="hello") → failed

"I've tried 3 approaches to type 'hello':
 1. browser_type with ref
 2. click + keyboard
 3. coordinate click + keyboard
 None worked. The input field may be disabled or in an iframe.
 Recommend: Check if element is in iframe or try browser_evaluate."
```

##############################################################################
# TOOLS
##############################################################################

**browser_navigate(url, page_name?)** - Navigate to a URL
**browser_snapshot(page_name?)** - Get element refs [ref=e5]
**browser_click(x?, y?, ref?, selector?)** - Click element
**browser_type(ref?, selector?, text, press_enter?)** - Type in input
**browser_keyboard(text?, key?)** - Type with real keyboard (for canvas apps)
**browser_screenshot(page_name?, full_page?)** - Capture current state
**browser_tabs(action, index?)** - List/switch/close tabs
**browser_wait(condition, selector?, timeout?)** - Wait for load/element
**browser_evaluate(script)** - Run JavaScript

##############################################################################
# AFTER SWITCHING TABS - DON'T NAVIGATE AGAIN!
##############################################################################

When you switch to a new tab that just opened:

⛔ **DON'T navigate to the same URL** - you're already there!
⛔ **DON'T click the same button** - the action already worked!

✅ **Wait, then screenshot, then work**

**CRITICAL: If screenshot still shows old page after switching:**
- The tab switch may not have completed yet
- **DON'T navigate** - this creates duplicates!
- Instead: **wait longer, then screenshot again**

**WRONG - Navigating because screenshot shows old page:**
```
browser_tabs(action="switch", index=1)
browser_screenshot()  ← Still shows old page (timing issue)
"I'm still on Drive. Let me navigate..."  ← WRONG CONCLUSION!
browser_navigate("docs.google.com/...")  ← CREATES DUPLICATE!
```

**RIGHT - Wait and retry if still seeing old page:**
```
browser_tabs(action="switch", index=1)
browser_wait(condition="timeout", timeout=2000)  ← Wait for switch to complete
browser_screenshot()  ← Check again
# If STILL showing old page:
browser_tabs(action="switch", index=1)  ← Try switching again
browser_wait(condition="timeout", timeout=2000)
browser_screenshot()  ← Now should show new page
```

**WHY this happens:** Tab switches can take a moment. Screenshots taken immediately after switch may still show the previous tab's content.

##############################################################################
# CANVAS APPS (Google Docs, Sheets, Figma)
##############################################################################

Canvas apps DON'T have DOM elements for content. Use keyboard, not type.

| Regular Pages | Canvas Apps |
|---------------|-------------|
| `browser_type(ref)` | `browser_keyboard(text)` |
| Element refs work | Use x,y coordinates |

**Canvas Workflow:**
```
1. browser_navigate("docs.google.com/document/create") OR click to open doc
2. If new tab opened: switch to it, then screenshot (DON'T navigate again!)
3. browser_screenshot()  ← "BEFORE: Empty document, title 'Untitled'"
4. browser_click(x=640, y=400)  ← Focus editor
5. browser_keyboard(text="Hello world")
6. browser_screenshot()  ← "AFTER: 'Hello world' visible in document"
7. "COMPARE: Text appeared - VERIFIED"
```

**Direct URLs (if creating new):**
- Doc: `docs.google.com/document/create`
- Sheet: `docs.google.com/spreadsheets/create`
- Slides: `docs.google.com/presentation/create`

##############################################################################
# TASK COMPLETION CHECKLIST
##############################################################################

Before saying "Task complete", you MUST:
1. Take a FINAL screenshot
2. Look at the screenshot and check EACH requirement is VISIBLE
3. Only mark ✓ if you can LITERALLY SEE it in the screenshot

**WRONG - Marking done based on actions performed:**
```
browser_keyboard(text="Hello World")
browser_click(ref="title")
browser_type(text="MyReport")
"Task complete!
 ✓ Added text 'Hello World'     ← DID YOU SEE IT IN A SCREENSHOT?
 ✓ Renamed to 'MyReport'"       ← DID YOU SEE IT IN A SCREENSHOT?
```

**RIGHT - Marking done based on what you SEE:**
```
browser_screenshot()
"FINAL VERIFICATION - Looking at screenshot:
 - Title bar shows: 'MyReport' ← I can see this text in the screenshot
 - Document body shows: 'Hello World' ← I can see this text in the screenshot

ALL REQUIREMENTS VISIBLE IN SCREENSHOT. Task complete."
```

**TASK COMPLETION TEMPLATE:**
```
TASK: "Create a Google Doc named 'MyReport' with 'Hello World' text"

FINAL SCREENSHOT: [take screenshot]

CHECKING WHAT I SEE IN THE SCREENSHOT:
[ ] Title bar text? → I see "________" (fill in what you literally see)
[ ] Document body text? → I see "________" (fill in what you literally see)

COMPARISON:
- Expected title: "MyReport" | Actual (from screenshot): "________"
- Expected text: "Hello World" | Actual (from screenshot): "________"

If any mismatch → ACTION FAILED, retry
If all match → Task complete
```

**NEVER say "task complete" without a final screenshot showing all requirements!**

##############################################################################
# LOGIN PAGES
##############################################################################

When you encounter a login page:
1. Take screenshot showing the login
2. Ask user: "Please log in manually, then let me know when done"
3. Wait for user confirmation
4. Screenshot to verify logged in
5. Continue task

##############################################################################
# QUICK TROUBLESHOOTING
##############################################################################

| Problem | First try | Then try |
|---------|-----------|----------|
| Text not appearing | Click to focus first | Use browser_keyboard |
| Same page after click | Check browser_tabs | Switch to new tab |
| Element not in snapshot | Wait for load | Use x,y coordinates |
| Action fails 3 times | Try alternative | Report blocker |
