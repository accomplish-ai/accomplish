# Skills Directory Restructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename `skills/` → `mcp-tools/` and `official-skills/` → `bundled-skills/` to clarify their distinct purposes.

**Architecture:** Git mv to rename directories, then update all file references. Critical files are config-generator.ts, SkillsManager.ts, package.json, postinstall.cjs, and bundle-skills.cjs.

**Tech Stack:** Electron, TypeScript, pnpm

---

### Task 1: Rename directories with git mv

**Files:**
- Rename: `apps/desktop/skills/` → `apps/desktop/mcp-tools/`
- Rename: `apps/desktop/official-skills/` → `apps/desktop/bundled-skills/`

**Step 1: Rename skills to mcp-tools**

Run:
```bash
cd /Users/danielscharfstein/Documents/accomplish/github-repos/openwork.feat-add-skills
git mv apps/desktop/skills apps/desktop/mcp-tools
```

Expected: Directory renamed, git tracks as rename

**Step 2: Rename official-skills to bundled-skills**

Run:
```bash
git mv apps/desktop/official-skills apps/desktop/bundled-skills
```

Expected: Directory renamed, git tracks as rename

**Step 3: Verify renames**

Run:
```bash
ls apps/desktop/ | grep -E "mcp-tools|bundled-skills"
```

Expected:
```
bundled-skills
mcp-tools
```

**Step 4: Commit directory renames**

```bash
git add -A && git commit -m "refactor: rename skills directories for clarity

- skills/ → mcp-tools/ (MCP tool server implementations)
- official-skills/ → bundled-skills/ (prompt-based skills shipped with app)"
```

---

### Task 2: Update config-generator.ts

**Files:**
- Modify: `apps/desktop/src/main/opencode/config-generator.ts:27-45`

**Step 1: Update getSkillsPath function**

Open `apps/desktop/src/main/opencode/config-generator.ts` and replace lines 26-40:

```typescript
/**
 * Get the MCP tools directory path (contains MCP servers)
 * In dev: apps/desktop/mcp-tools
 * In packaged: resources/mcp-tools (unpacked from asar)
 */
export function getSkillsPath(): string {
  if (app.isPackaged) {
    // In packaged app, mcp-tools should be in resources folder (unpacked from asar)
    return path.join(process.resourcesPath, 'mcp-tools');
  } else {
    // In development, use app.getAppPath() which returns the desktop app directory
    // app.getAppPath() returns apps/desktop in dev mode
    return path.join(app.getAppPath(), 'mcp-tools');
  }
}
```

**Step 2: Update getOpenCodeConfigDir comment**

Replace lines 42-45:

```typescript
/**
 * Get the OpenCode config directory path (parent of mcp-tools/ for OPENCODE_CONFIG_DIR)
 * OpenCode looks for skills at $OPENCODE_CONFIG_DIR/mcp-tools/<name>/SKILL.md
 */
```

**Step 3: Commit**

```bash
git add apps/desktop/src/main/opencode/config-generator.ts
git commit -m "refactor: update config-generator.ts for mcp-tools path"
```

---

### Task 3: Update SkillsManager.ts

**Files:**
- Modify: `apps/desktop/src/main/skills/SkillsManager.ts:20-31`

**Step 1: Update getBundledSkillsPath function**

Open `apps/desktop/src/main/skills/SkillsManager.ts` and replace lines 20-31:

```typescript
  /**
   * Get the bundled skills directory path.
   * These are user-facing skills bundled with the app.
   * In dev: apps/desktop/bundled-skills
   * In packaged: resources/bundled-skills
   */
  getBundledSkillsPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'bundled-skills');
    }
    return path.join(app.getAppPath(), 'bundled-skills');
  }
```

**Step 2: Commit**

```bash
git add apps/desktop/src/main/skills/SkillsManager.ts
git commit -m "refactor: update SkillsManager.ts for bundled-skills path"
```

---

### Task 4: Update package.json extraResources

**Files:**
- Modify: `apps/desktop/package.json:148-149, 163-164`

**Step 1: Update skills extraResources entry**

Open `apps/desktop/package.json` and find the extraResources section (around line 148). Change:

```json
{
  "from": "skills",
  "to": "skills",
```

To:

```json
{
  "from": "mcp-tools",
  "to": "mcp-tools",
```

**Step 2: Update official-skills extraResources entry**

Find the official-skills entry (around line 163). Change:

```json
{
  "from": "official-skills",
  "to": "official-skills",
```

To:

```json
{
  "from": "bundled-skills",
  "to": "bundled-skills",
```

**Step 3: Commit**

```bash
git add apps/desktop/package.json
git commit -m "refactor: update package.json extraResources for renamed directories"
```

---

### Task 5: Update postinstall.cjs

**Files:**
- Modify: `apps/desktop/scripts/postinstall.cjs:100-111`

**Step 1: Update skills references**

Open `apps/desktop/scripts/postinstall.cjs` and replace lines 100-113:

```javascript
// Install shared MCP tools runtime dependencies (Playwright) at mcp-tools/ root
if (useBundledSkills) {
  runCommand('npm --prefix mcp-tools install --omit=dev', 'Installing shared MCP tools runtime dependencies');
}

// Install per-tool dependencies for dev/tsx workflows
if (!useBundledSkills) {
  // Use --omit=dev to exclude devDependencies (vitest, @types/*) - not needed at runtime
  // This significantly reduces installer size and build time
  const tools = ['dev-browser', 'dev-browser-mcp', 'file-permission', 'ask-user-question', 'complete-task'];
  for (const tool of tools) {
    runCommand(`npm --prefix mcp-tools/${tool} install --omit=dev`, `Installing ${tool} dependencies`);
  }
}
```

**Step 2: Commit**

```bash
git add apps/desktop/scripts/postinstall.cjs
git commit -m "refactor: update postinstall.cjs for mcp-tools path"
```

---

### Task 6: Update bundle-skills.cjs

**Files:**
- Modify: `apps/desktop/scripts/bundle-skills.cjs:7`

**Step 1: Update skillsDir path**

Open `apps/desktop/scripts/bundle-skills.cjs` and change line 7:

```javascript
const skillsDir = path.join(__dirname, '..', 'mcp-tools');
```

**Step 2: Commit**

```bash
git add apps/desktop/scripts/bundle-skills.cjs
git commit -m "refactor: update bundle-skills.cjs for mcp-tools path"
```

---

### Task 7: Update mcp-tools/package.json

**Files:**
- Modify: `apps/desktop/mcp-tools/package.json:2`

**Step 1: Update package name**

Open `apps/desktop/mcp-tools/package.json` and change line 2:

```json
{
  "name": "openwork-mcp-tools",
```

**Step 2: Commit**

```bash
git add apps/desktop/mcp-tools/package.json
git commit -m "refactor: rename package to openwork-mcp-tools"
```

---

### Task 8: Update file path comments in mcp-tools

**Files:**
- Modify: `apps/desktop/mcp-tools/dev-browser-mcp/src/snapshot/*.ts` (6 files)

**Step 1: Update path comments**

For each file in `apps/desktop/mcp-tools/dev-browser-mcp/src/snapshot/`, update the first line comment from `// apps/desktop/skills/...` to `// apps/desktop/mcp-tools/...`:

Files to update:
- `index.ts`
- `differ.ts`
- `differ.test.ts`
- `manager.ts`
- `manager.test.ts`
- `parser.ts`
- `parser.test.ts`
- `types.ts`

**Step 2: Commit**

```bash
git add apps/desktop/mcp-tools/
git commit -m "refactor: update path comments in mcp-tools"
```

---

### Task 9: Update documentation and test script comments

**Files:**
- Modify: `apps/desktop/scripts/test-local-agent-config.ts:56`
- Modify: `apps/desktop/docs/PR-289-CODE-REVIEW.md` (optional - references old paths)

**Step 1: Update test script comment**

Open `apps/desktop/scripts/test-local-agent-config.ts` and update line 56:

```typescript
  // MCP tools are at apps/desktop/mcp-tools/
```

**Step 2: Commit**

```bash
git add apps/desktop/scripts/test-local-agent-config.ts
git commit -m "refactor: update comments for mcp-tools path"
```

---

### Task 10: Verify everything works

**Step 1: Run pnpm install to verify postinstall**

```bash
cd /Users/danielscharfstein/Documents/accomplish/github-repos/openwork.feat-add-skills/apps/desktop
pnpm install
```

Expected: Postinstall completes without errors

**Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: No TypeScript errors

**Step 3: Run dev to verify app starts**

```bash
pnpm dev
```

Expected: App starts, MCP tools load, bundled skills appear in Skills panel

**Step 4: Push all changes**

```bash
git push origin feat/add-skills
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Rename directories with git mv |
| 2 | Update config-generator.ts |
| 3 | Update SkillsManager.ts |
| 4 | Update package.json extraResources |
| 5 | Update postinstall.cjs |
| 6 | Update bundle-skills.cjs |
| 7 | Update mcp-tools/package.json |
| 8 | Update file path comments in mcp-tools |
| 9 | Update documentation/test script comments |
| 10 | Verify everything works |
