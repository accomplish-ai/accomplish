# Complete Task

This tool signals task completion. The agent MUST call this tool to finish any task.

## Usage

Call `complete_task` with:

- `status`: "success", "blocked", or "partial"
- `original_request_summary`: Restate what was asked (forces review)
- `summary`: What you accomplished
- `remaining_work`: (if blocked/partial) What's left to do

## Statuses

- **success** — All parts of the request completed
- **blocked** — Hit an unresolvable blocker, cannot continue
- **partial** — Completed some parts but not all
