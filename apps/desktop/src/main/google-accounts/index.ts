/**
 * Google account module — main-process surface.
 *
 * Milestone 4 of the daemon-only-SQLite migration
 * (plan: /Users/yanai/.claude/plans/squishy-exploring-hamster.md).
 *
 * Pre-M4 this re-exported `AccountManager` + `TokenManager` singletons
 * that opened the main DB handle and stored tokens under
 * `gws:token:<id>`. Both are now gone — their responsibilities live in
 * the daemon's `GoogleAccountService`, and desktop talks to it over
 * `gwsAccount.*` RPCs. The only piece that stayed on this side is the
 * OAuth loopback (`startGoogleOAuth` / `cancelGoogleOAuth`), which needs
 * Electron's `shell.openExternal` + a local HTTP listener.
 */
export { startGoogleOAuth, cancelGoogleOAuth } from './google-auth';
