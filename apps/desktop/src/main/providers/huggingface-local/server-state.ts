/**
 * Shared server state for the HuggingFace Local inference server.
 * Single source of truth, imported by all sub-modules.
 */

import http from 'http';

/**
 * Structure of a chat message in the conversation.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Request payload for the chat completion API.
 */
export interface ChatCompletionRequest {
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
}

/**
 * Internal state of the inference server.
 */
export interface ServerState {
  server: http.Server | null;
  port: number | null;
  loadedModelId: string | null;
  pipeline: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tokenizer: (((...args: any[]) => any) & Record<string, any>) | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Record<string, any> | null;
  isLoading: boolean;
  /** Set by stopServer() so an in-flight load can abort before mutating shared state. */
  isStopping: boolean;
}

export const state: ServerState = {
  server: null,
  port: null,
  loadedModelId: null,
  pipeline: null,
  tokenizer: null,
  model: null,
  isLoading: false,
  isStopping: false,
};

/** Mutex to prevent concurrent loadModel calls */
export let loadModelPromise: Promise<void> | null = null;
export function setLoadModelPromise(p: Promise<void> | null): void {
  loadModelPromise = p;
}

/** Mutex to prevent concurrent startServer calls */
export let startServerPromise: Promise<{ success: boolean; port?: number; error?: string }> | null =
  null;
export function setStartServerPromise(
  p: Promise<{ success: boolean; port?: number; error?: string }> | null,
): void {
  startServerPromise = p;
}

/** Counter tracking in-flight generation requests. Used by stopServer() to drain. */
export let activeGenerations = 0;
export function incrementGenerations(): void {
  activeGenerations++;
}
export function decrementGenerations(): void {
  activeGenerations--;
}
