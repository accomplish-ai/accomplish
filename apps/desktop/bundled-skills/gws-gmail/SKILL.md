---
name: gws-gmail
description: Read and manage Gmail across all connected Google accounts — search, send, reply, draft, archive, and label emails.
command: /gws-gmail
verified: true
---

# Google Gmail Skill

## Overview

This skill guides you in using the `google_gmail` MCP tool to manage email across all connected Google accounts.

## Available Subcommands

| Subcommand                | Description                                                             |
| ------------------------- | ----------------------------------------------------------------------- |
| `list`                    | List recent emails (defaults to INBOX). Use `--query` for Gmail search. |
| `read <messageId>`        | Read a full email thread by message ID.                                 |
| `send`                    | Compose and send a new email.                                           |
| `reply <messageId>`       | Reply to a specific message.                                            |
| `draft`                   | Save a draft without sending.                                           |
| `archive <messageId>`     | Archive a message (remove from INBOX).                                  |
| `mark-read <messageId>`   | Mark a message as read.                                                 |
| `mark-unread <messageId>` | Mark a message as unread.                                               |
| `label <messageId>`       | Apply or remove Gmail labels.                                           |

## Account Routing

- **Reads** (list, read): Omit `account` to query **all** accounts simultaneously.
- **Writes** (send, reply, draft, archive, label, mark-read, mark-unread): You **must** specify `account`. If the user hasn't said which account, ask them first.

```
google_gmail(command: "list --query 'is:unread'")                    // all accounts
google_gmail(command: "send --to 'x@example.com' --subject 'Hi'", account: "Work")
```

## Key Flags

| Flag                | Description                             |
| ------------------- | --------------------------------------- |
| `--query <q>`       | Gmail search query (list only)          |
| `--max <n>`         | Max results to return (default: 20)     |
| `--to <addr>`       | Recipient email address                 |
| `--cc <addr>`       | CC recipient                            |
| `--subject <text>`  | Email subject                           |
| `--body <text>`     | Email body (plain text)                 |
| `--label-ids <ids>` | Comma-separated label IDs to add/remove |

## Workflow: Reading and Replying

1. List emails: `google_gmail(command: "list --query 'is:unread'")`
2. Read a specific email: `google_gmail(command: "read <messageId>")`
3. Reply: `google_gmail(command: "reply <messageId> --body 'Thanks!'", account: "Work")`

## Error Handling

- If no accounts are connected, direct user to Settings → Integrations.
- If `account` is required but not specified, ask the user which account to use before proceeding.
