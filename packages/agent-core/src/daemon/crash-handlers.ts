/**
 * Crash Handlers
 *
 * Installs global process-level error handlers that log fatal errors before the
 * process exits. This prevents silent crashes in the daemon process.
 *
 * ESM module — use .js extensions on imports.
 */

/**
 * Install global crash / unhandled-rejection handlers.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
let installed = false;

export function installCrashHandlers(): void {
  if (installed) {
    return;
  }
  installed = true;

  process.on('uncaughtException', (err) => {
    console.error('[Daemon] Uncaught exception:', err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[Daemon] Unhandled promise rejection:', reason);
    process.exit(1);
  });
}
