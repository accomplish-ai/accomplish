import { EventEmitter } from 'node:events';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import {
  createTaskManager,
  createTaskId,
  createMessageId,
  buildCliArgs as coreBuildCliArgs,
  buildOpenCodeEnvironment,
  resolveCliPath,
  isCliAvailable as coreIsCliAvailable,
  getModelDisplayName,
  generateTaskSummary,
  mapResultToStatus,
  validateTaskConfig,
  ensureDevBrowserServer,
  generateConfig,
  buildProviderConfigs,
  syncApiKeysToOpenCodeAuth,
  getOpenCodeAuthPath,
  getBundledNodePaths,
  DEV_BROWSER_PORT,
  type TaskManagerAPI,
  type TaskCallbacks,
  type TaskConfig,
  type Task,
  type TaskMessage,
  type TaskResult,
  type TaskStatus,
  type StorageAPI,
  type EnvironmentConfig,
  type CliResolverConfig,
  type BrowserServerConfig,
  type BedrockCredentials,
} from '@accomplish_ai/agent-core';

export interface TaskServiceEvents {
  progress: [data: { taskId: string; stage: string; message?: string }];
  message: [data: { taskId: string; messages: TaskMessage[] }];
  complete: [data: { taskId: string; result: TaskResult }];
  error: [data: { taskId: string; error: string }];
  permission: [data: unknown];
  statusChange: [data: { taskId: string; status: TaskStatus }];
  summary: [data: { taskId: string; summary: string }];
}

export interface TaskServiceOptions {
  userDataPath: string;
  mcpToolsPath: string;
  isPackaged?: boolean;
  resourcesPath?: string;
  appPath?: string;
}

export class TaskService extends EventEmitter {
  private taskManager: TaskManagerAPI;
  private storage: StorageAPI;
  private userDataPath: string;
  private mcpToolsPath: string;
  private isPackaged: boolean;
  private resourcesPath: string;
  private appPath: string;
  constructor(storage: StorageAPI, options: TaskServiceOptions) {
    super();
    this.storage = storage;
    this.userDataPath = options.userDataPath;
    this.mcpToolsPath = options.mcpToolsPath;
    this.isPackaged = options.isPackaged ?? false;
    this.resourcesPath = options.resourcesPath ?? '';
    this.appPath = options.appPath ?? '';

    this.taskManager = createTaskManager({
      adapterOptions: {
        platform: process.platform,
        isPackaged: this.isPackaged,
        tempPath: tmpdir(),
        getCliCommand: () => this.getCliCommand(),
        buildEnvironment: (taskId) => this.buildEnvironment(taskId),
        buildCliArgs: (config, taskId) => this.buildCliArgs(config, taskId),
        onBeforeStart: () => this.onBeforeStart(),
        getModelDisplayName,
      },
      defaultWorkingDirectory: homedir(),
      maxConcurrentTasks: 10,
      isCliAvailable: () => this.isCliAvailable(),
      onBeforeTaskStart: async (callbacks, isFirst) => {
        const browserConfig = this.getBrowserServerConfig();
        if (!browserConfig.mcpToolsPath) {
          return;
        }
        if (isFirst) {
          callbacks.onProgress({
            stage: 'browser',
            message: 'Preparing browser...',
            isFirstTask: isFirst,
          });
        }
        await ensureDevBrowserServer(browserConfig, callbacks.onProgress);
      },
    });
  }

  async startTask(params: {
    prompt: string;
    taskId?: string;
    modelId?: string;
    sessionId?: string;
    workingDirectory?: string;
  }): Promise<Task> {
    const taskId = params.taskId || createTaskId();
    const config: TaskConfig = {
      prompt: params.prompt,
      taskId,
      modelId: params.modelId,
      sessionId: params.sessionId,
      workingDirectory: params.workingDirectory,
    };

    const validatedConfig = validateTaskConfig(config);

    const activeModel = this.storage.getActiveProviderModel();
    const selectedModel = activeModel || this.storage.getSelectedModel();
    if (selectedModel?.model) {
      validatedConfig.modelId = selectedModel.model;
    }

    const callbacks = this.createCallbacks(taskId);
    const task = await this.taskManager.startTask(taskId, validatedConfig, callbacks);

    const initialUserMessage: TaskMessage = {
      id: createMessageId(),
      type: 'user',
      content: validatedConfig.prompt,
      timestamp: new Date().toISOString(),
    };
    task.messages = [initialUserMessage];

    this.storage.saveTask(task);

    generateTaskSummary(validatedConfig.prompt, (provider) => this.storage.getApiKey(provider))
      .then((summary) => {
        this.storage.updateTaskSummary(taskId, summary);
        this.emit('summary', { taskId, summary });
      })
      .catch((err) => {
        console.warn('[TaskService] Failed to generate task summary:', err);
      });

    return task;
  }

  async stopTask(params: { taskId: string }): Promise<void> {
    const { taskId } = params;

    if (this.taskManager.isTaskQueued(taskId)) {
      this.taskManager.cancelQueuedTask(taskId);
      this.storage.updateTaskStatus(taskId, 'cancelled', new Date().toISOString());
      return;
    }

    if (this.taskManager.hasActiveTask(taskId)) {
      await this.taskManager.cancelTask(taskId);
      this.storage.updateTaskStatus(taskId, 'cancelled', new Date().toISOString());
    }
  }

  async interruptTask(params: { taskId: string }): Promise<void> {
    const { taskId } = params;
    if (this.taskManager.hasActiveTask(taskId)) {
      await this.taskManager.interruptTask(taskId);
    }
  }

  async resumeSession(params: {
    sessionId: string;
    prompt: string;
    existingTaskId?: string;
  }): Promise<Task> {
    const { sessionId, prompt, existingTaskId } = params;
    const taskId = existingTaskId || createTaskId();

    if (existingTaskId) {
      const userMessage: TaskMessage = {
        id: createMessageId(),
        type: 'user',
        content: prompt,
        timestamp: new Date().toISOString(),
      };
      this.storage.addTaskMessage(existingTaskId, userMessage);
    }

    const activeModel = this.storage.getActiveProviderModel();
    const selectedModel = activeModel || this.storage.getSelectedModel();

    const callbacks = this.createCallbacks(taskId);
    const task = await this.taskManager.startTask(
      taskId,
      {
        prompt,
        sessionId,
        taskId,
        modelId: selectedModel?.model,
      },
      callbacks,
    );

    if (existingTaskId) {
      this.storage.updateTaskStatus(existingTaskId, task.status, new Date().toISOString());
    }

    return task;
  }

  listTasks(): Task[] {
    return this.storage.getTasks() as Task[];
  }

  getTaskStatus(params: {
    taskId: string;
  }): { taskId: string; status: TaskStatus; prompt: string; createdAt: string } | null {
    const task = this.storage.getTask(params.taskId);
    if (!task) {
      return null;
    }
    return {
      taskId: task.id,
      status: task.status,
      prompt: task.prompt,
      createdAt: task.createdAt,
    };
  }

  getActiveTaskId(): string | null {
    return this.taskManager.getActiveTaskId();
  }

  hasActiveTask(taskId: string): boolean {
    return this.taskManager.hasActiveTask(taskId);
  }

  getActiveTaskCount(): number {
    return this.taskManager.getActiveTaskCount();
  }

  async sendResponse(taskId: string, response: string): Promise<void> {
    await this.taskManager.sendResponse(taskId, response);
  }

  dispose(): void {
    this.taskManager.dispose();
  }

  private createCallbacks(taskId: string): TaskCallbacks {
    return {
      onBatchedMessages: (messages: TaskMessage[]) => {
        this.emit('message', { taskId, messages });
        for (const msg of messages) {
          this.storage.addTaskMessage(taskId, msg);
        }
      },

      onProgress: (progress) => {
        this.emit('progress', { taskId, ...progress });
      },

      onPermissionRequest: (request) => {
        this.emit('permission', request);
      },

      onComplete: (result: TaskResult) => {
        this.emit('complete', { taskId, result });

        const taskStatus = mapResultToStatus(result);
        this.storage.updateTaskStatus(taskId, taskStatus, new Date().toISOString());

        const sessionId = result.sessionId || this.taskManager.getSessionId(taskId);
        if (sessionId) {
          this.storage.updateTaskSessionId(taskId, sessionId);
        }

        if (result.status === 'success') {
          this.storage.clearTodosForTask(taskId);
        }
      },

      onError: (error: Error) => {
        this.emit('error', { taskId, error: error.message });
        this.storage.updateTaskStatus(taskId, 'failed', new Date().toISOString());
      },

      onStatusChange: (status: TaskStatus) => {
        this.emit('statusChange', { taskId, status });
        this.storage.updateTaskStatus(taskId, status, new Date().toISOString());
      },

      onTodoUpdate: (todos) => {
        this.storage.saveTodosForTask(taskId, todos);
      },
    };
  }

  private getCliCommand(): { command: string; args: string[] } {
    const cliConfig: CliResolverConfig = {
      isPackaged: this.isPackaged,
      resourcesPath: this.resourcesPath,
      appPath: this.appPath,
    };
    const resolved = resolveCliPath(cliConfig);
    if (resolved) {
      return { command: resolved.cliPath, args: [] };
    }
    return { command: 'opencode', args: [] };
  }

  private async buildEnvironment(taskId: string): Promise<NodeJS.ProcessEnv> {
    const env: NodeJS.ProcessEnv = { ...process.env };

    const apiKeys = await this.storage.getAllApiKeys();
    const bedrockCredentials = this.storage.getBedrockCredentials() as BedrockCredentials | null;

    const activeModel = this.storage.getActiveProviderModel();
    const selectedModel = this.storage.getSelectedModel();
    let ollamaHost: string | undefined;
    if (activeModel?.provider === 'ollama' && activeModel.baseUrl) {
      ollamaHost = activeModel.baseUrl;
    } else if (selectedModel?.provider === 'ollama' && selectedModel.baseUrl) {
      ollamaHost = selectedModel.baseUrl;
    }

    const envConfig: EnvironmentConfig = {
      apiKeys,
      bedrockCredentials: bedrockCredentials || undefined,
      taskId: taskId || undefined,
      ollamaHost,
    };

    return buildOpenCodeEnvironment(env, envConfig);
  }

  private async buildCliArgs(config: TaskConfig, _taskId: string): Promise<string[]> {
    const activeModel = this.storage.getActiveProviderModel();
    const selectedModel = activeModel || this.storage.getSelectedModel();

    return coreBuildCliArgs({
      prompt: config.prompt,
      sessionId: config.sessionId,
      selectedModel: selectedModel
        ? {
            provider: selectedModel.provider,
            model: selectedModel.model,
          }
        : null,
    });
  }

  private async isCliAvailable(): Promise<boolean> {
    const cliConfig: CliResolverConfig = {
      isPackaged: this.isPackaged,
      resourcesPath: this.resourcesPath,
      appPath: this.appPath,
    };
    return coreIsCliAvailable(cliConfig);
  }

  private getBundledNodeBinPath(): string | undefined {
    const paths = getBundledNodePaths({
      isPackaged: this.isPackaged,
      resourcesPath: this.resourcesPath,
      appPath: this.appPath,
      userDataPath: this.userDataPath,
      tempPath: tmpdir(),
      platform: process.platform,
      arch: process.arch,
    });
    return paths?.binDir;
  }

  private async onBeforeStart(): Promise<void> {
    const authPath = getOpenCodeAuthPath();
    const apiKeys = await this.storage.getAllApiKeys();
    await syncApiKeysToOpenCodeAuth(authPath, apiKeys);

    const { providerConfigs, enabledProviders, modelOverride } = await buildProviderConfigs({
      getApiKey: (provider) => this.storage.getApiKey(provider),
    });

    const permissionApiPort = process.env.ACCOMPLISH_PERMISSION_API_PORT
      ? parseInt(process.env.ACCOMPLISH_PERMISSION_API_PORT, 10)
      : undefined;
    const questionApiPort = process.env.ACCOMPLISH_QUESTION_API_PORT
      ? parseInt(process.env.ACCOMPLISH_QUESTION_API_PORT, 10)
      : undefined;

    const result = generateConfig({
      platform: process.platform,
      mcpToolsPath: this.mcpToolsPath,
      userDataPath: this.userDataPath,
      isPackaged: this.isPackaged,
      bundledNodeBinPath: this.getBundledNodeBinPath(),
      providerConfigs,
      enabledProviders,
      permissionApiPort,
      questionApiPort,
      authToken: process.env.ACCOMPLISH_DAEMON_AUTH_TOKEN,
      model: modelOverride?.model,
      smallModel: modelOverride?.smallModel,
    });

    process.env.OPENCODE_CONFIG = result.configPath;
    process.env.OPENCODE_CONFIG_DIR = path.dirname(result.configPath);
  }

  private getBrowserServerConfig(): BrowserServerConfig {
    return {
      mcpToolsPath: this.mcpToolsPath,
      bundledNodeBinPath: this.getBundledNodeBinPath(),
      devBrowserPort: DEV_BROWSER_PORT,
    };
  }
}
