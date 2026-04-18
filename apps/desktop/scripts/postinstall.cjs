/**
 * Custom postinstall script for the desktop app.
 *
 * Milestone 6 of the daemon-only-SQLite migration
 * (plan: /Users/yanai/.claude/plans/squishy-exploring-hamster.md).
 *
 * Pre-M6 history (now retired):
 *   - Phase 4c of the OpenCode SDK cutover port removed `node-pty`, which
 *     eliminated the original reasons to skip electron-rebuild on Windows.
 *   - The script still ran `npx electron-rebuild` on macOS/Linux to rebuild
 *     `better-sqlite3` against Electron's embedded Node ABI, and used
 *     `prebuild-install --runtime electron` on Windows to drop a
 *     compatible prebuild in place.
 *
 * Post-M6: Electron main owns no native modules. The daemon keeps its
 * own copy of `better-sqlite3` built against the bundled Node 24 ABI via
 * `scripts/stage-daemon-deps.cjs`; that script is unchanged. This
 * postinstall is reduced to its remaining responsibility — installing
 * the shared MCP-tools runtime + per-tool dev dependencies.
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');

// Prevent infinite recursion when `npm install` triggered by this script
// walks back up the tree and re-runs the parent postinstall. Happens most
// often on Windows where path handling encourages upward walks.
if (process.env.ACCOMPLISH_POSTINSTALL_RUNNING) {
  console.log('> Postinstall already running, skipping nested invocation');
  process.exit(0);
}
process.env.ACCOMPLISH_POSTINSTALL_RUNNING = '1';

function runCommand(command, description) {
  console.log(`\n> ${description}...`);
  try {
    execSync(command, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
      shell: true,
      env: {
        ...process.env,
        ACCOMPLISH_POSTINSTALL_RUNNING: '1',
      },
    });
  } catch (_error) {
    console.error(`Failed: ${description}`);
    process.exit(1);
  }
}

const useBundledMcp = process.env.ACCOMPLISH_BUNDLED_MCP === '1' || process.env.CI === 'true';

// Install shared MCP tools runtime dependencies (Playwright) at mcp-tools/ root.
// MCP tools live in packages/agent-core/mcp-tools.
const mcpToolsPath = path.join(__dirname, '..', '..', '..', 'packages', 'agent-core', 'mcp-tools');
runCommand(
  `npm --prefix "${mcpToolsPath}" install --omit=dev --no-package-lock`,
  'Installing shared MCP tools runtime dependencies',
);

// Install per-tool dependencies for dev/tsx workflows.
if (!useBundledMcp) {
  // Install ALL dependencies (including devDependencies) during development
  // because esbuild needs them for bundling. The bundle-skills.cjs script
  // will reinstall with --omit=dev during packaged builds.
  // Phase 3 of the SDK cutover port removed `file-permission` and
  // `ask-user-question` MCP packages — don't try to install their deps.
  const tools = ['dev-browser', 'dev-browser-mcp', 'complete-task', 'start-task'];
  for (const tool of tools) {
    runCommand(
      `npm --prefix "${mcpToolsPath}/${tool}" install --no-package-lock`,
      `Installing ${tool} dependencies`,
    );
  }
}

console.log('\n> Postinstall complete!');
