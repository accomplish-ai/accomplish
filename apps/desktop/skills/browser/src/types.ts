export interface ServeOptions {
  port?: number;
  cdpPort?: number;
  headless?: boolean;
  profileDir?: string;
  useSystemChrome?: boolean;
}

export interface GetPageRequest {
  name: string;
  viewport?: { width: number; height: number };
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

export interface BrowserServer {
  wsEndpoint: string;
  port: number;
  stop: () => Promise<void>;
}
