import http from 'http';
import https from 'https';
import { URL } from 'url';

const AZURE_FOUNDRY_PROXY_PORT = 9228;
const MAX_REQUEST_SIZE = 10 * 1024 * 1024;

let server: http.Server | null = null;
let targetBaseUrl: string | null = null;

export interface AzureFoundryProxyInfo {
  baseURL: string;
  targetBaseURL: string;
  port: number;
}

function normalizeBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error(`Invalid protocol: ${parsed.protocol}. Only http and https are supported.`);
    }
    return parsed.origin + parsed.pathname.replace(/\/$/, '');
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Invalid URL format: ${url}`);
    }
    throw error;
  }
}

function getProxyBaseUrl(): string {
  return `http://127.0.0.1:${AZURE_FOUNDRY_PROXY_PORT}`;
}

function shouldTransformBody(contentType: string | undefined): boolean {
  return !!contentType && contentType.toLowerCase().includes('application/json');
}

export function transformRequestBody(body: Buffer): Buffer {
  const text = body.toString('utf8');
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    let modified = false;

    if ('reasoning_effort' in parsed) {
      console.log('[Azure Foundry Proxy] Stripping unsupported reasoning_effort parameter');
      delete parsed.reasoning_effort;
      modified = true;
    }

    if ('max_tokens' in parsed) {
      if (!('max_completion_tokens' in parsed)) {
        console.log('[Azure Foundry Proxy] Converting max_tokens to max_completion_tokens');
        parsed.max_completion_tokens = parsed.max_tokens;
      }
      delete parsed.max_tokens;
      modified = true;
    }

    if (modified) {
      return Buffer.from(JSON.stringify(parsed), 'utf8');
    }
  } catch {
    return body;
  }
  return body;
}

function isValidRequestPath(path: string): boolean {
  if (path === '/health') return true;
  if (path.startsWith('/openai/')) return true;
  if (
    path.startsWith('/chat/') ||
    path.startsWith('/completions') ||
    path.startsWith('/embeddings')
  )
    return true;
  if (path === '/models' || path.startsWith('/models/')) return true;
  return false;
}

function proxyRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({ status: 'ok', target: targetBaseUrl, port: AZURE_FOUNDRY_PROXY_PORT }),
    );
    return;
  }

  if (!targetBaseUrl) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Azure Foundry proxy target not configured',
        hint: 'Configure Azure AI Foundry endpoint in Settings > Providers',
      }),
    );
    return;
  }

  const url = new URL(req.url || '/', 'http://localhost');

  if (!isValidRequestPath(url.pathname)) {
    console.warn(`[Azure Foundry Proxy] Rejected invalid path: ${url.pathname}`);
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({ error: 'Invalid request path. Only Azure OpenAI API paths are allowed.' }),
    );
    return;
  }

  const targetUrl = new URL(`${targetBaseUrl}${url.pathname}${url.search}`);
  const isHttps = targetUrl.protocol === 'https:';

  const chunks: Buffer[] = [];
  let totalSize = 0;
  let aborted = false;

  req.on('data', (chunk) => {
    if (aborted) return;

    totalSize += chunk.length;
    if (totalSize > MAX_REQUEST_SIZE) {
      aborted = true;
      console.warn(`[Azure Foundry Proxy] Request exceeded size limit: ${totalSize} bytes`);
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request too large. Maximum size is 10MB.' }));
      req.destroy();
      return;
    }
    chunks.push(Buffer.from(chunk));
  });

  req.on('end', () => {
    if (aborted) return;

    const rawBody = Buffer.concat(chunks);
    const contentType = req.headers['content-type'];
    const body =
      rawBody.length > 0 && shouldTransformBody(contentType)
        ? transformRequestBody(rawBody)
        : rawBody;

    const headers = { ...req.headers } as Record<string, string | string[] | undefined>;
    delete headers.host;
    if (body.length !== rawBody.length) {
      headers['content-length'] = String(body.length);
    }

    const requestOptions: http.RequestOptions = {
      method: req.method,
      headers,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: `${targetUrl.pathname}${targetUrl.search}`,
    };

    const proxy = (isHttps ? https : http).request(requestOptions, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxy.on('error', (error) => {
      console.error('[Azure Foundry Proxy] Request error:', error);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
      }
      res.end(
        JSON.stringify({
          error: 'Azure Foundry proxy request failed',
          details: error.message,
          hint: 'Check your Azure endpoint URL and network connectivity',
        }),
      );
    });

    if (body.length > 0) {
      proxy.write(body);
    }
    proxy.end();
  });

  req.on('error', (error) => {
    console.error('[Azure Foundry Proxy] Incoming request error:', error);
    if (!res.headersSent) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({ error: 'Invalid request', details: error.message }));
  });
}

export async function ensureAzureFoundryProxy(baseURL: string): Promise<AzureFoundryProxyInfo> {
  targetBaseUrl = normalizeBaseUrl(baseURL);

  if (!server) {
    server = http.createServer(proxyRequest);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Azure Foundry proxy server startup timeout'));
      }, 5000);

      server!.once('error', (error: NodeJS.ErrnoException) => {
        clearTimeout(timeout);
        server = null;
        if (error.code === 'EADDRINUSE') {
          reject(
            new Error(
              `Port ${AZURE_FOUNDRY_PROXY_PORT} is already in use. ` +
                'Please close other applications using this port or restart the app.',
            ),
          );
        } else {
          reject(error);
        }
      });

      server!.listen(AZURE_FOUNDRY_PROXY_PORT, '127.0.0.1', () => {
        clearTimeout(timeout);
        console.log(`[Azure Foundry Proxy] Listening on port ${AZURE_FOUNDRY_PROXY_PORT}`);
        resolve();
      });
    });
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
      console.warn('[Azure Foundry Proxy] Shutdown timeout, forcing close');
      server = null;
      targetBaseUrl = null;
      resolve();
    }, 3000);

    server!.close((err) => {
      clearTimeout(timeout);
      if (err && (err as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') {
        console.error('[Azure Foundry Proxy] Error during shutdown:', err);
        reject(err);
      } else {
        console.log('[Azure Foundry Proxy] Server stopped');
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
