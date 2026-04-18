const fs = require('fs');
const path = require('path');
const { runCommandSync, runPnpmSync } = require('../../../scripts/dev-runtime.cjs');

const desktopRoot = path.join(__dirname, '..');
const cliArgs = new Set(process.argv.slice(2));
const isRemote = cliArgs.has('--remote');
const isClean = cliArgs.has('--clean');
const isCheck = cliArgs.has('--check');
const mode = isRemote ? 'remote' : isClean ? 'clean' : 'dev';

const env = { ...process.env };
if (!isRemote && !env.ACCOMPLISH_ROUTER_URL) {
  env.ACCOMPLISH_ROUTER_URL = 'http://localhost:5173';
}
if (isClean) {
  env.CLEAN_START = '1';
}

try {
  runNodeScript('patch-electron-name.cjs', env);

  // Milestone 6 of the daemon-only-SQLite migration removed the
  // `ensureNativeModules()` + `validate-native-modules.cjs` path. Pre-M6
  // this ran `electron-rebuild` on macOS/Linux and a better-sqlite3
  // prebuild probe on Windows. Post-M6 the Electron main process ships
  // zero native modules (the daemon owns its own better-sqlite3 copy
  // and runs under bundled Node, not Electron), so there is nothing for
  // electron-rebuild to do — and `@electron/rebuild` is no longer
  // installed. Running the pre-M6 path would fail immediately on every
  // `pnpm dev`. If a future Electron-native dependency reappears, add a
  // targeted check here at that point rather than resurrecting the
  // blanket rebuild.

  if (!isCheck) {
    fs.rmSync(path.join(desktopRoot, 'dist-electron'), { recursive: true, force: true });
  }

  if (isCheck) {
    console.log(`[desktop:${mode}] Check mode passed`);
    process.exit(0);
  }

  runPnpmSync(['exec', 'vite'], {
    cwd: desktopRoot,
    env,
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[desktop:${mode}] ${message}`);
  process.exit(1);
}

function runNodeScript(scriptName, commandEnv) {
  runCommandSync(process.execPath, [path.join(__dirname, scriptName)], {
    cwd: desktopRoot,
    env: commandEnv,
  });
}
