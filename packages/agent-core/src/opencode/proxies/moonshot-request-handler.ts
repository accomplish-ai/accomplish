import http from 'http';
import https from 'https';
import { createConsoleLogger } from '../../utils/logging.js';
import { extractAndCacheReasoningContent } from './moonshot-cache.js';
import { isValidRequestPath, shouldTransformBody } from './moonshot-validation.js';
import {
  MOONSHOT_PROXY_PORT,
  MAX_REQUEST_SIZE,
  DEBUG,
  transformMoonshotRequestBody,
} from './moonshot-transform.js';

const log = createConsoleLogger({ prefix: 'MoonshotProxy' });

export function createProxyRequestHandler(
  getTargetBaseUrl: () => string | null,
): (req: http.IncomingMessage, res: http.ServerResponse) => void {
  return function proxyRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const targetBaseUrl = getTargetBaseUrl();

    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', target: targetBaseUrl, port: MOONSHOT_PROXY_PORT }));
      return;
    }

    if (!targetBaseUrl) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Moonshot proxy target not configured',
          hint: 'Configure Moonshot AI in Settings > Providers',
        }),
      );
      return;
    }

    const url = new URL(req.url || '/', 'http://localhost');
    if (!isValidRequestPath(url.pathname)) {
      log.warn(`[Moonshot Proxy] Rejected invalid path: ${url.pathname}`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Invalid request path. Only OpenAI-compatible API paths are allowed.',
        }),
      );
      return;
    }

    const targetUrl = new URL(`${targetBaseUrl}${url.pathname}${url.search}`);
    const isHttps = targetUrl.protocol === 'https:';
    const chunks: Buffer[] = [];
    let totalSize = 0;
    let aborted = false;

    req.on('data', (chunk) => {
      if (aborted) {
        return;
      }
      totalSize += chunk.length;
      if (totalSize > MAX_REQUEST_SIZE) {
        aborted = true;
        log.warn(`[Moonshot Proxy] Request exceeded size limit: ${totalSize} bytes`);
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request too large. Maximum size is 10MB.' }));
        req.destroy();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });

    req.on('end', () => {
      if (aborted) {
        return;
      }
      const rawBody = Buffer.concat(chunks);
      const contentType = req.headers['content-type'];
      const contentEncoding = req.headers['content-encoding'];
      if (DEBUG) {
        log.info(`[Moonshot Proxy] Request: ${req.method} ${req.url}`);
        log.info(
          `[Moonshot Proxy] Content-Type: ${contentType}, Content-Encoding: ${contentEncoding}, Body size: ${rawBody.length}`,
        );
      }
      const body =
        rawBody.length > 0 && shouldTransformBody(contentType)
          ? transformMoonshotRequestBody(rawBody)
          : rawBody;
      if (DEBUG) {
        log.info(`[Moonshot Proxy] Transformed body size: ${body.length} (was ${rawBody.length})`);
      }
      const headers = { ...req.headers } as Record<string, string | string[] | undefined>;
      delete headers.host;
      delete headers['transfer-encoding'];
      delete headers['Transfer-Encoding'];
      headers['content-length'] = String(body.length);
      const requestOptions: http.RequestOptions = {
        method: req.method,
        headers,
        hostname: targetUrl.hostname,
        port: targetUrl.port || (isHttps ? 443 : 80),
        path: `${targetUrl.pathname}${targetUrl.search}`,
      };
      const proxy = (isHttps ? https : http).request(requestOptions, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
        const responseChunks: Buffer[] = [];
        proxyRes.on('data', (chunk: Buffer) => {
          responseChunks.push(chunk);
          if (!res.writableEnded && !res.destroyed) {
            res.write(chunk);
          }
        });
        proxyRes.on('end', () => {
          res.end();
          try {
            const responseText = Buffer.concat(responseChunks).toString('utf8');
            extractAndCacheReasoningContent(responseText);
          } catch (e) {
            if (DEBUG) {
              log.error(`[Moonshot Proxy] Error extracting reasoning_content: ${e}`);
            }
          }
        });
        proxyRes.on('error', (err) => {
          log.error(`[Moonshot Proxy] Response stream error: ${err}`);
          if (!res.headersSent) {
            res.end();
          }
        });
      });
      proxy.on('error', (error) => {
        log.error(`[Moonshot Proxy] Request error: ${error}`);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'Moonshot proxy request failed',
              details: error.message,
              hint: 'Check your Moonshot API key and network connectivity',
            }),
          );
        }
      });
      if (body.length > 0) {
        proxy.write(body);
      }
      proxy.end();
    });

    req.on('error', (error) => {
      log.error(`[Moonshot Proxy] Incoming request error: ${error}`);
      if (!res.headersSent) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request', details: error.message }));
      } else {
        res.destroy();
      }
    });
  };
}
