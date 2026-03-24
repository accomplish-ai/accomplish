#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
/**
 * Cross-platform dev-browser server launcher.
 * Replaces server.sh for Windows compatibility.
 * Always launches the prebuilt dist entry to keep dev and packaged behavior identical.
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

if (!process.env.NODE_BIN_PATH) {
  log('ERROR: NODE_BIN_PATH is required but was not provided.');
  log('Run "pnpm -F @accomplish/desktop download:nodejs" and rebuild before launching.');
  process.exit(1);
}

const bundledNode = path.join(process.env.NODE_BIN_PATH, isWindows ? 'node.exe' : 'node');
if (!fs.existsSync(bundledNode)) {
  log('ERROR: Bundled node not found at:', bundledNode);
  process.exit(1);
}

const nodeExe = bundledNode;
log('  Using bundled node:', nodeExe);

// Dist entry is required in all environments
const bundledServer = path.join(skillDir, 'dist', 'start-server.mjs');
if (!fs.existsSync(bundledServer)) {
  log('ERROR: Missing dev-browser dist entry:', bundledServer);
  log('Run "pnpm -F @accomplish/desktop build:mcp-tools:dev" before starting the app.');
  process.exit(1);
}
log('  Using bundled server:', bundledServer);

// Build environment
const env = { ...process.env };
if (headless) {
  env.HEADLESS = 'true';
}

const serverArgs = [bundledServer];
log('Spawning:', nodeExe, serverArgs.join(' '));
log('  cwd:', skillDir);

const child = spawn(nodeExe, serverArgs, {
  cwd: skillDir,
  stdio: 'inherit',
  env,
  windowsHide: true,
  shell: false,
});

child.on('error', (err) => {
  log('ERROR: Failed to spawn:', err.message);
  log('  Command:', nodeExe);
  log('  Args:', serverArgs);
  log('  Error code:', err.code);
  process.exit(1);
});

child.on('close', (code, signal) => {
  log('Process exited with code:', code, 'signal:', signal);
  process.exit(code || 0);
});

log('Spawn initiated, waiting for process...');
