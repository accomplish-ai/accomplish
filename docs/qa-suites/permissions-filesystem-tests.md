# Permissions & Filesystem QA Suite

Tests covering the filesystem permission inline card and related access-control behaviour.

---

## Permission Inline Card — Display

| ID         | Scenario                                          | Steps                                                                                                 | Expected                                                                          |
| ---------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| PERM-UI-01 | Permission inline card appears on file access     | 1. Start a task that reads a file outside the configured workspace 2. Observe the task execution view | Permission inline card is displayed within the task execution view                |
| PERM-UI-02 | Permission inline card is non-blocking            | 1. Trigger a file permission request 2. Interact with another part of the UI                          | The rest of the UI remains accessible; the inline card does not block interaction |
| PERM-UI-03 | Permission inline card shows correct path         | 1. Trigger a permission request for `/tmp/secret.txt`                                                 | Inline card displays the exact requested path                                     |
| PERM-UI-04 | Permission inline card dismisses on approval      | 1. Trigger a permission request 2. Click **Allow**                                                    | Inline card disappears; task continues execution                                  |
| PERM-UI-05 | Permission inline card dismisses on denial        | 1. Trigger a permission request 2. Click **Deny**                                                     | Inline card disappears; task receives a permission-denied error                   |
| PERM-UI-06 | Missing or empty file path renders fallback       | 1. Trigger a permission request with an empty file path                                               | Inline card displays "No file path provided" fallback text without crashing       |
| PERM-UI-07 | Very long file path does not overflow             | 1. Trigger a permission request with a path ≥ 300 characters                                          | Inline card wraps or truncates the path without breaking the card layout          |
| PERM-UI-08 | File path with special/Unicode characters renders | 1. Trigger a permission request for a path such as `/tmp/文件/émoji 🎉/file.txt`                      | Inline card renders the full path correctly without garbling or layout issues     |

---

## Permission Inline Card — Scoping

| ID            | Scenario                                                    | Steps                                                                                                                                  | Expected                                                                                                           |
| ------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| PERM-SCOPE-01 | Inline card scoped to requesting task                       | 1. Run two tasks simultaneously 2. Only Task A triggers a file permission request                                                      | Inline card appears only on Task A's execution page; Task B's page is unaffected                                   |
| PERM-SCOPE-02 | Inline card persists while awaiting response                | 1. Trigger a permission request 2. Switch to another task's execution page 3. Switch back to the original task page                    | Inline card is still visible on the original task's page and awaiting a response                                   |
| PERM-SCOPE-03 | Multiple simultaneous permission requests                   | 1. Run three tasks, each triggering a permission request                                                                               | Each task's execution page shows its own inline card independently                                                 |
| PERM-SCOPE-04 | Task completes while permission request is pending          | 1. Trigger a permission request 2. Allow the task to reach a completed state via a separate code path before responding to the request | Inline card is dismissed or resolved; no orphaned card is left on the execution page                               |
| PERM-SCOPE-05 | Task is cancelled with a pending permission request         | 1. Trigger a permission request 2. Cancel/interrupt the task before responding                                                         | Inline card is removed from the execution page; any pending permission grant is revoked or handled gracefully      |
| PERM-SCOPE-06 | Switching between two tasks that both have pending requests | 1. Start Task A and Task B, both triggering permission requests 2. Alternate between Task A's and Task B's execution pages             | Each task's execution page retains its own inline card independently; switching pages does not clear or swap cards |

---

## Filesystem Access — Allowed Paths

| ID         | Scenario                             | Steps                                                                                            | Expected                                                    |
| ---------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| PERM-FS-01 | Read file in allowed workspace       | 1. Configure workspace to allow `/home/user/project` 2. Run a task that reads a file there       | File is read without triggering a permission inline card    |
| PERM-FS-02 | Write file in allowed workspace      | 1. Configure workspace to allow `/home/user/project` 2. Run a task that writes a file there      | File is written without triggering a permission inline card |
| PERM-FS-03 | Read file outside allowed workspace  | 1. Configure workspace to allow `/home/user/project` 2. Run a task that reads `/etc/passwd`      | Permission inline card is shown                             |
| PERM-FS-04 | Write file outside allowed workspace | 1. Configure workspace to allow `/home/user/project` 2. Run a task that writes to `/tmp/out.txt` | Permission inline card is shown                             |

---

## Filesystem Access — Persistence

> **Session definition**: A session lasts until the application is restarted or the workspace is changed. Approved paths are retained in memory for the current session and cleared on restart.

| ID              | Scenario                                                     | Steps                                                                                                                  | Expected                                                                                                                                        |
| --------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| PERM-PERSIST-01 | Approved path persisted for session                          | 1. Approve a permission request for `/tmp` 2. Run a second task accessing a file in `/tmp`                             | No inline card shown for the second task; the file operation succeeds; previously approved path is reused                                       |
| PERM-PERSIST-02 | Denied path not persisted                                    | 1. Deny a permission request for `/tmp` 2. Run a second task accessing `/tmp`                                          | Permission inline card is shown again for the second task                                                                                       |
| PERM-PERSIST-03 | Permissions reset between sessions                           | 1. Approve a path 2. Restart the application 3. Run a task accessing the same path                                     | Permission inline card is shown again after restart                                                                                             |
| PERM-FS-SUBDIR  | Subdirectory access inherits parent approval                 | 1. Approve `/home/user/project` 2. Run a task accessing `/home/user/project/src/main.ts`                               | No inline card shown; file operation succeeds because path falls within the approved parent directory                                           |
| PERM-FS-SYMLINK | Symbolic link resolution requests permission for real path   | 1. Create a symlink at `/tmp/link → /etc/hosts` 2. Run a task that reads `/tmp/link`                                   | Permission inline card shown for the resolved real path (`/etc/hosts`) if that path is not already approved                                     |
| PERM-FS-RELABS  | Relative vs absolute path normalisation                      | 1. Approve `/home/user/project` 2. Run a task using the relative path `project/file.txt` (from `/home/user`)           | Paths are normalised to absolute form before checking; no inline card shown if the resolved path is already approved                            |
| PERM-FS-OPS     | Permission prompt covers delete, rename, and list operations | 1. Run a task that deletes, renames, or lists files outside the configured workspace                                   | Permission inline card is shown for each operation type; each card displays the correct operation label (DELETE, RENAME, LIST, etc.)            |
| PERM-FS-NORM    | Path normalisation (dots, double slashes)                    | 1. Approve `/home/user/project` 2. Run a task accessing `/home/user/project/../project/file.txt` or `//home//user/...` | Paths are normalised before lookup; no duplicate permission prompt is shown for a path already covered by an approved entry after normalisation |

> **Platform note**: Path tests above use POSIX paths. On Windows, replace `/` with `\` and adjust root paths accordingly (e.g., `C:\Users\user\project`).
