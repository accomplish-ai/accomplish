/**
 * CLI argument builder for OpenCode invocations.
 * Extracted from config-generator.ts.
 */
import { ACCOMPLISH_AGENT_NAME } from './config-generator.js';
import type { ProviderId } from '../common/types/providerSettings.js';

export interface BuildCliArgsOptions {
  prompt: string;
  sessionId?: string;
  selectedModel?: {
    provider: ProviderId;
    model: string;
  } | null;
}

/**
 * Builds the CLI argument array for an `opencode run` invocation.
 * Provider-specific model ID normalisation is applied here so callers
 * can pass raw provider/model pairs without worrying about prefixes.
 */
export function buildCliArgs(options: BuildCliArgsOptions): string[] {
  const { prompt, sessionId, selectedModel } = options;

  const args: string[] = ['run'];
  // CRITICAL: JSON format required for StreamParser to parse messages
  args.push('--format', 'json');

  if (selectedModel?.model) {
    if (selectedModel.provider === 'zai') {
      const modelId = selectedModel.model.split('/').pop();
      args.push('--model', `zai-coding-plan/${modelId}`);
    } else if (selectedModel.provider === 'deepseek') {
      const modelId = selectedModel.model.split('/').pop();
      args.push('--model', `deepseek/${modelId}`);
    } else if (selectedModel.provider === 'openrouter') {
      args.push('--model', selectedModel.model);
    } else if (selectedModel.provider === 'ollama') {
      // Accept both "qwen3:4b" and "ollama/qwen3:4b" inputs consistently
      const normalizedModelId = selectedModel.model.replace(/^ollama\//, '');
      args.push('--model', `ollama/${normalizedModelId}`);
    } else if (selectedModel.provider === 'litellm') {
      const modelId = selectedModel.model.replace(/^litellm\//, '');
      args.push('--model', `litellm/${modelId}`);
    } else if (selectedModel.provider === 'lmstudio') {
      const modelId = selectedModel.model.replace(/^lmstudio\//, '');
      args.push('--model', `lmstudio/${modelId}`);
    } else if (selectedModel.provider === 'vertex') {
      // Model IDs stored as "vertex/{publisher}/{model}" — strip publisher for @ai-sdk/google-vertex
      const modelId = selectedModel.model.replace(/^vertex\/[^/]+\//, '');
      args.push('--model', `vertex/${modelId}`);
    } else if (selectedModel.provider === 'custom') {
      const modelId = selectedModel.model.replace(/^custom\//, '');
      args.push('--model', `custom/${modelId}`);
    } else {
      args.push('--model', selectedModel.model);
    }
  }

  if (sessionId) {
    args.push('--session', sessionId);
  }

  args.push('--agent', ACCOMPLISH_AGENT_NAME);
  args.push(prompt);

  return args;
}
