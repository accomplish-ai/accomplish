# WebStorm / IntelliJ Run Configurations

One-click **Run** / **Debug** from the IDE for the npm scripts you'd otherwise type at the terminal.

## Why configs aren't committed

The repo's top-level `.gitignore` ignores `.idea/` entirely, so WebStorm settings stay local to each machine. Run configurations can't be shared via `.idea/runConfigurations/` without un-ignoring that subtree. This file serves as the contributor-facing source of truth: copy the XML snippets at the end into your own `.idea/runConfigurations/` directory, **or** recreate them through the WebStorm UI once. Claude Code can also read this doc to know which scripts exist and how they fit together.

## Setup — two paths

### Path A: copy the XML files (fastest, ~10 seconds)

1. Create the directory if it doesn't exist:
   ```bash
   mkdir -p .idea/runConfigurations
   ```
2. For each "Config" section below, save the XML block as `.idea/runConfigurations/<Name>.xml` (any filename works; WebStorm reads the `name=` attribute for display).
3. In WebStorm, **Run → Edit Configurations → Reload** (or just re-open the project). The new configs appear in the dropdown next to the green ▶ button.

### Path B: create through the WebStorm UI (~30 seconds per config)

1. **Run → Edit Configurations → + → npm**
2. Fill in:
   - **Name:** e.g. `Desktop: build:unpack`
   - **package.json:** pick the right workspace's `package.json` (e.g. `apps/desktop/package.json`)
   - **Command:** `run`
   - **Scripts:** the script name (e.g. `build:unpack`)
   - **Package manager:** select `pnpm` (or leave on `project` if pnpm is the project default)
   - **Node interpreter:** `project` (inherits from project-level Node settings)
3. Apply, close, run.

For scripts that need CLI arguments (e.g. `smoke:packaged-opencode`), add them to the **Arguments** field with `--` separator:

```
-- --artifact-dir=release/mac-arm64/Accomplish.app --expected-version=1.4.9
```

## What's available

Matching what's in [`apps/desktop/package.json`](../apps/desktop/package.json), [`apps/daemon/package.json`](../apps/daemon/package.json), and [`packages/agent-core/package.json`](../packages/agent-core/package.json):

| Config name                                  | Workspace             | What it runs                                                           | When you'd use it                                                         |
| -------------------------------------------- | --------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Electron Main (1. Start)                     | root                  | `pnpm dev` with `ELECTRON_DEBUG=1`                                     | Everyday dev: Vite dev server + Electron main, hot reload on the UI       |
| Desktop: build:unpack                        | `apps/desktop`        | Full pipeline → produces `release/mac-arm64/Accomplish.app`            | Fastest local packaged build for GUI smoke on Mac                         |
| Desktop: build:electron                      | `apps/desktop`        | Full pipeline → produces target-specific artifacts (.dmg / .zip)       | Closer to real release output locally                                     |
| Desktop: package:mac                         | `apps/desktop`        | Full package + `electron-rebuild`, macOS targets                       | Matches what CI runs on macOS                                             |
| Desktop: package:win                         | `apps/desktop`        | Full package, Windows x64                                              | Matches what CI runs on Windows                                           |
| Desktop: package:linux                       | `apps/desktop`        | Full package, Linux x64 + arm64                                        | Matches what CI runs on Linux                                             |
| Desktop: download:nodejs                     | `apps/desktop`        | Fetch/verify bundled Node archives                                     | First-time setup or after bumping `apps/desktop/scripts/node-version.cjs` |
| Desktop: stage:daemon-deps                   | `apps/desktop`        | Install daemon native deps into `apps/daemon/dist/` under bundled Node | Prereq for packaged builds; auto-chained in build/package scripts         |
| Desktop: smoke:packaged-opencode (mac-arm64) | `apps/desktop`        | Validate packaged `opencode` version + `serve --port=0` ready-line     | After any build:unpack, to confirm the packaged `.app` is healthy         |
| Daemon: build                                | `apps/daemon`         | `tsup` + post-build `dist/package.json` CJS marker                     | Prereq for `stage:daemon-deps` when running standalone                    |
| Tests: agent-core                            | `packages/agent-core` | `vitest`                                                               | Runs the ~692-test core suite                                             |
| Tests: daemon                                | `apps/daemon`         | `vitest run`                                                           | Runs the ~126-test daemon suite                                           |
| Tests: desktop unit                          | `apps/desktop`        | `vitest run --config vitest.unit.config.ts`                            | Main-process unit tests                                                   |
| Tests: desktop integration                   | `apps/desktop`        | `vitest run --config vitest.integration.config.ts`                     | Main-process integration tests                                            |

## Workflow examples

### Everyday development

Use the existing `Electron Main (1. Start)` config — Vite dev server + Electron main with hot reload.

### Test a packaged macOS build locally

1. Run **Desktop: build:unpack** (the chain auto-runs `download:nodejs` → daemon build → `stage:daemon-deps` → electron-builder)
2. In a terminal, strip quarantine + launch:
   ```bash
   xattr -cr apps/desktop/release/mac-arm64/Accomplish.app
   open apps/desktop/release/mac-arm64/Accomplish.app
   ```
3. Optionally run **Desktop: smoke:packaged-opencode (mac-arm64)** to verify packaged OpenCode + `opencode serve --port=0` both work

### Pre-push check before a PR

Run these in order — same gate CI enforces:

1. **Tests: agent-core**
2. **Tests: daemon**
3. **Tests: desktop unit**
4. **Tests: desktop integration**
5. **Desktop: build:unpack** (catches packaging regressions that unit tests miss)

## Config XML templates

Drop any of these into `.idea/runConfigurations/<filename>.xml`. Filenames are free-form; WebStorm reads the `name=` attribute for the display label.

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

### Desktop: build:electron

```xml
<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="Desktop: build:electron" type="js.build_tools.npm" factoryName="npm">
    <package-json value="$PROJECT_DIR$/apps/desktop/package.json" />
    <command value="run" />
    <scripts>
      <script value="build:electron" />
    </scripts>
    <node-interpreter value="project" />
    <package-manager value="pnpm" />
    <method v="2" />
  </configuration>
</component>
```

### Desktop: package:mac

```xml
<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="Desktop: package:mac" type="js.build_tools.npm" factoryName="npm">
    <package-json value="$PROJECT_DIR$/apps/desktop/package.json" />
    <command value="run" />
    <scripts>
      <script value="package:mac" />
    </scripts>
    <node-interpreter value="project" />
    <package-manager value="pnpm" />
    <method v="2" />
  </configuration>
</component>
```

### Desktop: package:win

```xml
<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="Desktop: package:win" type="js.build_tools.npm" factoryName="npm">
    <package-json value="$PROJECT_DIR$/apps/desktop/package.json" />
    <command value="run" />
    <scripts>
      <script value="package:win" />
    </scripts>
    <node-interpreter value="project" />
    <package-manager value="pnpm" />
    <method v="2" />
  </configuration>
</component>
```

### Desktop: package:linux

```xml
<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="Desktop: package:linux" type="js.build_tools.npm" factoryName="npm">
    <package-json value="$PROJECT_DIR$/apps/desktop/package.json" />
    <command value="run" />
    <scripts>
      <script value="package:linux" />
    </scripts>
    <node-interpreter value="project" />
    <package-manager value="pnpm" />
    <method v="2" />
  </configuration>
</component>
```

### Desktop: download:nodejs

```xml
<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="Desktop: download:nodejs" type="js.build_tools.npm" factoryName="npm">
    <package-json value="$PROJECT_DIR$/apps/desktop/package.json" />
    <command value="run" />
    <scripts>
      <script value="download:nodejs" />
    </scripts>
    <node-interpreter value="project" />
    <package-manager value="pnpm" />
    <method v="2" />
  </configuration>
</component>
```

### Desktop: stage:daemon-deps

```xml
<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="Desktop: stage:daemon-deps" type="js.build_tools.npm" factoryName="npm">
    <package-json value="$PROJECT_DIR$/apps/desktop/package.json" />
    <command value="run" />
    <scripts>
      <script value="stage:daemon-deps" />
    </scripts>
    <node-interpreter value="project" />
    <package-manager value="pnpm" />
    <method v="2" />
  </configuration>
</component>
```

### Desktop: smoke:packaged-opencode (mac-arm64)

Pre-configured with arguments for the darwin-arm64 artifact location. Duplicate and tweak `--artifact-dir` / `--expected-version` for other platforms as needed.

```xml
<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="Desktop: smoke:packaged-opencode (mac-arm64)" type="js.build_tools.npm" factoryName="npm">
    <package-json value="$PROJECT_DIR$/apps/desktop/package.json" />
    <command value="run" />
    <scripts>
      <script value="smoke:packaged-opencode" />
    </scripts>
    <arguments value="-- --artifact-dir=release/mac-arm64/Accomplish.app --expected-version=1.4.9" />
    <node-interpreter value="project" />
    <package-manager value="pnpm" />
    <method v="2" />
  </configuration>
</component>
```

### Daemon: build

```xml
<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="Daemon: build" type="js.build_tools.npm" factoryName="npm">
    <package-json value="$PROJECT_DIR$/apps/daemon/package.json" />
    <command value="run" />
    <scripts>
      <script value="build" />
    </scripts>
    <node-interpreter value="project" />
    <package-manager value="pnpm" />
    <method v="2" />
  </configuration>
</component>
```

### Tests: agent-core

```xml
<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="Tests: agent-core" type="js.build_tools.npm" factoryName="npm">
    <package-json value="$PROJECT_DIR$/packages/agent-core/package.json" />
    <command value="run" />
    <scripts>
      <script value="test" />
    </scripts>
    <node-interpreter value="project" />
    <package-manager value="pnpm" />
    <method v="2" />
  </configuration>
</component>
```

### Tests: daemon

```xml
<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="Tests: daemon" type="js.build_tools.npm" factoryName="npm">
    <package-json value="$PROJECT_DIR$/apps/daemon/package.json" />
    <command value="run" />
    <scripts>
      <script value="test" />
    </scripts>
    <node-interpreter value="project" />
    <package-manager value="pnpm" />
    <method v="2" />
  </configuration>
</component>
```

### Tests: desktop unit

```xml
<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="Tests: desktop unit" type="js.build_tools.npm" factoryName="npm">
    <package-json value="$PROJECT_DIR$/apps/desktop/package.json" />
    <command value="run" />
    <scripts>
      <script value="test:unit" />
    </scripts>
    <node-interpreter value="project" />
    <package-manager value="pnpm" />
    <method v="2" />
  </configuration>
</component>
```

### Tests: desktop integration

```xml
<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="Tests: desktop integration" type="js.build_tools.npm" factoryName="npm">
    <package-json value="$PROJECT_DIR$/apps/desktop/package.json" />
    <command value="run" />
    <scripts>
      <script value="test:integration" />
    </scripts>
    <node-interpreter value="project" />
    <package-manager value="pnpm" />
    <method v="2" />
  </configuration>
</component>
```

## Troubleshooting

**Configs don't appear after saving the XML files.** WebStorm only re-reads `.idea/runConfigurations/` on project reload. Close and reopen the project, or **Run → Edit Configurations → Reload**.

**"No Node interpreter" warning.** Open **Settings → Languages & Frameworks → Node.js** and set the interpreter to your system Node (or the project's `.nvmrc`-matched install, typically resolved via nvm / fnm / Volta). The existing `Electron Main (1. Start)` config inherits from the same project-level setting, so if that one works, the rest will too.

**"Package manager not detected" warning.** Either set **Package manager** dropdown to `pnpm` in the config, or at **Settings → Languages & Frameworks → Node.js → Package manager** project-wide.

**`pnpm: command not found` when a config runs.** WebStorm is using a Node install that doesn't have pnpm on its PATH. Either install pnpm globally in that Node (`corepack enable pnpm`), or set **Package manager → pnpm** and pin a specific pnpm binary path in settings.

**A config worked, then suddenly fails with `download:nodejs` errors.** The bundled-Node version probably got bumped. Run **Desktop: download:nodejs** once to re-fetch; it's idempotent (re-checks SHA256 and skips extraction if valid).

## Claude Code usage notes

Claude Code sessions can reference this file to know which scripts are surfaced through WebStorm and what each is for, which is useful when guiding a user through a multi-step flow (e.g., "run `Desktop: build:unpack`, then `Desktop: smoke:packaged-opencode (mac-arm64)`"). The underlying npm scripts are in the three workspace `package.json` files.
