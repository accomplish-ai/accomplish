---
name: gws-calendar
description: View, create, update, and delete Google Calendar events across all connected accounts. Find free time for meetings.
command: /gws-calendar
verified: true
---

# Google Calendar Skill

## Overview

This skill guides you in using the `google_calendar` MCP tool to manage calendar events across all connected Google accounts.

## Available Subcommands

| Subcommand         | Description                                                  |
| ------------------ | ------------------------------------------------------------ |
| `list`             | List upcoming events (defaults to next 7 days).              |
| `get <eventId>`    | Get details of a specific event.                             |
| `create`           | Create a new calendar event.                                 |
| `update <eventId>` | Update an existing event.                                    |
| `delete <eventId>` | Delete an event.                                             |
| `rsvp <eventId>`   | Accept, decline, or tentatively accept an event.             |
| `free-time`        | Find available meeting slots across all connected calendars. |

## Account Routing

- **Reads** (list, get, free-time): Omit `account` to query **all** accounts simultaneously.
- **Writes** (create, update, delete, rsvp): You **must** specify `account`. Ask the user if unclear.

```
google_calendar(command: "list")                                     // all accounts
google_calendar(command: "free-time --duration 60")                 // all accounts
google_calendar(command: "create --title 'Team Sync'", account: "Work")
```

## Key Flags

| Flag                   | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| `--start <datetime>`   | Start time in ISO 8601 format                        |
| `--end <datetime>`     | End time in ISO 8601 format                          |
| `--days <n>`           | Number of days to look ahead (list only, default: 7) |
| `--title <text>`       | Event title                                          |
| `--description <text>` | Event description                                    |
| `--location <text>`    | Event location                                       |
| `--attendees <emails>` | Comma-separated attendee emails                      |
| `--duration <minutes>` | Required slot duration in minutes (free-time only)   |
| `--response <r>`       | RSVP response: accepted / declined / tentative       |

## Workflow: Scheduling a Meeting

1. Find free time: `google_calendar(command: "free-time --duration 60 --days 5")`
2. Confirm a slot with the user.
3. Create the event: `google_calendar(command: "create --title 'Meeting' --start '2026-04-15T14:00:00' --end '2026-04-15T15:00:00' --attendees 'alice@example.com'", account: "Work")`

## Free-Time Algorithm

`free-time` fetches events from **all** connected accounts, merges overlapping busy intervals, and returns up to 10 available slots of at least the requested duration within the search window.

## Error Handling

- If no accounts are connected, direct user to Settings → Integrations.
- If `account` is required but not specified, ask the user which account to use before proceeding.
