#!/usr/bin/env node
/**
 * Cross-platform dev-browser server launcher.
 * Replaces server.sh for Windows compatibility.
 *
 * This script uses the local tsx binary directly instead of npx to avoid
 * issues with path resolution when running from the packaged Electron app.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const skillDir = __dirname;
const isWindows = process.platform === 'win32';

// Parse command line arguments
const headless = process.argv.includes('--headless');

// Logging helper - logs to stderr so it doesn't interfere with stdio inheritance
function log(...args) {
  const timestamp = new Date().toISOString();
  console.error(`[dev-browser server.cjs ${timestamp}]`, ...args);
}

log('Starting dev-browser server launcher...');
log('  skillDir:', skillDir);
log('  isWindows:', isWindows);
log('  headless:', headless);
log('  NODE_BIN_PATH:', process.env.NODE_BIN_PATH || '(not set)');
log('  PATH (first 500 chars):', (process.env.PATH || '').substring(0, 500));

// Find the node executable
let nodeExe = 'node';
if (process.env.NODE_BIN_PATH) {
  const bundledNode = path.join(process.env.NODE_BIN_PATH, isWindows ? 'node.exe' : 'node');
  if (fs.existsSync(bundledNode)) {
    nodeExe = bundledNode;
    log('  Using bundled node:', nodeExe);
  } else {
    log('  Bundled node not found at:', bundledNode, '- falling back to system node');
  }
} else {
  log('  Using system node');
}

// Prefer bundled server if present (no tsx needed)
const bundledServer = path.join(skillDir, 'dist', 'start-server.mjs');

let tsxCommand;
let tsxArgs;

if (fs.existsSync(bundledServer)) {
  tsxCommand = nodeExe;
  tsxArgs = [bundledServer];
  log('  Using bundled server:', bundledServer);
} else {
  // Find tsx - on Windows, ALWAYS prefer cli.mjs over tsx.cmd to avoid shell quoting issues
  // with paths containing spaces (e.g., "C:\\Program Files\\...")
  const localTsxJs = path.join(skillDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const localTsxBin = path.join(skillDir, 'node_modules', '.bin', isWindows ? 'tsx.cmd' : 'tsx');

  // On Windows: prefer cli.mjs (run via node.exe, no shell needed, no path quoting issues)
  // On Unix: prefer the tsx binary (simpler)
  if (isWindows && fs.existsSync(localTsxJs)) {
    // Windows: run tsx via node directly to avoid shell quoting issues with spaces in paths
    tsxCommand = nodeExe;
    tsxArgs = [localTsxJs, path.join('scripts', 'start-server.ts')];
    log('  Using tsx via node (Windows):', localTsxJs);
  } else if (!isWindows && fs.existsSync(localTsxBin)) {
    // Unix: use tsx binary directly
    tsxCommand = localTsxBin;
    tsxArgs = [path.join('scripts', 'start-server.ts')];
    log('  Using local tsx binary (Unix):', localTsxBin);
  } else if (fs.existsSync(localTsxJs)) {
    // Fallback for any platform: run tsx via node directly
    tsxCommand = nodeExe;
    tsxArgs = [localTsxJs, path.join('scripts', 'start-server.ts')];
    log('  Using tsx via node (fallback):', localTsxJs);
  } else if (fs.existsSync(localTsxBin)) {
    // Fallback: try tsx binary even on Windows (may have issues with spaces)
    tsxCommand = localTsxBin;
    tsxArgs = [path.join('scripts', 'start-server.ts')];
    log('  Using local tsx binary (fallback):', localTsxBin);
  } else {
    // Last resort: try npx (may fail with path issues)
    log('  WARNING: Local tsx not found, falling back to npx');
    log('  Checked:', localTsxJs);
    log('  Checked:', localTsxBin);

    let npxCommand = isWindows ? 'npx.cmd' : 'npx';
    if (process.env.NODE_BIN_PATH) {
      npxCommand = path.join(process.env.NODE_BIN_PATH, isWindows ? 'npx.cmd' : 'npx');
    }
    tsxCommand = npxCommand;
    tsxArgs = ['tsx', path.join('scripts', 'start-server.ts')];
    log('  Using npx:', npxCommand);
  }
}

// Build environment
const env = { ...process.env };
if (headless) {
  env.HEADLESS = 'true';
}

log('Spawning:', tsxCommand, tsxArgs.join(' '));
log('  cwd:', skillDir);

// Spawn options
const spawnOptions = {
  cwd: skillDir,
  stdio: 'inherit',
  env,
  windowsHide: true,
};

// On Windows, .cmd batch files REQUIRE shell: true to execute.
// When running node directly (with cli.mjs), we can use shell: false.
const isCmdFile = isWindows && tsxCommand.endsWith('.cmd');
if (isCmdFile) {
  spawnOptions.shell = true;
  log('  shell: true (Windows .cmd file)');
} else {
  // For node direct execution (cli.mjs) or Unix, shell is not needed
  spawnOptions.shell = false;
  log('  shell: false (direct executable)');
}

const child = spawn(tsxCommand, tsxArgs, spawnOptions);

child.on('error', (err) => {
  log('ERROR: Failed to spawn:', err.message);
  log('  Command:', tsxCommand);
  log('  Args:', tsxArgs);
  log('  Error code:', err.code);
  process.exit(1);
});

child.on('close', (code, signal) => {
  log('Process exited with code:', code, 'signal:', signal);
  process.exit(code || 0);
});

log('Spawn initiated, waiting for process...');
