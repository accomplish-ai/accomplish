/**
 * ensure-daemon-built.cjs
 *
 * Ensures apps/daemon/dist/index.js exists before desktop dev starts.
 * The daemon connector (daemon-connector.ts) requires the built artifact
 * to spawn the daemon process.
 *
 * Only builds if the output is missing or stale relative to source.
 * The daemon bundle includes @accomplish_ai/agent-core code, so agent-core
 * source changes must also invalidate this output.
 */

const fs = require('fs');
const path = require('path');
const { runPnpmSync } = require('./dev-runtime.cjs');

const rootDir = path.join(__dirname, '..');
const daemonDir = path.join(rootDir, 'apps', 'daemon');
const daemonDistEntry = path.join(daemonDir, 'dist', 'index.js');
const daemonSourceDir = path.join(daemonDir, 'src');
const agentCoreDir = path.join(rootDir, 'packages', 'agent-core');
const agentCoreSourceDir = path.join(agentCoreDir, 'src');
const agentCorePackageJsonPath = path.join(agentCoreDir, 'package.json');
const agentCoreTsconfigPath = path.join(agentCoreDir, 'tsconfig.json');

function getNewestMtimeMs(dirPath) {
  let newest = 0;
  if (!fs.existsSync(dirPath)) {
    return newest;
  }
  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile()) {
        try {
          const mtimeMs = fs.statSync(entryPath).mtimeMs;
          if (mtimeMs > newest) {
            newest = mtimeMs;
          }
        } catch {
          // skip
        }
      }
    }
  }
  return newest;
}

function getFileMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function needsBuild() {
  if (!fs.existsSync(daemonDistEntry)) {
    return true;
  }
  const sourceMtime = Math.max(
    getNewestMtimeMs(daemonSourceDir),
    getNewestMtimeMs(agentCoreSourceDir),
    getFileMtimeMs(agentCorePackageJsonPath),
    getFileMtimeMs(agentCoreTsconfigPath),
  );
  let distMtime = 0;
  try {
    distMtime = fs.statSync(daemonDistEntry).mtimeMs;
  } catch {
    return true;
  }
  return sourceMtime > distMtime;
}

if (needsBuild()) {
  console.log('Building @accomplish/daemon for dev...');
  try {
    runPnpmSync(['-F', '@accomplish/daemon', 'build'], {
      cwd: rootDir,
      env: process.env,
      stdio: 'inherit',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to build @accomplish/daemon: ${message}`);
    process.exit(1);
  }

  if (!fs.existsSync(daemonDistEntry)) {
    console.error('Failed to produce apps/daemon/dist/index.js');
    process.exit(1);
  }
}

console.log('✓ @accomplish/daemon build output found');
process.exit(0);
