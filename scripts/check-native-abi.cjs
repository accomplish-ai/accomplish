const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const { NODE_VERSION } = require('../apps/desktop/scripts/node-version.cjs');

const workspaces = [
  {
    name: '@accomplish/daemon',
    dir: path.join(rootDir, 'apps', 'daemon'),
  },
  {
    name: '@accomplish_ai/agent-core',
    dir: path.join(rootDir, 'packages', 'agent-core'),
  },
];

const smokeScript = `
const Database = require('better-sqlite3');
const db = new Database(':memory:');
try {
  const row = db.prepare('SELECT 1 AS ok').get();
  if (!row || row.ok !== 1) {
    throw new Error('unexpected SQLite smoke result');
  }
} finally {
  db.close();
}
`;

function hostTarget() {
  return `${process.platform}-${process.arch}`;
}

function nodeArchiveTarget(target) {
  return target.replace('win32-', 'win-');
}

function resolveBundledNode() {
  const target = hostTarget();
  const platformRoot = path.join(rootDir, 'apps', 'desktop', 'resources', 'nodejs', target);
  const nodeRoot = path.join(platformRoot, `node-v${NODE_VERSION}-${nodeArchiveTarget(target)}`);
  const nodeBin =
    process.platform === 'win32'
      ? path.join(nodeRoot, 'node.exe')
      : path.join(nodeRoot, 'bin', 'node');

  return fs.existsSync(nodeBin) ? nodeBin : null;
}

function resolveDaemonNode() {
  const bundledNode = resolveBundledNode();
  if (bundledNode) {
    return bundledNode;
  }

  const pnpmNode = process.env.npm_node_execpath;
  if (pnpmNode && fs.existsSync(pnpmNode)) {
    return pnpmNode;
  }

  return process.execPath;
}

function nodeDescription(nodeBin) {
  try {
    return execFileSync(nodeBin, ['-p', "process.version + ' ABI ' + process.versions.modules"], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return nodeBin;
  }
}

function checkWorkspace(nodeBin, workspace) {
  try {
    execFileSync(nodeBin, ['-e', smokeScript], {
      cwd: workspace.dir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr = error?.stderr?.toString?.().trim();
    const stdout = error?.stdout?.toString?.().trim();
    const details = [stderr, stdout].filter(Boolean).join('\n');

    console.error(`\nNative SQLite binding check failed for ${workspace.name}.`);
    console.error(`Daemon Node: ${nodeBin}`);
    console.error(`Runtime: ${nodeDescription(nodeBin)}`);
    if (details) {
      console.error(`\n${details}`);
    }
    console.error(
      '\nThis usually means better-sqlite3 was built under a different Node ABI.\n' +
        'Fix it with:\n\n' +
        '  pnpm rebuild better-sqlite3 --recursive\n',
    );
    process.exit(1);
  }
}

const daemonNode = resolveDaemonNode();
for (const workspace of workspaces) {
  checkWorkspace(daemonNode, workspace);
}

console.log(`Native SQLite bindings match daemon Node (${nodeDescription(daemonNode)})`);
