# Project Rules

Single source of truth for all Accomplish development rules.
Referenced from `CLAUDE.md` and the `address-ticket` skill.

---

## Code Quality

### ESM / agent-core
- **No `require()` in agent-core** — it is `"type": "module"`; use `import` everywhere
- **`.js` extensions required** on every internal import inside agent-core
  ```ts
  // ✅
  import { foo } from './utils/bar.js'
  // ❌
  import { foo } from './utils/bar'
  ```
- Do not use internal classes directly — always go through factories:
  `createTaskManager`, `createStorage`, `createPermissionHandler`, etc.

### TypeScript & Style
- **Always use braces** for `if`/`else`/`for`/`while` — enforced by ESLint `curly` rule
- **No nested ternaries** — use a mapper object or if/else
- **No `console.log` in production code** — use the app's existing logger
- **Reuse UI components** — check `apps/web/src/client/components/ui/` before creating new ones

### File size
- **New files must be < 200 lines** — split into logical modules when needed
- Exceptions: generated files, SQLite migration files, files the user explicitly allows

### Image assets
- Always use ES module imports in the web UI:
  ```ts
  // ✅
  import logo from '/assets/logo.png'
  // ❌  (breaks in packaged app)
  const logo = '/assets/logo.png'
  ```

### Browser bundle safety
- `apps/web` runs in the browser — **never import Node.js-only modules** from agent-core
  into web code. The Vite config externalizes `@aws-sdk/*` and Node built-ins, but new
  Node-only deps you add won't be caught automatically.
- If you add a Node.js-only import to agent-core that web also consumes, guard it behind
  a separate entry point or move it to a file web doesn't import.
- **Test the web build** (`pnpm build:web`) — it will fail if a Node.js module leaks in.

### Encryption / secure storage
- **Never create a new encryption scheme.** Use `SecureStorage` from agent-core for all
  sensitive data (API keys, tokens). It uses AES-256-GCM with machine-derived PBKDF2 keys
  and atomic file writes.
- If you need to store new sensitive data, add a method to the existing `SecureStorage`
  class — do not roll your own crypto.

### Daemon workspace (`apps/daemon`)
- The daemon is a plain Node.js process — **no Electron imports allowed** (`electron`,
  `@electron/*`, `electron-store`, etc.). It must run without Electron.
- Daemon depends on `@accomplish_ai/agent-core` only. If you need desktop-specific
  logic, it belongs in `apps/desktop`, not `apps/daemon`.

### Zustand store patterns
- **Token-based deduplication**: When writing async store actions, capture a request
  token before the async call and validate it before applying results. This prevents
  stale responses from overwriting current state.
  ```ts
  // ✅ Capture token, validate before applying
  const token = get()._requestToken;
  const result = await api.fetch();
  if (get()._requestToken !== token) { return; } // stale
  set({ data: result });
  ```
- Increment the token when cancelling or clearing state.

---

## IPC Chain (Electron ↔ Web)

Adding any new main-process capability requires **all four steps** — never skip one:

1. **Handler** in `apps/desktop/src/main/ipc/handlers.ts`
2. **Expose** via `contextBridge` in `apps/desktop/src/preload/index.ts`
3. **Typed wrapper** in `apps/web/src/client/lib/accomplish.ts`
4. **Consume** from a component or `apps/web/src/client/stores/taskStore.ts`
5. Run `pnpm typecheck` to verify the full chain compiles

When a PR adds a new `window.accomplish.*` method, verify it is typed in `accomplish.ts`
and has at least one test.

---

## SQLite / Migrations

- DB: `accomplish.db` (prod) / `accomplish-dev.db` (dev), in Electron user-data directory
- Current schema version: **6** — in `packages/agent-core/src/storage/migrations/index.ts`
- **Never modify a released migration file** — always add a new `vXXX-description.ts`,
  import it, append it to the `migrations` array, and bump `CURRENT_VERSION`
- **Every migration must explain WHY** — add a comment at the top of the `up()` function
  explaining the reason for the schema change, not just what it does

---

## Never Remove Features

Do **not** delete, comment out, or disable existing functionality unless the task
explicitly requires removal. This applies to:

- Exported functions, components, types, or IPC handlers
- UI elements (JSX blocks, buttons, tabs, routes)
- Config/registry entries
- Entire files (unless they are replaced by something equivalent)

If you find yourself removing something not mentioned in the ticket, **stop and confirm**
with the user before proceeding. When in doubt, keep it.

---

## Git Rules

### Always start from an up-to-date main

Before creating any branch:

```bash
git checkout main
git pull origin main
git log origin/main..HEAD   # must be empty — if not, stop and ask
```

Never branch off a stale `main`. If there is local work on `main` that has not been
pushed, stop and ask the user what to do.

### Branch naming

```
feat/ENG-XXX-short-description    # new capability
fix/ENG-XXX-short-description     # bug fix
refactor/ENG-XXX-short-description
chore/ENG-XXX-short-description
```

### Conventional commits

```
feat(scope): short description
fix(scope): short description
refactor(scope): description
chore(scope): description
```

Always write the ticket key in the commit body or PR description so it links back to Jira.

### Force-push policy

**Never force-push a branch that has an open PR.** Reviewers lose their comment context.
If you need to rewrite history, create a new branch instead.

---

## Pre-push Checklist

Run **in order** and fix before continuing. Do not push if any step fails.

```bash
# 1. Install deps if any package.json changed
git diff --name-only HEAD~1 | grep "package\.json" && pnpm install

# 2. Typecheck
pnpm typecheck

# 3. Lint + format
pnpm lint:eslint && pnpm format:check

# 4. Build  (catches import/ESM/alias errors the above miss)
pnpm build

# 5. Tests — only for workspaces where you changed files
pnpm -F @accomplish/web test:unit          # if apps/web changed
pnpm -F @accomplish/desktop test:unit      # if apps/desktop changed
pnpm -F @accomplish_ai/agent-core test     # if packages/agent-core changed
pnpm -F @accomplish/daemon test            # if apps/daemon changed
```

Extra checks when touching the IPC layer:

```bash
pnpm -F @accomplish/web test:integration
```

---

## Styling (web UI)

- **Tailwind CSS** + **shadcn/ui** components — check `ui/` before creating a new component
- **CSS variables** for theming — never hardcode color values
- **Animations** via `apps/web/src/client/lib/animations.ts` (Framer Motion)
- **DM Sans** font

---

## Bundled Node.js

The packaged app ships Node.js v20.18.1. When spawning `npx` / `node` from the main
process, prepend `bundledPaths.binDir` to `PATH` — otherwise the process exits 127 on
machines without system Node.js.

---

## TypeScript Path Aliases

| Alias | Resolves to |
|-------|-------------|
| `@/*` (web only) | `apps/web/src/client/*` |
| `@main/*` (desktop only) | `apps/desktop/src/main/*` |
| `@accomplish_ai/agent-core` | `packages/agent-core/src/index.ts` |
| `@accomplish_ai/agent-core/common` | `packages/agent-core/src/common.ts` |

Desktop does **not** have an `@/*` alias — UI code lives in `apps/web`.

---

## What NOT to do

| Don't | Do instead |
|-------|-----------|
| `require()` in agent-core | `import` |
| Import without `.js` in agent-core | Add the `.js` extension |
| Hardcode `/assets/logo.png` | `import logo from '/assets/logo.png'` |
| Skip IPC steps | All 4 steps, always |
| Modify a released migration | Add `vXXX-new.ts` |
| Remove a feature without asking | Ask first |
| Branch off stale `main` | `git pull` first |
| Force-push an open PR branch | Create a new branch |
| Push without running the checklist | Run every step |
| `console.log` in production | Use the app logger |
| Nested ternaries | Mapper object or if/else |
| `if (cond) doThing()` with no braces | Always add `{}` |
| Hardcode colors in CSS | CSS variables |
| New UI component from scratch | Check `ui/` first |
| New file > 200 lines | Split into modules |
| Import `fs`/`path`/`crypto` in web code | Keep Node.js-only code out of web imports |
| Import `electron` in daemon | Daemon is plain Node.js — no Electron |
| Roll custom encryption | Use `SecureStorage` from agent-core |
| Migration without WHY comment | Explain the reason in `up()` |
| Async store action without token check | Capture token, validate before `set()` |
