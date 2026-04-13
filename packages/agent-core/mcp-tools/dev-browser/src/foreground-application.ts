import { execSync, execFileSync } from 'child_process';

export async function withPreservedForeground<T>(operation: () => Promise<T>): Promise<T> {
  if (process.platform !== 'darwin') {
    return operation();
  }

  // Save frontmost app
  let frontmostApp: string | null = null;
  try {
    frontmostApp = execSync(
      `osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'`,
      { encoding: 'utf8', timeout: 2000 },
    ).trim();
  } catch {
    /* ignore */
  }

  try {
    return await operation();
  } finally {
    if (frontmostApp) {
      try {
        // Use execFileSync to avoid shell quoting issues
        execFileSync('osascript', ['-e', `tell application "${frontmostApp}" to activate`], {
          encoding: 'utf8',
          timeout: 2000,
        });
      } catch {
        /* ignore */
      }
    }
  }
}
