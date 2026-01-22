import http from 'http';
import https from 'https';
import { URL } from 'url';

const AZURE_FOUNDRY_PROXY_PORT = 9228;

let server: http.Server | null = null;
let targetBaseUrl: string | null = null;

export interface AzureFoundryProxyInfo {
  baseURL: string;
  targetBaseURL: string;
  port: number;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

function getProxyBaseUrl(): string {
  return `http://127.0.0.1:${AZURE_FOUNDRY_PROXY_PORT}`;
}

function shouldStripReasoningEffort(contentType: string | undefined): boolean {
  return !!contentType && contentType.toLowerCase().includes('application/json');
}

function stripReasoningEffort(body: Buffer): Buffer {
  const text = body.toString('utf8');
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if ('reasoning_effort' in parsed) {
      delete parsed.reasoning_effort;
      return Buffer.from(JSON.stringify(parsed), 'utf8');
    }
  } catch {
    return body;
  }
  return body;
}

function proxyRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (!targetBaseUrl) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Azure Foundry proxy target not configured' }));
    return;
  }

  const url = new URL(req.url || '/', 'http://localhost');
  const targetUrl = new URL(`${normalizeBaseUrl(targetBaseUrl)}${url.pathname}${url.search}`);
  const isHttps = targetUrl.protocol === 'https:';

  const chunks: Buffer[] = [];
  req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  req.on('end', () => {
    const rawBody = Buffer.concat(chunks);
    const contentType = req.headers['content-type'];
    const body =
      rawBody.length > 0 && shouldStripReasoningEffort(contentType)
        ? stripReasoningEffort(rawBody)
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
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Azure Foundry proxy request failed' }));
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
    res.end(JSON.stringify({ error: 'Invalid request' }));
  });
}

export async function ensureAzureFoundryProxy(baseURL: string): Promise<AzureFoundryProxyInfo> {
  targetBaseUrl = normalizeBaseUrl(baseURL);

  if (!server) {
    server = http.createServer(proxyRequest);
    server.listen(AZURE_FOUNDRY_PROXY_PORT, '127.0.0.1', () => {
      console.log(`[Azure Foundry Proxy] Listening on port ${AZURE_FOUNDRY_PROXY_PORT}`);
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.warn(`[Azure Foundry Proxy] Port ${AZURE_FOUNDRY_PROXY_PORT} already in use, reusing existing proxy`);
      } else {
        console.error('[Azure Foundry Proxy] Server error:', error);
      }
    });
  }

  return {
    baseURL: getProxyBaseUrl(),
    targetBaseURL: targetBaseUrl,
    port: AZURE_FOUNDRY_PROXY_PORT,
  };
}
