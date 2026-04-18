/**
 * Stage the daemon's runtime native dependencies into apps/daemon/dist/
 * using the bundled Node from apps/desktop/resources/nodejs/.
 *
 * Runs BEFORE electron-builder, so the contents of apps/daemon/dist/
 * — including the freshly-installed node_modules/ — are copied into
 * the packaged app via the existing extraResources entry:
 *
 *   { "from": "../../apps/daemon/dist", "to": "daemon" }
 *
 * Staging pre-packaging rather than post-packaging is deliberate:
 *   - No post-sign mutation of the .app (signatures stay valid)
 *   - Works uniformly across all electron-builder output targets
 *     (unpacked, DMG, ZIP, AppImage, deb, NSIS)
 *   - Matches what the private accomplish-release workflow does for
 *     CI builds, so local and CI artifacts have the same layout
 *
 * Uses the bundled Node + npm to run `npm install`, with the bundled
 * Node dir prepended to PATH so prebuild-install / node-gyp child
 * processes resolve the same `node`.
 *
 * Target arch:
 *   Defaults to the host platform+arch. Cross-arch staging is supported
 *   via `--target-platform=<platform>-<arch>` (e.g. `linux-arm64`). This
 *   matters for local multi-arch Linux builds: `package:linux` used to
 *   stage once on the host arch and then produce both x64 + arm64
 *   artifacts, so one artifact shipped the wrong `.node` binary. The
 *   canonical release pipeline is per-arch runners so cross-arch is
 *   mostly a developer-convenience thing — when used, we set
 *   `npm_config_target_arch` / `npm_config_target_platform` so
 *   `prebuild-install` picks the right prebuild, and skip the local
 *   ABI smoke (can't `require()` a foreign-arch binary).
 *
 * Prerequisites:
 *   - `pnpm -F @accomplish/desktop download:nodejs` has been run
 *     (or the build script has chained it in)
 *   - `pnpm -F @accomplish/daemon build` has produced dist/index.js
 *
 * Usage:
 *   node apps/desktop/scripts/stage-daemon-deps.cjs [--target-platform=<p>-<a>]
 *   (typically invoked via `pnpm -F @accomplish/desktop stage:daemon-deps`)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { NODE_VERSION } = require('./node-version.cjs');

const DESKTOP_ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.join(DESKTOP_ROOT, '..', '..');
const DAEMON_DIST = path.join(REPO_ROOT, 'apps', 'daemon', 'dist');

const DEPS = ['ws@8', 'better-sqlite3@12'];

const SUPPORTED_TARGET_PLATFORMS = new Set([
  'darwin-x64',
  'darwin-arm64',
  'linux-x64',
  'linux-arm64',
  'win32-x64',
]);

function log(msg) {
  console.log(`[stage-daemon-deps] ${msg}`);
}

function die(msg) {
  console.error(`[stage-daemon-deps] FAIL: ${msg}`);
  process.exit(1);
}

/**
 * Extract the package name from a spec like "ws@8" or "@scope/pkg@1".
 * Uses lastIndexOf so scoped packages work too.
 */
function packageName(spec) {
  const at = spec.lastIndexOf('@');
  return at <= 0 ? spec : spec.slice(0, at);
}

function parseArgs(argv) {
  let targetPlatform = null;
  for (const arg of argv) {
    if (arg.startsWith('--target-platform=')) {
      targetPlatform = arg.slice('--target-platform='.length).trim();
    }
  }
  return { targetPlatform };
}

/**
 * Map Node's `process.platform` to the short name used for directories
 * under `resources/nodejs/`. Currently identical — kept as a helper so
 * future renames (e.g. 'freebsd', 'darwin' vs 'macos') have one place
 * to touch.
 */
function hostPlatform() {
  return `${process.platform}-${process.arch}`;
}

/**
 * Locate the bundled Node for the given platform/arch. P2.C fix: we
 * require the exact `node-v${NODE_VERSION}-${target}` directory. Pre-fix
 * this sorted all `node-v*` entries lexicographically and picked the
 * last one, which could pick up a stale extracted Node version if
 * `download:nodejs` had been run against multiple versions against the
 * same checkout. after-pack.cjs copies the exact `NODE_VERSION`, so
 * picking anything else produces an ABI mismatch at runtime.
 */
function resolveBundledNode(target) {
  // The `target` string matches the directory name under resources/nodejs/
  // — e.g. 'linux-x64', 'darwin-arm64'. Bundled Node always runs on the
  // host; for cross-arch staging we still use the host's Node binary
  // and flip prebuild-install via env vars (see `npmInstallEnv`).
  const host = hostPlatform();
  const platformRoot = path.join(DESKTOP_ROOT, 'resources', 'nodejs', host);

  if (!fs.existsSync(platformRoot)) {
    die(
      `Bundled Node dir not found for host ${host}: ${platformRoot}. ` +
        `Run \`pnpm -F @accomplish/desktop download:nodejs\` first.`,
    );
  }

  // Node's own archive layout names the extracted dir
  // `node-v${NODE_VERSION}-${target}` (e.g. `node-v24.15.0-linux-x64`).
  // P2.C: use the exact host directory, not a sorted glob.
  const expectedDir = `node-v${NODE_VERSION}-${host.replace('win32-', 'win-')}`;
  const nodeDir = path.join(platformRoot, expectedDir);
  if (!fs.existsSync(nodeDir)) {
    die(
      `Expected bundled Node directory not found: ${nodeDir}. ` +
        `node-version.cjs pins v${NODE_VERSION}; run \`pnpm -F @accomplish/desktop download:nodejs\` ` +
        `(and remove any stale node-v*/ directories under ${platformRoot} if you've upgraded).`,
    );
  }

  const isWindows = process.platform === 'win32';
  const nodeBin = path.join(nodeDir, isWindows ? 'node.exe' : path.join('bin', 'node'));
  const npmCli = isWindows
    ? path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js')
    : path.join(nodeDir, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');

  if (!fs.existsSync(nodeBin)) {
    die(`Bundled Node binary missing at ${nodeBin}`);
  }
  if (!fs.existsSync(npmCli)) {
    die(`Bundled npm CLI missing at ${npmCli}`);
  }

  void target; // reserved for future cross-arch Node selection if needed
  return { nodeBin, npmCli };
}

/**
 * Build the env passed to `npm install`. Prepends the bundled Node
 * bin dir to PATH so prebuild-install / node-gyp child processes
 * resolve the matching `node`. For cross-arch staging, sets the
 * standard `npm_config_target_*` env vars so prebuild-install
 * downloads the right prebuild.
 */
function npmInstallEnv(nodeBinDir, target) {
  const [targetPlatform, targetArch] = target.split('-');
  const env = {
    ...process.env,
    PATH: `${nodeBinDir}${path.delimiter}${process.env.PATH || ''}`,
  };
  if (target !== hostPlatform()) {
    // `prebuild-install` honors these and resolves the matching arch
    // prebuild from the native-module's GitHub release assets.
    env.npm_config_target_arch = targetArch;
    env.npm_config_target_platform = targetPlatform === 'win32' ? 'win32' : targetPlatform;
    env.npm_config_arch = targetArch;
    env.npm_config_platform = env.npm_config_target_platform;
  }
  return env;
}

function main() {
  if (!fs.existsSync(DAEMON_DIST)) {
    die(
      `Daemon dist not found at ${DAEMON_DIST}. ` +
        `Run \`pnpm -F @accomplish/daemon build\` first.`,
    );
  }

  const { targetPlatform } = parseArgs(process.argv.slice(2));
  const target = targetPlatform ?? hostPlatform();
  if (!SUPPORTED_TARGET_PLATFORMS.has(target)) {
    die(
      `Unsupported target platform '${target}'. ` +
        `Supported: ${[...SUPPORTED_TARGET_PLATFORMS].join(', ')}`,
    );
  }

  const host = hostPlatform();
  const isCrossArch = target !== host;

  const { nodeBin, npmCli } = resolveBundledNode(target);
  const binDir = path.dirname(nodeBin);

  log(`Bundled Node: ${nodeBin}`);
  log(`Staging into: ${DAEMON_DIST}`);
  log(`Dependencies: ${DEPS.join(' ')}`);
  log(`Target: ${target}${isCrossArch ? ` (cross-arch; host=${host})` : ''}`);

  const env = npmInstallEnv(binDir, target);

  execFileSync(nodeBin, [npmCli, 'install', '--no-save', ...DEPS], {
    cwd: DAEMON_DIST,
    env,
    stdio: 'inherit',
  });

  // Host-arch staging: verify each dep loads under the bundled Node to
  // catch ABI mismatches before electron-builder bundles a broken dist/.
  // Cross-arch staging: skip the runtime smoke — a foreign-arch `.node`
  // can't be `require()`'d on the host — and check the binary file
  // exists at the expected path instead.
  if (isCrossArch) {
    for (const spec of DEPS) {
      const name = packageName(spec);
      log(`Target=${target}: skipping runtime require('${name}') smoke (cross-arch)`);
      if (name === 'better-sqlite3') {
        const releaseDir = path.join(
          DAEMON_DIST,
          'node_modules',
          'better-sqlite3',
          'build',
          'Release',
        );
        const hasNode = fs.existsSync(releaseDir)
          ? fs.readdirSync(releaseDir).some((f) => f.endsWith('.node'))
          : false;
        if (!hasNode) {
          die(
            `Cross-arch staging: no *.node binary under ${releaseDir} after ` +
              `prebuild-install. Check that better-sqlite3's release assets ` +
              `include a build for ${target}.`,
          );
        }
        log(`Target=${target}: better-sqlite3 native binary present in build/Release/`);
      }
    }
  } else {
    for (const spec of DEPS) {
      const name = packageName(spec);
      log(`Verifying require('${name}') under bundled Node...`);
      execFileSync(
        nodeBin,
        ['-e', `require('./node_modules/${name}'); console.log('${name} OK')`],
        {
          cwd: DAEMON_DIST,
          env,
          stdio: 'inherit',
        },
      );
    }
  }

  log('Staging complete.');
}

main();
