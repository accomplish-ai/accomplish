---
name: bulk-operations
description: Two-phase approach for bulk operations. Use when processing multiple items like "download all", "process each", "rename every", "check all files", or any batch operation involving more than 5 items.
---

Two-phase approach for bulk operations. Use when processing multiple items like "download all", "process each", "rename every", "check all files", or any batch operation involving more than 5 items.

<critical-requirement>
##############################################################################
# MANDATORY: Use a two-phase approach with SEPARATE script executions.
# NEVER write a script that processes ALL items on the first attempt.
##############################################################################
</critical-requirement>

<phase name="test-run">
## Phase 1: Test Run (2-5 items) - MANDATORY BEFORE FULL EXECUTION

Before processing all items, write and execute a SMALL test script:
1. Process only 2-5 items (enough to catch issues, not just 1)
2. This MUST be a separate script execution, not part of the full batch
3. After the script completes, VERIFY results before proceeding:
   - Check files exist / data saved / operations completed
   - Look for errors in output
   - Confirm expected outcomes

If test fails: Stop, diagnose, fix the approach, test again
If test passes: Proceed to Phase 2
</phase>

<phase name="full-execution">
## Phase 2: Full Execution - Only after Phase 1 succeeds

Write a NEW script for the remaining items (don't re-process test items).
</phase>

<examples>
WRONG (monolithic - will waste 12+ minutes if it fails):
  Script 1: Loop through all 24 months, download all statements
  → Fails after 12 minutes, no files downloaded

RIGHT (two-phase - catches issues in ~30 seconds):
  Script 1: Download statements for January 2024 only (1 month, ~4 cards)
  → Verify: "ls ~/Downloads/*.pdf" shows 4 new files
  → Success!
  Script 2: Download statements for remaining 23 months
  → Report: "Downloaded 96 statements"

WRONG:
  Script 1: Rename all 50 files in one loop

RIGHT:
  Script 1: Rename first 3 files, verify they exist at new paths
  Script 2: Rename remaining 47 files
</examples>

<rationale>
Browser automation is fragile. Selectors break, auth expires, timeouts occur.
A 12-minute script that fails wastes user time and provides no feedback.
A 30-second test catches the same issues immediately.
</rationale>
