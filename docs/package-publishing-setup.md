# Package Publishing Setup

This document explains the complete setup for publishing `@accomplish/core` and `@accomplish/shared` packages to npm.

## Overview

This PR enables automated npm publishing for the monorepo's shared packages using [Changesets](https://github.com/changesets/changesets) for version management and GitHub Actions for CI/CD.

### What was added

| Component | Purpose |
|-----------|---------|
| Changesets | Version management, changelog generation |
| GitHub Actions workflow | Automated publishing to npm |
| CI guardrails | Enforce changesets for package changes |
| Documentation | Publishing workflow in CLAUDE.md |

---

## Files Changed

### 1. Package Metadata

#### `packages/shared/package.json`

**Before:**
```json
{
  "name": "@accomplish/shared",
  "version": "0.1.0",
  "private": true,
  ...
}
```

**After:**
```json
{
  "name": "@accomplish/shared",
  "version": "0.1.0",
  "description": "Shared types, constants, and utilities for Accomplish desktop and CLI",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/accomplish-ai/accomplish.git",
    "directory": "packages/shared"
  },
  "publishConfig": {
    "access": "public"
  },
  ...
}
```

**Changes:**
- Removed `"private": true` - allows npm publishing
- Added `description` - appears on npm package page
- Added `license` - MIT license
- Added `repository` - links to GitHub source
- Added `publishConfig.access: "public"` - required for scoped packages (@accomplish/*)

#### `packages/core/package.json`

Same changes as shared, with:
- Description: "Core logic for Accomplish desktop and CLI - OpenCode adapter, storage, providers, skills"
- Directory: "packages/core"

---

### 2. Changesets Configuration

#### `.changeset/config.json`

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [
    ["@accomplish/shared", "@accomplish/core"]
  ],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["@accomplish/desktop"]
}
```

**Configuration explained:**

| Option | Value | Purpose |
|--------|-------|---------|
| `changelog` | `@changesets/cli/changelog` | Default changelog format |
| `commit` | `false` | Don't auto-commit version bumps |
| `fixed` | `[]` | No fixed version groups |
| `linked` | `[["@accomplish/shared", "@accomplish/core"]]` | These packages version together |
| `access` | `"public"` | Publish as public packages |
| `baseBranch` | `"main"` | Compare against main branch |
| `updateInternalDependencies` | `"patch"` | Auto-bump dependents on patch releases |
| `ignore` | `["@accomplish/desktop"]` | Desktop app excluded from publishing |

#### `.changeset/README.md`

Auto-generated documentation explaining how to use changesets.

---

### 3. Root Package Scripts

#### `package.json` (root)

**Added scripts:**
```json
{
  "scripts": {
    "changeset": "changeset",
    "version-packages": "changeset version",
    "release": "pnpm build && pnpm publish -r --access public"
  }
}
```

**Added dependency:**
```json
{
  "devDependencies": {
    "@changesets/cli": "^2.29.8"
  }
}
```

**Script purposes:**

| Script | Command | Purpose |
|--------|---------|---------|
| `changeset` | `pnpm changeset` | Create a new changeset (interactive) |
| `version-packages` | `pnpm version-packages` | Apply changesets, bump versions, update changelogs |
| `release` | `pnpm release` | Build all packages and publish to npm |

---

### 4. GitHub Actions Workflows

#### `.github/workflows/publish-packages.yml` (NEW)

```yaml
name: Publish Packages

on:
  push:
    branches:
      - main

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repo
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: pnpm install

      - name: Create Release PR or Publish
        uses: changesets/action@v1
        with:
          commit: "chore: release packages"
          title: "chore: release packages"
          publish: pnpm release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**How it works:**

1. Triggers on every push to `main`
2. Uses `changesets/action@v1` which:
   - **If changesets exist:** Creates a "Release PR" with version bumps and changelog updates
   - **If no changesets (after merging Release PR):** Publishes packages to npm
3. Requires `NPM_TOKEN` secret for npm authentication

#### `.github/workflows/ci.yml` (MODIFIED)

**Added job: `changeset-check`**

```yaml
changeset-check:
  name: Changeset Check
  runs-on: ubuntu-latest
  if: github.event_name == 'pull_request'
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      with:
        fetch-depth: 0

    - name: Check for package changes
      id: changes
      run: |
        CHANGED_FILES=$(git diff --name-only origin/${{ github.base_ref }}...HEAD)
        PACKAGE_CHANGES=$(echo "$CHANGED_FILES" | grep -E "^packages/(core|shared)/" || true)

        if [ -n "$PACKAGE_CHANGES" ]; then
          echo "package_changes=true" >> $GITHUB_OUTPUT
        else
          echo "package_changes=false" >> $GITHUB_OUTPUT
        fi

    - name: Check for changeset
      if: steps.changes.outputs.package_changes == 'true'
      run: |
        CHANGED_FILES=$(git diff --name-only origin/${{ github.base_ref }}...HEAD)
        CHANGESET_FILES=$(echo "$CHANGED_FILES" | grep -E "^\.changeset/.*\.md$" | grep -v "README.md" || true)

        if [ -z "$CHANGESET_FILES" ]; then
          echo "::error::Changes detected in packages/core or packages/shared but no changeset found."
          exit 1
        fi
```

**Purpose:**
- Only runs on pull requests
- Detects changes to `packages/core/**` or `packages/shared/**`
- **Fails CI** if package changes exist without a changeset file
- Provides helpful error message with instructions

---

### 5. Documentation

#### `CLAUDE.md` (MODIFIED)

Added new section "Publishing Packages (Changesets)" with:
- How to create a changeset
- Automated release process
- Manual release commands

---

## How the Publishing Flow Works

### Developer Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Make changes to @accomplish/core or @accomplish/shared  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Run: pnpm changeset                                      │
│    - Select packages that changed                           │
│    - Choose bump type (patch/minor/major)                   │
│    - Write summary for changelog                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Commit changeset file (.changeset/random-name.md)        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Create PR → CI runs changeset-check → Merge to main      │
└─────────────────────────────────────────────────────────────┘
```

### Automated Release Flow

```
┌─────────────────────────────────────────────────────────────┐
│ PR merged to main (with changeset files)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ GitHub Action: publish-packages.yml runs                    │
│ changesets/action detects changesets exist                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Creates "Release PR" automatically                          │
│ - Bumps versions in package.json                            │
│ - Updates CHANGELOG.md                                      │
│ - Deletes consumed changeset files                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Review and merge Release PR                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ GitHub Action runs again                                    │
│ No changesets exist → runs: pnpm release                    │
│ Publishes packages to npm                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Setup Required

### 1. Add NPM_TOKEN Secret

1. Go to [npmjs.com](https://www.npmjs.com) → Account Settings → Access Tokens
2. Generate new token with "Automation" type
3. Go to GitHub repo → Settings → Secrets and variables → Actions
4. Add new secret: `NPM_TOKEN` with the npm token value

### 2. Verify GitHub Actions Permissions

1. Go to GitHub repo → Settings → Actions → General
2. Under "Workflow permissions", enable "Read and write permissions"
3. Check "Allow GitHub Actions to create and approve pull requests"

---

## Commands Reference

| Command | Purpose |
|---------|---------|
| `pnpm changeset` | Create a new changeset (interactive) |
| `pnpm changeset status` | Check pending changesets |
| `pnpm version-packages` | Apply changesets and bump versions (manual) |
| `pnpm release` | Build and publish all packages (manual) |

---

## Changeset File Format

A changeset file looks like this:

```markdown
---
"@accomplish/shared": patch
"@accomplish/core": minor
---

Description of changes for the changelog.

- Added new feature X
- Fixed bug Y
```

**Bump types:**
- `patch` (0.0.X) - Bug fixes, small changes
- `minor` (0.X.0) - New features, backwards compatible
- `major` (X.0.0) - Breaking changes

---

## FAQ

### Q: What if I forget to add a changeset?

CI will fail with an error message telling you to run `pnpm changeset`.

### Q: What if my changes don't need a release?

Run `pnpm changeset add --empty` to create an empty changeset that won't trigger a version bump.

### Q: Can I edit a changeset after creating it?

Yes, changeset files are just markdown. Edit them directly before committing.

### Q: What happens to the desktop app?

The `@accomplish/desktop` package is in the `ignore` list and won't be affected by changesets or published to npm.

### Q: Where are packages published?

To npm (https://registry.npmjs.org) as public packages:
- https://www.npmjs.com/package/@accomplish/core
- https://www.npmjs.com/package/@accomplish/shared
