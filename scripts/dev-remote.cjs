const {
  formatChildExit,
  killChildProcess,
  resolveExitCode,
  spawnPnpm,
} = require('./dev-runtime.cjs');

const cliArgs = process.argv.slice(2);
const isCheck = cliArgs.includes('--check');
const positionalArgs = cliArgs.filter((arg) => !arg.startsWith('--'));

const url = positionalArgs[0];
if (!url) {
  console.error('Usage: pnpm dev:remote <url>');
  console.error(
    'Example: pnpm dev:remote https://accomplish-app-preview-42.accomplish.workers.dev',
  );
  process.exit(1);
}

const env = {
  ...process.env,
  ACCOMPLISH_ROUTER_URL: url,
};

console.log('[dev:remote] Launching Electron → ' + url);

const electronArgs = ['-F', '@accomplish/desktop', 'dev:remote'];
if (isCheck) {
  electronArgs.push('--', '--check');
}

const electron = spawnPnpm(electronArgs, { env });
let shuttingDown = false;

function cleanup(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  killChildProcess(electron, { force: true });
  process.exit(resolveExitCode(reason));
}

electron.on('error', (error) => {
  if (shuttingDown) return;
  console.error(`[dev:remote] Failed to start Electron: ${error.message}`);
  cleanup(1);
});

electron.on('exit', (code, signal) => {
  if (shuttingDown) return;
  const message = `[dev:remote] Electron exited (${formatChildExit(code, signal)})`;
  if (typeof code === 'number' && code === 0) {
    console.log(message);
  } else {
    console.error(message);
  }
  cleanup(typeof code === 'number' ? code : 1);
});

process.on('SIGINT', () => cleanup(130));
process.on('SIGTERM', () => cleanup(143));
process.on('uncaughtException', (error) => {
  console.error(error);
  cleanup(1);
});
process.on('unhandledRejection', (reason) => {
  console.error(reason);
  cleanup(1);
});
