const path = require('path');
const { runCommandSync, runPnpmSync } = require('../../../scripts/dev-runtime.cjs');

const desktopRoot = path.join(__dirname, '..');
const ensureAgentCoreBuiltScript = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'scripts',
  'ensure-agent-core-built.cjs',
);
const env = { ...process.env };

try {
  runCommandSync(process.execPath, [ensureAgentCoreBuiltScript], {
    cwd: desktopRoot,
    env,
  });
  runPnpmSync(['build:mcp-tools:dev'], {
    cwd: desktopRoot,
    env,
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[desktop:predev] ${message}`);
  process.exit(1);
}
