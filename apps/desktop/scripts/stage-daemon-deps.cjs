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

/** Subset of DEPS that install a native binary — must be purged before
 *  re-staging so `prebuild-install` actually re-runs and picks the
 *  correct target's `.node` binary. `ws` is pure JS; leaving it in
 *  place between runs is safe and faster. */
const NATIVE_DEPS = ['better-sqlite3'];

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

/**
 * Read the architecture signature of a compiled `.node` addon and
 * return a short arch tag ('x64'/'arm64') or null on unknown format.
 *
 * Called after staging to make sure the binary actually matches the
 * declared `--target-platform`. Without this check, a stale native
 * module from the previous stage run (different target arch) could
 * slip through — the review finding P1.F case.
 *
 * Parses magic bytes directly instead of shelling out to `file` so
 * the check works identically on macOS, Linux, and Windows (and on
 * CI runners without the `file` utility installed).
 */
function readNativeArch(binaryPath) {
  const fd = fs.openSync(binaryPath, 'r');
  try {
    const header = Buffer.alloc(64);
    fs.readSync(fd, header, 0, 64, 0);

    // Mach-O (macOS). Magic FEEDFACF = MH_MAGIC_64 (little-endian).
    //
    // Mach-O's `cputype` encodes the base CPU in the low bits and OR's
    // in `CPU_ARCH_ABI64 = 0x01000000` for 64-bit variants. `MH_MAGIC_64`
    // guarantees we're looking at a 64-bit binary, so both supported
    // arches will have the ABI64 bit set:
    //   CPU_TYPE_X86_64 = CPU_TYPE_X86 (7) | 0x01000000 = 0x01000007
    //   CPU_TYPE_ARM64  = CPU_TYPE_ARM (12) | 0x01000000 = 0x0100000C
    //
    // Masking the ABI64 bit off lets us compare against the base types
    // directly and handles both explicitly-constructed variants.
    if (header.readUInt32LE(0) === 0xfeedfacf) {
      const cpuType = header.readInt32LE(4);
      const baseCpuType = cpuType & ~0x01000000;
      if (baseCpuType === 7) return 'x64'; // CPU_TYPE_X86_64
      if (baseCpuType === 12) return 'arm64'; // CPU_TYPE_ARM64
      return null;
    }

    // ELF (Linux). Magic 7F 45 4C 46 + class/encoding bytes.
    if (header[0] === 0x7f && header[1] === 0x45 && header[2] === 0x4c && header[3] === 0x46) {
      // `e_machine` is a 2-byte LE value at offset 0x12 for EI_DATA=1
      // (little-endian, which covers every supported target).
      const machine = header.readUInt16LE(0x12);
      if (machine === 0x3e) return 'x64'; // EM_X86_64
      if (machine === 0xb7) return 'arm64'; // EM_AARCH64
      return null;
    }

    // PE (Windows). Magic 4D 5A (MZ). The PE header offset lives at
    // 0x3C (LE). `IMAGE_FILE_HEADER.Machine` is the first 2 bytes
    // after the 4-byte 'PE\0\0' signature.
    if (header[0] === 0x4d && header[1] === 0x5a) {
      const peOffset = header.readUInt32LE(0x3c);
      const peHeader = Buffer.alloc(6);
      fs.readSync(fd, peHeader, 0, 6, peOffset);
      // 'PE\0\0' signature then IMAGE_FILE_HEADER.Machine
      const sigOk =
        peHeader[0] === 0x50 && peHeader[1] === 0x45 && peHeader[2] === 0 && peHeader[3] === 0;
      if (!sigOk) return null;
      const machine = peHeader.readUInt16LE(4);
      if (machine === 0x8664) return 'x64'; // IMAGE_FILE_MACHINE_AMD64
      if (machine === 0xaa64) return 'arm64'; // IMAGE_FILE_MACHINE_ARM64
      return null;
    }
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Purge the previously-installed copy of every native dependency from
 * `apps/daemon/dist/node_modules/` before re-running `npm install`.
 *
 * Review finding P1.F: npm's idempotence is the bug here. When
 * `better-sqlite3@12` is already installed at the same version, `npm
 * install --no-save better-sqlite3@12` short-circuits — it skips the
 * install script, which is where `prebuild-install` runs. That's
 * normally a win, but for cross-arch staging it means the second
 * `package:linux:<arch>` invocation inherits the first arch's native
 * binary. Deleting the package dir forces a full re-install every time.
 *
 * Also remove `package-lock.json` / `pnpm-lock.yaml` if present: a
 * stale lockfile can pin the resolved-URL to a previous-arch prebuild
 * asset, and we want prebuild-install to re-resolve against
 * `npm_config_target_arch`.
 */
function purgePreviousStaging() {
  const nodeModules = path.join(DAEMON_DIST, 'node_modules');
  for (const name of NATIVE_DEPS) {
    const pkgDir = path.join(nodeModules, name);
    if (fs.existsSync(pkgDir)) {
      log(`Removing previous ${name} install at ${pkgDir}`);
      fs.rmSync(pkgDir, { recursive: true, force: true });
    }
  }
  for (const lockfile of ['package-lock.json', 'pnpm-lock.yaml']) {
    const lockPath = path.join(DAEMON_DIST, lockfile);
    if (fs.existsSync(lockPath)) {
      log(`Removing stale ${lockfile}`);
      fs.rmSync(lockPath, { force: true });
    }
  }
}

/**
 * Confirm each native dep's `.node` file is actually for `target`.
 * Throws (via `die`) on mismatch so the build fails LOUDLY instead of
 * packaging a wrong-arch daemon that would crash on first DB call.
 */
function verifyNativeBinariesForTarget(target) {
  const expectedArch = target.split('-')[1];
  // Sanity: if someone adds a target string that doesn't end in 'x64'
  // or 'arm64' (e.g. future riscv64), `readNativeArch` would return
  // null for the known-good cases and the comparison would fail
  // misleadingly. Fail fast here with a clear message instead.
  if (expectedArch !== 'x64' && expectedArch !== 'arm64') {
    die(
      `verifyNativeBinariesForTarget: unsupported arch '${expectedArch}' in target ` +
        `'${target}'. Extend readNativeArch() + this check when adding new arches.`,
    );
  }

  for (const name of NATIVE_DEPS) {
    const releaseDir = path.join(DAEMON_DIST, 'node_modules', name, 'build', 'Release');
    if (!fs.existsSync(releaseDir)) {
      die(
        `Expected native build directory missing after install: ${releaseDir}. ` +
          `prebuild-install for ${name} did not run or failed silently.`,
      );
    }
    const nodeFiles = fs.readdirSync(releaseDir).filter((f) => f.endsWith('.node'));
    if (nodeFiles.length === 0) {
      die(
        `No *.node binary under ${releaseDir} after install. ` +
          `Check that ${name}'s release assets include a build for ${target}.`,
      );
    }
    for (const file of nodeFiles) {
      const binaryPath = path.join(releaseDir, file);
      const actualArch = readNativeArch(binaryPath);
      if (actualArch === null) {
        die(
          `Could not determine arch of ${binaryPath}. Unknown binary format ` +
            `(not Mach-O / ELF / PE). Target=${target}.`,
        );
      }
      if (actualArch !== expectedArch) {
        die(
          `Arch mismatch for ${name}: ${binaryPath} is ${actualArch}, ` +
            `expected ${expectedArch} (target=${target}). The previous stage run ` +
            `may have left a stale binary — purgePreviousStaging() should have ` +
            `removed it, so this is a bug.`,
        );
      }
      log(`Verified ${name} binary matches target arch ${expectedArch}: ${file}`);
    }
  }
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

  // Purge previous native installs BEFORE npm runs. Without this,
  // re-installing the same version of `better-sqlite3` is a no-op and
  // the prior target's `.node` binary is reused verbatim — the P1.F
  // correctness bug. Pure-JS deps (ws) stay in place across runs.
  purgePreviousStaging();

  const env = npmInstallEnv(binDir, target);

  execFileSync(nodeBin, [npmCli, 'install', '--no-save', ...DEPS], {
    cwd: DAEMON_DIST,
    env,
    stdio: 'inherit',
  });

  // Always verify the native binary matches the target — structural
  // check via magic bytes. Runs for both host and cross-arch staging.
  verifyNativeBinariesForTarget(target);

  // Host-arch staging: additionally run the runtime `require()` smoke
  // to catch ABI mismatches (right arch, wrong Node major). Cross-arch
  // can't load a foreign-arch binary, so the magic-byte check above
  // is our end-of-the-line signal.
  if (!isCrossArch) {
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
  } else {
    log(
      `Target=${target}: cross-arch, skipping runtime require() smoke (would fail ABI). ` +
        `Arch check via magic bytes above is the correctness gate.`,
    );
  }

  log('Staging complete.');
}

main();
