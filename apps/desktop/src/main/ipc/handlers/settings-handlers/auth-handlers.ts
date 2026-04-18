import type { IpcMainInvokeEvent } from 'electron';
import { shell } from 'electron';
import { validateHttpUrl } from '@accomplish_ai/agent-core/desktop-main';
import { getSlackMcpOauthStatus } from '@accomplish_ai/agent-core/desktop-main';
import { loginSlackMcp, logoutSlackMcp } from '../../../opencode/slack-auth';
import {
  loginGithubCopilot,
  logoutGithubCopilot,
  getCopilotOAuthStatus,
} from '../../../opencode/copilot-auth';
import type { IpcHandler } from '../../types';
import { getDaemonClient } from '../../../daemon-bootstrap';
import { ensureDaemonRunning } from '../../../daemon/daemon-connector';

export function registerAuthHandlers(handle: IpcHandler): void {
  // Milestone 3 sub-chunk 3c: OpenAI base URL get/set route through daemon.
  handle('settings:openai-base-url:get', async (_event: IpcMainInvokeEvent) => {
    return getDaemonClient().call('settings.getOpenAiBaseUrl');
  });

  handle('settings:openai-base-url:set', async (_event: IpcMainInvokeEvent, baseUrl: string) => {
    if (typeof baseUrl !== 'string') {
      throw new Error('Invalid base URL');
    }

    const trimmed = baseUrl.trim();
    if (!trimmed) {
      await getDaemonClient().call('settings.setOpenAiBaseUrl', { baseUrl: '' });
      return;
    }

    validateHttpUrl(trimmed, 'OpenAI base URL');
    await getDaemonClient().call('settings.setOpenAiBaseUrl', {
      baseUrl: trimmed.replace(/\/+$/, ''),
    });
  });

  // Phase 4a of the SDK cutover port: OpenAI OAuth moved into the daemon
  // via a 4-method RPC protocol. Desktop's role is reduced to:
  //   - opening the authorize URL in the user's browser
  //     (Electron-only `shell.openExternal`)
  //   - proxying status / login RPCs from the renderer
  //
  // Renderer-facing IPC contracts kept unchanged:
  //   opencode:auth:openai:status → { connected, expires? }
  //   opencode:auth:openai:login  → { ok, openedUrl? }
  //
  // `plan` returned by `auth.openai.awaitCompletion` is consumed internally
  // by the Settings UI's model-dropdown logic via a subsequent status / model
  // fetch; it is intentionally NOT surfaced here to preserve the existing
  // renderer contract (plan lives on the agent-core type surface but is
  // only exposed where its consumers are).
  handle('opencode:auth:openai:status', async (_event: IpcMainInvokeEvent) => {
    const client = await ensureDaemonRunning();
    return (await client.call('auth.openai.status')) as { connected: boolean; expires?: number };
  });

  handle('opencode:auth:openai:login', async (_event: IpcMainInvokeEvent) => {
    const client = await ensureDaemonRunning();
    const { sessionId, authorizeUrl } = (await client.call('auth.openai.startLogin')) as {
      sessionId: string;
      authorizeUrl: string;
    };
    // Electron-only step: open the authorize URL in the user's default browser.
    // Keeping this on the desktop side is deliberate per plan decision #6 —
    // the daemon does not have access to Electron's `shell` API.
    await shell.openExternal(authorizeUrl);
    // The daemon-side `awaitCompletion` blocks for up to 2 minutes while the
    // user finishes the browser OAuth flow. The default `DaemonClient.call`
    // timeout is 30s, so we MUST override here — otherwise the IPC handler
    // throws `RPC timeout: auth.openai.awaitCompletion (30000ms)` even when
    // the daemon-side flow eventually succeeds. Use slightly more than the
    // daemon's internal deadline so the daemon's own timeout error wins.
    const AWAIT_COMPLETION_RPC_TIMEOUT_MS = 2 * 60_000 + 5_000;
    const completion = (await client.call(
      'auth.openai.awaitCompletion',
      {
        sessionId,
        timeoutMs: 2 * 60_000,
      },
      { timeoutMs: AWAIT_COMPLETION_RPC_TIMEOUT_MS },
    )) as { ok: boolean; plan?: unknown; error?: string };
    if (!completion.ok) {
      throw new Error(completion.error ?? 'OpenAI authentication failed.');
    }
    // Preserve the existing { ok, openedUrl? } contract expected by
    // apps/desktop/src/preload/index.ts and apps/web/src/client/lib/accomplish.ts.
    return { ok: true, openedUrl: authorizeUrl };
  });

  handle('opencode:auth:slack:status', async (_event: IpcMainInvokeEvent) => {
    return getSlackMcpOauthStatus();
  });

  handle('opencode:auth:slack:login', async (_event: IpcMainInvokeEvent) => {
    await loginSlackMcp();
    return { ok: true };
  });

  handle('opencode:auth:slack:logout', async (_event: IpcMainInvokeEvent) => {
    await logoutSlackMcp();
  });

  handle('opencode:auth:copilot:status', async (_event: IpcMainInvokeEvent) => {
    return getCopilotOAuthStatus();
  });

  handle('opencode:auth:copilot:login', async (_event: IpcMainInvokeEvent) => {
    try {
      const result = await loginGithubCopilot();
      return result;
    } catch (err) {
      if (err instanceof Error) {
        throw err;
      }
      throw new Error(String(err));
    }
  });

  handle('opencode:auth:copilot:logout', async (_event: IpcMainInvokeEvent) => {
    logoutGithubCopilot();
  });
}
