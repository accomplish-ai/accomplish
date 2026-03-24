const path = require('path');
const { runCommandSync } = require('./dev-runtime.cjs');

const rootDir = path.join(__dirname, '..');
const env = { ...process.env };

try {
  runNodeScript('check-deps.cjs');
  runNodeScript('ensure-agent-core-built.cjs');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[predev] ${message}`);
  process.exit(1);
}

function runNodeScript(scriptName) {
  runCommandSync(process.execPath, [path.join(__dirname, scriptName)], {
    cwd: rootDir,
    env,
  });
}
