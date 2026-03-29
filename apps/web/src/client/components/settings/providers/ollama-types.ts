import type { ToolSupportStatus } from '@accomplish_ai/agent-core';

export interface OllamaModel {
  id: string;
  name: string;
  toolSupport?: ToolSupportStatus;
}
