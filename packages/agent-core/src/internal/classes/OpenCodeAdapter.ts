/**
 * OpenCodeAdapter — SDK-based runtime bridge between Accomplish task lifecycle
 * and the `opencode serve` process (via `@opencode-ai/sdk/v2`).
 *
 * Replaces the earlier PTY + stdout-JSON-parsing implementation. Lifecycle:
 *
 *   TaskManager creates adapter →
 *     startTask(config) →
 *       getServerUrl(taskId) resolves URL →
 *       createOpencodeClient({ baseUrl }) →
 *       event.subscribe() opens SSE stream →
 *       session.create(...) → session.prompt(...) →
 *       subscriber loop maps SDK events to OSS adapter events.
 *   sendResponse(response) → permission.reply or question.reply (whichever was
 *     last asked).
 *   cancelTask() → session.abort + abort event subscription.
 *
 * Preserves the full OSS `OpenCodeAdapterEvents` surface so TaskManager and
 * consumers downstream stay unchanged. OSS-only features preserved:
 *   - `'browser-frame'` event (ENG-695 / PR #414) — detected off SDK tool-output
 *     events produced by `dev-browser-mcp`.
 *   - `'auth-error'` event — surfaced both from SDK `session.error` events and
 *     the existing OpenCodeLogWatcher tail.
 *   - CONNECTOR_AUTH_REQUIRED_MARKER detection in assistant text output.
 *   - Sandbox provider wiring (unchanged from the prior adapter).
 *
 * Part of the OpenCode SDK cutover port (commercial PR #720, Phase 1b).
 *
 * NOTE: Runtime task execution does not work end-to-end in this phase — the
 * `getServerUrl` resolver is populated by the daemon in Phase 2. During Phase
 * 1b, unit tests cover adapter construction + event mapping shapes; real task
 * execution requires Phase 2 to wire up a live `opencode serve` instance.
 */

import * as crypto from 'crypto';
import { EventEmitter } from 'events';

import {
  createOpencodeClient,
  type OpencodeClient,
  type Event as OpenCodeSdkEvent,
  type Part as OpenCodeSdkPart,
  type PermissionRequest as OpenCodeSdkPermissionRequest,
  type QuestionRequest as OpenCodeSdkQuestionRequest,
  type AssistantMessage,
  type Message as OpenCodeSdkMessage,
  type ToolPart,
} from '@opencode-ai/sdk/v2';

import { OpenCodeLogWatcher, createLogWatcher, OpenCodeLogError } from './OpenCodeLogWatcher.js';
import {
  TaskInactivityWatchdog,
  type TaskInactivityWatchdogSnapshot,
  type TaskInactivityWatchdogTimeoutContext,
} from './TaskInactivityWatchdog.js';
import {
  CompletionEnforcer,
  CompletionEnforcerCallbacks,
  CompletionFlowState,
} from '../../opencode/completion/index.js';

import type { TaskConfig, Task, TaskResult } from '../../common/types/task.js';
import type { OnBeforeStartContext } from '../../types/task-manager.js';
import type { OpenCodeMessage } from '../../common/types/opencode.js';
import type { PermissionRequest, PermissionResponse } from '../../common/types/permission.js';
import {
  FILE_PERMISSION_REQUEST_PREFIX,
  QUESTION_REQUEST_PREFIX,
} from '../../common/types/permission.js';
import type { TodoItem } from '../../common/types/todo.js';
import type { SandboxConfig, SandboxProvider } from '../../common/types/sandbox.js';
import type { BrowserFramePayload } from '../../common/types/browser-view.js';
import { DEFAULT_SANDBOX_CONFIG } from '../../common/types/sandbox.js';
import { DisabledSandboxProvider } from '../../sandbox/disabled-provider.js';
import { serializeError } from '../../utils/error.js';
import { getOAuthProviderDisplayName, isOAuthProviderId } from '../../common/types/connector.js';
import { CONNECTOR_AUTH_REQUIRED_MARKER } from '../../common/constants.js';
import { createConsoleLogger } from '../../utils/logging.js';
// `toTaskMessage` and `ModelContext` will be wired when we move to emitting
// pre-processed `TaskMessage` shapes on the event bus (Phase 1c / Phase 2 —
// renderer upsert-by-ID lands there). Today we still emit `OpenCodeMessage`
// synthetic shapes via `partToOpenCodeMessage` for back-compat with the
// existing `message` event consumers.
//
// Keeping this comment so future readers see the intended trajectory.

const log = createConsoleLogger({ prefix: 'OpenCodeAdapter' });

/** Retained for call-site back-compat; the SDK flow no longer uses exit codes. */
export const WINDOWS_CTRL_C_EXIT_CODE = -1073741510;

export const isNormalExit = (code: number | null, platform?: string): boolean =>
  code === 0 || (platform === 'win32' && code === WINDOWS_CTRL_C_EXIT_CODE);

interface ConnectorAuthPauseInput {
  providerId?: string;
  message?: string;
  label?: string;
  pendingLabel?: string;
  successText?: string;
}

export class OpenCodeCliNotFoundError extends Error {
  constructor() {
    super(
      'OpenCode runtime is not available. The bundled runtime may be missing or corrupted. Please reinstall the application.',
    );
    this.name = 'OpenCodeCliNotFoundError';
  }
}

/**
 * Thrown when startTask is invoked without a `getServerUrl` resolver — the
 * SDK adapter requires a live `opencode serve` URL to connect. Phase 2
 * populates this from the daemon's server-manager.
 */
export class OpenCodeRuntimeUnavailableError extends Error {
  constructor(message?: string) {
    super(
      message ??
        'OpenCode runtime URL is not available. Ensure the daemon has started the serve process before starting a task.',
    );
    this.name = 'OpenCodeRuntimeUnavailableError';
  }
}

export interface AdapterOptions {
  platform: NodeJS.Platform;
  isPackaged: boolean;
  tempPath: string;
  /**
   * Resolve the base URL of an `opencode serve` instance for a given task.
   * Populated in Phase 2 by the daemon's server-manager. Required for the
   * SDK adapter; constructors that omit it will succeed, but startTask will
   * throw `OpenCodeRuntimeUnavailableError` until it is wired up.
   *
   * The optional `ctx` carries per-task context (workspaceId) through to the
   * server-manager's own `onBeforeStart` call so the daemon can write the
   * correct per-task config file when spawning `opencode serve`.
   */
  getServerUrl?: (taskId: string, ctx?: OnBeforeStartContext) => Promise<string | undefined>;
  /**
   * Optional pre-task hook. Returns environment variables to merge into
   * `this.externalEnv` before opening the SDK session. The daemon's
   * `task-config-builder.onBeforeStart` uses this to lazily generate the
   * per-task `opencode.json`, sync API keys to `auth.json`, and surface the
   * resulting `OPENCODE_CONFIG[_DIR]` env vars so the upstream `opencode
   * serve` instance picks them up. Phase 4b removed the unused PTY-era
   * `getCliCommand`, `buildEnvironment`, and `buildCliArgs` siblings — the
   * SDK flow has no equivalent of CLI args (it uses `session.prompt`) and
   * the spawn environment is owned by `apps/daemon/src/opencode/server-manager.ts`.
   *
   * The `ctx` argument lets the hook include per-task data (taskId for the
   * per-task config filename, workspaceId for workspace knowledge notes).
   * Callers that don't have a task context pass an empty object.
   */
  onBeforeStart?: (ctx: OnBeforeStartContext) => Promise<NodeJS.ProcessEnv | void>;
  getModelDisplayName?: (modelId: string) => string;
  /** Lazy sandbox factory, called once per adapter instance. */
  sandboxFactory?: () => { provider: SandboxProvider; config: SandboxConfig };
  sandboxProvider?: SandboxProvider;
  sandboxConfig?: SandboxConfig;
  /**
   * Optional proxy tagger. Called with the current task ID when a task
   * starts, and with `undefined` when it tears down. Allows an optional
   * runtime adapter to attribute LLM requests to the originating task.
   * Undefined in pure OSS builds — the adapter is a no-op on this axis.
   */
  setProxyTaskId?: (taskId: string | undefined) => void;
}

export interface OpenCodeAdapterEvents {
  message: [OpenCodeMessage];
  'tool-use': [string, unknown];
  'tool-result': [string];
  'permission-request': [PermissionRequest];
  progress: [{ stage: string; message?: string; modelName?: string }];
  complete: [TaskResult];
  error: [Error];
  debug: [{ type: string; message: string; data?: unknown }];
  'todo:update': [TodoItem[]];
  'auth-error': [{ providerId: string; message: string }];
  /** Live browser preview frame (ENG-695 / PR #414), preserved in the SDK port. */
  'browser-frame': [BrowserFramePayload];
  reasoning: [string];
  'tool-call-complete': [
    {
      toolName: string;
      toolInput: unknown;
      toolOutput: string;
      sessionId?: string;
    },
  ];
  'step-finish': [
    {
      reason: string;
      model?: string;
      tokens?: {
        input: number;
        output: number;
        reasoning: number;
        cache?: { read: number; write: number };
      };
      cost?: number;
    },
  ];
}

/** Shape of an active in-flight request awaiting a caller reply. */
interface PendingRequest {
  kind: 'permission' | 'question';
  /** OSS-facing request ID (prefixed so isFilePermissionRequest/isQuestionRequest work). */
  requestId: string;
  /** Native SDK request ID used for the reply API call. */
  sdkRequestId: string;
  sessionId: string;
}

export class OpenCodeAdapter extends EventEmitter<OpenCodeAdapterEvents> {
  private options: AdapterOptions;
  private sandboxProvider: SandboxProvider;
  private sandboxConfig: SandboxConfig;
  private client: OpencodeClient | null = null;
  private logWatcher: OpenCodeLogWatcher | null = null;
  private completionEnforcer: CompletionEnforcer;

  private currentSessionId: string | null = null;
  private currentTaskId: string | null = null;
  private currentModelId: string | null = null;
  private currentProviderId: string | null = null;
  private lastWorkingDirectory: string | undefined;

  private eventAbortController: AbortController | null = null;
  private eventStreamPromise: Promise<void> | null = null;

  private hasCompleted = false;
  private isDisposed = false;
  private wasInterrupted = false;
  private externalEnv: NodeJS.ProcessEnv | undefined;

  /** Most recent permission/question request awaiting a caller reply. */
  private pendingRequest: PendingRequest | null = null;

  /** Screenshot/frame payload buffer for dev-browser-mcp outputs emitted via SDK tool events. */
  private browserFrameSeen = new Set<string>();

  /**
   * Per-session map of SDK message ID → role. Populated from `message.updated`
   * events; consulted in `handlePartUpdated` so we only forward parts of
   * ASSISTANT messages up to the renderer. Without this filter, OpenCode's
   * SDK emits `message.part.updated` for the USER prompt's own text part —
   * `partToOpenCodeMessage` + `toTaskMessage` would then store it as
   * `type: 'assistant'`, producing a duplicated user message bubble ahead
   * of the real reply (user: "how much is 7+4" → bogus assistant bubble
   * echoing "how much is 7+4" → real assistant bubble "7+4 = 11"). The
   * map is cleared on task-start alongside the other per-task state so
   * IDs from a prior task can't bleed in.
   */
  private messageRoles = new Map<string, 'user' | 'assistant' | string>();

  /**
   * Text parts that arrived via `message.part.updated` before we had seen
   * the matching `message.updated` (so the parent message's role wasn't
   * yet known). Keyed by SDK `messageID`. When the role eventually
   * resolves via `handleMessageUpdated`:
   *   - role === 'assistant' → replay buffered parts as `message` events
   *     so the renderer and persistence layer receive them.
   *   - role !== 'assistant' → drop buffered parts (user/system text that
   *     would have produced a phantom assistant bubble).
   * Without this buffer, the earlier default-deny dropped legitimate
   * assistant text FOREVER whenever the SDK delivered the text part
   * ahead of its parent message.updated — which Codex R5 P1 identified
   * as the root cause of follow-up turns "completing" with no assistant
   * reply in SQLite.
   */
  private pendingTextParts = new Map<string, OpenCodeSdkPart[]>();

  /**
   * Per-task set of tool-call IDs that have already been counted by the
   * completion enforcer (`markToolsUsed`, `markTaskRequiresCompletion`, or
   * `handleCompleteTaskDetection`). Used to dedupe across the
   * running → completed/error transitions the SDK re-emits for the same
   * `part.id`. Without this, fast tools that the SDK only surfaces as
   * `completed` (never `running`) were dropped — Codex R3 P2 flagged the
   * "markToolsUsed only fires on running" bug; this set lets the first
   * observed transition (whichever it is) count while keeping dedupe.
   */
  private countedToolCallIds = new Set<string>();

  /**
   * Whether we're currently awaiting a response to an outstanding
   * `session.prompt` call. `session.idle` events from the SDK only
   * terminate the task when this is true. Without the gate, a fresh
   * adapter subscribing to `event.subscribe` on an already-idle session
   * (e.g., every follow-up turn arriving via `resumeSession`) can
   * receive a pending `session.idle` event BEFORE we've even issued
   * our new prompt — my handler then called `markComplete('success')`
   * prematurely, so when the real assistant reply streamed in the task
   * was already marked completed and the renderer dropped the new
   * messages on the floor. User-visible symptom: follow-up turn shows
   * the user bubble but never the agent's reply.
   */
  private awaitingIdle = false;

  /**
   * Whether we've observed the server actually start generating for
   * the current turn. `session.idle` only transitions the task to
   * complete when this is true AND `awaitingIdle` is true. Rationale:
   * the SDK's event subscription often delivers a "current state"
   * `session.idle` for a session that was already idle before we
   * subscribed, even if the event is received AFTER we set
   * `awaitingIdle = true`. That stale idle would incorrectly complete
   * the task before the new turn's reply streamed in. Flipping this
   * flag only on `message.updated` with `role=assistant` guarantees
   * the next idle we see is truly end-of-generation.
   */
  private sawAssistantProgress = false;

  /**
   * Monotonic counter bumped in `handleSdkEvent` on every SDK event. Feeds
   * the `TaskInactivityWatchdog` fingerprint — each real SDK event advances
   * it, so a stuck task (LLM generation hung, server silent) produces a
   * stable fingerprint and the watchdog escalates.
   */
  private watchdogActivityCounter = 0;
  private watchdog: TaskInactivityWatchdog | null = null;

  constructor(options: AdapterOptions, taskId?: string) {
    super();
    this.options = options;
    this.currentTaskId = taskId ?? null;

    // Sandbox wiring preserved from the prior PTY adapter.
    if (options.sandboxFactory) {
      const { provider, config } = options.sandboxFactory();
      this.sandboxProvider = provider;
      this.sandboxConfig = config;
    } else {
      if (
        options.sandboxConfig &&
        options.sandboxConfig.mode !== 'disabled' &&
        !options.sandboxProvider
      ) {
        throw new Error(
          `sandboxProvider must be supplied when sandboxConfig.mode is "${options.sandboxConfig.mode}". ` +
            'Omitting it causes the task to run unsandboxed on the host.',
        );
      }
      this.sandboxProvider = options.sandboxProvider ?? new DisabledSandboxProvider();
      this.sandboxConfig = options.sandboxConfig ?? DEFAULT_SANDBOX_CONFIG;
    }

    this.completionEnforcer = this.createCompletionEnforcer();
    this.setupLogWatcher();
  }

  // ──────────────────────────── public API ─────────────────────────────────

  async startTask(config: TaskConfig): Promise<Task> {
    if (this.isDisposed) {
      throw new Error('Adapter has been disposed and cannot start new tasks');
    }

    const taskId = config.taskId || this.generateTaskId();
    this.currentTaskId = taskId;
    this.currentSessionId = null;
    this.currentModelId = config.modelId ?? null;
    this.currentProviderId = config.provider ?? null;
    this.hasCompleted = false;
    this.wasInterrupted = false;
    this.pendingRequest = null;
    this.browserFrameSeen.clear();
    this.messageRoles.clear();
    this.pendingTextParts.clear();
    this.countedToolCallIds.clear();
    this.awaitingIdle = false;
    this.sawAssistantProgress = false;
    this.completionEnforcer.reset();
    this.lastWorkingDirectory = config.workingDirectory;

    // Tag the LLM-gateway proxy with this task so it can attribute outgoing
    // requests. No-op in pure OSS builds where no gateway is wired.
    this.options.setProxyTaskId?.(taskId);

    if (this.logWatcher) {
      await this.logWatcher.start();
    }

    // Per-task context lets the daemon's onBeforeStart resolve workspace-
    // scoped knowledge notes and pick a per-task config filename so
    // concurrent tasks don't race on the same opencode.json. Built once and
    // forwarded both to the adapter-side `onBeforeStart` hook AND the
    // server-manager `getServerUrl` call, since both end up invoking the
    // daemon's `onBeforeStart` internally.
    const onBeforeStartCtx: OnBeforeStartContext = {
      taskId,
      workspaceId: config.workspaceId,
    };

    if (this.options.onBeforeStart) {
      this.externalEnv = (await this.options.onBeforeStart(onBeforeStartCtx)) ?? {};
    }

    // Resolve the running opencode-serve URL. Phase 2 populates this from the
    // daemon's server-manager; until then, startTask fails cleanly.
    if (!this.options.getServerUrl) {
      throw new OpenCodeRuntimeUnavailableError(
        'AdapterOptions.getServerUrl not configured. Daemon server-manager wiring lands in Phase 2 of the SDK cutover port.',
      );
    }
    const serverUrl = await this.options.getServerUrl(taskId, onBeforeStartCtx);
    if (!serverUrl) {
      throw new OpenCodeRuntimeUnavailableError(
        `No opencode-serve URL available for task ${taskId}.`,
      );
    }

    this.client = createOpencodeClient({ baseUrl: serverUrl });

    this.emit('progress', { stage: 'loading', message: 'Loading agent...' });

    // Open the SDK event subscription before creating the session so we don't
    // miss early events.
    this.eventAbortController = new AbortController();
    this.eventStreamPromise = this.runEventSubscription(this.eventAbortController.signal);

    // Resume an existing session if the caller provided one; otherwise
    // create a fresh one. CRITICAL for conversation continuity — the
    // previous code called `session.create` unconditionally on every
    // `startTask`, which meant every follow-up turn (from `resumeSession`
    // → `_runTask` → `startTask({ sessionId, ... })`) got a brand-new
    // SDK session with zero memory of earlier turns. User-visible
    // symptom: after answering "What is 8+9? → 17", a follow-up "add 5
    // to the result" triggered a clarification popup because the agent
    // had no idea what "the result" referred to. OpenCode sessions are
    // long-lived; `session.prompt(sessionID=X, text=...)` appends a new
    // user turn to session X and the agent sees the full prior history.
    const model = this.buildModelParam(config);
    let sessionId: string | null = config.sessionId ?? null;
    if (!sessionId) {
      const sessionCreateRes = await this.client.session.create(
        { title: this.deriveTitle(config.prompt) },
        { throwOnError: true },
      );
      sessionId =
        (sessionCreateRes as { data?: { id?: string }; id?: string }).data?.id ??
        (sessionCreateRes as { id?: string }).id ??
        null;
      if (!sessionId) {
        throw new Error('session.create did not return a session ID');
      }
    }
    this.currentSessionId = sessionId;

    // Start the inactivity watchdog now that we have a session. Defaults
    // from `TaskInactivityWatchdog` give us a 90s stall → soft-timeout
    // nudge followed by 60s post-nudge → hard timeout (total ~2.5 min of
    // zero SDK activity). The watchdog pauses while a permission/question
    // prompt is pending (human input time doesn't count as a stall).
    this.startWatchdog();

    this.emit('progress', { stage: 'waiting', message: 'Waiting for response...' });

    // Flip `awaitingIdle` BEFORE firing the prompt so any `session.idle`
    // event the SDK emits from this point forward correctly triggers
    // task completion. `event.subscribe` can replay an older idle for
    // a previously-idle session (e.g., every follow-up turn arriving
    // via `resumeSession`), and without this gate that pre-prompt idle
    // prematurely marked the task complete, cleaning up the adapter
    // before the real reply could stream back. User-visible symptom:
    // follow-up user bubble appeared but the assistant's reply was
    // never rendered (see 17:18:35→17:18:40 trace in daemon log:
    // task cleaned up 5s after start, no reply produced).
    this.awaitingIdle = true;

    // Fire the prompt. We do NOT await — the response streams via events.
    this.client.session
      .prompt({
        sessionID: sessionId,
        parts: [{ type: 'text', text: config.prompt }],
        ...(model ? { model } : {}),
      })
      .catch((err: unknown) => {
        // Session.prompt errors surface through the event stream too, but
        // we capture them here to avoid unhandled rejections.
        log.warn('session.prompt rejected', { error: serializeError(err) });
      });

    return {
      id: taskId,
      prompt: config.prompt,
      status: 'running',
      sessionId,
      messages: [],
      createdAt: new Date().toISOString(),
    };
  }

  async resumeSession(sessionId: string, prompt: string): Promise<Task> {
    return this.startTask({ prompt, sessionId });
  }

  /**
   * Send a response to an in-flight permission or question request.
   *
   * Signature finalised in Phase 2 of the SDK cutover port — takes a
   * structured `PermissionResponse` carrying:
   *   - `requestId`: the OSS-facing request ID (`filereq_*` or `questionreq_*`)
   *   - `decision`:  'allow' | 'deny'
   *   - `selectedOptions` / `customText`: question-response payload (optional)
   *
   * Routing:
   *   - permission.asked: maps decision to SDK reply shape. 'allow' → 'once'.
   *     There is no 'always' signal at this layer; callers that want
   *     sticky-permission behaviour need a follow-up feature.
   *   - question.asked: packages `selectedOptions` + `customText` as the
   *     SDK's `QuestionAnswer[]`. At least one non-empty answer is required;
   *     if neither is provided and decision is 'deny', we send an empty
   *     answer list via `question.reject`.
   */
  async sendResponse(response: PermissionResponse): Promise<void> {
    // Defense-in-depth: today the daemon guarantees one adapter per task,
    // so `response.taskId` should always match `this.currentTaskId`. A
    // future refactor that shares adapters (pooling, session multiplexing)
    // would break this assumption silently and route responses to the
    // wrong task's pending request. Fail loudly instead.
    if (response.taskId && this.currentTaskId && response.taskId !== this.currentTaskId) {
      throw new Error(
        `sendResponse taskId mismatch: adapter task=${this.currentTaskId}, response task=${response.taskId}`,
      );
    }
    const pending = this.pendingRequest;
    if (!pending) {
      throw new Error('No pending permission or question request to respond to');
    }
    if (!this.client) {
      throw new Error('SDK client not initialised');
    }

    if (pending.kind === 'permission') {
      const reply: 'once' | 'always' | 'reject' = response.decision === 'allow' ? 'once' : 'reject';
      await this.client.permission.reply(
        { requestID: pending.sdkRequestId, reply },
        { throwOnError: true },
      );
      this.pendingRequest = null;
    } else {
      // Question reply. Build the `answers` payload from selectedOptions +
      // customText. If both are empty and decision is 'deny', use reject.
      const answers: string[][] = [];
      if (response.selectedOptions && response.selectedOptions.length > 0) {
        answers.push(response.selectedOptions);
      }
      if (response.customText) {
        answers.push([response.customText]);
      }
      const isCancel = response.decision === 'deny' && answers.length === 0;
      if (isCancel) {
        await this.client.question.reject(
          { requestID: pending.sdkRequestId },
          { throwOnError: true },
        );
      } else {
        // The SDK expects Array<QuestionAnswer>; QuestionAnswer = Array<string>.
        await this.client.question.reply(
          { requestID: pending.sdkRequestId, answers },
          { throwOnError: true },
        );
      }
      this.pendingRequest = null;

      // Cancel-hangs-forever fix: when the user hits Cancel on a
      // clarification popup (decision=deny, no answer payload), the
      // opencode SDK session often stops without ever emitting another
      // `session.idle`. Server-side it was paused waiting for an
      // answer; the reject signals abandonment but doesn't always
      // produce the idle event our `session.idle` handler relies on to
      // mark the task complete. Symptom: task card spins "Doing…"
      // forever and the tool row for the question stays in `running`.
      // User-visible fix: treat a cancel as end-of-turn and mark the
      // task complete ourselves. The session object remains alive
      // server-side so a follow-up prompt via `resumeSession` still
      // keeps conversation memory.
      if (isCancel) {
        this.markComplete('success');
      }
    }
  }

  async cancelTask(): Promise<void> {
    this.wasInterrupted = true;
    await this.abortSession('cancel');
    this.teardown();
  }

  async interruptTask(): Promise<void> {
    this.wasInterrupted = true;
    await this.abortSession('interrupt');
  }

  getSessionId(): string | null {
    return this.currentSessionId;
  }

  getTaskId(): string | null {
    return this.currentTaskId;
  }

  /**
   * Current model/provider context for this task, derived from the
   * config at start + the first `message.updated` that reports the
   * assistant's chosen model/provider. Consumed by `TaskManager`'s
   * live `toTaskMessage` conversion so persisted rows and `task.message`
   * RPC notifications carry `modelId` / `providerId` (Codex R4 P2 #2 —
   * the fields existed on the adapter but were never passed through
   * to the message processor on the live pipeline).
   */
  getModelContext(): { modelId?: string; providerId?: string } {
    const ctx: { modelId?: string; providerId?: string } = {};
    if (this.currentModelId) ctx.modelId = this.currentModelId;
    if (this.currentProviderId) ctx.providerId = this.currentProviderId;
    return ctx;
  }

  get running(): boolean {
    return this.client !== null && !this.hasCompleted && !this.isDisposed;
  }

  isAdapterDisposed(): boolean {
    return this.isDisposed;
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.teardown();
    if (this.logWatcher) {
      this.logWatcher.stop();
      this.logWatcher.removeAllListeners();
      this.logWatcher = null;
    }
    this.removeAllListeners();
  }

  // ──────────────────────────── internals ──────────────────────────────────

  private generateTaskId(): string {
    return crypto.randomUUID();
  }

  private generateRequestId(kind: 'permission' | 'question'): string {
    const prefix = kind === 'permission' ? FILE_PERMISSION_REQUEST_PREFIX : QUESTION_REQUEST_PREFIX;
    return `${prefix}${crypto.randomUUID()}`;
  }

  private deriveTitle(prompt: string): string {
    const trimmed = prompt.trim().split('\n')[0] ?? '';
    return trimmed.length > 80 ? `${trimmed.slice(0, 80)}...` : trimmed;
  }

  private buildModelParam(config: TaskConfig): { providerID: string; modelID: string } | null {
    if (!config.modelId || !config.provider) return null;
    return { providerID: config.provider, modelID: config.modelId };
  }

  private createCompletionEnforcer(): CompletionEnforcer {
    const callbacks: CompletionEnforcerCallbacks = {
      onStartContinuation: async (prompt: string) => {
        if (this.currentSessionId && this.client) {
          this.client.session
            .prompt({
              sessionID: this.currentSessionId,
              parts: [{ type: 'text', text: prompt }],
            })
            .catch((err: unknown) => {
              log.warn('continuation prompt rejected', { error: serializeError(err) });
            });
        }
      },
      onComplete: () => {
        this.markComplete('success');
      },
      onDebug: (type: string, message: string, data?: unknown) => {
        this.emit('debug', { type, message, data });
      },
    };
    return new CompletionEnforcer(callbacks);
  }

  private setupLogWatcher(): void {
    this.logWatcher = createLogWatcher();
    this.logWatcher.on('error', (error: OpenCodeLogError) => {
      if (this.hasCompleted || !this.client) return;
      log.info(`Log watcher detected error: ${error.errorName}`);

      const errorMessage = OpenCodeLogWatcher.getErrorMessage(error);

      this.emit('debug', {
        type: 'error',
        message: `[${error.errorName}] ${errorMessage}`,
        data: {
          errorName: error.errorName,
          statusCode: error.statusCode,
          providerID: error.providerID,
          modelID: error.modelID,
          message: error.message,
        },
      });

      if (error.isAuthError && error.providerID) {
        this.emit('auth-error', {
          providerId: error.providerID,
          message: errorMessage,
        });
      }

      this.markComplete('error', errorMessage);
      void this.abortSession('log-error');
    });
  }

  private async runEventSubscription(signal: AbortSignal): Promise<void> {
    if (!this.client) return;
    let subscription;
    try {
      subscription = await this.client.event.subscribe(
        {},
        // AbortSignal is propagated to the underlying fetch via options. The
        // SDK forwards it without declaring it in the Options type; cast to
        // unknown to bypass the narrow declared shape.
        { throwOnError: true, signal } as unknown as Parameters<
          OpencodeClient['event']['subscribe']
        >[1],
      );
    } catch (err) {
      if (!this.isDisposed && !this.wasInterrupted) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
        this.markComplete('error', err instanceof Error ? err.message : String(err));
      }
      return;
    }

    try {
      // subscription.stream is an AsyncIterable<Event>
      const stream = (subscription as { stream: AsyncIterable<OpenCodeSdkEvent> }).stream;
      for await (const event of stream) {
        if (signal.aborted) break;
        try {
          this.handleSdkEvent(event);
        } catch (err) {
          log.warn('event handler threw', { error: serializeError(err) });
        }
      }
    } catch (err) {
      if (!this.isDisposed && !this.wasInterrupted && !signal.aborted) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
        this.markComplete('error', err instanceof Error ? err.message : String(err));
      }
    } finally {
      // Belt-and-braces teardown of the SDK subscription. The AbortSignal
      // path already halts event iteration, but long-running daemons that
      // run many tasks may accumulate subtle socket/fd leaks if the
      // subscription's own handle isn't explicitly released. Best-effort:
      // call `.close()` if the SDK exposes one (version-dependent), else
      // no-op. Swallow errors — the subscription may already be closed by
      // the abort path.
      const maybeClose = (subscription as { close?: () => void | Promise<void> }).close;
      if (typeof maybeClose === 'function') {
        try {
          await Promise.resolve(maybeClose.call(subscription));
        } catch {
          /* ignore — best-effort cleanup */
        }
      }
    }
  }

  private handleSdkEvent(event: OpenCodeSdkEvent): void {
    // Bump the watchdog fingerprint BEFORE the switch so every real SDK
    // event (message, part, delta, permission, question, idle, error,
    // todo…) counts as progress. A hang that produces no events will
    // leave this counter stable, letting the watchdog detect the stall.
    this.watchdogActivityCounter += 1;
    switch (event.type) {
      case 'message.updated': {
        const info = (event.properties as { info: OpenCodeSdkMessage }).info;
        this.handleMessageUpdated(info);
        return;
      }
      case 'message.part.updated': {
        const part = (event.properties as { part: OpenCodeSdkPart }).part;
        this.handlePartUpdated(part);
        return;
      }
      case 'message.part.delta': {
        // Delta updates stream text incrementally; the renderer already
        // coalesces by stable ID when the completed text arrives via
        // message.part.updated. We don't emit per-delta messages to avoid
        // flooding the IPC bus.
        //
        // Use deltas as the LIVE-GENERATION signal for the idle gate.
        // Deltas represent in-flight streaming content, so they are
        // NOT replayable when a new client subscribes to an existing
        // session — unlike `message.updated` / `message.part.updated`,
        // which can redeliver prior-turn state. That makes delta events
        // a much stronger signal that the CURRENT turn is actually
        // generating (Codex R5 P2: the prior `sawAssistantProgress`
        // signal was tied to `message.updated` and could be satisfied
        // by a replayed assistant message from a prior turn).
        this.sawAssistantProgress = true;
        return;
      }
      case 'permission.asked': {
        const sdkReq = event.properties as OpenCodeSdkPermissionRequest;
        this.handlePermissionAsked(sdkReq);
        return;
      }
      case 'question.asked': {
        const sdkReq = event.properties as OpenCodeSdkQuestionRequest;
        this.handleQuestionAsked(sdkReq);
        return;
      }
      case 'session.error': {
        const err = (event.properties as { error?: { message?: string; name?: string } }).error;
        if (err) {
          const msg = err.message ?? 'Session error';
          this.emit('error', new Error(msg));
          this.markComplete('error', msg);
        }
        return;
      }
      case 'session.idle': {
        // SDK-era turn boundary. `session.idle` fires at the end of EVERY
        // turn in a session; the SDK session itself does not terminate
        // and can be re-prompted via `session.prompt` for the next user
        // message.
        //
        // DO NOT invoke `completionEnforcer.handleProcessExit(0)` here.
        // That path was designed for the PTY era where the `opencode run`
        // child exited when the turn ended — firing exactly once. It
        // schedules continuation NUDGES via `onStartContinuation` whenever
        // the agent didn't call `complete_task`. In SDK mode, `session.idle`
        // repeats, and each invocation would re-enter the nudge path:
        //   turn 1 idle → scheduleContinuation → sends nudge via session.prompt
        //   → agent replies defensively ("I was conversational, no workflow
        //   needed") → idle fires again → scheduleContinuation again → …
        // until `MAX_RETRIES_REACHED` stops the storm (~10 attempts).
        // Symptom: the user sees 5–10 successive defensive assistant
        // bubbles after a simple "add 6" request before the task finally
        // ends.
        //
        // Correct SDK-era behavior: an idle session is a natural turn
        // boundary. Mark the task complete based on any `complete_task`
        // the agent already recorded this turn (BLOCKED → error;
        // anything else → success). The user can send a follow-up prompt
        // via the existing resumeSession path if they want more work.
        if (this.hasCompleted) return;
        // Ignore `session.idle` until TWO conditions hold:
        //   1. `awaitingIdle` — we've issued a `session.prompt` for this
        //      turn.
        //   2. `sawAssistantProgress` — the server has emitted at least
        //      one `message.updated` with role=assistant, i.e. started
        //      generating a reply.
        // Condition #1 alone is not enough: the SDK's event subscription
        // may deliver a "current state" `session.idle` for a previously-
        // idle session even after we've set `awaitingIdle = true`. That
        // stale idle would complete the task before the new turn's reply
        // streamed in (user-visible: follow-up turn showed the user
        // bubble but no agent reply). Requiring evidence of generation
        // ensures we only treat an idle as terminal once the server has
        // actually started responding.
        if (!this.awaitingIdle || !this.sawAssistantProgress) return;
        this.awaitingIdle = false;
        const enforcerState = this.completionEnforcer.getState();
        if (enforcerState === CompletionFlowState.BLOCKED) {
          this.markComplete('error', 'Task blocked');
        } else {
          this.markComplete('success');
        }
        return;
      }
      case 'todo.updated': {
        const sdkTodos = (event.properties as { todos: Array<Record<string, unknown>> }).todos;
        // SDK Todo shape: { content, status, priority?, ... } — no `id`. Map
        // into OSS `TodoItem` by synthesising a stable id from index + content.
        const todos: TodoItem[] = (sdkTodos ?? []).map((t, idx) => {
          const rawStatus = t.status;
          const status: TodoItem['status'] =
            rawStatus === 'completed' || rawStatus === 'in_progress' || rawStatus === 'cancelled'
              ? rawStatus
              : 'pending';
          const rawPriority = t.priority;
          const priority: TodoItem['priority'] =
            rawPriority === 'high' || rawPriority === 'low' ? rawPriority : 'medium';
          return {
            id: `todo_${idx}_${String(t.content ?? '').slice(0, 32)}`,
            content: String(t.content ?? ''),
            status,
            priority,
          };
        });
        this.emit('todo:update', todos);
        // Sync todos into the completion enforcer — its "claim success
        // with incomplete todos → downgrade to partial" logic reads this.
        this.completionEnforcer.updateTodos(todos);
        return;
      }
      default:
        return;
    }
  }

  private handleMessageUpdated(info: OpenCodeSdkMessage): void {
    // Track the role for every message ID we observe so `handlePartUpdated`
    // can drop non-assistant text parts (the SDK re-broadcasts the user's
    // own prompt as a `message.part.updated` event; without filtering it
    // appears as a duplicate assistant bubble).
    const id = (info as { id?: string }).id;
    const role = (info as { role?: string }).role;
    if (id && role) {
      this.messageRoles.set(id, role);
      // Flush any text parts that arrived before this `message.updated`.
      // Replay only if role is assistant; drop otherwise. Without this
      // path, the earlier default-deny in `handlePartUpdated` dropped
      // the entire follow-up reply whenever `message.part.updated`
      // raced ahead of `message.updated` on a resumed session (Codex
      // R5 P1). The orphan-buffer design preserves both correctness
      // (never echo the user's prompt as assistant) and liveness
      // (never lose an assistant reply).
      const orphans = this.pendingTextParts.get(id);
      if (orphans && orphans.length > 0) {
        this.pendingTextParts.delete(id);
        if (role === 'assistant') {
          for (const part of orphans) {
            const synthetic = this.partToOpenCodeMessage(part);
            if (synthetic) this.emit('message', synthetic);
          }
        }
      }
    }
    if (info.role === 'assistant') {
      const assistant = info as AssistantMessage;
      if (assistant.modelID && !this.currentModelId) {
        this.currentModelId = assistant.modelID;
      }
      if (assistant.providerID && !this.currentProviderId) {
        this.currentProviderId = assistant.providerID;
      }
      // Observing an assistant message.updated means the server started
      // generating a reply for this turn — any `session.idle` we see
      // from here on is a real end-of-generation signal, not a stale
      // pre-prompt replay. See `sawAssistantProgress` field comment.
      this.sawAssistantProgress = true;
    }
  }

  private handlePartUpdated(part: OpenCodeSdkPart): void {
    // Reasoning parts → OSS `reasoning` event
    if (part.type === 'reasoning') {
      const text = (part as { text?: string }).text;
      if (text) this.emit('reasoning', text);
      return;
    }

    // Text parts — convert via message-processor (handles sanitization, stable IDs,
    // and the new modelContext stamping from Phase 1a).
    if (part.type === 'text') {
      // Guard against the SDK re-broadcasting the user's own prompt as a
      // text part. `toTaskMessage` unconditionally stamps text parts as
      // `type: 'assistant'`; without the role filter the renderer shows a
      // bogus assistant bubble echoing the user's prompt immediately
      // before the real reply.
      //
      // Ordering is not guaranteed between `message.updated` and
      // `message.part.updated` for the same message id — particularly
      // on resumed sessions, `message.part.updated` can arrive first.
      // The earlier default-deny dropped those parts forever, losing
      // legitimate assistant replies (Codex R5 P1 — reproduced as
      // turn-2 replies missing from SQLite). Instead:
      //   - Role unknown → buffer in `pendingTextParts[messageID]`.
      //     `handleMessageUpdated` flushes when the role resolves:
      //     assistant → replay; non-assistant → discard.
      //   - Role is 'assistant' → emit normally.
      //   - Role is anything else (user / system) → drop.
      const messageId = (part as { messageID?: string }).messageID;
      const role = messageId ? this.messageRoles.get(messageId) : undefined;
      if (role === undefined) {
        if (messageId) {
          const bucket = this.pendingTextParts.get(messageId) ?? [];
          bucket.push(part);
          this.pendingTextParts.set(messageId, bucket);
        }
        this.checkForConnectorAuthMarker((part as { text?: string }).text ?? '');
        return;
      }
      if (role !== 'assistant') {
        this.checkForConnectorAuthMarker((part as { text?: string }).text ?? '');
        return;
      }
      const synthetic = this.partToOpenCodeMessage(part);
      if (synthetic) {
        this.emit('message', synthetic);
      }
      this.checkForConnectorAuthMarker((part as { text?: string }).text ?? '');
      return;
    }

    // Tool parts — convert state transitions (running/completed/error) into
    // `message` events so the renderer can coalesce tool rows.
    if (part.type === 'tool') {
      const toolPart = part as ToolPart;
      const toolName = toolPart.tool ?? 'unknown';
      const state = (toolPart as { state?: { status?: string; input?: unknown; output?: string } })
        .state;
      const status = state?.status;

      if (status === 'running') {
        this.emit('tool-use', toolName, state?.input);
      } else if (status === 'completed' || status === 'error') {
        const output = state?.output ?? '';
        this.emit('tool-result', output);
        this.emit('tool-call-complete', {
          toolName,
          toolInput: state?.input,
          toolOutput: output,
          sessionId: this.currentSessionId ?? undefined,
        });

        // Browser-frame detection: dev-browser-mcp emits JSON frames in its tool
        // output. Parse opportunistically; the renderer relies on this to display
        // live page previews (ENG-695 / PR #414).
        if (toolName === 'dev-browser-mcp' || toolName.endsWith('_dev-browser-mcp')) {
          this.detectBrowserFrames(output);
        }
      }

      // Completion-enforcer wiring. Before this was hooked up, tasks
      // running the full workflow (start_task → tools → complete_task)
      // did nothing when the agent called `complete_task` — the enforcer
      // stayed in IDLE state and `session.idle` never resolved into a
      // success marker.
      //
      //   start_task: marks the task as requiring completion (full
      //               workflow, not conversational).
      //   complete_task: records the arguments so `shouldComplete()` /
      //                  `handleProcessExit()` see state.isDone().
      //   any other tool: counts for continuation — prevents the
      //                   enforcer from labelling this as conversational
      //                   when the agent actually did work.
      //
      // Dedupe by the tool call's `part.id` (stable across the
      // running → completed/error transitions the SDK re-emits for the
      // same call). Count at the FIRST transition we observe, whether
      // that's running or completed/error — fast tools may never surface
      // a `running` update at all (Codex R3 P2). `countedToolCallIds`
      // ensures we only notify the enforcer once per call.
      //
      // `complete_task` is special: its `state.input` carries the
      // success/partial/blocked payload, and the `running` snapshot may
      // be streaming (missing `status`). `handleCompleteTaskDetection`
      // is write-once — once it records a call, subsequent invocations
      // are rejected (completion-enforcer.ts:56-59), so we cannot
      // upgrade an earlier partial snapshot later (Codex R4 P1 #2).
      // To avoid locking in a partial payload, defer the complete_task
      // count to the first TERMINAL transition we observe. If the SDK
      // somehow never surfaces a terminal update for this call, we
      // correctly never mark it — preserving the agent's true state
      // over a potentially-wrong guess.
      if (status === 'running' || status === 'completed' || status === 'error') {
        const callId = (toolPart as { id?: string }).id;
        const alreadyCounted = callId ? this.countedToolCallIds.has(callId) : false;
        const isTerminal = status === 'completed' || status === 'error';
        const isCompleteTask = toolName === 'complete_task';

        if (!alreadyCounted) {
          if (isCompleteTask && !isTerminal) {
            // Skip the running snapshot for complete_task; wait for
            // terminal to get the full input. Do NOT mark counted yet.
          } else {
            if (callId) this.countedToolCallIds.add(callId);
            if (isCompleteTask && state?.input !== undefined) {
              this.completionEnforcer.handleCompleteTaskDetection(state.input);
            } else if (toolName === 'start_task') {
              this.completionEnforcer.markTaskRequiresCompletion();
            } else {
              this.completionEnforcer.markToolsUsed(true);
            }
          }
        }
      }

      const synthetic = this.partToOpenCodeMessage(part);
      if (synthetic) {
        this.emit('message', synthetic);
      }
      return;
    }

    // Step-finish parts carry token usage stats.
    if (part.type === 'step-finish') {
      const sp = part as {
        reason?: string;
        tokens?: {
          input?: number;
          output?: number;
          reasoning?: number;
          cache?: { read?: number; write?: number };
        };
        cost?: number;
      };
      this.emit('step-finish', {
        reason: sp.reason ?? 'unknown',
        model: this.currentModelId ?? undefined,
        tokens: sp.tokens
          ? {
              input: sp.tokens.input ?? 0,
              output: sp.tokens.output ?? 0,
              reasoning: sp.tokens.reasoning ?? 0,
              ...(sp.tokens.cache
                ? { cache: { read: sp.tokens.cache.read ?? 0, write: sp.tokens.cache.write ?? 0 } }
                : {}),
            }
          : undefined,
        cost: sp.cost,
      });
    }
  }

  private handlePermissionAsked(sdkReq: OpenCodeSdkPermissionRequest): void {
    const requestId = this.generateRequestId('permission');
    this.pendingRequest = {
      kind: 'permission',
      requestId,
      sdkRequestId: sdkReq.id,
      sessionId: sdkReq.sessionID,
    };
    const fileOp = this.inferFileOperation(sdkReq);
    const filePath = this.inferFilePath(sdkReq);
    // Note: SDK v2 permission requests reference the originating tool via
    // `tool: { messageID, callID }` — not by name. Resolving to a human-
    // readable tool name would require looking up the tool part separately;
    // the renderer can do that via its existing tool registry. Leave
    // toolName undefined for now.
    const req: PermissionRequest = {
      id: requestId,
      taskId: this.currentTaskId ?? '',
      type: fileOp ? 'file' : 'tool',
      toolInput: sdkReq.metadata,
      ...(fileOp ? { fileOperation: fileOp } : {}),
      ...(filePath ? { filePath } : {}),
      createdAt: new Date().toISOString(),
    };
    this.emit('permission-request', req);
  }

  private handleQuestionAsked(sdkReq: OpenCodeSdkQuestionRequest): void {
    const requestId = this.generateRequestId('question');
    this.pendingRequest = {
      kind: 'question',
      requestId,
      sdkRequestId: sdkReq.id,
      sessionId: sdkReq.sessionID,
    };
    const first = sdkReq.questions?.[0];
    const req: PermissionRequest = {
      id: requestId,
      taskId: this.currentTaskId ?? '',
      type: 'question',
      question: first?.question,
      header: first?.header,
      options: first?.options?.map((o) => ({
        label: o.label,
        description: o.description,
      })),
      multiSelect: first?.multiple,
      createdAt: new Date().toISOString(),
    };
    this.emit('permission-request', req);
  }

  private inferFileOperation(
    req: OpenCodeSdkPermissionRequest,
  ): PermissionRequest['fileOperation'] | undefined {
    const perm = req.permission;
    if (perm === 'edit' || perm === 'modify') return 'modify';
    if (perm === 'write') return 'create';
    if (perm === 'delete') return 'delete';
    return undefined;
  }

  private inferFilePath(req: OpenCodeSdkPermissionRequest): string | undefined {
    const patterns = req.patterns;
    if (Array.isArray(patterns) && patterns.length > 0) return patterns[0];
    return undefined;
  }

  private partToOpenCodeMessage(part: OpenCodeSdkPart): OpenCodeMessage | null {
    // Synthesise an OSS OpenCodeMessage from the SDK part so existing
    // consumers of the `message` event (TaskManager → task-callbacks)
    // continue to work. Phase 1c renderer updates will switch to TaskMessage-
    // shaped events eventually.
    const asAny = part as unknown as {
      id?: string;
      sessionID?: string;
      messageID?: string;
      type?: string;
      text?: string;
      tool?: string;
      state?: { status?: string; input?: unknown; output?: string };
    };

    if (part.type === 'text') {
      const text = asAny.text ?? '';
      return {
        type: 'text',
        part: {
          id: asAny.id ?? '',
          sessionID: asAny.sessionID ?? '',
          messageID: asAny.messageID ?? '',
          type: 'text',
          text,
        },
      } as OpenCodeMessage;
    }

    if (part.type === 'tool') {
      const rawStatus = asAny.state?.status;
      const status: 'pending' | 'running' | 'completed' | 'error' =
        rawStatus === 'running' ||
        rawStatus === 'completed' ||
        rawStatus === 'error' ||
        rawStatus === 'pending'
          ? rawStatus
          : 'pending';
      return {
        type: 'tool_use',
        part: {
          id: asAny.id ?? '',
          sessionID: asAny.sessionID ?? '',
          messageID: asAny.messageID ?? '',
          type: 'tool',
          tool: asAny.tool ?? 'unknown',
          state: {
            status,
            input: asAny.state?.input,
            output: asAny.state?.output,
          },
        },
      };
    }

    return null;
  }

  private checkForConnectorAuthMarker(text: string): void {
    if (!text.includes(CONNECTOR_AUTH_REQUIRED_MARKER)) return;
    const payload = this.parseConnectorAuthPayload(text);
    if (payload?.providerId && isOAuthProviderId(payload.providerId)) {
      this.emit('auth-error', {
        providerId: payload.providerId,
        message:
          payload.message ??
          `${getOAuthProviderDisplayName(payload.providerId)} authentication required`,
      });
    }
  }

  private parseConnectorAuthPayload(text: string): ConnectorAuthPauseInput | null {
    const start = text.indexOf(CONNECTOR_AUTH_REQUIRED_MARKER);
    if (start < 0) return null;
    const after = text.slice(start + CONNECTOR_AUTH_REQUIRED_MARKER.length).trim();
    const braceStart = after.indexOf('{');
    if (braceStart < 0) return null;
    try {
      // Best-effort: find matching closing brace.
      let depth = 0;
      for (let i = braceStart; i < after.length; i++) {
        if (after[i] === '{') depth++;
        else if (after[i] === '}') {
          depth--;
          if (depth === 0) {
            return JSON.parse(after.slice(braceStart, i + 1));
          }
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * Parse dev-browser-mcp tool output for JSON-encoded browser frames
   * (ENG-695 / PR #414). The PTY path scanned raw stdout; the SDK path
   * inspects the tool's output field once it reaches `completed` state.
   *
   * Payload shape: `{"type":"browser-frame","taskId":...,"pageName":...,"frame":...,"timestamp":...}`.
   */
  private detectBrowserFrames(output: string): void {
    if (!output) return;
    const lines = output.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{') || !trimmed.includes('"type":"browser-frame"')) continue;
      // Dedup: frame payloads can be replayed across state transitions.
      const fingerprint = trimmed.slice(0, 64);
      if (this.browserFrameSeen.has(fingerprint)) continue;
      this.browserFrameSeen.add(fingerprint);
      try {
        const payload = JSON.parse(trimmed) as BrowserFramePayload & { type?: string };
        if (payload.type === 'browser-frame') {
          this.emit('browser-frame', payload);
        }
      } catch {
        // Malformed line — skip.
      }
    }
  }

  private async abortSession(reason: 'cancel' | 'interrupt' | 'log-error'): Promise<void> {
    this.eventAbortController?.abort();
    if (this.client && this.currentSessionId) {
      try {
        await this.client.session.abort(
          { sessionID: this.currentSessionId },
          { throwOnError: false },
        );
      } catch (err) {
        log.debug?.(`session.abort (${reason}) threw`, { error: serializeError(err) });
      }
    }
  }

  private markComplete(status: TaskResult['status'], error?: string): void {
    if (this.hasCompleted) return;
    this.hasCompleted = true;
    const result: TaskResult = { status, sessionId: this.currentSessionId || undefined };
    if (error) result.error = error;
    this.emit('complete', result);
  }

  private teardown(): void {
    this.watchdog?.stop();
    this.watchdog = null;
    this.eventAbortController?.abort();
    this.eventAbortController = null;
    this.eventStreamPromise = null;
    this.pendingRequest = null;
    this.client = null;
    // Clear optional proxy task tag so subsequent non-task LLM calls aren't
    // misattributed. No-op if the callback wasn't wired.
    this.options.setProxyTaskId?.(undefined);
  }

  /**
   * Spin up the inactivity watchdog for this task. Called after the SDK
   * session is created in `startTask`. The watchdog samples every
   * `sampleIntervalMs` (default 5s), considers the task stalled if the
   * fingerprint doesn't advance for `stallTimeoutMs` (default 90s), nudges
   * via `onSoftTimeout`, and hard-fails via `onHardTimeout` after a further
   * `postNudgeTimeoutMs` (default 60s). A pending permission/question
   * request pauses the detection — waiting on a human isn't a stall.
   *
   * Wired lazily here (rather than in the constructor) because the adapter
   * instance is reused across tasks in the queued-task case and we want a
   * fresh timer budget per task.
   */
  private startWatchdog(): void {
    this.watchdog?.stop();
    this.watchdog = new TaskInactivityWatchdog({
      sample: async () => this.sampleWatchdogState(),
      onSoftTimeout: async (ctx) => this.handleWatchdogSoftTimeout(ctx),
      onHardTimeout: async (ctx) => this.handleWatchdogHardTimeout(ctx),
      onDebug: (type, message, data) => {
        log.warn(`[watchdog] ${type}: ${message}`, { data });
      },
    });
    this.watchdog.start();
  }

  private sampleWatchdogState(): TaskInactivityWatchdogSnapshot {
    // Fingerprint combines the session ID, the monotonic activity counter,
    // and the pending-request ID. Any genuine progress (event received, new
    // permission prompt) advances it. A hang leaves it stable.
    const fingerprint = [
      this.currentSessionId ?? 'no-session',
      this.watchdogActivityCounter,
      this.pendingRequest?.sdkRequestId ?? 'no-pending',
    ].join(':');
    // `inProgress: false` tells the watchdog to reset its timer and not
    // escalate. We flip it false in three cases:
    //   - task already completed
    //   - client torn down
    //   - waiting on human input (pending permission/question)
    // Otherwise the session is actively expected to produce events.
    const inProgress =
      !this.hasCompleted &&
      this.client !== null &&
      !this.isDisposed &&
      this.pendingRequest === null;
    return {
      fingerprint,
      inProgress,
      summary: this.currentSessionId ?? undefined,
    };
  }

  private handleWatchdogSoftTimeout(ctx: TaskInactivityWatchdogTimeoutContext): void {
    // Soft timeout: task has been quiet for `stallTimeoutMs`. V1 treats this
    // as a warning and lets the post-nudge timer run — opencode may still
    // produce a late event. Future enhancement: send a session nudge via
    // the SDK to prompt progress. For now, log and continue.
    log.warn(
      `[watchdog] Task stalled (soft timeout, attempt ${ctx.attempt}, elapsed ${ctx.elapsedMs}ms). Waiting for recovery...`,
      { sessionId: this.currentSessionId, taskId: this.currentTaskId },
    );
  }

  private handleWatchdogHardTimeout(ctx: TaskInactivityWatchdogTimeoutContext): void {
    // Hard timeout: task hasn't made progress in soft + post-nudge
    // windows. Fail the task. `markComplete` triggers the standard
    // cleanup chain (error event, teardown, callback).
    const elapsedSec = Math.round(ctx.elapsedMs / 1000);
    const msg = `Task inactivity watchdog: no SDK events for ${elapsedSec}s (hard timeout)`;
    log.error(`[watchdog] ${msg}`, {
      sessionId: this.currentSessionId,
      taskId: this.currentTaskId,
    });
    if (!this.hasCompleted) {
      this.emit('error', new Error(msg));
      this.markComplete('error', msg);
    }
  }
}
