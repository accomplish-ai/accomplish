# Windows CI/CD Support Design

## Goal

Add Windows support to CI and release pipelines:
- Run unit/integration tests + typecheck on Windows in CI
- Build and publish unsigned Windows installers in releases
- Support selective platform builds for testing

## CI Workflow Changes

New job in `.github/workflows/ci.yml`:

```yaml
windows-ci:
  name: Windows CI
  runs-on: windows-latest

  steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Setup pnpm
      uses: pnpm/action-setup@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'pnpm'

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    - name: Run unit tests
      run: pnpm -F @accomplish/desktop test:unit

    - name: Run integration tests
      run: pnpm -F @accomplish/desktop test:integration

    - name: Run typecheck
      run: pnpm -F @accomplish/desktop typecheck

    - name: Upload test results
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: windows-test-results
        path: apps/desktop/coverage/
        retention-days: 7
```

- Runs in parallel with Linux jobs
- No E2E tests (Docker/Xvfb not available on Windows)
- Native modules use prebuilds (no compilation)

## Release Workflow Changes

### New Workflow Dispatch Input

```yaml
workflow_dispatch:
  inputs:
    bump_type:
      description: 'Version bump type'
      required: true
      type: choice
      options:
        - patch
        - minor
        - major
    platforms:
      description: 'Platforms to build'
      required: true
      type: choice
      options:
        - all
        - windows-only
        - macos-only
      default: all
    dry_run:
      description: 'Test mode - skips push to main, creates test release'
      required: false
      type: boolean
      default: false
```

### New Windows Build Job

```yaml
build-windows-x64:
  name: Build Windows (x64)
  needs: version-bump
  if: inputs.platforms == 'all' || inputs.platforms == 'windows-only'
  runs-on: windows-latest

  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      with:
        ref: v${{ needs.version-bump.outputs.new_version }}

    - name: Setup pnpm
      uses: pnpm/action-setup@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'pnpm'

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    - name: Download Node.js binaries
      run: pnpm -F @accomplish/desktop download:nodejs

    - name: Build desktop app
      run: pnpm -F @accomplish/desktop build

    - name: Package (unsigned)
      run: node scripts/package.cjs --win --x64 --publish never
      working-directory: apps/desktop
      env:
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        CSC_IDENTITY_AUTO_DISCOVERY: false

    - name: Upload artifacts
      uses: actions/upload-artifact@v4
      with:
        name: Openwork-Windows-x64
        path: apps/desktop/release/*.exe
        retention-days: 30
```

### Update Existing macOS Jobs

Add conditional execution:

```yaml
build-mac-arm64:
  if: inputs.platforms == 'all' || inputs.platforms == 'macos-only'
  ...

build-mac-x64:
  if: inputs.platforms == 'all' || inputs.platforms == 'macos-only'
  ...
```

### Update create-release Job

- Update needs to include Windows build
- Download Windows artifacts conditionally
- Include Windows files in release

## Expected Release Artifacts

- `Openwork-x.x.x-mac-arm64.dmg` / `.zip`
- `Openwork-x.x.x-mac-x64.dmg` / `.zip`
- `Openwork-x.x.x-win-x64.exe` (new)

## Unsigned Build Behavior

Users see Windows SmartScreen warning on first run:
- "Windows protected your PC"
- Click "More info" → "Run anyway" to proceed

## Future: Code Signing

When certificate is available, add secrets:
- `WIN_CSC_LINK` - Base64-encoded .pfx certificate
- `WIN_CSC_KEY_PASSWORD` - Certificate password

Update build step env:
```yaml
env:
  CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
  CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
```

## Testing Strategy

1. Run release workflow with `platforms: windows-only` + `dry_run: true`
2. Verify Windows build succeeds and artifact uploads
3. Download and test installer manually
4. Run full release with `platforms: all` once validated

## No Changes Needed

These files already support Windows:
- `postinstall.cjs` - Handles Windows native module prebuilds
- `download-nodejs.cjs` - Includes Windows Node.js binaries
- `package.json` build config - Has Windows NSIS settings
