---
name: gws-shared
description: 'Google Workspace MCP tools: shared patterns for flags, formatting, multi-account routing, and security.'
command: /gws-shared
verified: true
hidden: true
---

# Google Workspace — Shared Reference

## MCP Tools

| Tool                         | Description                                                         |
| ---------------------------- | ------------------------------------------------------------------- |
| `google_sheets`              | Create spreadsheets, read/write cell data (auto-prepends `sheets `) |
| `google_docs`                | Create documents, read/write text content (auto-prepends `docs `)   |
| `google_slides`              | Create presentations, read/write slides (auto-prepends `slides `)   |
| `google_gmail`               | Send, read, and manage Gmail messages                               |
| `google_calendar`            | Create, list, and update Google Calendar events                     |
| `request_google_file_picker` | Request access to Google Drive files via the file picker UI         |

## Scope & File Access

`google_sheets`, `google_docs`, and `google_slides` use the `drive.file` scope. They can **only** access:

1. Files **created** by this app (e.g., via `spreadsheets create`, `documents create`, `presentations create`)
2. Files **explicitly selected** by the user via Google Picker

To access an existing user file, call `request_google_file_picker` with the filename as `query`. The tool will:

- Search for already-accessible files matching that name
- If found, return file metadata directly (no pause, no picker)
- If not found, fall through to the Google Picker for the user to select the file

This means files picked in a previous task can be reused without showing the picker again.

## Multi-Account Support

All tools accept an optional `account` parameter to target a specific connected Google account.

```
google_gmail(command: "list", account: "Work")
google_calendar(command: "list-events", account: "Personal")
request_google_file_picker(query: "Q3 Budget", account: "Work")
```

### Account Routing Rules

| Operation                                | When `account` omitted      | When `account` specified  |
| ---------------------------------------- | --------------------------- | ------------------------- |
| **Read** (list, search, get, free-time)  | Queries **all** accounts    | Queries only that account |
| **Write** (send, create, update, delete) | **Ask which account** first | Uses specified account    |

### Specifying Accounts

Use either the label or the full email address:

```
google_gmail(command: "send ...", account: "Work")
google_gmail(command: "send ...", account: "alice@company.com")
request_google_file_picker(query: "Budget", account: "Personal")
```

## Common Workflows

Create responses for `google_docs`, `google_sheets`, and `google_slides` always end with a direct link to the created Doc, Sheet, or Slide deck. Use that link in the task result when the user may want to open the file.

### Sheets: Create, append rows, read back

```bash
# 1. Create a spreadsheet
google_sheets(command: "spreadsheets create --json '{\"properties\": {\"title\": \"Q3 Metrics\"}}'")

# 2. Add multiple rows with --json-values
google_sheets(command: "+append --spreadsheet '<spreadsheetId>' --json-values '[[\"Name\",\"Revenue\"],[\"Acme\",\"1.2M\"]]'")

# 3. Read back to verify
google_sheets(command: "+read --spreadsheet '<spreadsheetId>' --range 'Sheet1'")
```

### Docs: Create, write text, read back

```bash
# 1. Create a document
google_docs(command: "documents create --json '{\"title\": \"Meeting Notes\"}'")

# 2. Append plain text
google_docs(command: "+write --document '<documentId>' --text 'Key decisions from today...'")

# 3. Read back to verify
google_docs(command: "documents get --params '{\"documentId\": \"<documentId>\"}'")
```

### Slides: Create, get IDs, batchUpdate

```bash
# 1. Create a presentation
google_slides(command: "presentations create --json '{\"title\": \"Q3 Review\"}'")

# 2. Get the presentation to discover slide/placeholder IDs
google_slides(command: "presentations get --params '{\"presentationId\": \"<presentationId>\"}'")
```

> **IMPORTANT — `--values` vs `--json-values` (Sheets only)**
>
> - `--values 'a,b,c'` appends **one row**. It CANNOT be used multiple times to add more rows.
> - `--json-values '[["a","b"],["c","d"]]'` appends **multiple rows** in a single call. Always use this for bulk data.

## Error Handling

If a call fails, the tool returns an error message (not JSON). Check the message for HTTP status codes:

- **403** — Permission denied (file not in `drive.file` scope)
- **404** — File not found or not accessible
- **400** — Invalid request body or parameters

If a tool returns an error because no accounts are connected, direct the user to Settings → Integrations → Google Accounts.

If an account shows status `expired`, instruct the user to reconnect it in Settings → Integrations → Google Accounts.

## Method Flags

| Flag                        | Description                                   |
| --------------------------- | --------------------------------------------- |
| `--params '{"key": "val"}'` | URL/query parameters                          |
| `--json '{"key": "val"}'`   | Request body                                  |
| `--page-all`                | Auto-paginate (NDJSON output)                 |
| `--page-limit <N>`          | Max pages when using --page-all (default: 10) |

> `--format json` is automatically appended by the MCP server. Do not add it.

## Security Rules

- **Never** output secrets (API keys, tokens) directly
- **Always** confirm with the user before executing write/delete commands
- Do NOT fall back to browser automation when MCP tools are available
