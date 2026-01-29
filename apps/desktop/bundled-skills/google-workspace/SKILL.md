---
name: google-workspace
description: Interact with Google Workspace - create documents, spreadsheets, send emails via Gmail, and manage Google Drive files.
command: /google-workspace
verified: true
---

# Google Workspace Integration

This skill enables interaction with Google Workspace services including:

- **Google Docs**: Create, edit, and format documents
- **Google Sheets**: Create spreadsheets, add data, formulas, and charts
- **Gmail**: Compose and send emails
- **Google Drive**: Organize and manage files

## Usage

When the user asks to create a Google Doc, spreadsheet, or send an email, use the browser automation tools to:

1. Navigate to the appropriate Google service
2. Authenticate if needed (user may need to be logged in)
3. Perform the requested action
4. Confirm completion to the user

## Examples

- "Create a Google Doc with meeting notes"
- "Make a spreadsheet to track expenses"
- "Send an email to my team about the project update"
- "Create a folder in Drive called 'Q1 Reports'"

## Requirements

- User must be logged into their Google account in the browser
- Browser automation tools must be available
