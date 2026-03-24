const fs = require('fs');
const path = require('path');
const { isWindows, runCommandSync, runPnpmSync } = require('../../../scripts/dev-runtime.cjs');

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
  ensureNativeModules(env);

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

function ensureNativeModules(commandEnv) {
  const forceRebuild = process.env.ACCOMPLISH_FORCE_ELECTRON_REBUILD === '1';
  if (!isWindows || forceRebuild) {
    runElectronRebuild(commandEnv);
    return;
  }

  if (hasWindowsPrebuiltNativeModules(commandEnv)) {
    console.log('[desktop] Using Windows prebuilt native modules');
    return;
  }

  console.log('[desktop] Native prebuild validation failed; running electron-rebuild');
  runElectronRebuild(commandEnv);
}

function runElectronRebuild(commandEnv) {
  runPnpmSync(['exec', 'electron-rebuild', '-f'], {
    cwd: desktopRoot,
    env: commandEnv,
  });
}

function hasWindowsPrebuiltNativeModules(commandEnv) {
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : null;
  if (!arch) {
    return false;
  }

  const nodePtyPrebuildDir = path.join(
    desktopRoot,
    'node_modules',
    'node-pty',
    'prebuilds',
    `win32-${arch}`,
  );
  const betterSqliteBinary = path.join(
    desktopRoot,
    'node_modules',
    'better-sqlite3',
    'build',
    'Release',
    'better_sqlite3.node',
  );

  const hasNodePty = fs.existsSync(nodePtyPrebuildDir);
  const hasBetterSqlite = fs.existsSync(betterSqliteBinary);

  if (!hasNodePty) {
    console.log(`[desktop] Missing node-pty prebuilds at ${nodePtyPrebuildDir}`);
  }
  if (!hasBetterSqlite) {
    console.log(`[desktop] Missing better-sqlite3 binary at ${betterSqliteBinary}`);
  }

  if (!hasNodePty || !hasBetterSqlite) {
    return false;
  }

  return validateNativeModulesInElectron(commandEnv);
}

function validateNativeModulesInElectron(commandEnv) {
  try {
    runPnpmSync(['exec', 'electron', path.join(__dirname, 'validate-native-modules.cjs')], {
      cwd: desktopRoot,
      env: commandEnv,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[desktop] Electron native module validation failed: ${message}`);
    return false;
  }
}
