import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as desktopMain from '../../src/desktop-main.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DESKTOP_MAIN_SRC = path.resolve(__dirname, '../../src/desktop-main.ts');

/**
 * Milestone 1 of the daemon-only-SQLite migration
 * (plan: /Users/yanai/.claude/plans/squishy-exploring-hamster.md).
 *
 * This test enforces two things about `@accomplish_ai/agent-core/desktop-main`:
 *
 *   1. The runtime surface exposes the expected symbols (typeof checks).
 *   2. The source file does NOT re-export from any barrel (root `./index.js`,
 *      `./common.js`, or sub-barrels like `./daemon/index.js`). Barrel
 *      re-exports drag in side-effects and dependency graphs — which for
 *      the root barrel pulls `better-sqlite3` — the exact bundling hazard
 *      this entrypoint is meant to eliminate.
 *
 * The source-level check is the hard gate here. Runtime typeof catches an
 * accidentally-removed export, but only the source check catches an
 * accidentally-reintroduced barrel re-export that might still compile.
 */
describe('desktop-main entrypoint', () => {
  describe('source-level invariants', () => {
    const source = fs.readFileSync(DESKTOP_MAIN_SRC, 'utf-8');

    // Extract all import/export source specifiers so each invariant can run
    // against the parsed-string list rather than trying to grep the whole
    // file. Handles `import {...} from '...'`, `import '...'`,
    // `export {...} from '...'`, and `export * from '...'`.
    const specifiers: string[] = [];
    const specifierRegex = /from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;
    let match: RegExpExecArray | null;
    while ((match = specifierRegex.exec(source)) !== null) {
      specifiers.push(match[1] ?? match[2]);
    }

    it('never re-exports from the root barrel `./index.js`', () => {
      expect(specifiers).not.toContain('./index.js');
      expect(specifiers).not.toContain('./index');
    });

    it('never re-exports from `./common.js`', () => {
      // `./common.js` is a sibling barrel; importing through it risks pulling
      // in whatever common.ts re-exports (including, potentially, DB-bound
      // modules if common.ts itself grows).
      expect(specifiers).not.toContain('./common.js');
      expect(specifiers).not.toContain('./common');
    });

    it('never re-exports from any sub-barrel `index.js`', () => {
      // e.g. `./daemon/index.js`, `./providers/index.js`, etc. Re-export
      // from the concrete file instead (`./daemon/client.js`).
      const barrels = specifiers.filter((s) => /^\.(?:\/[^/]+)+\/index(?:\.js)?$/.test(s));
      expect(
        barrels,
        `Found barrel re-exports (must point at concrete modules instead): ${JSON.stringify(barrels)}`,
      ).toEqual([]);
    });

    // ── DB-coupling denylist (the real invariant this file exists to protect) ──
    //
    // The reviewer's M1 finding: a future concrete re-export from any of these
    // paths would pass the "no barrels" check while silently pulling
    // better-sqlite3 back into main's module graph. Enforce an explicit
    // denylist so regressions fail the test loudly.
    //
    // `storage/migrations/errors` is intentionally excluded — it defines pure
    // `Error` subclasses with zero imports and is safe for main to see.

    it('never imports `better-sqlite3`', () => {
      expect(specifiers).not.toContain('better-sqlite3');
    });

    it('never re-exports from `./storage/database` (the DB singleton)', () => {
      const dbSpecs = specifiers.filter((s) => /\.\/storage\/database(?:\.js)?$/.test(s));
      expect(
        dbSpecs,
        `desktop-main must not re-export from storage/database: ${JSON.stringify(dbSpecs)}`,
      ).toEqual([]);
    });

    it('never re-exports from `./factories/storage` (constructs the DB singleton)', () => {
      const factorySpecs = specifiers.filter((s) => /\.\/factories\/storage(?:\.js)?$/.test(s));
      expect(
        factorySpecs,
        `desktop-main must not re-export createStorage: ${JSON.stringify(factorySpecs)}`,
      ).toEqual([]);
    });

    it('never re-exports from `./storage/repositories/*` (all DB-bound)', () => {
      const repoSpecs = specifiers.filter((s) => /\.\/storage\/repositories\//.test(s));
      expect(
        repoSpecs,
        `desktop-main must not re-export storage repositories: ${JSON.stringify(repoSpecs)}`,
      ).toEqual([]);
    });

    it('only re-exports from `./storage/` for the pure-error module', () => {
      // Catch-all: any future `./storage/<something>` path that isn't the
      // known-safe `migrations/errors` module is suspicious.
      const storageSpecs = specifiers.filter(
        (s) => /^\.\/storage\//.test(s) && !/^\.\/storage\/migrations\/errors(?:\.js)?$/.test(s),
      );
      expect(
        storageSpecs,
        `desktop-main re-exports from an unexpected ./storage/ path; only migrations/errors is allowed: ${JSON.stringify(storageSpecs)}`,
      ).toEqual([]);
    });
  });

  describe('runtime surface', () => {
    it('exposes daemon RPC infrastructure as classes/functions', () => {
      expect(typeof desktopMain.DaemonClient).toBe('function'); // class
      expect(typeof desktopMain.createSocketTransport).toBe('function');
      expect(typeof desktopMain.getSocketPath).toBe('function');
      expect(typeof desktopMain.getPidFilePath).toBe('function');
      expect(typeof desktopMain.getDaemonDir).toBe('function');
      expect(typeof desktopMain.acquirePidLock).toBe('function');
      expect(typeof desktopMain.PidLockError).toBe('function'); // class
      expect(typeof desktopMain.installCrashHandlers).toBe('function');
    });

    it('exposes OAuth helpers as functions', () => {
      expect(typeof desktopMain.discoverOAuthMetadata).toBe('function');
      expect(typeof desktopMain.registerOAuthClient).toBe('function');
      expect(typeof desktopMain.generatePkceChallenge).toBe('function');
      expect(typeof desktopMain.buildAuthorizationUrl).toBe('function');
      expect(typeof desktopMain.exchangeCodeForTokens).toBe('function');
      expect(typeof desktopMain.refreshAccessToken).toBe('function');
      expect(typeof desktopMain.isTokenExpired).toBe('function');
    });

    it('exposes provider validators and model fetchers as functions', () => {
      expect(typeof desktopMain.validateApiKey).toBe('function');
      expect(typeof desktopMain.validateBedrockCredentials).toBe('function');
      expect(typeof desktopMain.fetchBedrockModels).toBe('function');
      expect(typeof desktopMain.validateVertexCredentials).toBe('function');
      expect(typeof desktopMain.fetchVertexModels).toBe('function');
      expect(typeof desktopMain.validateAzureFoundry).toBe('function');
      expect(typeof desktopMain.testAzureFoundryConnection).toBe('function');
      expect(typeof desktopMain.fetchOpenRouterModels).toBe('function');
      expect(typeof desktopMain.testNimConnection).toBe('function');
      expect(typeof desktopMain.fetchNimModels).toBe('function');
      expect(typeof desktopMain.testOllamaConnection).toBe('function');
      expect(typeof desktopMain.fetchProviderModels).toBe('function');
    });

    it('exposes OpenCode auth helpers as functions', () => {
      expect(typeof desktopMain.getSlackMcpOauthStatus).toBe('function');
    });

    it('exposes utilities as functions', () => {
      expect(typeof desktopMain.sanitizeString).toBe('function');
      expect(typeof desktopMain.validateHttpUrl).toBe('function');
      expect(typeof desktopMain.createMessageId).toBe('function');
    });

    it('exposes FutureSchemaError as a class', () => {
      expect(typeof desktopMain.FutureSchemaError).toBe('function'); // class
      const err = new desktopMain.FutureSchemaError(99, 30);
      expect(err).toBeInstanceOf(Error);
      expect(err.storedVersion).toBe(99);
      expect(err.appVersion).toBe(30);
    });

    it('exposes createLogWriter as a function', () => {
      expect(typeof desktopMain.createLogWriter).toBe('function');
    });

    it('exposes constants', () => {
      expect(typeof desktopMain.DEV_BROWSER_PORT).toBe('number');
      expect(typeof desktopMain.DEV_BROWSER_CDP_PORT).toBe('number');
      expect(desktopMain.ALLOWED_API_KEY_PROVIDERS).toBeInstanceOf(Set);
      expect(typeof desktopMain.DEFAULT_PROVIDERS).toBe('object');
      expect(typeof desktopMain.ZAI_ENDPOINTS).toBe('object');
    });
  });
});
