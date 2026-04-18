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
      'apps/desktop/src/main/store/storage.ts', // removed in Milestone 5
      // M3 3a: `store/secureStorage.ts` — now a pure RPC façade.
      // M3 3d: `store/workspaceManager.ts` + `ipc/handlers/workspace-handlers.ts`.
      // M4: `google-accounts/*` (account-manager + token-manager deleted,
      //     index.ts re-exports only the OAuth loopback helpers) +
      //     `skills/SkillsManager.ts` (now a daemon-client wrapper).
      // Only `store/storage.ts` remains — it's the last main-side DB
      // consumer and Milestone 5 finishes it off.
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
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
);
