#!/usr/bin/env node
/**
 * Cross-platform dev-browser server launcher.
 * Runs the pre-bundled JavaScript directly - no tsx required.
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

// Run the pre-bundled JavaScript
const serverScript = path.join(skillDir, 'dist', 'index.mjs');

if (!fs.existsSync(serverScript)) {
  log('ERROR: Bundled script not found at:', serverScript);
  log('Run "node scripts/build-skills.mjs" from apps/desktop to build skills');
  process.exit(1);
}

// Build environment
const env = { ...process.env };
if (headless) {
  env.HEADLESS = 'true';
}

log('Spawning:', nodeExe, serverScript);
log('  cwd:', skillDir);

const child = spawn(nodeExe, [serverScript], {
  cwd: skillDir,
  stdio: 'inherit',
  env,
  windowsHide: true,
});

child.on('error', (err) => {
  log('ERROR: Failed to spawn:', err.message);
  log('  Command:', nodeExe);
  log('  Script:', serverScript);
  log('  Error code:', err.code);
  process.exit(1);
});

child.on('close', (code, signal) => {
  log('Process exited with code:', code, 'signal:', signal);
  process.exit(code || 0);
});

log('Spawn initiated, waiting for process...');
