import http from 'http';
import { createConsoleLogger } from '../../utils/logging.js';
import { normalizeBaseUrl } from './moonshot-validation.js';
import { MOONSHOT_PROXY_PORT } from './moonshot-transform.js';
import { createProxyRequestHandler } from './moonshot-request-handler.js';

export { transformMoonshotRequestBody } from './moonshot-transform.js';

const log = createConsoleLogger({ prefix: 'MoonshotProxy' });

let server: http.Server | null = null;
let targetBaseUrl: string | null = null;

export interface MoonshotProxyInfo {
  baseURL: string;
  targetBaseURL: string;
  port: number;
}

function getProxyBaseUrl(): string {
  return `http://127.0.0.1:${MOONSHOT_PROXY_PORT}`;
}

export async function ensureMoonshotProxy(baseURL: string): Promise<MoonshotProxyInfo> {
  targetBaseUrl = normalizeBaseUrl(baseURL);

  if (!server) {
    const handler = createProxyRequestHandler(() => targetBaseUrl);
    server = http.createServer(handler);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Moonshot proxy server startup timeout'));
      }, 5000);

      server!.once('error', (error: NodeJS.ErrnoException) => {
        clearTimeout(timeout);
        server = null;
        if (error.code === 'EADDRINUSE') {
          reject(
            new Error(
              `Port ${MOONSHOT_PROXY_PORT} is already in use. ` +
                'Please close other applications using this port or restart the app.',
            ),
          );
        } else {
          reject(error);
        }
      });

      server!.listen(MOONSHOT_PROXY_PORT, '127.0.0.1', () => {
        clearTimeout(timeout);
        log.info(`[Moonshot Proxy] Listening on port ${MOONSHOT_PROXY_PORT}`);
        resolve();
      });
    });
  }

  return {
    baseURL: getProxyBaseUrl(),
    targetBaseURL: targetBaseUrl,
    port: MOONSHOT_PROXY_PORT,
  };
}

export async function stopMoonshotProxy(): Promise<void> {
  if (!server) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      log.warn('[Moonshot Proxy] Shutdown timeout, forcing close');
      server = null;
      targetBaseUrl = null;
      resolve();
    }, 3000);

    server!.close((err) => {
      clearTimeout(timeout);
      server = null;
      targetBaseUrl = null;
      if (err && (err as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') {
        log.error(`[Moonshot Proxy] Error during shutdown: ${err}`);
        reject(err);
      } else {
        log.info('[Moonshot Proxy] Server stopped');
        resolve();
      }
    });
  });
}

export function isMoonshotProxyRunning(): boolean {
  return server !== null && server.listening;
}
