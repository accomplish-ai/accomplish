const requiredModules = ['better-sqlite3', 'node-pty'];

try {
  for (const moduleName of requiredModules) {
    require(moduleName);
  }
  console.log('[desktop] Electron native module validation passed');
  process.exit(0);
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error('[desktop] Electron native module validation failed');
  console.error(message);
  process.exit(1);
}
