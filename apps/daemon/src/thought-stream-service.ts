import http from 'node:http';
import {
  createThoughtStreamHandler,
  type ThoughtStreamAPI,
  type ThoughtStreamEvent,
  type ThoughtStreamCheckpointEvent,
} from '@accomplish_ai/agent-core';
import { z } from 'zod';
import { createHttpServer, type Route } from './http-server-factory.js';
import { RateLimiter } from './rate-limiter.js';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 600;

const thoughtEventSchema = z.object({
  taskId: z.string().min(1),
  content: z.string(),
  category: z.enum(['observation', 'reasoning', 'decision', 'action']),
  agentName: z.string(),
  timestamp: z.number(),
});

const checkpointEventSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(['progress', 'complete', 'stuck']),
  summary: z.string(),
  nextPlanned: z.string().optional(),
  blocker: z.string().optional(),
  agentName: z.string(),
  timestamp: z.number(),
});

export class ThoughtStreamService {
  private handler: ThoughtStreamAPI;
  private server: http.Server | null = null;
  private onThought: ((event: ThoughtStreamEvent) => void) | null = null;
  private onCheckpoint: ((event: ThoughtStreamCheckpointEvent) => void) | null = null;
  private authToken: string;
  private actualPort: number | null = null;
  private rateLimiter = new RateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS);

  constructor(authToken: string) {
    this.handler = createThoughtStreamHandler();
    this.authToken = authToken;
  }

  setEventHandlers(
    onThought: (event: ThoughtStreamEvent) => void,
    onCheckpoint: (event: ThoughtStreamCheckpointEvent) => void,
  ): void {
    this.onThought = onThought;
    this.onCheckpoint = onCheckpoint;
  }

  getPort(): number | null {
    return this.actualPort;
  }

  registerTask(taskId: string): void {
    this.handler.registerTask(taskId);
  }

  unregisterTask(taskId: string): void {
    this.handler.unregisterTask(taskId);
  }

  async start(fixedPort?: number): Promise<http.Server> {
    const routes: Route[] = [
      {
        method: 'POST',
        path: '/thought',
        handler: async (data, _req, res) => {
          const parsed = thoughtEventSchema.safeParse(data);
          if (!parsed.success) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid thought event' }));
            return;
          }
          if (!this.handler.isTaskActive(parsed.data.taskId)) {
            res.writeHead(200);
            res.end();
            return;
          }
          this.onThought?.(parsed.data);
          res.writeHead(200);
          res.end();
        },
      },
      {
        method: 'POST',
        path: '/checkpoint',
        handler: async (data, _req, res) => {
          const parsed = checkpointEventSchema.safeParse(data);
          if (!parsed.success) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid checkpoint event' }));
            return;
          }
          if (!this.handler.isTaskActive(parsed.data.taskId)) {
            res.writeHead(200);
            res.end();
            return;
          }
          this.onCheckpoint?.(parsed.data);
          res.writeHead(200);
          res.end();
        },
      },
    ];

    const { server, port } = await createHttpServer({
      authToken: this.authToken,
      rateLimiter: this.rateLimiter,
      routes,
      serviceName: 'ThoughtStreamService',
      port: fixedPort,
    });

    this.server = server;
    this.actualPort = port;
    return server;
  }

  close(): void {
    this.rateLimiter.dispose();
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
