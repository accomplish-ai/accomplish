#!/usr/bin/env node
/**
 * Cross-platform dev-browser server launcher.
 * Replaces server.sh for Windows compatibility.
 */
const { spawn } = require('child_process');
const path = require('path');

const skillDir = __dirname;
const isWindows = process.platform === 'win32';

// Parse command line arguments
const headless = process.argv.includes('--headless');

// Determine npx path - prefer bundled Node.js if available
let npxCommand = isWindows ? 'npx.cmd' : 'npx';
if (process.env.NODE_BIN_PATH) {
  npxCommand = path.join(process.env.NODE_BIN_PATH, isWindows ? 'npx.cmd' : 'npx');
}

// Build environment
const env = { ...process.env };
if (headless) {
  env.HEADLESS = 'true';
}

console.log('Starting dev-browser server...');

const child = spawn(npxCommand, ['tsx', 'scripts/start-server.ts'], {
  cwd: skillDir,
  stdio: 'inherit',
  env,
  shell: isWindows,
  windowsHide: true,
});

child.on('error', (err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});

child.on('close', (code) => {
  process.exit(code || 0);
});
