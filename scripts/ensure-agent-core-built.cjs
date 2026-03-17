const fs = require('fs');
const path = require('path');
const { runPnpmSync } = require('./dev-runtime.cjs');

const rootDir = path.join(__dirname, '..');
const agentCoreDir = path.join(rootDir, 'packages', 'agent-core');
const agentCorePackageJsonPath = path.join(agentCoreDir, 'package.json');
const agentCoreSourceDir = path.join(agentCoreDir, 'src');
const agentCoreTsconfigPath = path.join(agentCoreDir, 'tsconfig.json');
const desktopNodeResourcesDir = path.join(rootDir, 'apps', 'desktop', 'resources', 'nodejs');
const mcpDistOutputs = [
  'mcp-tools/file-permission/dist/index.mjs',
  'mcp-tools/ask-user-question/dist/index.mjs',
  'mcp-tools/complete-task/dist/index.mjs',
  'mcp-tools/start-task/dist/index.mjs',
  'mcp-tools/dev-browser-mcp/dist/index.mjs',
  'mcp-tools/dev-browser/dist/start-server.mjs',
  'mcp-tools/dev-browser/dist/start-relay.mjs',
];
const hostNodeRuntimeTargets = new Set(['darwin-arm64', 'darwin-x64', 'win32-x64']);

function resolveHostNodeRuntimeTarget() {
  const target = `${process.platform}-${process.arch}`;
  return hostNodeRuntimeTargets.has(target) ? target : null;
}

function hasNodeBinary(nodeRoot, isWindows) {
  const nodeBinaryPath = isWindows
    ? path.join(nodeRoot, 'node.exe')
    : path.join(nodeRoot, 'bin', 'node');
  return fs.existsSync(nodeBinaryPath);
}

function isHostNodeRuntimeAvailable(target) {
  const targetDir = path.join(desktopNodeResourcesDir, target);
  if (!fs.existsSync(targetDir)) {
    return false;
  }

  const isWindows = target.startsWith('win32-');
  if (hasNodeBinary(targetDir, isWindows)) {
    return true;
  }

  try {
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const nestedNodeRoot = path.join(targetDir, entry.name);
      if (hasNodeBinary(nestedNodeRoot, isWindows)) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

function addOutputPath(outputs, value) {
  if (typeof value !== 'string' || !value.startsWith('./')) {
    return;
  }
  outputs.add(value.slice(2));
}

function collectOutputPaths(entry, outputs) {
  if (typeof entry === 'string') {
    addOutputPath(outputs, entry);
    return;
  }

  if (!entry || typeof entry !== 'object') {
    return;
  }

  for (const value of Object.values(entry)) {
    collectOutputPaths(value, outputs);
  }
}

function getFileMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function getNewestFileMtimeMsInDir(dirPath) {
  let newest = 0;
  if (!fs.existsSync(dirPath)) {
    return newest;
  }

  const stack = [dirPath];
  while (stack.length > 0) {
    const currentPath = stack.pop();
    if (!currentPath) continue;

    let entries;
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const mtimeMs = getFileMtimeMs(entryPath);
      if (mtimeMs > newest) {
        newest = mtimeMs;
      }
    }
  }

  return newest;
}

function isAgentCoreBuildOutdated(outputPaths) {
  const newestInputMtimeMs = Math.max(
    getNewestFileMtimeMsInDir(agentCoreSourceDir),
    getFileMtimeMs(agentCorePackageJsonPath),
    getFileMtimeMs(agentCoreTsconfigPath),
  );

  if (!Number.isFinite(newestInputMtimeMs) || newestInputMtimeMs <= 0) {
    return false;
  }

  let oldestOutputMtimeMs = Number.POSITIVE_INFINITY;
  for (const relativeOutputPath of outputPaths) {
    const outputPath = path.join(agentCoreDir, relativeOutputPath);
    const outputMtimeMs = getFileMtimeMs(outputPath);
    if (!Number.isFinite(outputMtimeMs) || outputMtimeMs <= 0) {
      return true;
    }
    oldestOutputMtimeMs = Math.min(oldestOutputMtimeMs, outputMtimeMs);
  }

  if (!Number.isFinite(oldestOutputMtimeMs)) {
    return true;
  }

  return newestInputMtimeMs > oldestOutputMtimeMs;
}

function runPnpm(args, description) {
  console.log(description);
  try {
    runPnpmSync(args, {
      cwd: rootDir,
      env: process.env,
      stdio: 'inherit',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to run pnpm for "${description}": ${message}`);
    process.exit(1);
  }
}

const hostNodeTarget = resolveHostNodeRuntimeTarget();
if (hostNodeTarget) {
  if (!isHostNodeRuntimeAvailable(hostNodeTarget)) {
    console.log(`Missing bundled Node.js runtime for ${hostNodeTarget}.`);
    runPnpm(
      ['-F', '@accomplish/desktop', 'download:nodejs', `--platform=${hostNodeTarget}`],
      `Downloading bundled Node.js runtime for ${hostNodeTarget}...`,
    );

    if (!isHostNodeRuntimeAvailable(hostNodeTarget)) {
      console.error(`Failed to provision bundled Node.js runtime for ${hostNodeTarget}.`);
      process.exit(1);
    }
  }
} else {
  console.log(
    `Skipping bundled Node.js runtime verification for unsupported host target ${process.platform}-${process.arch}.`,
  );
}

let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(agentCorePackageJsonPath, 'utf8'));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to read or parse ${agentCorePackageJsonPath}: ${message}`);
  process.exit(1);
}
const outputPaths = new Set();

addOutputPath(outputPaths, pkg.main);
addOutputPath(outputPaths, pkg.module);
addOutputPath(outputPaths, pkg.types);
collectOutputPaths(pkg.exports, outputPaths);

let missingOutputs = [...outputPaths].filter(
  (relativeOutputPath) => !fs.existsSync(path.join(agentCoreDir, relativeOutputPath)),
);

const needsAgentCoreBuild = missingOutputs.length > 0 || isAgentCoreBuildOutdated(outputPaths);
if (needsAgentCoreBuild) {
  console.log('Missing @accomplish_ai/agent-core build outputs:');
  if (missingOutputs.length > 0) {
    for (const missingOutput of missingOutputs) {
      console.log(`  - ${missingOutput}`);
    }
  } else {
    console.log('  - existing outputs are stale relative to source; rebuilding');
  }
  runPnpm(['-F', '@accomplish_ai/agent-core', 'build'], 'Building @accomplish_ai/agent-core...');

  missingOutputs = [...outputPaths].filter(
    (relativeOutputPath) => !fs.existsSync(path.join(agentCoreDir, relativeOutputPath)),
  );
  if (missingOutputs.length > 0) {
    console.error('Failed to produce required @accomplish_ai/agent-core outputs:');
    for (const missingOutput of missingOutputs) {
      console.error(`  - ${missingOutput}`);
    }
    process.exit(1);
  }
}

let missingMcpDistOutputs = mcpDistOutputs.filter(
  (relativeOutputPath) => !fs.existsSync(path.join(agentCoreDir, relativeOutputPath)),
);
if (missingMcpDistOutputs.length > 0) {
  console.log('Missing MCP dist outputs:');
  for (const missingOutput of missingMcpDistOutputs) {
    console.log(`  - ${missingOutput}`);
  }
  runPnpm(
    ['-F', '@accomplish/desktop', 'build:mcp-tools:dev'],
    'Building MCP dist artifacts for dev...',
  );

  missingMcpDistOutputs = mcpDistOutputs.filter(
    (relativeOutputPath) => !fs.existsSync(path.join(agentCoreDir, relativeOutputPath)),
  );
  if (missingMcpDistOutputs.length > 0) {
    console.error('Failed to produce required MCP dist outputs:');
    for (const missingOutput of missingMcpDistOutputs) {
      console.error(`  - ${missingOutput}`);
    }
    process.exit(1);
  }
}

console.log('✓ @accomplish_ai/agent-core and MCP dist outputs found');
process.exit(0);
