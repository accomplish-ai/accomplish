#!/usr/bin/env node

/**
 * assert-packaging-invariants.cjs — post-packaging sanity check for the
 * daemon-only-SQLite migration's end-state (Milestone 6).
 *
 * Enforces three invariants on a packaged Accomplish app artifact:
 *
 *   1. `app.asar.unpacked/` MUST NOT contain any path matching
 *      `better-sqlite3`. If it does, Electron main is still carrying
 *      the native module — M5/M6 regressed and the GUI would either
 *      fail to load (ABI mismatch) or quietly re-introduce the
 *      concurrent-writer hazard with the daemon.
 *   2. `daemon/node_modules/better-sqlite3/build/Release/` MUST contain
 *      at least one `*.node` file. The daemon is the sole SQLite owner
 *      post-M5; its copy is staged by
 *      `apps/desktop/scripts/stage-daemon-deps.cjs` against the bundled
 *      Node ABI. A missing native binary means the daemon would crash
 *      on first DB call.
 *   3. The daemon's `better-sqlite3` MUST load cleanly under the
 *      bundled Node (resolved from `<app-root>/nodejs/<platform>-<arch>/`).
 *      Invokes `<bundled-node> -e require(...)` and fails if the child
 *      process exits non-zero.
 *
 * CLI:
 *   node apps/desktop/scripts/assert-packaging-invariants.cjs \
 *     --app-root <path-to-packaged-app-resources-dir>
 *
 * Intended call sites:
 *   - OSS: `pnpm -F @accomplish/desktop verify:package --app-root <...>`
 *     after `pnpm package:mac|win|linux`.
 *   - Free (sibling `accomplish-release` workflow): one step per build
 *     job, invoking this script via the `commit_sha` checkout — no
 *     private copy to drift.
 *
 * On macOS Resources dir: `<dist>/mac*\/Accomplish.app/Contents/Resources`
 * On Windows Resources dir: `<dist>/win-*\/resources`
 * On Linux (AppImage extracted): `<AppImage-mount>/resources`
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function die(msg) {
  console.error(`[assert-packaging-invariants] FAIL: ${msg}`);
  process.exit(1);
}

function log(msg) {
  console.log(`[assert-packaging-invariants] ${msg}`);
}

function parseArgs(argv) {
  const result = { appRoot: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--app-root' && argv[i + 1]) {
      result.appRoot = path.resolve(argv[i + 1]);
      i++;
    }
  }
  return result;
}

/**
 * Recursively walk a directory and return true if any path segment
 * matches `needle` (case-sensitive substring). Used by invariant #1 to
 * scan `app.asar.unpacked/` for `better-sqlite3`.
 */
function treeContainsPath(rootDir, needle) {
  if (!fs.existsSync(rootDir)) {
    return false;
  }
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (full.includes(needle)) {
        return true;
      }
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        stack.push(full);
      }
    }
  }
  return false;
}

/**
 * Locate the bundled Node binary under `<appRoot>/nodejs/`. The staging
 * script lays it out as `nodejs/<platform>-<arch>/bin/node` on POSIX and
 * `nodejs/<platform>-<arch>/node.exe` on Windows. We glob the first
 * platform-arch directory we find rather than recomputing the current
 * platform — keeps the script usable for cross-arch smoke checks.
 */
function findBundledNode(appRoot) {
  const nodejsDir = path.join(appRoot, 'nodejs');
  if (!fs.existsSync(nodejsDir)) {
    return null;
  }
  const entries = fs.readdirSync(nodejsDir, { withFileTypes: true });
  const platformDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  for (const platDir of platformDirs) {
    const posixPath = path.join(nodejsDir, platDir, 'bin', 'node');
    if (fs.existsSync(posixPath)) {
      return posixPath;
    }
    const winPath = path.join(nodejsDir, platDir, 'node.exe');
    if (fs.existsSync(winPath)) {
      return winPath;
    }
  }
  return null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.appRoot) {
    die('--app-root is required');
  }
  if (!fs.existsSync(args.appRoot)) {
    die(`--app-root does not exist: ${args.appRoot}`);
  }
  log(`Verifying packaging invariants under ${args.appRoot}`);

  // ─── Invariant 1: no better-sqlite3 in Electron main's ASAR unpack ───
  const asarUnpack = path.join(args.appRoot, 'app.asar.unpacked');
  if (fs.existsSync(asarUnpack)) {
    if (treeContainsPath(asarUnpack, 'better-sqlite3')) {
      die(
        `app.asar.unpacked contains better-sqlite3 — Electron main still ships ` +
          `the native module. M5/M6 regressed.`,
      );
    }
    log('OK: app.asar.unpacked/ has no better-sqlite3 references');
  } else {
    log(
      `Note: no app.asar.unpacked/ directory at ${asarUnpack} (this is expected if nothing is unpacked)`,
    );
  }

  // ─── Invariant 2: daemon's better-sqlite3 .node binary is present ───
  const daemonNative = path.join(
    args.appRoot,
    'daemon',
    'node_modules',
    'better-sqlite3',
    'build',
    'Release',
  );
  if (!fs.existsSync(daemonNative)) {
    die(
      `daemon/node_modules/better-sqlite3/build/Release/ missing at ${daemonNative}. ` +
        `stage-daemon-deps.cjs likely did not run, or its output wasn't bundled ` +
        `into the packaged app's extraResources.`,
    );
  }
  const nodeFiles = fs.readdirSync(daemonNative).filter((name) => name.endsWith('.node'));
  if (nodeFiles.length === 0) {
    die(
      `daemon/node_modules/better-sqlite3/build/Release/ has no *.node file. ` +
        `The daemon's SQLite owner would crash on first DB call.`,
    );
  }
  log(
    `OK: daemon/node_modules/better-sqlite3 ships ${nodeFiles.length} native binary(ies): ` +
      `${nodeFiles.join(', ')}`,
  );

  // ─── Invariant 3: bundled Node can actually load the native module ───
  const bundledNode = findBundledNode(args.appRoot);
  if (!bundledNode) {
    die(
      `Could not find a bundled Node binary under ${args.appRoot}/nodejs/<platform>-<arch>/. ` +
        `If this is an intentional cross-platform artifact check, re-run on the target OS.`,
    );
  }
  const daemonBetterSqlite3Dir = path.join(
    args.appRoot,
    'daemon',
    'node_modules',
    'better-sqlite3',
  );
  try {
    execFileSync(
      bundledNode,
      ['-e', `require(${JSON.stringify(daemonBetterSqlite3Dir)}); console.log('OK')`],
      { stdio: 'pipe' },
    );
    log("OK: bundled Node can require the daemon's better-sqlite3 (ABI match)");
  } catch (err) {
    die(
      `Bundled Node could not load daemon's better-sqlite3 — ABI mismatch. ` +
        `${err.stderr ? err.stderr.toString() : err.message}`,
    );
  }

  log('All packaging invariants hold');
  process.exit(0);
}

main();
