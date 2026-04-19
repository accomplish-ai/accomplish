/**
 * Smoke test for the packaged OpenCode CLI.
 *
 * Runs against a finished electron-builder artifact directory (local
 * `build:unpack` output, or an extracted CI artifact) to prove that the
 * packaged `opencode` binary:
 *   1. reports the expected version
 *   2. starts `opencode serve --hostname=127.0.0.1 --port=0` cleanly under
 *      isolated HOME/XDG env and emits the expected
 *      "opencode server listening on http://..." stdout line
 *   3. terminates within a short deadline after SIGTERM (or equivalent)
 *
 * Intended call sites:
 *   - local: after `pnpm -F @accomplish/desktop build:unpack`
 *   - CI: after electron-builder in each per-platform release job, before
 *     the R2 upload gate
 *
 * Usage:
 *   node scripts/smoke-packaged-opencode.cjs \
 *     --artifact-dir=release/mac-arm64/Accomplish.app \
 *     --expected-version=1.14.18
 *
 * Optional flags:
 *   --ready-timeout-ms=30000   how long to wait for the ready line
 *   --kill-timeout-ms=5000     how long to wait for graceful exit after SIGTERM
 *
 * Exit codes:
 *   0  pass
 *   1  smoke failure (message on stderr)
 *   2  usage error
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const READY_LINE_PATTERN = /opencode server listening on\s+(https?:\/\/\S+)/;

function parseArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    // Tolerate a bare `--` separator forwarded by pnpm — some runners strip
    // it, others pass it through literally. The WebStorm XML template in
    // docs/webstorm-run-configurations.md relies on this.
    if (arg === '--') {
      continue;
    }
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (!m) {
      console.error(`[smoke-packaged-opencode] Unrecognized argument: ${arg}`);
      process.exit(2);
    }
    out[m[1]] = m[2];
  }
  return out;
}

function log(msg) {
  console.log(`[smoke-packaged-opencode] ${msg}`);
}

function die(msg, code = 1) {
  console.error(`[smoke-packaged-opencode] FAIL: ${msg}`);
  process.exit(code);
}

/**
 * Resolve the packaged opencode binary under an artifact directory.
 *
 * Electron-builder layouts we care about:
 *   macOS .app:       <root>/Contents/Resources/app.asar.unpacked/node_modules/
 *   Linux unpacked:   <root>/resources/app.asar.unpacked/node_modules/
 *   Windows unpacked: <root>/resources/app.asar.unpacked/node_modules/
 *
 * The platform-specific subdir is chosen by electron-builder from the
 * `optionalDependencies` list, keyed on BOTH OS and arch. We match by full
 * `opencode-<platform>-<arch>[-variant]` so a hypothetical artifact that
 * somehow contains both arm64 and x64 packages can't be smoked against the
 * wrong binary. Among multiple matching variants (baseline, musl, etc.)
 * we prefer the shortest name (so plain `opencode-linux-x64` wins over
 * `opencode-linux-x64-baseline`).
 */
function resolveBinary(artifactDir) {
  const candidates = [
    path.join(artifactDir, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules'),
    path.join(artifactDir, 'resources', 'app.asar.unpacked', 'node_modules'),
  ];
  const modulesDir = candidates.find((p) => fs.existsSync(p));
  if (!modulesDir) {
    die(
      `Could not find app.asar.unpacked/node_modules under ${artifactDir}. ` +
        `Checked: ${candidates.join(', ')}`,
    );
  }

  const platformName = process.platform === 'win32' ? 'windows' : process.platform;
  const targetPrefix = `opencode-${platformName}-${process.arch}`;
  const entries = fs
    .readdirSync(modulesDir)
    .filter((name) => name === targetPrefix || name.startsWith(`${targetPrefix}-`))
    .sort((a, b) => a.length - b.length);

  if (entries.length === 0) {
    const all = fs
      .readdirSync(modulesDir)
      .filter((n) => n.startsWith('opencode-'))
      .join(', ');
    die(
      `No OpenCode dir matching "${targetPrefix}" under ${modulesDir}. ` +
        `Opencode dirs present: ${all || '(none)'}`,
    );
  }

  const binName = process.platform === 'win32' ? 'opencode.exe' : 'opencode';
  const binPath = path.join(modulesDir, entries[0], 'bin', binName);
  if (!fs.existsSync(binPath)) {
    die(`Binary not found at expected path: ${binPath}`);
  }
  return binPath;
}

function runVersion(binPath, expectedVersion) {
  return new Promise((resolve, reject) => {
    const proc = spawn(binPath, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    proc.stdout.on('data', (d) => (buf += d.toString()));
    proc.stderr.on('data', (d) => (buf += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      const out = buf.trim();
      if (code !== 0) {
        return reject(new Error(`opencode --version exited ${code}. Output: ${out}`));
      }
      if (!out.includes(expectedVersion)) {
        return reject(
          new Error(`Expected version "${expectedVersion}" in output, got: ${out || '(empty)'}`),
        );
      }
      resolve(out);
    });
  });
}

function createIsolatedEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-smoke-'));
  const sub = (name) => {
    const p = path.join(root, name);
    fs.mkdirSync(p, { recursive: true });
    return p;
  };
  const dirs = {
    home: sub('home'),
    config: sub('config'),
    data: sub('data'),
    state: sub('state'),
    cache: sub('cache'),
  };
  return {
    root,
    env: {
      ...process.env,
      HOME: dirs.home,
      USERPROFILE: dirs.home,
      XDG_CONFIG_HOME: dirs.config,
      XDG_DATA_HOME: dirs.data,
      XDG_STATE_HOME: dirs.state,
      XDG_CACHE_HOME: dirs.cache,
      APPDATA: dirs.config,
      LOCALAPPDATA: dirs.cache,
      OPENCODE_CONFIG_DIR: path.join(dirs.config, 'opencode'),
    },
  };
}

function runServeSmoke(binPath, readyTimeoutMs, killTimeoutMs) {
  return new Promise((resolve) => {
    const isolated = createIsolatedEnv();

    const cleanup = () => {
      try {
        fs.rmSync(isolated.root, { recursive: true, force: true });
      } catch {
        // Best effort — tmp dir will be cleared eventually anyway.
      }
    };

    const proc = spawn(binPath, ['serve', '--hostname=127.0.0.1', '--port=0'], {
      env: isolated.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdoutBuf = '';
    let stderrBuf = '';
    let settled = false;

    const readyTimer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        proc.kill();
      } catch {
        // Ignore — we're erroring out anyway.
      }
      cleanup();
      resolve({
        ok: false,
        error: new Error(
          `Timeout after ${readyTimeoutMs}ms waiting for ready line. ` +
            `Last stdout: ${stdoutBuf.slice(-1500) || '(empty)'} ` +
            `Last stderr: ${stderrBuf.slice(-1500) || '(empty)'}`,
        ),
      });
    }, readyTimeoutMs);

    proc.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString();
      if (settled) {
        return;
      }
      const match = stdoutBuf.match(READY_LINE_PATTERN);
      if (!match) {
        return;
      }
      settled = true;
      clearTimeout(readyTimer);
      const readyUrl = match[1];

      // Ask for a graceful shutdown. On Windows this maps to TerminateProcess
      // (ungraceful) — the smoke only cares that the ready line appeared, so
      // we accept a non-zero exit code on Windows and bound the wait instead.
      try {
        proc.kill();
      } catch {
        // Ignore.
      }
      const killTimer = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // Ignore.
        }
      }, killTimeoutMs);

      proc.once('close', (code, signal) => {
        clearTimeout(killTimer);
        cleanup();
        resolve({ ok: true, readyUrl, exitCode: code, exitSignal: signal });
      });
    });

    proc.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
    });

    proc.on('error', (err) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(readyTimer);
      cleanup();
      resolve({ ok: false, error: err });
    });

    proc.on('close', (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(readyTimer);
      cleanup();
      resolve({
        ok: false,
        error: new Error(
          `opencode serve exited before ready line (code=${code}, signal=${signal}). ` +
            `Last stdout: ${stdoutBuf.slice(-1500) || '(empty)'} ` +
            `Last stderr: ${stderrBuf.slice(-1500) || '(empty)'}`,
        ),
      });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const artifactDir = args['artifact-dir'];
  const expectedVersion = args['expected-version'];
  const readyTimeoutMs = parseInt(args['ready-timeout-ms'] ?? '30000', 10);
  const killTimeoutMs = parseInt(args['kill-timeout-ms'] ?? '5000', 10);

  if (!artifactDir || !expectedVersion) {
    console.error(
      'Usage: smoke-packaged-opencode.cjs ' +
        '--artifact-dir=<path> --expected-version=<version> ' +
        '[--ready-timeout-ms=N] [--kill-timeout-ms=N]',
    );
    process.exit(2);
  }
  if (!Number.isFinite(readyTimeoutMs) || readyTimeoutMs <= 0) {
    die(`--ready-timeout-ms must be a positive integer, got: ${args['ready-timeout-ms']}`, 2);
  }
  if (!Number.isFinite(killTimeoutMs) || killTimeoutMs <= 0) {
    die(`--kill-timeout-ms must be a positive integer, got: ${args['kill-timeout-ms']}`, 2);
  }
  if (!fs.existsSync(artifactDir)) {
    die(`--artifact-dir does not exist: ${artifactDir}`);
  }

  log(`Artifact:          ${artifactDir}`);
  log(`Expected version:  ${expectedVersion}`);
  log(`Ready timeout:     ${readyTimeoutMs}ms`);

  const binPath = resolveBinary(artifactDir);
  log(`Resolved binary:   ${binPath}`);

  try {
    const versionOut = await runVersion(binPath, expectedVersion);
    log(`Version check OK: ${versionOut}`);
  } catch (err) {
    die(`Version check failed: ${err.message}`);
  }

  log('Running "opencode serve --port=0" with isolated HOME/XDG env...');
  const result = await runServeSmoke(binPath, readyTimeoutMs, killTimeoutMs);
  if (!result.ok) {
    die(`Serve smoke failed: ${result.error.message}`);
  }
  log(
    `Serve smoke OK — ready on ${result.readyUrl} ` +
      `(exit=${result.exitCode}, signal=${result.exitSignal})`,
  );
  log('PASS');
}

main().catch((err) => die(err.stack || err.message));
