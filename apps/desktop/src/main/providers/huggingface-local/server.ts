/**
 * HuggingFace Local Inference Server — re-exports
 *
 * This file is the public surface of the local inference server.
 * Implementation is split across focused sub-modules:
 *   - server-state.ts      — shared mutable state & mutexes
 *   - model-loader.ts      — loadModel, formatChatPrompt
 *   - http-handler.ts      — HTTP routing, SSE streaming
 *   - server-lifecycle.ts  — startServer, stopServer, getServerStatus, testConnection
 */

export { startServer, stopServer, getServerStatus, testConnection } from './server-lifecycle';
