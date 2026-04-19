# WebStorm / IntelliJ Run Configurations

One-click **Run** / **Debug** from the IDE for the core local workflow: dev server, packaged local build, and packaged-artifact smoke.

## Why configs aren't committed

The repo's top-level `.gitignore` ignores `.idea/` entirely, so WebStorm settings stay local to each machine. This file is the contributor-facing source of truth: copy the XML snippets below into your own `.idea/runConfigurations/`, **or** recreate them through the WebStorm UI once. Claude Code can also read this doc to know which configs are the canonical ones.

## The three configurations

Any other npm script can be added as a run config the same way — these are just the three most commonly used for this repo.

| Config name                                  | Workspace      | What it runs                                                             | When you'd use it                                                                                                             |
| -------------------------------------------- | -------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Electron Main (1. Start)                     | root           | `pnpm dev` with `ELECTRON_DEBUG=1`                                       | Everyday dev: Vite dev server + Electron main, hot reload on the UI                                                           |
| Desktop: build:unpack                        | `apps/desktop` | Full pipeline → produces `apps/desktop/release/mac-arm64/Accomplish.app` | Fastest local packaged build for GUI smoke (chains `download:nodejs` → daemon build → `stage:daemon-deps` → electron-builder) |
| Desktop: smoke:packaged-opencode (mac-arm64) | `apps/desktop` | Validate packaged `opencode --version` + `serve --port=0` ready-line     | After a `build:unpack`, to confirm the packaged `.app` is healthy                                                             |

## Setup — two paths

### Path A: copy the XML files (fastest, ≈10 seconds)

1. Create the directory if it doesn't exist:
   ```bash
   mkdir -p .idea/runConfigurations
   ```
2. Save each XML block below as `.idea/runConfigurations/<any-filename>.xml` (WebStorm reads the `name=` attribute for display).
3. In WebStorm, **Run → Edit Configurations → Reload** (or just re-open the project). The configs appear in the dropdown next to the green ▶ button.

### Path B: create through the WebStorm UI (≈30 seconds per config)

1. **Run → Edit Configurations → + → npm**
2. Fill in:
   - **Name:** e.g. `Desktop: build:unpack`
   - **package.json:** pick the right workspace's `package.json` (e.g. `apps/desktop/package.json`)
   - **Command:** `run`
   - **Scripts:** the script name (e.g. `build:unpack`)
   - **Package manager:** `pnpm` (or `project` if pnpm is the project default)
   - **Node interpreter:** `project` (inherits from project-level Node settings)
3. Apply, close, run.

For scripts that need CLI arguments (e.g. `smoke:packaged-opencode`), add them to the **Arguments** field with `--` as the separator:

```
-- --artifact-dir=release/mac-arm64/Accomplish.app --expected-version=1.14.18
```

## Typical workflow

1. Run **Desktop: build:unpack** — full chain, produces `apps/desktop/release/mac-arm64/Accomplish.app`
2. In a terminal:
   ```bash
   xattr -cr apps/desktop/release/mac-arm64/Accomplish.app
   open apps/desktop/release/mac-arm64/Accomplish.app
   ```
3. Run **Desktop: smoke:packaged-opencode (mac-arm64)** to verify the packaged OpenCode + `opencode serve --port=0` both work

## XML templates

### Desktop: build:unpack

```xml
<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="Desktop: build:unpack" type="js.build_tools.npm" factoryName="npm">
    <package-json value="$PROJECT_DIR$/apps/desktop/package.json" />
    <command value="run" />
    <scripts>
      <script value="build:unpack" />
    </scripts>
    <node-interpreter value="project" />
    <package-manager value="pnpm" />
    <method v="2" />
  </configuration>
</component>
```

### Desktop: smoke:packaged-opencode (mac-arm64)

Pre-configured with arguments for the darwin-arm64 artifact. Duplicate and tweak `--artifact-dir` / `--expected-version` for other platforms.

```xml
<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="Desktop: smoke:packaged-opencode (mac-arm64)" type="js.build_tools.npm" factoryName="npm">
    <package-json value="$PROJECT_DIR$/apps/desktop/package.json" />
    <command value="run" />
    <scripts>
      <script value="smoke:packaged-opencode" />
    </scripts>
    <arguments value="-- --artifact-dir=release/mac-arm64/Accomplish.app --expected-version=1.14.18" />
    <node-interpreter value="project" />
    <package-manager value="pnpm" />
    <method v="2" />
  </configuration>
</component>
```

## Troubleshooting

**Configs don't appear after saving the XML files.** WebStorm only re-reads `.idea/runConfigurations/` on project reload. Close and reopen the project, or **Run → Edit Configurations → Reload**.

**"No Node interpreter" warning.** Open **Settings → Languages & Frameworks → Node.js** and set the interpreter to your system Node (typically resolved via nvm / fnm / Volta to match `.nvmrc`). The existing `Electron Main (1. Start)` config inherits from the same project-level setting, so if that one works, the rest will too.

**"Package manager not detected."** Either set **Package manager** to `pnpm` in the config, or project-wide at **Settings → Languages & Frameworks → Node.js → Package manager**.

**`pnpm: command not found` when a config runs.** WebStorm is using a Node install that doesn't have pnpm on its PATH. Either install pnpm globally in that Node (`corepack enable pnpm`), or pin a pnpm binary path under **Package manager** in the Node.js settings.

**`build:unpack` errors on missing bundled Node.** The chain auto-runs `download:nodejs` — if it still fails, check that `apps/desktop/scripts/node-version.cjs` is current with `.nvmrc` and re-try. The downloader is idempotent (SHA256-checked) so re-running is safe.

## Adding more configs

Everything else is an npm script in one of the workspace `package.json` files — pick what you need and follow Path B above. Candidates that aren't included here but are useful occasionally: `package:mac` / `package:win` / `package:linux` (CI-parity builds), `test` in each workspace, `download:nodejs` (standalone), `stage:daemon-deps` (standalone; normally auto-chained by `build:unpack`).
