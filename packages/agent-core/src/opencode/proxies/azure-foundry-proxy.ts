import http from 'http';
import https from 'https';
import { createConsoleLogger } from '../../utils/logging.js';
import {
  normalizeBaseUrl,
  transformRequestBody,
  isValidRequestPath,
  shouldTransformBody,
} from './azure-foundry-proxy-transform.js';

export { transformRequestBody } from './azure-foundry-proxy-transform.js';

const log = createConsoleLogger({ prefix: 'AzureFoundryProxy' });

const AZURE_FOUNDRY_PROXY_PORT = 9228;
const MAX_REQUEST_SIZE = 10 * 1024 * 1024;

let server: http.Server | null = null;
let targetBaseUrl: string | null = null;
let serverStartupPromise: Promise<void> | null = null;

const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
];

export interface AzureFoundryProxyInfo {
  baseURL: string;
  targetBaseURL: string;
  port: number;
}

function getProxyBaseUrl(): string {
  return `http://127.0.0.1:${AZURE_FOUNDRY_PROXY_PORT}`;
}

function sendJson(res: http.ServerResponse, status: number, body: object): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function forwardRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  rawBody: Buffer,
  targetUrl: URL,
): void {
  const isHttps = targetUrl.protocol === 'https:';
  const body =
    rawBody.length > 0 && shouldTransformBody(req.headers['content-type'])
      ? transformRequestBody(rawBody)
      : rawBody;

  const headers = { ...req.headers } as Record<string, string | string[] | undefined>;
  delete headers.host;
  HOP_BY_HOP_HEADERS.forEach((header) => {
    delete headers[header];
  });

  // Always set content-length to the actual body length being forwarded.
  // When transfer-encoding was chunked, the hop-by-hop removal above deletes it,
  // so an explicit content-length is required even when the body was not transformed.
  headers['content-length'] = String(body.length);

  const proxy = (isHttps ? https : http).request(
    {
      method: req.method,
      headers,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: `${targetUrl.pathname}${targetUrl.search}`,
    },
    (proxyRes) => {
      const responseHeaders = { ...proxyRes.headers };
      // Remove hop-by-hop headers from the response to prevent logic errors in the proxy
      HOP_BY_HOP_HEADERS.forEach((header) => {
        delete responseHeaders[header];
      });

      res.writeHead(proxyRes.statusCode || 500, responseHeaders);
      proxyRes.pipe(res);
    },
  );

  proxy.on('error', (error) => {
    log.error('[Azure Foundry Proxy] Request error:', { error: error.message });
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Azure Foundry proxy request failed',
          details: error.message,
          hint: 'Check your Azure endpoint URL and network connectivity',
        }),
      );
    } else {
      res.end();
    }
  });

  if (body.length > 0) {
    proxy.write(body);
  }
  proxy.end();
}

function proxyRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (req.url === '/health') {
    sendJson(res, 200, { status: 'ok', target: targetBaseUrl, port: AZURE_FOUNDRY_PROXY_PORT });
    return;
  }

  if (!targetBaseUrl) {
    sendJson(res, 503, {
      error: 'Azure Foundry proxy target not configured',
      hint: 'Configure Azure AI Foundry endpoint in Settings > Providers',
    });
    return;
  }

  const url = new URL(req.url || '/', 'http://localhost');

  if (!isValidRequestPath(url.pathname)) {
    log.warn(`[Azure Foundry Proxy] Rejected invalid path: ${url.pathname}`);
    sendJson(res, 403, { error: 'Invalid request path. Only Azure OpenAI API paths are allowed.' });
    return;
  }

  const targetUrl = new URL(`${targetBaseUrl}${url.pathname}${url.search}`);
  const chunks: Buffer[] = [];
  let totalSize = 0;
  let aborted = false;

  req.on('data', (chunk) => {
    if (aborted) return;
    totalSize += chunk.length;
    if (totalSize > MAX_REQUEST_SIZE) {
      aborted = true;
      log.warn(`[Azure Foundry Proxy] Request exceeded size limit: ${totalSize} bytes`);
      sendJson(res, 413, { error: 'Request too large. Maximum size is 10MB.' });
      req.destroy();
      return;
    }
    chunks.push(Buffer.from(chunk));
  });

  req.on('end', () => {
    if (aborted) return;
    forwardRequest(req, res, Buffer.concat(chunks), targetUrl);
  });

  req.on('error', (error) => {
    log.error('[Azure Foundry Proxy] Incoming request error:', { error: error.message });
    if (!res.headersSent) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request', details: error.message }));
    } else {
      res.end();
    }
  });
}

async function startProxyServer(): Promise<void> {
  const newServer = http.createServer(proxyRequest);
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      newServer.close();
      reject(new Error('Azure Foundry proxy server startup timeout'));
    }, 5000);
    newServer.once('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      reject(
        error.code === 'EADDRINUSE'
          ? new Error(
              `Port ${AZURE_FOUNDRY_PROXY_PORT} is already in use. Please close other applications using this port or restart the app.`,
            )
          : error,
      );
    });
    newServer.listen(AZURE_FOUNDRY_PROXY_PORT, '127.0.0.1', () => {
      clearTimeout(timeout);
      log.info(`[Azure Foundry Proxy] Listening on port ${AZURE_FOUNDRY_PROXY_PORT}`);
      server = newServer;
      resolve();
    });
  });
}

export async function ensureAzureFoundryProxy(baseURL: string): Promise<AzureFoundryProxyInfo> {
  targetBaseUrl = normalizeBaseUrl(baseURL);
  if (!server) {
    if (!serverStartupPromise) {
      serverStartupPromise = startProxyServer().finally(() => {
        serverStartupPromise = null;
      });
    }
    await serverStartupPromise;
  }
  return {
    baseURL: getProxyBaseUrl(),
    targetBaseURL: targetBaseUrl,
    port: AZURE_FOUNDRY_PROXY_PORT,
  };
}

export async function stopAzureFoundryProxy(): Promise<void> {
  if (!server) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      log.warn('[Azure Foundry Proxy] Shutdown timeout, forcing close');
      server = null;
      targetBaseUrl = null;
      resolve();
    }, 3000);
    server!.close((err) => {
      clearTimeout(timeout);
      if (err && (err as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') {
        log.error('[Azure Foundry Proxy] Error during shutdown:', {
          error: err instanceof Error ? err.message : String(err),
        });
        reject(err);
      } else {
        log.info('[Azure Foundry Proxy] Server stopped');
        resolve();
      }
    });
    server = null;
    targetBaseUrl = null;
  });
}

export function isAzureFoundryProxyRunning(): boolean {
  return server !== null && server.listening;
}
