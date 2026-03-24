import { describe, it, expect, vi } from 'vitest';
import http from 'node:http';
import { createHttpServer } from '../../src/http-server-factory.js';
import { RateLimiter } from '../../src/rate-limiter.js';

function makeRequest(
  port: number,
  path: string,
  method: string,
  body?: string,
  authToken?: string,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode || 0, body: data });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

describe('createHttpServer', () => {
  it('should return 401 for requests with invalid auth', async () => {
    const rateLimiter = new RateLimiter(60_000, 10);
    const { server, port } = await createHttpServer({
      authToken: 'secret-token',
      rateLimiter,
      routes: [
        {
          method: 'POST',
          path: '/ping',
          handler: async (_data, _req, res) => {
            res.writeHead(200);
            res.end();
          },
        },
      ],
      serviceName: 'HttpServerFactoryTest',
    });

    try {
      const res = await makeRequest(port, '/ping', 'POST', '{}', 'wrong-token');
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error).toBe('Unauthorized');
    } finally {
      rateLimiter.dispose();
      await closeServer(server);
    }
  });

  it('should return 429 when rate limit is exceeded before hitting route handler', async () => {
    const routeHandler = vi.fn(
      async (
        _data: Record<string, unknown>,
        _req: http.IncomingMessage,
        res: http.ServerResponse,
      ) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      },
    );
    const rateLimiter = new RateLimiter(60_000, 1);
    const { server, port } = await createHttpServer({
      authToken: 'secret-token',
      rateLimiter,
      routes: [
        {
          method: 'POST',
          path: '/ping',
          handler: routeHandler,
        },
      ],
      serviceName: 'HttpServerFactoryTest',
    });

    try {
      const first = await makeRequest(port, '/ping', 'POST', '{}', 'secret-token');
      const second = await makeRequest(port, '/ping', 'POST', '{}', 'secret-token');

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(429);
      expect(JSON.parse(second.body).error).toBe('Too many requests');
      expect(routeHandler).toHaveBeenCalledTimes(1);
    } finally {
      rateLimiter.dispose();
      await closeServer(server);
    }
  });

  it('should return 500 when route handler throws an error', async () => {
    const rateLimiter = new RateLimiter(60_000, 10);
    const { server, port } = await createHttpServer({
      authToken: 'secret-token',
      rateLimiter,
      routes: [
        {
          method: 'POST',
          path: '/crash',
          handler: async () => {
            throw new Error('boom');
          },
        },
      ],
      serviceName: 'HttpServerFactoryTest',
    });

    try {
      const res = await makeRequest(port, '/crash', 'POST', '{}', 'secret-token');
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).error).toBe('Internal server error');
    } finally {
      rateLimiter.dispose();
      await closeServer(server);
    }
  });

  it('should return 204 for OPTIONS requests without auth', async () => {
    const rateLimiter = new RateLimiter(60_000, 10);
    const { server, port } = await createHttpServer({
      authToken: 'secret-token',
      rateLimiter,
      routes: [
        {
          method: 'POST',
          path: '/ping',
          handler: async (_data, _req, res) => {
            res.writeHead(200);
            res.end();
          },
        },
      ],
      serviceName: 'HttpServerFactoryTest',
    });

    try {
      const res = await makeRequest(port, '/ping', 'OPTIONS');
      expect(res.statusCode).toBe(204);
    } finally {
      rateLimiter.dispose();
      await closeServer(server);
    }
  });
});
