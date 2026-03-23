export interface ServeOptions {
  port?: number;
  headless?: boolean;
  cdpPort?: number;
  profileDir?: string;
  useSystemChrome?: boolean;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface GetPageRequest {
  name: string;
  viewport?: ViewportSize;
}

export interface GetPageResponse {
  wsEndpoint: string;
  name: string;
  targetId: string;
}

export interface ListPagesResponse {
  pages: string[];
}

export interface ServerInfoResponse {
  wsEndpoint: string;
}

// ─── Screencast types (ENG-695, contributed by david-mamani / PR #553) ──────

export interface ScreencastConfig {
  format: 'jpeg' | 'png';
  quality: number;
  maxWidth: number;
  maxHeight: number;
  everyNthFrame: number;
}

export interface ScreencastFrameMetadata {
  pageUrl: string;
  timestamp: number;
  offsetTop: number;
  pageScaleFactor: number;
  deviceWidth: number;
  deviceHeight: number;
}

export interface ScreencastFrame {
  /** Base-64 encoded image data */
  data: string;
  /** CDP session ID for acknowledgement */
  sessionId: number;
  metadata: ScreencastFrameMetadata;
}

export type ScreencastStatus = 'idle' | 'starting' | 'streaming' | 'stopping' | 'error';
