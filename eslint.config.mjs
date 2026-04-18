import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import react from 'eslint-plugin-react';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-electron/**',
      '**/release/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      'scripts/**',
      '**/scripts/**/*.cjs',
      '**/public/theme-init.js',
      '**/out/**',
      '.claude/**',
      '**/mcp-tools/dev-browser/server.cjs',
      '**/mcp-tools/dev-browser/server.mjs',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      curly: ['error', 'all'],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      react,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/jsx-key': 'error',
      'react/jsx-no-target-blank': 'error',
      'react/no-children-prop': 'error',
      'react/no-unescaped-entities': 'error',
    },
  },
  {
    files: ['apps/desktop/src/main/**/*.ts', 'apps/desktop/src/preload/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  // Milestone 1 of the daemon-only-SQLite migration
  // (plan: /Users/yanai/.claude/plans/squishy-exploring-hamster.md).
  //
  // Electron main must NOT value-import from root `@accomplish_ai/agent-core`
  // — the root barrel re-exports `createStorage`, which transitively pulls
  // `better-sqlite3`. Use `@accomplish_ai/agent-core/desktop-main` for values,
  // `@accomplish_ai/agent-core/common` for pure types that aren't already
  // re-exported from `desktop-main`.
  //
  // The `ignores` list below is the explicit shrinking allowlist. Each entry
  // is removed when the referenced migration milestone lands. When the list
  // is empty (after Milestone 5), this rule becomes the end-state invariant.
  {
    files: ['apps/desktop/src/main/**/*.ts', 'apps/desktop/src/preload/**/*.ts'],
    ignores: [
      // Shrinking allowlist is now empty — the end-state invariant is in
      // force: every Electron-main value import from `@accomplish_ai/agent-core`
      // is a violation. Type-only imports are still allowed (see
      // `allowTypeImports: true` on the rule).
      //
      // Migration history:
      //   M1:   new `@accomplish_ai/agent-core/desktop-main` subpath introduced,
      //         non-DB value imports repointed.
      //   M3 3a: `store/secureStorage.ts` — pure RPC façade.
      //   M3 3b: legacy electron-store import moved to daemon.
      //   M3 3c: settings / provider / favorites / HF / log / bug-report handlers.
      //   M3 3d: `store/workspaceManager.ts` + workspace/KN handlers.
      //   M3 3e: connector + auth-entry handlers + `ConnectorAuthStore`.
      //   M4:   Google accounts + skills ownership → daemon.
      //   M5:   `store/storage.ts` reduced to path-math helpers;
      //         `getStorage()` / `createStorage` / `closeStorage` all gone.
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@accomplish_ai/agent-core',
              message:
                'Use `@accomplish_ai/agent-core/desktop-main` for value imports, or `@accomplish_ai/agent-core/common` for pure types. Root is DB-bound (pulls better-sqlite3) and must not be value-imported from Electron main.',
              allowTypeImports: true,
            },
            {
              // M6 review finding P2.D: the root-barrel ban above catches
              // `import X from '@accomplish_ai/agent-core'`, but agent-core's
              // tsconfig wildcard exposes every concrete submodule too
              // (`@accomplish_ai/agent-core/*`). A future main/preload file
              // could deep-import `better-sqlite3` directly and bypass the
              // broader rule — flag it explicitly so the fix is obvious.
              name: 'better-sqlite3',
              message:
                'Electron main and preload must not import better-sqlite3. SQLite is owned by the daemon process (apps/daemon); go through a daemon RPC instead.',
            },
          ],
          patterns: [
            {
              // Every concrete DB-bound module in agent-core. These are
              // the exact paths a reviewer flagged as bypass vectors after
              // the root-barrel guard landed. Pure error/migration-error
              // types live under `agent-core/storage/migrations/errors`
              // and are re-exported via `/desktop-main` — so desktop
              // never needs a deep import into `storage/` at all.
              group: [
                '@accomplish_ai/agent-core/storage',
                '@accomplish_ai/agent-core/storage/*',
                '@accomplish_ai/agent-core/factories',
                '@accomplish_ai/agent-core/factories/storage',
                '@accomplish_ai/agent-core/internal',
                '@accomplish_ai/agent-core/internal/*',
              ],
              message:
                'Deep imports into agent-core storage/factories/internal are banned from Electron main. Every one of these modules reaches `better-sqlite3`. Route through `@accomplish_ai/agent-core/desktop-main` (values) or `@accomplish_ai/agent-core/common` (pure types).',
            },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
);
