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
 * processes resolve the same `node` and the downloaded prebuilt
 * native binaries match the bundled Node's ABI.
 *
 * Prerequisites:
 *   - `pnpm -F @accomplish/desktop download:nodejs` has been run
 *     (or the build script has chained it in)
 *   - `pnpm -F @accomplish/daemon build` has produced dist/index.js
 *
 * Usage:
 *   node apps/desktop/scripts/stage-daemon-deps.cjs
 *   (typically invoked via `pnpm -F @accomplish/desktop stage:daemon-deps`)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DESKTOP_ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.join(DESKTOP_ROOT, '..', '..');
const DAEMON_DIST = path.join(REPO_ROOT, 'apps', 'daemon', 'dist');

const DEPS = ['ws@8', 'better-sqlite3@12'];

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

/**
 * Locate the bundled Node for the current runner's platform/arch.
 *
 * Layout under apps/desktop/resources/nodejs/ is:
 *   <platform>-<arch>/node-v<VERSION>-<platform>-<arch>/...
 *
 * where platform is 'darwin' | 'linux' | 'win32' and arch is 'x64' |
 * 'arm64', matching Node's own naming convention.
 */
function resolveBundledNode() {
  const platformDir = `${process.platform}-${process.arch}`;
  const platformRoot = path.join(DESKTOP_ROOT, 'resources', 'nodejs', platformDir);

  if (!fs.existsSync(platformRoot)) {
    die(
      `Bundled Node dir not found for this host: ${platformRoot}. ` +
        `Run \`pnpm -F @accomplish/desktop download:nodejs\` first.`,
    );
  }

  const versionedDirs = fs
    .readdirSync(platformRoot)
    .filter((name) => name.startsWith('node-v'))
    .sort()
    .reverse();

  if (versionedDirs.length === 0) {
    die(
      `No extracted Node found under ${platformRoot}. ` +
        `Run \`pnpm -F @accomplish/desktop download:nodejs\` first.`,
    );
  }

  const nodeDir = path.join(platformRoot, versionedDirs[0]);
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

  return { nodeBin, npmCli };
}

function main() {
  if (!fs.existsSync(DAEMON_DIST)) {
    die(
      `Daemon dist not found at ${DAEMON_DIST}. ` +
        `Run \`pnpm -F @accomplish/daemon build\` first.`,
    );
  }

  const { nodeBin, npmCli } = resolveBundledNode();
  const binDir = path.dirname(nodeBin);

  log(`Bundled Node: ${nodeBin}`);
  log(`Staging into: ${DAEMON_DIST}`);
  log(`Dependencies: ${DEPS.join(' ')}`);

  // Prepend bundled Node dir to PATH so prebuild-install / node-gyp
  // child processes pick the matching `node` first and the downloaded
  // native binaries have the right ABI.
  const env = {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
  };

  execFileSync(nodeBin, [npmCli, 'install', '--no-save', ...DEPS], {
    cwd: DAEMON_DIST,
    env,
    stdio: 'inherit',
  });

  // Quick smoke: each dep loads under bundled Node. Catches ABI
  // mismatches and missing native binaries before electron-builder
  // copies a broken dist/ into the app bundle.
  for (const spec of DEPS) {
    const name = packageName(spec);
    log(`Verifying require('${name}') under bundled Node...`);
    execFileSync(nodeBin, ['-e', `require('./node_modules/${name}'); console.log('${name} OK')`], {
      cwd: DAEMON_DIST,
      env,
      stdio: 'inherit',
    });
  }

  log('Staging complete.');
}

main();
