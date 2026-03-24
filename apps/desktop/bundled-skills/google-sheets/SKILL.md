---
name: google-sheets
description: Automate Google Sheets interactions through browser automation - create spreadsheets, enter data, apply formulas, and format cells.
command: /google-sheets
verified: true
---

# Google Sheets Interaction Skill

## Overview

This skill provides patterns and best practices for automating Google Sheets interactions through browser automation. Google Sheets is a **canvas-based web app** — standard DOM element references are often unreliable; prefer keyboard shortcuts and coordinate clicks.

---

## Agent Workflow (Always Follow This Order)

1. **Orient** — Take a screenshot. Confirm you're on the right tab/sheet. Identify existing data range.
2. **Plan** — Decide what cells to read or write, in what order.
3. **Execute in small steps** — One logical action at a time (one row, one format operation, etc.).
4. **Verify** — Take a screenshot after each meaningful action to confirm the result before continuing.
5. **Recover if needed** — If something looks wrong, `Cmd+Z` immediately before doing anything else.

---

## 1. Session Setup / Opening a Sheet

**Starting from scratch:**

- Navigate to `https://sheets.google.com`
- Click "Blank spreadsheet" to create new, or click an existing file
- After clicking, **wait for the new tab** — Sheets often opens in a new tab. Switch to it before proceeding.

**Opening an existing file:**

- Navigate to `https://drive.google.com`, search for the file, and open it
- Or navigate directly via a known URL

**Before acting on any sheet:**

- Take a screenshot to confirm the sheet is loaded (look for the grid and toolbar)
- Confirm which **sheet tab** is active (bottom of screen)
- Use `Cmd+Home` to go to A1 and orient yourself

---

## 2. Reading / Understanding Existing Data

Before writing anything, read what's already there:

- **Screenshot first** — Get a visual overview of the data layout
- **`browser_get_text`** — Extracts cell text content; useful for reading values without clicking
- **`Cmd+End`** — Jumps to the last cell with data; tells you the extent of the dataset
- **`Cmd+Home`** — Returns to A1

**To read a specific cell's value:** Click the cell and read the formula bar (visible in screenshot), or use `browser_get_text` and parse the result.

---

## 3. Navigation & Cell Selection

**DO NOT type cell references into the Name Box** — it often enters text into cells instead of navigating.

**Preferred navigation methods:**
| Goal | Method |
|------|--------|
| Go to A1 | `Cmd+Home` |
| Go to start of row | `Home` |
| Go to last data cell | `Cmd+End` |
| Move right | `Tab` |
| Move down | `Enter` |
| Move by one cell | Arrow keys |
| Select entire row | Click the row number on the left (e.g., "2") |
| Select entire column | Click the column letter at top (e.g., "A") |
| Select a range | Click start cell, then `Shift+click` end cell |
| Select column range (for resize) | Click first column letter, `Shift+click` last |

**Confirming current cell location:**

- Take a screenshot and look at the **Name Box** (top-left, shows current cell address like "A1")
- Look at the **formula bar** (top center) which shows the selected cell's content
- The selected cell has a blue/green border — visible in screenshots

---

## 4. Data Entry

### Basic pattern for tabular data:

```
1. Click on the starting cell (e.g., A1)
2. Type value → Tab (moves right)
3. Type value → Tab → Tab → ...
4. At end of row: press Enter (moves to next row, returns to column where you started)
5. Press Home to ensure you're at column A
6. Repeat
```

### Entering a single value:

```
1. Click the target cell
2. Type the value
3. Press Enter or Tab to confirm (don't leave it unconfirmed)
```

### Pasting multi-line data:

- Prepare data as tab-separated text (TSV)
- Click the target starting cell
- Paste with `Cmd+V`
- Verify result with a screenshot

**Avoid:**

- Typing tab characters inside a string to separate columns — they won't work as cell separators
- Leaving a cell in edit mode (blinking cursor) before navigating away — always confirm with Enter or Tab

---

## 5. Formulas

### Entering a formula:

```
1. Click target cell
2. Type = followed by the formula (e.g., =SUM(A1:A10))
3. Press Enter to confirm
```

### Common formulas:

| Formula                     | Purpose               |
| --------------------------- | --------------------- |
| `=SUM(A1:A10)`              | Sum a range           |
| `=AVERAGE(B2:B20)`          | Average               |
| `=COUNT(C2:C100)`           | Count non-empty cells |
| `=IF(A1>10,"Yes","No")`     | Conditional           |
| `=VLOOKUP(key,range,col,0)` | Lookup                |
| `=A1&" "&B1`                | Concatenate cells     |
| `=TODAY()`                  | Today's date          |

### Copying a formula down a column:

```
1. Click the cell with the formula
2. Press Cmd+C to copy
3. Select the range below (click first cell, Shift+click last)
4. Press Cmd+V to paste
```

Or: click the cell, then double-click the small blue square in the cell's bottom-right corner (auto-fill handle) — this fills down to match adjacent data.

---

## 6. Formatting

### Bold / Italic / Underline:

```
1. Select cell(s) or row (click row number)
2. Cmd+B (bold), Cmd+I (italic), Cmd+U (underline)
```

### Header row formatting (recommended pattern):

```
1. Click the row number to select the entire row
2. Cmd+B for bold
3. Click the Fill Color button (paint bucket in toolbar) → choose a color
4. View > Freeze > 1 row (so header stays visible when scrolling)
```

### Number formatting:

```
Format > Number > choose format (Currency, Percent, Date, etc.)
```

### Text wrapping:

```
Format > Wrapping > Wrap (or Overflow / Clip)
```

### Column width auto-fit:

```
1. Click first column letter, Shift+click last column letter to select range
2. Right-click on any selected column header
3. "Resize columns A - X"
4. Choose "Fit to data" → OK
```

---

## 7. Sheet Tabs (Multiple Sheets)

Sheet tabs appear at the **bottom** of the screen.

| Action            | Method                                     |
| ----------------- | ------------------------------------------ |
| Switch to a sheet | Click its tab at the bottom                |
| Add a new sheet   | Click the **+** button at the bottom left  |
| Rename a sheet    | Double-click the tab, type new name, Enter |
| Duplicate a sheet | Right-click the tab → "Duplicate"          |
| Delete a sheet    | Right-click the tab → "Delete"             |

**Always confirm which sheet tab is active before reading or writing data.**

---

## 8. Menus Reference

| Menu                         | Useful For             |
| ---------------------------- | ---------------------- |
| View > Freeze                | Freeze rows/columns    |
| Format > Number              | Number/date formatting |
| Format > Wrapping            | Text wrap in cells     |
| Data > Sort range            | Sort by column         |
| Data > Filter                | Add filter dropdowns   |
| Data > Split text to columns | Split delimited text   |
| Insert > Row / Column        | Insert rows or columns |

---

## 9. Common Keyboard Shortcuts

| Action               | Shortcut                                 |
| -------------------- | ---------------------------------------- |
| Bold                 | `Cmd+B`                                  |
| Italic               | `Cmd+I`                                  |
| Undo                 | `Cmd+Z`                                  |
| Redo                 | `Cmd+Shift+Z`                            |
| Select All           | `Cmd+A`                                  |
| Copy                 | `Cmd+C`                                  |
| Paste                | `Cmd+V`                                  |
| Go to A1             | `Cmd+Home`                               |
| Go to last data cell | `Cmd+End`                                |
| Go to start of row   | `Home`                                   |
| Move right           | `Tab`                                    |
| Move down            | `Enter`                                  |
| Delete cell contents | `Delete`                                 |
| Find & Replace       | `Cmd+H`                                  |
| Insert row above     | `Cmd+Option+Shift+=` (with row selected) |

---

## 10. Error Recovery

**Something went wrong — act immediately:**

1. `Cmd+Z` — Undo the last action (do this before anything else)
2. Take a screenshot to assess current state
3. Re-orient: `Cmd+Home` to go to A1
4. Re-read the data before retrying

**Common problems and fixes:**
| Problem | Fix |
|---------|-----|
| Text entered into wrong cell | `Cmd+Z`, then navigate correctly and re-enter |
| Formula shows as text (starts with `=` but not computing) | Click cell, press F2 to edit, confirm cell is not formatted as plain text |
| Dialog appeared unexpectedly | Screenshot to read it, then press `Escape` or respond appropriately |
| Sheet opened in new browser tab | Use `browser_tabs` / tabs tool to switch to the new tab |
| Cell stuck in edit mode | Press `Escape` to cancel edit, or `Enter` to confirm |

---

## 11. Saving

Google Sheets **auto-saves continuously**. You do not need to manually save.

- Watch for "Saving..." → "All changes saved" in the top bar to confirm
- If you see a "Save" prompt, the file may be a non-Google format (e.g., .xlsx) — click Save to keep changes

---

## 12. Browser Automation Tips

- **Google Sheets is a canvas app** — DOM element references (`ref_id`) often don't work for cells. Use coordinate clicks instead.
- **Always screenshot before and after** significant actions
- **Use keyboard shortcuts** over toolbar button clicks whenever possible — more reliable
- **Toolbar buttons** can be clicked by coordinate if needed; take a screenshot to locate them first
- **Name Box** (top-left showing cell address): Read it in screenshots to confirm position, but don't type into it for navigation
- **After creating a new sheet**, wait for the new browser tab to open, then switch to it before interacting
