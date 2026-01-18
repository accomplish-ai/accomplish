# Slack Release Reminder Design

## Overview

Automated Slack notifications to remind the team to release when there are new commits, with one-click access to trigger the release workflow.

## Goal

Send a Slack message twice daily (10am and 7pm Israel time) to `#openwork-opensource-releases` showing commits since the last release, with buttons to trigger patch/minor/major releases.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  GitHub Actions (Scheduled: 10am & 7pm Israel Time)            │
│                                                                 │
│  1. Check for commits since last release tag                   │
│  2. If no commits → Exit silently                              │
│  3. If commits exist → Format message with commit list         │
│  4. Send to Slack via Incoming Webhook                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Slack: #openwork-opensource-releases                          │
│                                                                 │
│  📦 Release Reminder - Openwork                                │
│  ─────────────────────────────────────                         │
│  5 commits since v0.2.1:                                       │
│  • fix: inject version at build time                           │
│  • feat: add AskUserQuestion MCP tool                          │
│  • ...                                                         │
│                                                                 │
│  [Patch 0.2.2]  [Minor 0.3.0]  [Major 1.0.0]  ← URL buttons   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (user clicks)
┌─────────────────────────────────────────────────────────────────┐
│  GitHub Actions Page (browser)                                  │
│  → User clicks "Run workflow" button                           │
└─────────────────────────────────────────────────────────────────┘
```

## Schedule

Runs every day at 10am and 7pm Israel time. To handle DST:

| Israel Time | UTC (Winter, UTC+2) | UTC (Summer, UTC+3) |
|-------------|---------------------|---------------------|
| 10:00 AM    | 08:00               | 07:00               |
| 7:00 PM     | 17:00               | 16:00               |

Cron expressions (covers both DST scenarios):
```yaml
on:
  schedule:
    - cron: '0 7 * * *'   # 10am Israel (summer)
    - cron: '0 8 * * *'   # 10am Israel (winter)
    - cron: '0 16 * * *'  # 7pm Israel (summer)
    - cron: '0 17 * * *'  # 7pm Israel (winter)
```

## Slack Message Format

```
┌──────────────────────────────────────────────────────────────┐
│ 📦 Release Reminder - Openwork                              │
├──────────────────────────────────────────────────────────────┤
│ *5 commits since v0.2.1:*                                   │
│                                                              │
│ • `d94668d` fix: inject version at build time               │
│ • `bd636d0` test: add version assertion to preload          │
│ • `702e4b9` fix: align version to 0.2.1                     │
│ • `0b806f8` ci: update macOS Intel runner                   │
│ • `5535618` ci: add dry_run mode for testing                │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ [🔧 Patch → 0.2.2]  [✨ Minor → 0.3.0]  [🚀 Major → 1.0.0]   │
└──────────────────────────────────────────────────────────────┘
```

- Shows short SHA + commit message (first line only)
- Limits to 10 most recent commits (with "+N more" if exceeded)
- Buttons show calculated next version
- Each button links to GitHub Actions workflow dispatch page

## Components

**New file:** `.github/workflows/release-reminder.yml`

**GitHub Secret:** `SLACK_RELEASE_WEBHOOK_URL` (already configured)

**No external infrastructure required.**

## Workflow Logic

```
1. Checkout repo
2. Get latest release tag (git describe --tags --abbrev=0)
3. Get commits since that tag (git log $TAG..HEAD --oneline)
4. If no commits → exit 0 (silent, no notification)
5. Calculate next versions (patch/minor/major)
6. Format Slack message with commits + buttons
7. POST to Slack webhook
```

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| No releases yet | Use first commit as baseline |
| No new commits | Skip notification silently |
| Too many commits | Show 10 + "and N more" |

## Security

- Slack webhook URL stored as GitHub Secret (encrypted)
- Never exposed in code, logs, or to forks
- Standard pattern for public repos with Slack integration

## Setup (Completed)

1. Created Slack App: `Openwork Release Bot`
2. Enabled Incoming Webhooks
3. Added webhook to `#openwork-opensource-releases`
4. Added GitHub Secret: `SLACK_RELEASE_WEBHOOK_URL`
