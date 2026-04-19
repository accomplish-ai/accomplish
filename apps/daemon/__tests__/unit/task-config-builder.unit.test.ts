/**
 * Integration-ish tests for the daemon's `onBeforeStart` hook.
 *
 * These tests run the REAL `resolveTaskConfig` + `generateConfig` (not
 * mocked), so they prove that the live daemon config path writes all of:
 *   - workspace knowledge notes into the system prompt
 *   - enabled MCP connectors into `mcpServers`
 *   - GWS accounts (gws-mcp / gmail-mcp / calendar-mcp) + manifest env
 *   - OpenAI `store: false` provider option
 *   - language preference
 * into the actual opencode-<taskId>.json file on disk.
 *
 * The only mocks we inject sit at the edges `resolveTaskConfig` can't
 * reach without better-sqlite3 native bindings:
 *   - `getDatabase()` returns an in-memory stub that answers the two SQL
 *     shapes `prepareGwsManifest` issues
 *   - knowledge-note repo + provider-settings repo return fixed values
 *
 * Everything else — connector-token shape, cloud browser config,
 * language, `store: false` injection, filename construction — flows
 * through the real code.
 *
 * Tests also pin the three regressions Codex flagged:
 *   - validateTaskConfig preserves workspaceId (so resolveTaskConfig
 *     actually sees it)
 *   - configFileName sanitisation against malicious taskIds
 *   - resumeSession workspaceId fallback to the stored task (in a
 *     sibling test file that mocks StorageAPI only)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Tunable via each test.
// Either-or: `knowledgeInstructionsText` → rendered in the binding
// <workspace-instructions> block; `knowledgeContextText` → rendered in the
// soft <workspace-knowledge> block. Tests set one or both per scenario.
let knowledgeInstructionsText: string | undefined = undefined;
let knowledgeContextText: string | undefined = undefined;
let activeProviderModel: { provider: string; model: string } | null = null;
let gwsRows: Record<string, unknown>[] = [];

// `generateConfig` does `fs.existsSync(nodeExe)` before writing the config;
// create a real placeholder file each test can point at. This is test
// plumbing, not what onBeforeStart produces on a real machine — the real
// daemon resolves this from packaged / dev paths.
let fakeNodeBinDir: string;
let fakeMcpToolsPath: string;

// Live DB stub — only answers what `prepareGwsManifest` queries.
const dbStub = {
  prepare: vi.fn((sql: string) => {
    if (sql.includes('SELECT') && sql.includes('google_accounts')) {
      return { all: vi.fn(() => gwsRows), run: vi.fn(), get: vi.fn() };
    }
    // UPDATE last_refreshed_at — no-op in tests (we never near-expiry here)
    return { all: vi.fn(() => []), run: vi.fn(), get: vi.fn() };
  }),
};

vi.mock('@accomplish_ai/agent-core/storage/database', () => ({
  getDatabase: vi.fn(() => dbStub),
}));

// resolveTaskConfig imports directly from the repository module (NOT via
// the barrel), so the mock must target that module path exactly. We stub
// both `getFormattedKnowledgeNotes` (the new structured API that splits
// instructions from context) and `getKnowledgeNotesForPrompt` (the legacy
// single-string API kept for backward compatibility).
vi.mock('@accomplish_ai/agent-core/storage/repositories/knowledgeNotes', () => ({
  getFormattedKnowledgeNotes: vi.fn(() => ({
    instructions: knowledgeInstructionsText ?? '',
    context: knowledgeContextText ?? '',
  })),
  getKnowledgeNotesForPrompt: vi.fn(() => {
    const parts: string[] = [];
    if (knowledgeInstructionsText) parts.push(`### Instruction\n${knowledgeInstructionsText}`);
    if (knowledgeContextText) parts.push(knowledgeContextText);
    return parts.join('\n\n');
  }),
}));

vi.mock('@accomplish_ai/agent-core', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    // Mock out the auth.json sync / bundled-node resolution bits that
    // hit the filesystem unnecessarily for this test.
    syncApiKeysToOpenCodeAuth: vi.fn(),
    getOpenCodeAuthJsonPath: vi.fn(() => '/tmp/fake-auth.json'),
    // generateConfig throws without a bundled node path; point at a real
    // file created in beforeEach. The MCP server entries the test asserts
    // on don't actually spawn — we just need fs.existsSync to pass. The
    // real daemon resolves this from packaged / dev paths.
    getBundledNodePaths: vi.fn(() => ({
      binDir: fakeNodeBinDir,
      nodeExe: path.join(fakeNodeBinDir, process.platform === 'win32' ? 'node.exe' : 'node'),
    })),
    getEnabledSkills: vi.fn(() => []),
    isCliAvailable: vi.fn(async () => true),
  };
});

// Provider-settings / storage-repository barrel reads getDatabase() at call
// time — the real one requires an initialised native SQLite module which is
// absent in this test environment. Stub only the methods `buildProviderConfigs`
// pulls in via that barrel. The vitest alias maps `@accomplish_ai/agent-core`
// to agent-core's src/, so the relative path resolves the same way as from
// `src/opencode/config-builder.ts`.
vi.mock('@accomplish_ai/agent-core/storage/repositories/index', async () => {
  return {
    getProviderSettings: vi.fn(() => ({
      activeProviderId: null,
      connectedProviders: {},
      debugMode: false,
      onboardingComplete: true,
      selectedModel: undefined,
      ollamaConfig: null,
      litellmConfig: null,
      azureFoundryConfig: null,
      lmstudioConfig: null,
      huggingfaceLocalConfig: null,
      nimConfig: null,
      openAiBaseUrl: '',
      llamaCppConfig: null,
      language: undefined,
    })),
    getActiveProviderModel: vi.fn(() => activeProviderModel),
    getConnectedProviderIds: vi.fn(() => []),
    getOllamaConfig: vi.fn(() => null),
    getLMStudioConfig: vi.fn(() => null),
    getLiteLLMConfig: vi.fn(() => null),
    getAzureFoundryConfig: vi.fn(() => null),
    getHuggingFaceLocalConfig: vi.fn(() => null),
    getNimConfig: vi.fn(() => null),
    getOpenAiBaseUrl: vi.fn(() => ''),
    getLlamaCppConfig: vi.fn(() => null),
  };
});

const { onBeforeStart } = await import('../../src/task-config-builder.js');

function makeStorage(overrides: Record<string, unknown> = {}) {
  return {
    getAllApiKeys: vi.fn(async () => ({ openai: 'sk-test-openai' })),
    getApiKey: vi.fn((provider: string) => (provider === 'openai' ? 'sk-test-openai' : null)),
    get: vi.fn(() => null),
    set: vi.fn(),
    getEnabledConnectors: vi.fn(() => []),
    getConnectorTokens: vi.fn(() => null),
    setConnectorStatus: vi.fn(),
    storeConnectorTokens: vi.fn(),
    getCloudBrowserConfig: vi.fn(() => null),
    getLanguage: vi.fn(() => undefined),
    ...overrides,
  };
}

describe('daemon onBeforeStart — integration against real resolveTaskConfig + generateConfig', () => {
  let tmpUserData: string;

  beforeEach(() => {
    knowledgeInstructionsText = undefined;
    knowledgeContextText = undefined;
    activeProviderModel = null;
    gwsRows = [];
    tmpUserData = path.join(
      os.tmpdir(),
      `daemon-onbeforestart-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    fs.mkdirSync(tmpUserData, { recursive: true });
    fakeNodeBinDir = path.join(tmpUserData, 'fake-node-bin');
    fs.mkdirSync(fakeNodeBinDir, { recursive: true });
    fs.writeFileSync(
      path.join(fakeNodeBinDir, process.platform === 'win32' ? 'node.exe' : 'node'),
      '',
    );
    // generator-mcp validates each registered MCP tool has a real
    // `{tool}/dist/index.mjs` on disk. Create empty placeholders for each
    // tool the real generator could conditionally register, so the test
    // doesn't have to know which combinations each scenario enables.
    fakeMcpToolsPath = path.join(tmpUserData, 'fake-mcp-tools');
    for (const tool of [
      'request-connector-auth',
      'complete-task',
      'start-task',
      'whatsapp',
      'dev-browser-mcp',
      'gmail-mcp',
      'calendar-mcp',
      'gws-mcp',
      'request-google-file-picker',
    ]) {
      const distDir = path.join(fakeMcpToolsPath, tool, 'dist');
      fs.mkdirSync(distDir, { recursive: true });
      fs.writeFileSync(path.join(distDir, 'index.mjs'), '');
    }
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpUserData, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('writes opencode-<taskId>.json containing workspace knowledge notes and OpenAI store:false', async () => {
    // Use an `instruction`-type note to exercise the new binding wrapper path.
    knowledgeInstructionsText = '- Remember: treat `foo` as a reserved keyword in this workspace.';
    const storage = makeStorage();

    const { configPath } = await onBeforeStart(
      storage as never,
      {
        userDataPath: tmpUserData,
        mcpToolsPath: fakeMcpToolsPath,
        isPackaged: false,
        resourcesPath: '',
        appPath: '',
      },
      { taskId: 'tsk_abc', workspaceId: 'ws_42' },
    );

    // File should exist under the per-task name inside userDataPath/opencode/
    expect(configPath).toBe(path.join(tmpUserData, 'opencode', 'opencode-tsk_abc.json'));
    expect(fs.existsSync(configPath)).toBe(true);

    const written = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    // System prompt has the workspace knowledge text embedded
    const systemPrompt =
      typeof written.instructions === 'string'
        ? written.instructions
        : Array.isArray(written.instructions)
          ? written.instructions.join('\n')
          : JSON.stringify(written);
    expect(systemPrompt).toContain('treat `foo` as a reserved keyword');

    // OpenAI provider has store:false injected
    expect(written.provider?.openai?.options?.store).toBe(false);
  });

  it('returns workspaceInstructions alongside env so the adapter can inject them as SDK `system` per-turn', async () => {
    // The generated config file (tested above) is not enough — the
    // OpenAI/Codex provider path inside OpenCode has its own
    // `options.instructions` channel that crowds out the agent-level
    // prompt. onBeforeStart must return the pre-formatted instruction
    // bullet list via `workspaceInstructions` so the adapter can
    // duplicate it into `session.prompt({ system })` on every turn.
    knowledgeInstructionsText = '- Always add "Haiku" suffix to every reply';
    const storage = makeStorage();

    const result = await onBeforeStart(
      storage as never,
      {
        userDataPath: tmpUserData,
        mcpToolsPath: fakeMcpToolsPath,
        isPackaged: false,
        resourcesPath: '',
        appPath: '',
      },
      { taskId: 'tsk_ws_instr', workspaceId: 'ws_42' },
    );

    expect(result.workspaceInstructions).toBeDefined();
    expect(result.workspaceInstructions).toContain('Always add "Haiku" suffix to every reply');
    // Env is still populated as before — not clobbered by the new field.
    expect(result.env.OPENCODE_CONFIG).toBeDefined();
  });

  it('omits workspaceInstructions when no instruction-type notes exist (context/reference only)', async () => {
    // The structured return from getFormattedKnowledgeNotes splits by type:
    // only `instruction` notes go into `.instructions`, so context-only
    // workspaces should produce a result with no `workspaceInstructions` key.
    knowledgeInstructionsText = undefined;
    knowledgeContextText = '### Context\n- Project uses Postgres 16';
    const storage = makeStorage();

    const result = await onBeforeStart(
      storage as never,
      {
        userDataPath: tmpUserData,
        mcpToolsPath: fakeMcpToolsPath,
        isPackaged: false,
        resourcesPath: '',
        appPath: '',
      },
      { taskId: 'tsk_ctx_only', workspaceId: 'ws_42' },
    );

    expect(result.workspaceInstructions).toBeUndefined();
  });

  it('includes enabled MCP connectors in the written config', async () => {
    const storage = makeStorage({
      getEnabledConnectors: vi.fn(() => [
        {
          id: 'conn-slack-1',
          name: 'slack',
          url: 'https://slack.example.com/mcp',
          status: 'connected',
        },
      ]),
      getConnectorTokens: vi.fn(() => ({
        accessToken: 'slack-access-token',
        refreshToken: undefined,
        expiresAt: Date.now() + 3600_000,
      })),
    });

    const { configPath } = await onBeforeStart(
      storage as never,
      {
        userDataPath: tmpUserData,
        mcpToolsPath: fakeMcpToolsPath,
        isPackaged: false,
        resourcesPath: '',
        appPath: '',
      },
      { taskId: 'tsk_conn', workspaceId: undefined },
    );

    const written = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const mcp = (written.mcp ?? written.mcpServers ?? {}) as Record<
      string,
      { type?: string; url?: string; headers?: Record<string, string> }
    >;
    // Generator-mcp encodes user connectors as `connector-<sanitized-name>-<id-prefix>`
    // (see generator-mcp.ts:240–262). Built-in `slack` uses a bare `slack` key,
    // so filtering on the `connector-` prefix avoids false-passing on the
    // default remote slack MCP that's always registered.
    const userConnectorEntries = Object.entries(mcp).filter(([key]) =>
      key.startsWith('connector-'),
    );
    expect(userConnectorEntries).toHaveLength(1);
    const [connectorKey, connectorServer] = userConnectorEntries[0];
    expect(connectorKey).toBe('connector-slack-conn-s');
    expect(connectorServer.type).toBe('remote');
    expect(connectorServer.url).toBe('https://slack.example.com/mcp');
    expect(connectorServer.headers?.Authorization).toBe('Bearer slack-access-token');
  });

  it('registers gws-mcp + gmail-mcp + calendar-mcp + GWS_ACCOUNTS_MANIFEST env when accounts are connected', async () => {
    const now = Date.now();
    gwsRows = [
      {
        google_account_id: 'gacc-1',
        email: 'alice@example.com',
        display_name: 'Alice',
        picture_url: null,
        label: 'Personal',
        status: 'connected',
        connected_at: new Date(now).toISOString(),
        last_refreshed_at: null,
      },
    ];
    const storage = makeStorage({
      get: vi.fn((key: string) => {
        if (key === 'gws:token:gacc-1') {
          return JSON.stringify({
            accessToken: 'ya29.live',
            refreshToken: 'rt-live',
            expiresAt: now + 3600_000, // 1 hour — well outside refresh margin
            scopes: ['https://www.googleapis.com/auth/gmail.modify'],
          });
        }
        return null;
      }),
    });

    const { configPath } = await onBeforeStart(
      storage as never,
      {
        userDataPath: tmpUserData,
        mcpToolsPath: fakeMcpToolsPath,
        isPackaged: false,
        resourcesPath: '',
        appPath: '',
      },
      { taskId: 'tsk_gws', workspaceId: undefined },
    );

    const written = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const mcp = (written.mcp ?? written.mcpServers ?? {}) as Record<
      string,
      { environment?: Record<string, string>; env?: Record<string, string> }
    >;
    // The three GWS MCP servers should be registered
    expect(Object.keys(mcp)).toEqual(
      expect.arrayContaining(['gws-mcp', 'gmail-mcp', 'calendar-mcp']),
    );
    // Each GWS MCP server's env should include GWS_ACCOUNTS_MANIFEST pointing
    // at the manifest file we just wrote
    const gwsMcpEnv = mcp['gws-mcp'].environment ?? mcp['gws-mcp'].env ?? {};
    expect(gwsMcpEnv.GWS_ACCOUNTS_MANIFEST).toContain('gws-manifests');
    expect(gwsMcpEnv.GWS_ACCOUNTS_MANIFEST).toContain('manifest.json');
    // Verify the manifest actually exists on disk
    expect(fs.existsSync(gwsMcpEnv.GWS_ACCOUNTS_MANIFEST!)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(gwsMcpEnv.GWS_ACCOUNTS_MANIFEST!, 'utf-8'));
    expect(manifest).toHaveLength(1);
    expect(manifest[0].email).toBe('alice@example.com');
  });

  it('sanitises malicious taskIds when building the per-task config filename', async () => {
    const storage = makeStorage();
    const { configPath } = await onBeforeStart(
      storage as never,
      {
        userDataPath: tmpUserData,
        mcpToolsPath: fakeMcpToolsPath,
        isPackaged: false,
        resourcesPath: '',
        appPath: '',
      },
      { taskId: '../../../etc/passwd', workspaceId: undefined },
    );

    // No path escape — the file lands inside userDataPath/opencode/ and
    // the filename has path separators replaced with underscores.
    expect(configPath.startsWith(path.join(tmpUserData, 'opencode'))).toBe(true);
    expect(configPath).not.toContain('..');
    expect(configPath).not.toContain('/etc/passwd');
    const filename = path.basename(configPath);
    expect(filename).toMatch(/^opencode-[_A-Za-z0-9-]+\.json$/);
  });

  it('falls back to default opencode.json when ctx has no taskId (transient OAuth path)', async () => {
    const storage = makeStorage();
    const { configPath } = await onBeforeStart(
      storage as never,
      {
        userDataPath: tmpUserData,
        mcpToolsPath: fakeMcpToolsPath,
        isPackaged: false,
        resourcesPath: '',
        appPath: '',
      },
      {},
    );

    expect(path.basename(configPath)).toBe('opencode.json');
  });
});
