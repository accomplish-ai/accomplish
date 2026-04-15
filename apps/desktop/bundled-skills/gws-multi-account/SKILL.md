---
name: gws-multi-account
description: Guidance for working across multiple connected Google accounts — managing email, calendar events, and files for personal and work accounts simultaneously.
command: /gws-multi-account
verified: true
---

# Google Workspace Multi-Account Skill

## Overview

When the user has connected multiple Google accounts (e.g. personal and work), you can operate across all of them simultaneously for read operations, or target a specific account for write operations.

## Account Discovery

At the start of each task the system prompt lists all connected accounts:

```
| Label    | Email                    | Status    |
|----------|--------------------------|-----------|
| Work     | alice@company.com        | connected |
| Personal | alice@gmail.com          | connected |
```

## Core Routing Rules

| Operation type                                           | When `account` is omitted             | When `account` is specified        |
| -------------------------------------------------------- | ------------------------------------- | ---------------------------------- |
| **Read** (list, search, get, free-time)                  | Queries **all** accounts              | Queries only the specified account |
| **Write** (send, reply, create, update, delete, archive) | **Ask the user** which account to use | Uses the specified account         |

## How to Specify an Account

Use either the label or the full email address:

```
google_gmail(command: "send ...", account: "Work")
google_gmail(command: "send ...", account: "alice@company.com")
google_calendar(command: "create ...", account: "Personal")
```

## Common Multi-Account Workflows

### Check all unread emails

```
google_gmail(command: "list --query 'is:unread'")
```

Returns results from all connected accounts, each labelled with its account.

### Find free time across all calendars

```
google_calendar(command: "free-time --duration 60 --days 5")
```

Merges busy time from all connected accounts to find truly free slots.

### Send from a specific account

Always confirm with the user which account to send from before calling:

```
google_gmail(command: "send --to 'bob@example.com' --subject 'Hi' --body 'Hello!'", account: "Work")
```

### Reply to an email (correct account is important)

Read the email first to see which account received it, then reply from that same account:

```
google_gmail(command: "reply <messageId> --body 'Thanks!'", account: "Work")
```

## Error Cases

- **Account not found**: If the specified label/email doesn't match any connected account, the tool returns the list of available accounts. Update the `account` parameter and retry.
- **No accounts connected**: Direct the user to Settings → Integrations → Google Accounts to connect an account.
- **Token expired**: If an account shows status `expired`, the user needs to reconnect it in Settings → Integrations → Google Accounts.
