import crypto from 'node:crypto';
import http from 'node:http';
import { RateLimiter } from './rate-limiter.js';

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

export interface Route {
  method: string;
  path: string;
  handler: (
    data: Record<string, unknown>,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) => Promise<void>;
}

export interface HttpServerOptions {
  authToken: string;
  rateLimiter: RateLimiter;
  routes: Route[];
  serviceName: string;
}

function validateAuthToken(
  authToken: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): boolean {
  const authHeader = req.headers['authorization'];
  const expected = `Bearer ${authToken}`;
  if (
    !authHeader ||
    authHeader.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
  ) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return false;
  }
  return true;
}

async function readBody(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<string | null> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY_SIZE) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request body too large' }));
      return null;
    }
  }
  return body;
}

function parseJsonBody(body: string, res: http.ServerResponse): Record<string, unknown> | null {
  try {
    return JSON.parse(body);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return null;
  }
}

export function createHttpServer(
  options: HttpServerOptions,
): Promise<{ server: http.Server; port: number }> {
  const { authToken, rateLimiter, routes, serviceName } = options;

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const clientIp = req.socket.remoteAddress || 'unknown';
      if (!rateLimiter.isAllowed(clientIp)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Too many requests' }));
        return;
      }

      if (!validateAuthToken(authToken, req, res)) {
        return;
      }

      const route = routes.find((r) => r.method === req.method && r.path === req.url);
      if (!route) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      const body = await readBody(req, res);
      if (body === null) {
        return;
      }

      const data = parseJsonBody(body, res);
      if (data === null) {
        return;
      }

      try {
        await route.handler(data, req, res);
      } catch (error) {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
        console.error(`[${serviceName}] Unhandled error in ${route.method} ${route.path}:`, error);
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = addr && typeof addr === 'object' ? addr.port : 0;
      console.log(`[${serviceName}] Listening on port ${port}`);
      resolve({ server, port });
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      reject(new Error(`[${serviceName}] Failed to start: ${error.message}`));
    });
  });
}
