/**
 * Browser live-view shared types.
 *
 * Used by the renderer, preload bridge, and main-process screencast service
 * to share a consistent event shape for embedded browser preview.
 *
 * Originally authored by david-mamani (PR #553).
 */

export interface BrowserFramePayload {
  /** Base-64 encoded JPEG frame data (emitted as `frame` by dev-browser-mcp) */
  frame: string;
  /** Logical page name inside the dev-browser server */
  pageName: string;
  /** Unix timestamp (ms) when the frame was captured */
  timestamp: number;
  /** Optional task identifier so the renderer can route to the right preview */
  taskId?: string;
}

export interface BrowserStatusPayload {
  status: 'idle' | 'starting' | 'streaming' | 'stopping' | 'error';
  error?: string;
  taskId?: string;
  pageName?: string;
}

export interface BrowserNavigatePayload {
  url: string;
  taskId?: string;
  pageName?: string;
}
